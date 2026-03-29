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

function openUrl(target: string) {
  if (!autoOpen) return;
  if (process.platform === "win32") {
    Bun.spawn(["rundll32.exe", "url.dll,FileProtocolHandler", target]);
  } else if (process.platform === "darwin") {
    Bun.spawn(["open", target]);
  } else {
    Bun.spawn(["xdg-open", target]);
  }
}

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/`);
    return res.ok;
  } catch {
    return false;
  }
}

// Start server in a truly independent process that survives hook cleanup.
// Bun's child_process.spawn({ detached: true }) doesn't reliably detach on Windows,
// so we use platform-native launchers that create separate process groups.
function startServer(serverFile: string): void {
  if (process.platform === "win32") {
    // PowerShell Start-Process creates a fully independent process outside the hook's tree.
    const psCmd = `Start-Process -FilePath bun -ArgumentList 'run','${serverFile}' -WorkingDirectory '${glassboardPath}' -WindowStyle Hidden`;
    Bun.spawn(["powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", psCmd], {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } else {
    // On Unix, setsid creates a new session so the server outlives the hook's process group.
    // Falls back to direct spawn if setsid is unavailable.
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

if (await isServerRunning()) {
  openUrl(url);
  process.exit(0);
}

const serverFile = resolve(glassboardPath, "server.ts");
if (!existsSync(serverFile)) {
  process.stderr.write(`Glassboard not found at ${glassboardPath}\n`);
  process.exit(0);
}

startServer(serverFile);

// Wait for server to be ready (max 5 seconds)
for (let i = 0; i < 10; i++) {
  if (await isServerRunning()) break;
  await Bun.sleep(500);
}

openUrl(url);
