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

if (!stopOnEnd) process.exit(0);

// Kill the server by finding the process listening on our port.
// This is more reliable than PID files which can become stale.
if (process.platform === "win32") {
  Bun.spawn(["powershell.exe", "-NoProfile", "-Command",
    `Stop-Process -Id (Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue`
  ], { stdio: ["ignore", "ignore", "ignore"] });
} else {
  Bun.spawn(["bash", "-c", `kill $(lsof -t -i:${port}) 2>/dev/null`], {
    stdio: ["ignore", "ignore", "ignore"],
  });
}
