import { readFile, writeFile } from "fs/promises";
import { join, extname, resolve, sep } from "path";
import { homedir } from "os";
import { renderToStaticMarkup } from "react-dom/server";
import { listProjects, listSessions, getSessionFilePath } from "./lib/data";
import { startWatching } from "./lib/watcher";
import { parseSessionFile, paginateMessages } from "./lib/parser";
import { exportMarkdown, exportPlainText, exportHtml } from "./lib/export";
import { HomePage } from "./views/home";
import type { AppConfig, ParsedMessage } from "./lib/types";

const BOOKMARKS_PATH = join(homedir(), ".claude", "glassboard-bookmarks.json");

async function loadBookmarks(sessionId: string): Promise<number[]> {
  try {
    const content = await readFile(BOOKMARKS_PATH, "utf-8");
    const all = JSON.parse(content);
    return all[sessionId] || [];
  } catch { return []; }
}

// Serialize bookmark writes to prevent concurrent read-modify-write corruption
let bookmarkLock: Promise<void> = Promise.resolve();

async function toggleBookmark(sessionId: string, index: number): Promise<number[]> {
  let result: number[] = [];
  bookmarkLock = bookmarkLock.then(async () => {
    let all: Record<string, number[]> = {};
    try {
      const content = await readFile(BOOKMARKS_PATH, "utf-8");
      all = JSON.parse(content);
    } catch {}
    const current = all[sessionId] || [];
    const pos = current.indexOf(index);
    if (pos >= 0) current.splice(pos, 1);
    else current.push(index);
    current.sort((a, b) => a - b);
    all[sessionId] = current;
    try {
      await writeFile(BOOKMARKS_PATH, JSON.stringify(all, null, 2));
      result = current;
    } catch (e) {
      console.error("[bookmarks] write failed:", e);
    }
  }).catch(() => {}); // Prevent rejection from poisoning the chain
  await bookmarkLock;
  return result;
}

// In compiled mode, import.meta.dir points to a virtual Bun path (B:\~BUN\root\).
// Detect compiled mode and use the executable's directory for runtime files.
import { dirname } from "path";
const isCompiled = import.meta.dir.startsWith("B:") || import.meta.dir.includes("~BUN");
const APP_DIR = isCompiled ? dirname(process.execPath) : import.meta.dir;

const CONFIG_PATH = join(APP_DIR, "config.json");
let config: AppConfig;
try {
  config = await Bun.file(CONFIG_PATH).json();
} catch (e) {
  console.error(`Failed to load config from ${CONFIG_PATH}:`, e);
  process.exit(1);
}

const PORT = Number(process.env.PORT) || config.port || 4001;
const PUBLIC_DIR = resolve(join(APP_DIR, "public"));

const MIME: Record<string, string> = {
  ".css": "text/css",
  ".js": "application/javascript",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
};

/** Only allow alphanumeric, hyphens, underscores, dots, and spaces in path segments. Blocks . and .. */
function isSafePathSegment(s: string): boolean {
  return /^[\w\-. ]+$/.test(s) && s !== "." && s !== "..";
}

