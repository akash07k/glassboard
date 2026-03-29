import { existsSync, readFileSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";

const pluginDir = resolve(dirname(Bun.main), "..");
const settingsFile = resolve(pluginDir, ".local.md");
const pidFile = resolve(pluginDir, ".glassboard.pid");

// Read stopOnSessionEnd setting (default: false)
let stopOnEnd = false;

if (existsSync(settingsFile)) {
  const text = readFileSync(settingsFile, "utf-8");
  const match = text.match(/stopOnSessionEnd:\s*(\w+)/);
  if (match) stopOnEnd = match[1] === "true";
}

if (!stopOnEnd) process.exit(0);

// Kill the server if PID file exists
if (existsSync(pidFile)) {
  const pid = Number(readFileSync(pidFile, "utf-8").trim());
  try {
    process.kill(pid);
  } catch {}
  try {
    unlinkSync(pidFile);
  } catch {}
}
