import type { ParsedMessage } from "./types";

function codeFence(content: string): string {
  let len = 3;
  while (content.includes("`".repeat(len))) len++;
  const fence = "`".repeat(len);
  return fence + "\n" + content + "\n" + fence;
}

interface ExportMeta {
  sessionId: string;
  project: string;
  date: string;
}

export function exportMarkdown(messages: ParsedMessage[], meta: ExportMeta): string {
  const lines: string[] = [
    `# Session: ${meta.sessionId}`,
    `**Project:** ${meta.project}`,
    `**Date:** ${meta.date}`,
    "", "---", "",
  ];

  for (const msg of messages) {
    switch (msg.type) {
      case "user":
        lines.push(`## User\n${msg.text}`, "", "---", "");
        break;
      case "assistant_text":
        lines.push(`## Assistant\n${msg.text}`, "", "---", "");
        break;
      case "assistant_thinking":
        lines.push(`## Thinking\n${msg.text}`, "", "---", "");
        break;
      case "tool_call":
        lines.push(`### Tool: ${msg.toolName} — ${msg.description}`, codeFence(msg.input), "");
        break;
      case "tool_result":
        lines.push(codeFence(msg.content), "", "---", "");
        break;
      case "system":
        lines.push(`*${msg.text}*`, "");
        break;
      case "local_command":
        lines.push(`> ${msg.command}`, msg.output ? `${msg.output}` : "", "");
        break;
      case "queued":
        lines.push(`*Queued: ${msg.text}*`, "");
        break;
    }
  }
  return lines.join("\n");
}

export function exportPlainText(messages: ParsedMessage[], meta: ExportMeta): string {
  const lines: string[] = [
    `Session: ${meta.sessionId}`,
    `Project: ${meta.project}`,
    `Date: ${meta.date}`,
    "", "---", "",
  ];

  for (const msg of messages) {
    switch (msg.type) {
      case "user":
        lines.push(`[User]\n${msg.text}`, "", "---", "");
        break;
      case "assistant_text":
        lines.push(`[Assistant]\n${msg.text}`, "", "---", "");
        break;
      case "assistant_thinking":
        lines.push(`[Thinking]\n${msg.text}`, "", "---", "");
        break;
      case "tool_call":
        lines.push(`[Tool: ${msg.toolName}] ${msg.description}`, `> ${msg.input}`, "");
        break;
      case "tool_result":
        lines.push(msg.content, "", "---", "");
        break;
      case "system":
        lines.push(`[System] ${msg.text}`, "");
        break;
      case "local_command":
        lines.push(`[Command] ${msg.command}`, msg.output ? msg.output : "", "");
        break;
      case "queued":
        lines.push(`[Queued] ${msg.text}`, "");
        break;
    }
  }
  return lines.join("\n");
}

export function exportHtml(messages: ParsedMessage[], meta: ExportMeta): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const body: string[] = [];
  body.push(`<h1>Session: ${esc(meta.sessionId)}</h1>`);
  body.push(`<p><strong>Project:</strong> ${esc(meta.project)}</p>`);
  body.push(`<p><strong>Date:</strong> ${esc(meta.date)}</p>`);
  body.push("<hr>");

  for (const msg of messages) {
    switch (msg.type) {
      case "user":
        body.push(`<article><h2>User</h2><pre>${esc(msg.text)}</pre></article><hr>`);
        break;
      case "assistant_text":
        body.push(`<article><h2>Assistant</h2><pre>${esc(msg.text)}</pre></article><hr>`);
        break;
      case "assistant_thinking":
        body.push(`<article><h2>Thinking</h2><pre>${esc(msg.text)}</pre></article><hr>`);
        break;
      case "tool_call":
        body.push(`<article><h2>Tool: ${esc(msg.toolName)} — ${esc(msg.description)}</h2><pre>${esc(msg.input)}</pre></article>`);
        break;
      case "tool_result":
        body.push(`<article><pre>${esc(msg.content)}</pre></article><hr>`);
        break;
      case "system":
        body.push(`<article><h2>System</h2><p>${esc(msg.text)}</p></article>`);
        break;
      case "local_command":
        body.push(`<article><h2>Command: ${esc(msg.command)}</h2><pre>${esc(msg.output)}</pre></article>`);
        break;
      case "queued":
        body.push(`<article><h2>Queued</h2><pre>${esc(msg.text)}</pre></article>`);
        break;
    }
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Session ${esc(meta.sessionId)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:60rem;margin:0 auto;padding:1rem;background:#1a1a2e;color:#e0e0e0}
pre{white-space:pre-wrap;word-break:break-word}
article{margin:1rem 0;padding:.5rem 1rem;border:1px solid #444;border-radius:4px}
h2{font-size:1rem}
hr{border:none;border-top:1px solid #444}
</style>
</head>
<body>
${body.join("\n")}
</body>
</html>`;
}
