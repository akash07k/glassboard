import { describe, test, expect } from "bun:test";
import { classifyLine } from "../lib/watcher";

// Helper to access message fields without TS union narrowing boilerplate
const msg = (events: ReturnType<typeof classifyLine>, i = 0) => events[i].message as any;

describe("classifyLine", () => {
  test("classifies user message as UserPromptSubmit", () => {
    const obj = { type: "user", message: { content: "hello world" }, timestamp: "2026-01-01T00:00:00Z" };
    const events = classifyLine(obj, "2026-01-01T00:00:00Z", 0, 0);
    expect(events.length).toBe(1);
    expect(events[0].eventName).toBe("UserPromptSubmit");
    expect(events[0].message.type).toBe("user");
    expect(msg(events).text).toBe("hello world");
  });

  test("classifies user message with array content", () => {
    const obj = { type: "user", message: { content: [{ type: "text", text: "run cmd" }] } };
    const events = classifyLine(obj, null, 0, 0);
    expect(events.length).toBe(1);
    expect(events[0].eventName).toBe("UserPromptSubmit");
    expect(msg(events).text).toBe("run cmd");
  });

  test("classifies tool_result in user content as PostToolUse", () => {
    const obj = { type: "user", message: { content: [
      { type: "text", text: "here" },
      { type: "tool_result", tool_use_id: "tu1", content: [{ type: "text", text: "output" }] }
    ] } };
    const events = classifyLine(obj, null, 0, 0);
    expect(events.length).toBe(2);
    expect(events[0].eventName).toBe("PostToolUse");
    expect(events[0].message.type).toBe("tool_result");
    expect(events[1].eventName).toBe("UserPromptSubmit");
  });

  test("classifies assistant text as AssistantResponse", () => {
    const obj = { type: "assistant", message: { content: [{ type: "text", text: "Hi!" }] } };
    const events = classifyLine(obj, null, 0, 0);
    expect(events.length).toBe(1);
    expect(events[0].eventName).toBe("AssistantResponse");
  });

  test("classifies assistant thinking as Thinking", () => {
    const obj = { type: "assistant", message: { content: [{ type: "thinking", thinking: "hmm" }] } };
    const events = classifyLine(obj, null, 0, 0);
    expect(events.length).toBe(1);
    expect(events[0].eventName).toBe("Thinking");
  });

  test("classifies tool_use as PreToolUse", () => {
    const obj = { type: "assistant", message: { content: [
      { type: "tool_use", id: "tu1", name: "Bash", input: { command: "ls", description: "list" } }
    ] } };
    const events = classifyLine(obj, null, 0, 0);
    expect(events.length).toBe(1);
    expect(events[0].eventName).toBe("PreToolUse");
    expect(msg(events).toolName).toBe("Bash");
  });

  test("classifies system init as SessionStart", () => {
    const obj = { type: "system", subtype: "init", session_id: "abc" };
    const events = classifyLine(obj, null, 0, 0);
    expect(events[0].eventName).toBe("SessionStart");
  });

  test("classifies system stop_hook_summary as Stop", () => {
    const obj = { type: "system", subtype: "stop_hook_summary" };
    const events = classifyLine(obj, null, 0, 0);
    expect(events[0].eventName).toBe("Stop");
  });

  test("classifies system turn_duration as TurnComplete", () => {
    const obj = { type: "system", subtype: "turn_duration", durationMs: 500 };
    const events = classifyLine(obj, null, 0, 0);
    expect(events[0].eventName).toBe("TurnComplete");
    expect(msg(events).text).toContain("500ms");
  });

  test("passes through hook_started events", () => {
    const obj = { type: "system", subtype: "hook_started", hook_event: "SubagentStart" };
    const events = classifyLine(obj, null, 0, 0);
    expect(events[0].eventName).toBe("SubagentStart");
  });

  test("classifies multiple assistant content blocks", () => {
    const obj = { type: "assistant", message: { content: [
      { type: "thinking", thinking: "let me think" },
      { type: "text", text: "Here you go" },
      { type: "tool_use", id: "t1", name: "Read", input: { file_path: "/tmp/x" } }
    ] } };
    const events = classifyLine(obj, null, 0, 0);
    expect(events.length).toBe(3);
    expect(events[0].eventName).toBe("Thinking");
    expect(events[1].eventName).toBe("AssistantResponse");
    expect(events[2].eventName).toBe("PreToolUse");
  });

  test("skips empty thinking blocks", () => {
    const obj = { type: "assistant", message: { content: [{ type: "thinking", thinking: "" }] } };
    const events = classifyLine(obj, null, 0, 0);
    expect(events.length).toBe(0);
  });

  test("assigns correct index to sequential events", () => {
    const obj = { type: "assistant", message: { content: [
      { type: "text", text: "a" },
      { type: "text", text: "b" }
    ] } };
    const events = classifyLine(obj, null, 0, 5);
    expect(events[0].message.index).toBe(5);
    expect(events[1].message.index).toBe(6);
  });
});