function htmlResponse(el: React.ReactElement): Response {
  return new Response("<!DOCTYPE html>" + renderToStaticMarkup(el), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Build client TypeScript to JavaScript for the browser
// Skip in compiled mode — client.js is pre-built during packaging
const clientTs = join(APP_DIR, "public", "client.ts");
const clientJsExists = await Bun.file(join(APP_DIR, "public", "client.js")).exists();
if (!clientJsExists || (await Bun.file(clientTs).exists())) {
await Bun.build({
  entrypoints: [clientTs],
  outdir: join(APP_DIR, "public"),
  target: "browser",
  splitting: true,
  format: "esm",
  minify: false,
});
console.log("[build] client.ts → client.js");
}

Bun.serve({
  port: PORT,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/style.css" || path === "/favicon.ico" || path.endsWith(".js") || path.startsWith("/sounds/")) {
      const file = join(PUBLIC_DIR, path);
      const resolved = resolve(file);
      if (!resolved.startsWith(PUBLIC_DIR + sep) && resolved !== PUBLIC_DIR) {
        return new Response("Forbidden", { status: 403 });
      }
      try {
        return new Response(await readFile(file), {
          headers: { "content-type": MIME[extname(file)] || "application/octet-stream" },
        });
      } catch { return new Response("Not Found", { status: 404 }); }
    }

    // Serve config defaults for client JS
    if (path === "/api/config") {
      return jsonResponse(config.defaults);
    }

    if (path.startsWith("/api/")) {
      try {
        return await handleApi(req, url);
      } catch (e) {
        console.error("[http] API error:", e);
        return jsonResponse({ error: String(e) }, 500);
      }
    }

    if (path === "/") {
      try {
        return await handleHome(url);
      } catch (e) {
        console.error("[http] home error:", e);
        return new Response("Failed to load session. The session file may have been deleted.", { status: 500 });
      }
    }
    return new Response("Not Found", { status: 404 });
  },
});

async function handleHome(url: URL): Promise<Response> {
  const selectedProject = url.searchParams.get("project") || "";
  const selectedSession = url.searchParams.get("session") || "";
  if (selectedProject && !isSafePathSegment(selectedProject)) return new Response("Bad Request", { status: 400 });
  if (selectedSession && !isSafePathSegment(selectedSession)) return new Response("Bad Request", { status: 400 });
  const projects = await listProjects();
  const sessions = selectedProject ? await listSessions(selectedProject) : [];

  let messages: ParsedMessage[] = [];
  let totalCount = 0;
  let startIndex = 0;

  if (selectedProject && selectedSession) {
    const allMessages = await parseSessionFile(getSessionFilePath(selectedProject, selectedSession));
    const paginated = paginateMessages(allMessages, {
      limit: config.defaults.pagination.messagesPerPage,
      snapToTurnBoundary: config.defaults.pagination.snapToTurnBoundary,
    });
    messages = paginated.messages;
    totalCount = paginated.totalCount;
    startIndex = paginated.startIndex;
  }

  const bookmarks = selectedSession ? await loadBookmarks(selectedSession) : [];

  // Build page title
  const projectObj = projects.find((p) => p.id === selectedProject);
  const sessionObj = sessions.find((s) => s.sessionId === selectedSession);
  let pageTitle = "Glassboard";
  if (sessionObj && projectObj) {
    pageTitle = sessionObj.label + ": " + projectObj.friendlyName + " - Glassboard";
  } else if (projectObj) {
    pageTitle = projectObj.friendlyName + " - Glassboard";
  }

  return htmlResponse(
    HomePage({
      projects, sessions, messages, selectedProject, selectedSession,
      defaults: config.defaults, totalCount, startIndex, pageTitle, bookmarks,
    }),
  );
}

