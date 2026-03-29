import { readFile } from "fs/promises";
import type { ParsedMessage, PaginatedResponse } from "./types";

export async function parseSessionFile(
  filePath: string,
): Promise<ParsedMessage[]> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());
  const messages: ParsedMessage[] = [];

  let turnIndex = -1;

  for (const line of lines) {
    let obj: any;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.type === "file-history-snapshot") continue;
    const ts: string | null = obj.timestamp || null;

    if (obj.type === "user") {
      turnIndex++;
      parseUserLine(obj, ts, turnIndex, messages);
    } else if (obj.type === "assistant") {
      parseAssistantLine(obj, ts, turnIndex, messages);
    } else if (obj.type === "system") {
      parseSystemLine(obj, ts, turnIndex, messages);
    } else if (obj.type === "queue-operation" && obj.operation === "enqueue" && obj.content) {
      messages.push({ type: "queued", text: obj.content, timestamp: ts, turnIndex: turnIndex });
    }
  }

  return messages;
}

function parseUserLine(obj: any, ts: string | null, turn: number, messages: ParsedMessage[]) {
  const content = obj.message?.content;
  if (typeof content === "string") {
    messages.push({ type: "user", text: content, timestamp: ts, turnIndex: turn });
    return;
  }
  if (Array.isArray(content)) {
    const textParts: string[] = [];
    for (const item of content) {
      if (item.type === "text") {
        textParts.push(item.text);
      } else if (item.type === "tool_result") {
        messages.push({
          type: "tool_result",
          toolUseId: item.tool_use_id,
          content: extractToolResultContent(item.content),
          timestamp: ts,
          turnIndex: turn,
        });
      }
    }
    if (textParts.length > 0) {
      messages.push({ type: "user", text: textParts.join("\n"), timestamp: ts, turnIndex: turn });
    }
  }
}

function extractToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text)
      .join("\n");
  }
  return "";
}

function parseAssistantLine(obj: any, ts: string | null, turn: number, messages: ParsedMessage[]) {
  const content = obj.message?.content;
  if (!Array.isArray(content)) return;

  for (const block of content) {
    if (block.type === "text") {
      messages.push({ type: "assistant_text", text: block.text, timestamp: ts, turnIndex: turn });
    } else if (block.type === "thinking" && block.thinking) {
      messages.push({ type: "assistant_thinking", text: block.thinking, timestamp: ts, turnIndex: turn });
    } else if (block.type === "tool_use") {
      const input = block.input || {};
      messages.push({
        type: "tool_call",
        toolUseId: block.id,
        toolName: block.name,
        description: String(input.description || input.prompt || input.pattern || ""),
        input: String(input.command || input.file_path || JSON.stringify(input, null, 2)),
        timestamp: ts,
        turnIndex: turn,
      });
    }
  }
}

function parseSystemLine(obj: any, ts: string | null, turn: number, messages: ParsedMessage[]) {
  const subtype = obj.subtype || "unknown";

  // Local commands (e.g. /rename) have content with XML-like tags
  if (subtype === "local_command" && obj.content) {
    const cmdMatch = obj.content.match(/<command-name>([\s\S]*?)<\/command-name>/);
    const argsMatch = obj.content.match(/<command-args>([\s\S]*?)<\/command-args>/);
    const stdoutMatch = obj.content.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
    const command = cmdMatch ? cmdMatch[1] + (argsMatch ? " " + argsMatch[1] : "") : "";
    const output = stdoutMatch ? stdoutMatch[1] : "";
    if (command || output) {
      messages.push({ type: "local_command", command, output, timestamp: ts, turnIndex: turn });
      return;
    }
  }

  let text = `System: ${subtype}`;
  if (obj.durationMs) text += ` (${obj.durationMs}ms)`;
  if (obj.messageCount) text += `, ${obj.messageCount} messages`;
  messages.push({ type: "system", subtype, text, timestamp: ts, turnIndex: turn });
}

export function paginateMessages(
  allMessages: ParsedMessage[],
  opts: { before?: number; limit: number; snapToTurnBoundary?: boolean },
): PaginatedResponse {
  const total = allMessages.length;
  const limit = opts.limit;
  const snap = opts.snapToTurnBoundary !== false;

  let endIndex = opts.before != null ? Math.min(opts.before, total) : total;
  let startIndex = Math.max(0, endIndex - limit);

  if (snap && startIndex > 0) {
    const turnAtBoundary = allMessages[startIndex].turnIndex;
    while (startIndex > 0 && allMessages[startIndex - 1].turnIndex === turnAtBoundary) {
      startIndex--;
    }
  }

  return {
    messages: allMessages.slice(startIndex, endIndex),
    totalCount: total,
    startIndex,
    endIndex,
    hasMore: startIndex > 0,
  };
}
