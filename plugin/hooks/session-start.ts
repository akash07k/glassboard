import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";

const pluginDir = resolve(dirname(Bun.main), "..");
const settingsFile = resolve(pluginDir, ".local.md");

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

// Await the browser process so it completes before the hook exits.
// Without this, Claude Code kills the hook's process tree before the
// browser opener (rundll32/open/xdg-open) finishes its work.
async function openUrl(target: string): Promise<void> {
  if (!autoOpen) return;
  let proc;
  if (process.platform === "win32") {
    proc = Bun.spawn(["rundll32.exe", "url.dll,FileProtocolHandler", target]);
  } else if (process.platform === "darwin") {
    proc = Bun.spawn(["open", target]);
  } else {
    proc = Bun.spawn(["xdg-open", target]);
  }
  await proc.exited;
}

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/`);
    return res.ok;
  } catch {
    return false;
  }
}

async function registerSession(): Promise<void> {
  if (!sessionId) return;
  try {
    await fetch(`http://localhost:${port}/api/sessions/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
  } catch {}
}

// Start server via platform-native launcher so it survives hook cleanup.
function startServer(serverFile: string): void {
  if (process.platform === "win32") {
    const psCmd = `Start-Process -FilePath bun -ArgumentList 'run','${serverFile}' -WorkingDirectory '${glassboardPath}' -WindowStyle Hidden`;
    Bun.spawn(["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", psCmd], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } else {
    try {
      Bun.spawn(["setsid", "bun", "run", serverFile], {
        cwd: glassboardPath,
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {
      Bun.spawn(["bun", "run", serverFile], {
        cwd: glassboardPath,
        stdio: ["ignore", "ignore", "ignore"],
      });
    }
  }
}

// --- Main flow ---

// Start server if not already running
if (!(await isServerRunning())) {
  const serverFile = resolve(glassboardPath, "server.ts");
  if (!existsSync(serverFile)) {
    process.stderr.write(`Glassboard not found at ${glassboardPath}\n`);
    process.exit(0);
  }
  startServer(serverFile);
  for (let i = 0; i < 10; i++) {
    if (await isServerRunning()) break;
    await Bun.sleep(500);
  }
}

// Register this session, then open the browser
await registerSession();
await openUrl(url);
