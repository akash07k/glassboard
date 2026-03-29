import { watch, type FSWatcher } from "fs";
import { open, stat } from "fs/promises";
import { parseSessionFile } from "./parser";
import type { ParsedMessage } from "./types";

export type WatchEvent = {
  eventName: string;
  message: ParsedMessage & { index: number };
};

type WatchCallback = (events: WatchEvent[]) => void;
type HeartbeatCallback = () => void;

interface Subscriber {
  onEvents: WatchCallback;
  onHeartbeat: HeartbeatCallback;
}

interface ActiveWatcher {
  watcher: FSWatcher;
  heartbeat: ReturnType<typeof setInterval>;
  subscribers: Set<Subscriber>;
}

const activeWatchers = new Map<string, ActiveWatcher>();

export async function startWatching(
  filePath: string,
  onEvents: WatchCallback,
  onHeartbeat: HeartbeatCallback,
): Promise<() => void> {
  const subscriber: Subscriber = { onEvents, onHeartbeat };

  // If a watcher already exists for this file, just add the subscriber
  const existing = activeWatchers.get(filePath);
  if (existing) {
    existing.subscribers.add(subscriber);
    return () => removeSubscriber(filePath, subscriber);
  }

  // Create a new watcher — set placeholder to prevent race condition
  const subscribers = new Set<Subscriber>([subscriber]);
  const placeholder: any = { subscribers };
  activeWatchers.set(filePath, placeholder);

  try {
    const parsed = await parseSessionFile(filePath);
    const fileStat = await stat(filePath);
    let byteOffset = fileStat.size;
    let messageCount = parsed.length;
    let turnIndex = parsed.length > 0 ? parsed[parsed.length - 1].turnIndex : -1;

    // If all subscribers left during async setup, abort — no need for a watcher
    if (subscribers.size === 0) {
      activeWatchers.delete(filePath);
      return () => {};
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const watcher = watch(filePath, () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => readNewLines(), 100);
    });

    const heartbeat = setInterval(() => {
      for (const sub of subscribers) sub.onHeartbeat();
    }, 15_000);

    async function readNewLines() {
      try {
        const newStat = await stat(filePath);
        if (newStat.size <= byteOffset) return;

        const fd = await open(filePath, "r");
        const buf = Buffer.alloc(newStat.size - byteOffset);
        try {
          await fd.read(buf, 0, buf.length, byteOffset);
        } finally {
          await fd.close();
        }
        byteOffset = newStat.size;

        const newText = buf.toString("utf-8");
        const lines = newText.split("\n").filter((l) => l.trim());
        const events: WatchEvent[] = [];

        for (const line of lines) {
          let obj: any;
          try { obj = JSON.parse(line); } catch { continue; }
          if (obj.type === "file-history-snapshot") continue;

          const ts: string | null = obj.timestamp || null;
          if (obj.type === "user") turnIndex++;

          const classified = classifyLine(obj, ts, turnIndex, messageCount);
          for (const evt of classified) {
            events.push(evt);
            messageCount++;
          }
        }

        if (events.length > 0) {
          for (const sub of subscribers) sub.onEvents(events);
        }
      } catch (e) {
        console.error("[watcher] read error:", e);
      }
    }

    // If all subscribers left during setup, clean up immediately
    if (subscribers.size === 0) {
      watcher.close();
      clearInterval(heartbeat);
      activeWatchers.delete(filePath);
      return () => {};
    }

    // Replace placeholder with full watcher
    activeWatchers.set(filePath, { watcher, heartbeat, subscribers });
  } catch (e) {
    activeWatchers.delete(filePath);
    throw e;
  }
  return () => removeSubscriber(filePath, subscriber);
}

function removeSubscriber(filePath: string, subscriber: Subscriber) {
  const active = activeWatchers.get(filePath);
  if (!active) return;
  active.subscribers.delete(subscriber);
  // Close watcher only when last subscriber disconnects
  if (active.subscribers.size === 0) {
    if (active.watcher) active.watcher.close();
    if (active.heartbeat) clearInterval(active.heartbeat);
    activeWatchers.delete(filePath);
  }
}

