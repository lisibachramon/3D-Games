#!/usr/bin/env bash
# FLOTSAM launcher for macOS / Linux. Double-click on Mac, or run ./start.command
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org (LTS) and try again."
  read -p "Press enter to close..." _; exit 1
fi
if [ ! -d node_modules ]; then
  echo "First run: installing dependencies..."
  npm install --omit=dev
fi
PORT="${PORT:-8080}"
( sleep 1.2; (open "http://localhost:$PORT" 2>/dev/null || xdg-open "http://localhost:$PORT" 2>/dev/null) ) &
echo ""
echo "  🌊 FLOTSAM is starting on http://localhost:$PORT"
echo "  Play with friends: share your LAN address, e.g. http://$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}'):$PORT"
echo ""
PORT="$PORT" npm start
