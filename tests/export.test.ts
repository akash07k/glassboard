import { describe, test, expect } from "bun:test";
import { exportMarkdown, exportPlainText, exportHtml } from "../lib/export";
import type { ParsedMessage } from "../lib/types";

const messages: ParsedMessage[] = [
  { type: "user", text: "hello world", timestamp: "2026-03-28T10:00:00Z", turnIndex: 0 },
  { type: "assistant_text", text: "Hi there!", timestamp: "2026-03-28T10:00:01Z", turnIndex: 0 },
  { type: "tool_call", toolUseId: "t1", toolName: "Bash", description: "List files", input: "ls", timestamp: "2026-03-28T10:00:02Z", turnIndex: 0 },
  { type: "tool_result", toolUseId: "t1", content: "file1.txt\nfile2.txt", timestamp: "2026-03-28T10:00:03Z", turnIndex: 0 },
  { type: "system", subtype: "turn_duration", text: "System: turn_duration (500ms)", timestamp: "2026-03-28T10:00:04Z", turnIndex: 0 },
];

const meta = { sessionId: "abc-123", project: "D:\\projects\\myapp", date: "2026-03-28" };

describe("exportMarkdown", () => {
  test("includes session header", () => {
    const md = exportMarkdown(messages, meta);
    expect(md).toContain("# Session: abc-123");
    expect(md).toContain("**Project:** D:\\projects\\myapp");
  });
  test("formats user messages", () => {
    expect(exportMarkdown(messages, meta)).toContain("## User\nhello world");
  });
  test("formats assistant messages", () => {
    expect(exportMarkdown(messages, meta)).toContain("## Assistant\nHi there!");
  });
  test("formats tool calls with code blocks", () => {
    const md = exportMarkdown(messages, meta);
    expect(md).toContain("### Tool: Bash");
    expect(md).toContain("```\nls\n```");
  });
});

describe("exportPlainText", () => {
  test("formats user messages", () => {
    expect(exportPlainText(messages, meta)).toContain("[User]\nhello world");
  });
  test("formats tool calls", () => {
    const txt = exportPlainText(messages, meta);
    expect(txt).toContain("[Tool: Bash] List files");
    expect(txt).toContain("> ls");
  });
});

describe("exportHtml", () => {
  test("returns valid HTML document", () => {
    const html = exportHtml(messages, meta);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });
  test("escapes HTML entities", () => {
    const msgs: ParsedMessage[] = [{ type: "user", text: '<script>alert("xss")</script>', timestamp: null, turnIndex: 0 }];
    const html = exportHtml(msgs, meta);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});