export function classifyLine(
  obj: any, ts: string | null, turn: number, baseIndex: number,
): WatchEvent[] {
  const events: WatchEvent[] = [];

  if (obj.type === "system" && obj.subtype === "hook_started" && obj.hook_event) {
    events.push({
      eventName: obj.hook_event,
      message: { type: "system", subtype: obj.subtype, text: "Hook: " + obj.hook_event, timestamp: ts, turnIndex: turn, index: baseIndex },
    });
    return events;
  }

  if (obj.type === "user") {
    const content = obj.message?.content;
    let text = "";
    if (typeof content === "string") text = content;
    else if (Array.isArray(content)) {
      const textItems = content.filter((c: any) => c.type === "text");
      text = textItems.map((c: any) => c.text).join("\n");
      for (const item of content) {
        if (item.type === "tool_result") {
          const resultText = typeof item.content === "string" ? item.content
            : Array.isArray(item.content) ? item.content.filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n") : "";
          events.push({
            eventName: "PostToolUse",
            message: { type: "tool_result", toolUseId: item.tool_use_id, content: resultText, timestamp: ts, turnIndex: turn, index: baseIndex + events.length },
          });
        }
      }
    }
    if (text) {
      events.push({
        eventName: "UserPromptSubmit",
        message: { type: "user", text, timestamp: ts, turnIndex: turn, index: baseIndex + events.length },
      });
    }
    return events;
  }

  if (obj.type === "assistant") {
    const content = obj.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text") {
          events.push({
            eventName: "AssistantResponse",
            message: { type: "assistant_text", text: block.text, timestamp: ts, turnIndex: turn, index: baseIndex + events.length },
          });
        } else if (block.type === "thinking" && block.thinking) {
          events.push({
            eventName: "Thinking",
            message: { type: "assistant_thinking", text: block.thinking, timestamp: ts, turnIndex: turn, index: baseIndex + events.length },
          });
        } else if (block.type === "tool_use") {
          const input = block.input || {};
          events.push({
            eventName: "PreToolUse",
            message: {
              type: "tool_call", toolUseId: block.id, toolName: block.name,
              description: String(input.description || input.prompt || input.pattern || ""),
              input: String(input.command || input.file_path || JSON.stringify(input, null, 2)),
              timestamp: ts, turnIndex: turn, index: baseIndex + events.length,
            },
          });
        }
      }
    }
    return events;
  }

  if (obj.type === "system") {
    const sub = obj.subtype || "unknown";

    // Local commands (/rename, etc.)
    if (sub === "local_command" && obj.content) {
      const cmdMatch = obj.content.match(/<command-name>([\s\S]*?)<\/command-name>/);
      const argsMatch = obj.content.match(/<command-args>([\s\S]*?)<\/command-args>/);
      const stdoutMatch = obj.content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
      const command = cmdMatch ? cmdMatch[1] + (argsMatch ? " " + argsMatch[1] : "") : "";
      const output = stdoutMatch ? stdoutMatch[1] : "";
      if (command || output) {
        events.push({
          eventName: "System",
          message: { type: "local_command", command, output, timestamp: ts, turnIndex: turn, index: baseIndex + events.length } as any,
        });
        return events;
      }
    }

    let eventName = "System";
    if (sub === "init") eventName = "SessionStart";
    else if (sub === "stop_hook_summary") eventName = "Stop";
    else if (sub === "turn_duration") eventName = "TurnComplete";
    else if (sub === "notification") eventName = "Notification";

    let text = "System: " + sub;
    if (obj.durationMs) text += " (" + obj.durationMs + "ms)";

    events.push({
      eventName,
      message: { type: "system", subtype: sub, text, timestamp: ts, turnIndex: turn, index: baseIndex + events.length },
    });
    return events;
  }

  // Queue operations (task notifications, queued user messages)
  if (obj.type === "queue-operation" && obj.operation === "enqueue" && obj.content) {
    events.push({
      eventName: "System",
      message: { type: "queued", text: obj.content, timestamp: ts, turnIndex: turn, index: baseIndex + events.length } as any,
    });
    return events;
  }

  return events;
}

export function stopAllWatchers() {
  for (const [, active] of activeWatchers) {
    if (active.watcher) active.watcher.close();
    if (active.heartbeat) clearInterval(active.heartbeat);
  }
  activeWatchers.clear();
}
