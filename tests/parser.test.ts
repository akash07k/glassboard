import { describe, test, expect } from "bun:test";
import { parseSessionFile, paginateMessages } from "../lib/parser";
import { join } from "path";

const FIXTURE = join(import.meta.dir, "fixtures", "sample-session.jsonl");

describe("parseSessionFile", () => {
  test("skips file-history-snapshot lines", async () => {
    const messages = await parseSessionFile(FIXTURE);
    expect(messages.map((m) => m.type)).not.toContain("file-history-snapshot");
  });

  test("parses user message with string content", async () => {
    const messages = await parseSessionFile(FIXTURE);
    expect(messages.find((m) => m.type === "user" && m.text === "hello world")).toBeDefined();
  });

  test("parses user message with array content", async () => {
    const messages = await parseSessionFile(FIXTURE);
    expect(messages.find((m) => m.type === "user" && m.text === "run a command")).toBeDefined();
  });

  test("extracts tool_result from user message content array", async () => {
    const messages = await parseSessionFile(FIXTURE);
    const tr = messages.find((m) => m.type === "tool_result" && m.toolUseId === "tu1");
    expect(tr).toBeDefined();
    expect(tr!.content).toBe("command output here");
  });

  test("parses assistant text", async () => {
    const messages = await parseSessionFile(FIXTURE);
    expect(messages.find((m) => m.type === "assistant_text" && m.text === "Hi there!")).toBeDefined();
  });

  test("parses assistant thinking", async () => {
    const messages = await parseSessionFile(FIXTURE);
    expect(messages.find((m) => m.type === "assistant_thinking" && m.text === "let me think")).toBeDefined();
  });

  test("parses tool_use", async () => {
    const messages = await parseSessionFile(FIXTURE);
    const tc = messages.find((m) => m.type === "tool_call" && m.toolName === "Bash");
    expect(tc).toBeDefined();
    expect(tc!.toolUseId).toBe("tu2");
    expect(tc!.description).toBe("List files");
  });

  test("parses system messages", async () => {
    const messages = await parseSessionFile(FIXTURE);
    expect(messages.find((m) => m.type === "system" && m.subtype === "turn_duration")).toBeDefined();
  });

  test("preserves file order", async () => {
    const messages = await parseSessionFile(FIXTURE);
    expect(messages[0].type).toBe("user");
    expect(messages[1].type).toBe("assistant_thinking");
    expect(messages[2].type).toBe("assistant_text");
  });
});

describe("paginateMessages", () => {
  test("returns last N messages when no before param", async () => {
    const all = await parseSessionFile(FIXTURE);
    const result = paginateMessages(all, { limit: 3 });
    expect(result.messages.length).toBeLessThanOrEqual(4);
    expect(result.endIndex).toBe(all.length);
    expect(result.totalCount).toBe(all.length);
  });

  test("returns messages before a given index", async () => {
    const all = await parseSessionFile(FIXTURE);
    const result = paginateMessages(all, { before: all.length, limit: 3 });
    expect(result.endIndex).toBeLessThanOrEqual(all.length);
    expect(result.hasMore).toBe(result.startIndex > 0);
  });

  test("snaps to turn boundary", async () => {
    const all = await parseSessionFile(FIXTURE);
    const result = paginateMessages(all, { limit: 3, snapToTurnBoundary: true });
    if (result.messages.length > 0) {
      const firstTurn = result.messages[0].turnIndex;
      const prior = all.slice(0, result.startIndex);
      const splitTurn = prior.filter(m => m.turnIndex === firstTurn);
      expect(splitTurn.length).toBe(0);
    }
  });
});
