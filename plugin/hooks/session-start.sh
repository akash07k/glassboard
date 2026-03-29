#!/bin/bash
# Glassboard SessionStart hook
# Starts the Glassboard server if not already running,
# optionally opens the browser directly to the current session.

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS_FILE="$PLUGIN_DIR/.local.md"
PID_FILE="$PLUGIN_DIR/.glassboard.pid"

# Defaults
PORT="${GLASSBOARD_PORT:-4001}"
AUTO_OPEN="${GLASSBOARD_AUTO_OPEN:-true}"
GLASSBOARD_PATH="${GLASSBOARD_PATH:-$PLUGIN_DIR/..}"

# Read settings from .local.md if present
if [ -f "$SETTINGS_FILE" ]; then
  _port=$(grep -oP 'port:\s*\K\d+' "$SETTINGS_FILE" 2>/dev/null)
  _auto=$(grep -oP 'autoOpen:\s*\K\w+' "$SETTINGS_FILE" 2>/dev/null)
  _path=$(grep -oP 'glassboardPath:\s*\K.+' "$SETTINGS_FILE" 2>/dev/null)
  [ -n "$_port" ] && PORT="$_port"
  [ -n "$_auto" ] && AUTO_OPEN="$_auto"
  [ -n "$_path" ] && GLASSBOARD_PATH="$_path"
fi

# Read session info from hook stdin (JSON with session_id, cwd, etc.)
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | grep -oP '"session_id"\s*:\s*"\K[^"]+' 2>/dev/null)
CWD=$(echo "$INPUT" | grep -oP '"cwd"\s*:\s*"\K[^"]+' 2>/dev/null)
# Decode JSON-escaped backslashes (\\) to single backslash (\)
CWD=$(echo "$CWD" | sed 's/\\\\/\\/g')

# Derive project ID from cwd (replace : and separators with -)
PROJECT_ID=""
if [ -n "$CWD" ]; then
  PROJECT_ID=$(echo "$CWD" | sed 's/[:\\/]/-/g')
fi

# Build the URL — go directly to current session if we have the info
URL="http://localhost:$PORT/"
if [ -n "$PROJECT_ID" ] && [ -n "$SESSION_ID" ]; then
  URL="http://localhost:$PORT/?project=$PROJECT_ID&session=$SESSION_ID"
elif [ -n "$PROJECT_ID" ]; then
  URL="http://localhost:$PORT/?project=$PROJECT_ID"
fi

# Check if server is already running
if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" 2>/dev/null | grep -q "200"; then
  if [ "$AUTO_OPEN" = "true" ]; then
    if command -v cmd.exe &>/dev/null; then
      cmd.exe /c start "" "$URL" &
    elif command -v xdg-open &>/dev/null; then
      xdg-open "$URL" &
    elif command -v open &>/dev/null; then
      open "$URL" &
    fi
  fi
  exit 0
fi

# Verify Glassboard directory exists
if [ ! -f "$GLASSBOARD_PATH/server.ts" ]; then
  echo "Glassboard not found at $GLASSBOARD_PATH" >&2
  exit 0
fi

# Start the server in background
cd "$GLASSBOARD_PATH"
nohup bun run server.ts > /dev/null 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

# Wait for server to be ready (max 5 seconds)
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/" 2>/dev/null | grep -q "200"; then
    break
  fi
  sleep 0.5
done

# Open browser if configured
if [ "$AUTO_OPEN" = "true" ]; then
  if command -v cmd.exe &>/dev/null; then
    cmd.exe /c start "" "$URL" &
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$URL" &
  elif command -v open &>/dev/null; then
    open "$URL" &
  fi
fi

exit 0
