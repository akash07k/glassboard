import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { spawn } from "child_process";

const pluginDir = resolve(dirname(Bun.main), "..");
const settingsFile = resolve(pluginDir, ".local.md");
const pidFile = resolve(pluginDir, ".glassboard.pid");

// Defaults
let port = 4001;
let autoOpen = true;
let glassboardPath = resolve(pluginDir, "..");

// Read settings from .local.md if present
if (existsSync(settingsFile)) {
  const text = readFileSync(settingsFile, "utf-8");
  const portMatch = text.match(/port:\s*(\d+)/);
  const autoMatch = text.match(/autoOpen:\s*(\w+)/);
  const pathMatch = text.match(/glassboardPath:\s*(.+)/);
  if (portMatch) port = Number(portMatch[1]);
  if (autoMatch) autoOpen = autoMatch[1] === "true";
  if (pathMatch) glassboardPath = pathMatch[1].trim();
}

// Read session info from hook stdin
const input = await Bun.stdin.text();
let sessionId = "";
let cwd = "";
try {
  const data = JSON.parse(input);
  sessionId = data.session_id ?? "";
  cwd = data.cwd ?? "";
} catch {}

// Derive project ID from cwd
const projectId = cwd ? cwd.replace(/[:\\/]/g, "-") : "";

// Build URL
let url = `http://localhost:${port}/`;
if (projectId && sessionId) {
  url += `?project=${projectId}&session=${sessionId}`;
} else if (projectId) {
  url += `?project=${projectId}`;
}

function openUrl(target: string) {
  if (!autoOpen) return;
  const platform = process.platform;
  if (platform === "win32") {
    Bun.spawn(["rundll32.exe", "url.dll,FileProtocolHandler", target]);
  } else if (platform === "darwin") {
    Bun.spawn(["open", target]);
  } else {
    Bun.spawn(["xdg-open", target]);
  }
}

// Check if server is already running
async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/`);
    return res.ok;
  } catch {
    return false;
  }
}

if (await isServerRunning()) {
  openUrl(url);
  process.exit(0);
}

// Verify Glassboard directory exists
const serverFile = resolve(glassboardPath, "server.ts");
if (!existsSync(serverFile)) {
  process.stderr.write(`Glassboard not found at ${glassboardPath}\n`);
  process.exit(0);
}

// Start the server in a new process group so it survives hook termination.
// Bun.spawn doesn't support detached mode; child_process.spawn does.
// Without detached: true, Claude Code kills the server when cleaning up the hook's process tree.
const child = spawn("bun", ["run", serverFile], {
  cwd: glassboardPath,
  detached: true,
  stdio: "ignore",
});
child.unref();
writeFileSync(pidFile, String(child.pid));

// Wait for server to be ready (max 5 seconds)
for (let i = 0; i < 10; i++) {
  if (await isServerRunning()) break;
  await Bun.sleep(500);
}

openUrl(url);
