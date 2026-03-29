---
name: glassboard
description: Open Glassboard — the accessible session viewer
user_invocable: true
---

# Open Glassboard

Start the Glassboard server if it isn't running and open it in the browser.

## Instructions

Run this bash command to start Glassboard and open it:

```bash
PLUGIN_DIR="${CLAUDE_PLUGIN_ROOT}"
GLASSBOARD_PATH="${CLAUDE_PLUGIN_ROOT}/.."
PORT=4001

# Read port from settings if available
if [ -f "$PLUGIN_DIR/.local.md" ]; then
  _port=$(grep -oP 'port:\s*\K\d+' "$PLUGIN_DIR/.local.md" 2>/dev/null)
  [ -n "$_port" ] && PORT="$_port"
fi

# Start server if not running
if ! curl -s -o /dev/null "http://localhost:$PORT/" 2>/dev/null; then
  cd "$GLASSBOARD_PATH" && nohup bun run server.ts > /dev/null 2>&1 &
  sleep 2
fi

# Open browser (cross-platform)
URL="http://localhost:$PORT/"
if command -v rundll32.exe &>/dev/null; then
  rundll32.exe url.dll,FileProtocolHandler "$URL"
elif command -v xdg-open &>/dev/null; then
  xdg-open "$URL"
elif command -v open &>/dev/null; then
  open "$URL"
fi

echo "Glassboard is running at http://localhost:$PORT/"
```

Tell the user that Glassboard has been opened in their browser.
