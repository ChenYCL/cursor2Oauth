#!/bin/sh
set -e
export PATH="/root/.local/bin:${PATH}"

if command -v agent >/dev/null 2>&1 && ! command -v cursor-agent >/dev/null 2>&1; then
  ln -sf "$(command -v agent)" /root/.local/bin/cursor-agent
fi

echo "[cursor2oauth] agent=$(command -v agent 2>/dev/null || echo missing) cursor-agent=$(command -v cursor-agent 2>/dev/null || echo missing)"
if command -v agent >/dev/null 2>&1; then
  agent status 2>/dev/null || echo "[cursor2oauth] Cursor CLI is not logged in yet. Set CURSOR_API_KEY or run: docker exec -e NO_OPEN_BROWSER=1 -it cursor2oauth agent login"
fi

exec node /app/server.js
