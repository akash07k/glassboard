#!/bin/bash
# Glassboard SessionEnd hook
# Optionally stops the server when the Claude session ends.

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SETTINGS_FILE="$PLUGIN_DIR/.local.md"
PID_FILE="$PLUGIN_DIR/.glassboard.pid"

# Read stopOnSessionEnd setting (default: false)
STOP_ON_END="${GLASSBOARD_STOP_ON_END:-false}"

if [ -f "$SETTINGS_FILE" ]; then
  _stop=$(grep -oP 'stopOnSessionEnd:\s*\K\w+' "$SETTINGS_FILE" 2>/dev/null)
  [ -n "$_stop" ] && STOP_ON_END="$_stop"
fi

if [ "$STOP_ON_END" != "true" ]; then
  exit 0
fi

# Kill the server if PID file exists
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    echo "Glassboard server stopped (PID $PID)"
  fi
  rm -f "$PID_FILE"
fi

exit 0
