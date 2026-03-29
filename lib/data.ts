import { readdir, readFile, stat } from "fs/promises";
import { join, sep } from "path";
import { homedir } from "os";
import type { Project, SessionSummary } from "./types";

const CLAUDE_DIR = join(homedir(), ".claude");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

export async function listProjects(): Promise<Project[]> {
  const entries = await readdir(PROJECTS_DIR).catch(() => []);
  const pathMap = await buildProjectPathMap();
  return entries.map((id) => ({
    id,
    friendlyName: pathMap.get(id) || decodeFallback(id),
  }));
}

// Build a map from project dir name → real filesystem path using history.jsonl
async function buildProjectPathMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const historyPath = join(CLAUDE_DIR, "history.jsonl");
  try {
    const content = await readFile(historyPath, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      let obj: any;
      try { obj = JSON.parse(line); } catch { continue; }
      const realPath: string = obj.project;
      if (!realPath) continue;
      // Encode the path the same way Claude Code does: replace : and separators with -
      const encoded = realPath.replace(/[:\\/]/g, "-");
      if (!map.has(encoded)) map.set(encoded, realPath);
    }
  } catch {}
  return map;
}

// Fallback for projects not found in history
function decodeFallback(dirName: string): string {
  // Best-effort: restore drive colon, replace - with separator
  const m = dirName.match(/^([A-Za-z])-(.*)$/);
  if (m) return m[1] + ":" + m[2].replace(/-/g, sep);
  return dirName.replace(/-/g, sep);
}

export async function listSessions(projectId: string): Promise<SessionSummary[]> {
  const projectDir = join(PROJECTS_DIR, projectId);
  const entries = await readdir(projectDir).catch(() => []);
  const jsonlFiles = entries.filter((f) => f.endsWith(".jsonl"));

  // Build sessionId → name map from session metadata files
  const nameMap = await buildSessionNameMap();

  const sessions: SessionSummary[] = [];
  for (const file of jsonlFiles) {
    const filePath = join(projectDir, file);
    const fileStat = await stat(filePath);
    const sessionId = file.replace(".jsonl", "");
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    sessions.push({
      sessionId,
      date: fileStat.mtime.toISOString(),
      label: nameMap.get(sessionId) || extractFirstUserPrompt(lines),
      lineCount: lines.length,
    });
  }

  sessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return sessions;
}

// Cache file for session names — Claude's session metadata files are
// ephemeral (recreated per process), so names get lost on resume.
// We cache any names we discover so they persist.
const NAME_CACHE_PATH = join(CLAUDE_DIR, "glassboard-session-names.json");

async function loadNameCache(): Promise<Record<string, string>> {
  try {
    const content = await readFile(NAME_CACHE_PATH, "utf-8");
    return JSON.parse(content);
  } catch { return {}; }
}

async function saveNameCache(cache: Record<string, string>): Promise<void> {
  const { writeFile } = await import("fs/promises");
  await writeFile(NAME_CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function buildSessionNameMap(): Promise<Map<string, string>> {
  const cache = await loadNameCache();
  const map = new Map<string, string>(Object.entries(cache));
  let cacheUpdated = false;

  // Scan active session metadata for any new names
  const sessionsDir = join(CLAUDE_DIR, "sessions");
  try {
    const files = await readdir(sessionsDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const content = await readFile(join(sessionsDir, file), "utf-8");
        const obj = JSON.parse(content);
        if (obj.sessionId && obj.name && cache[obj.sessionId] !== obj.name) {
          map.set(obj.sessionId, obj.name);
          cache[obj.sessionId] = obj.name;
          cacheUpdated = true;
        }
      } catch { continue; }
    }
  } catch {}

  if (cacheUpdated) await saveNameCache(cache);
  return map;
}

function extractFirstUserPrompt(lines: string[]): string {
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === "user") {
        const content = obj.message?.content;
        if (typeof content === "string") return content.slice(0, 80);
        if (Array.isArray(content)) {
          const text = content.find((c: any) => c.type === "text");
          if (text) return text.text.slice(0, 80);
        }
      }
    } catch {
      continue;
    }
  }
  return "(empty session)";
}

export function getSessionFilePath(projectId: string, sessionId: string): string {
  return join(PROJECTS_DIR, projectId, `${sessionId}.jsonl`);
}