async function handleApi(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;

  if (path === "/api/projects" && req.method === "GET") {
    return jsonResponse(await listProjects());
  }

  const projSessions = path.match(/^\/api\/projects\/([^/]+)\/sessions$/);
  if (projSessions && req.method === "GET") {
    if (!isSafePathSegment(projSessions[1])) {
      return jsonResponse({ error: "Invalid path segment" }, 400);
    }
    return jsonResponse(await listSessions(projSessions[1]));
  }

  const session = path.match(/^\/api\/sessions\/([^/]+)\/([^/]+)$/);
  if (session && req.method === "GET") {
    if (!isSafePathSegment(session[1]) || !isSafePathSegment(session[2])) {
      return jsonResponse({ error: "Invalid path segment" }, 400);
    }
    const filePath = getSessionFilePath(session[1], session[2]);
    const allMessages = await parseSessionFile(filePath);
    const limit = Number(url.searchParams.get("limit")) || config.defaults.pagination.messagesPerPage;
    const beforeParam = url.searchParams.get("before");
    const before = beforeParam != null ? Number(beforeParam) : undefined;
    const result = paginateMessages(allMessages, {
      limit,
      before,
      snapToTurnBoundary: config.defaults.pagination.snapToTurnBoundary,
    });
    return jsonResponse(result);
  }

  const exp = path.match(/^\/api\/sessions\/([^/]+)\/([^/]+)\/export$/);
  if (exp && req.method === "GET") {
    if (!isSafePathSegment(exp[1]) || !isSafePathSegment(exp[2])) {
      return jsonResponse({ error: "Invalid path segment" }, 400);
    }
    return handleExport(url, exp[1], exp[2]);
  }

  // Real-time file watching via SSE
  const watchMatch = path.match(/^\/api\/watch\/([^/]+)\/([^/]+)$/);
  if (watchMatch && req.method === "GET") {
    if (!isSafePathSegment(watchMatch[1]) || !isSafePathSegment(watchMatch[2])) {
      return jsonResponse({ error: "Invalid path segment" }, 400);
    }
    const filePath = getSessionFilePath(watchMatch[1], watchMatch[2]);
    console.log("[watch] SSE for", filePath);

    return new Response(
      new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode(": connected\n\n"));

          let unsubscribe: (() => void) | null = null;

          startWatching(
            filePath,
            (events) => {
              for (const evt of events) {
                try {
                  controller.enqueue(enc.encode(
                    "event: " + evt.eventName + "\ndata: " + JSON.stringify(evt.message) + "\n\n"
                  ));
                } catch {
                  // Stream closed — clean up
                  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
                  break;
                }
              }
            },
            () => {
              try { controller.enqueue(enc.encode(": ping\n\n")); } catch {
                if (unsubscribe) { unsubscribe(); unsubscribe = null; }
              }
            },
          ).then((cleanup) => {
            unsubscribe = cleanup;
            // If client already disconnected before watcher started
            if (req.signal.aborted && unsubscribe) {
              unsubscribe();
              unsubscribe = null;
            }
          }).catch((e) => {
            console.error("[watch] start error:", e);
          });

          req.signal.addEventListener("abort", () => {
            console.log("[watch] client disconnected");
            if (unsubscribe) { unsubscribe(); unsubscribe = null; }
          });
        },
      }),
      {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          "connection": "keep-alive",
        },
      },
    );
  }

  const bookmarksGet = path.match(/^\/api\/bookmarks\/([^/]+)$/);
  if (bookmarksGet && req.method === "GET") {
    if (!isSafePathSegment(bookmarksGet[1])) return jsonResponse({ error: "Invalid" }, 400);
    return jsonResponse({ indices: await loadBookmarks(bookmarksGet[1]) });
  }

  if (bookmarksGet && req.method === "POST") {
    if (!isSafePathSegment(bookmarksGet[1])) return jsonResponse({ error: "Invalid" }, 400);
    const body = (await req.json()) as { index: unknown };
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0) {
      return jsonResponse({ error: "Invalid index" }, 400);
    }
    const indices = await toggleBookmark(bookmarksGet[1], index);
    return jsonResponse({ indices });
  }

  return jsonResponse({ error: "Not Found" }, 404);
}

async function handleExport(url: URL, projectId: string, sessionId: string): Promise<Response> {
  const format = url.searchParams.get("format") || config.defaults.exportFormat || "txt";
  const messages = await parseSessionFile(getSessionFilePath(projectId, sessionId));
  const projects = await listProjects();
  const project = projects.find((p) => p.id === projectId);
  const meta = { sessionId, project: project?.friendlyName || projectId, date: new Date().toISOString().split("T")[0] };

  let content: string, mime: string, ext: string;
  switch (format) {
    case "md": content = exportMarkdown(messages, meta); mime = "text/markdown"; ext = "md"; break;
    case "html": content = exportHtml(messages, meta); mime = "text/html"; ext = "html"; break;
    default: content = exportPlainText(messages, meta); mime = "text/plain"; ext = "txt";
  }

  return new Response(content, {
    headers: {
      "content-type": `${mime}; charset=utf-8`,
      "content-disposition": `attachment; filename="session-${sessionId.slice(0, 8)}.${ext}"`,
    },
  });
}

console.log(`Glassboard running at http://localhost:${PORT}`);
