import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";

const pluginDir = resolve(dirname(Bun.main), "..");
const settingsFile = resolve(pluginDir, ".local.md");

// Defaults
let port = 4001;
let stopOnEnd = false;

if (existsSync(settingsFile)) {
  const text = readFileSync(settingsFile, "utf-8");
  const stopMatch = text.match(/stopOnSessionEnd:\s*(\w+)/);
  const portMatch = text.match(/port:\s*(\d+)/);
  if (stopMatch) stopOnEnd = stopMatch[1] === "true";
  if (portMatch) port = Number(portMatch[1]);
}

// Read session info from hook stdin
const input = await Bun.stdin.text();
let sessionId = "";
try {
  const data = JSON.parse(input);
  sessionId = data.session_id ?? "";
} catch {}

// Deregister this session from the server.
// If stopOnSessionEnd is true, tell the server to shut down when all sessions are gone.
// The server handles the grace period and lifecycle — no process killing needed.
if (sessionId) {
  try {
    await fetch(`http://localhost:${port}/api/sessions/deregister`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId, shutdownIfEmpty: stopOnEnd }),
    });
  } catch {}
}
