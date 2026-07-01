#!/bin/bash
# ════════════════════════════════════════════════════════════
#  Waifu Assistant — Start Script
#  Just run: ./start.sh
# ════════════════════════════════════════════════════════════

cd "$(dirname "$0")"

# Kill any existing instances on our ports
lsof -ti:8765 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

echo "🌸 Starting Waifu Assistant..."

# Start Python server (auto-activates venv)
(cd server && source venv/bin/activate && python3.12 main.py) &
SERVER_PID=$!

# Wait for server to be ready
sleep 6

# Start Vite renderer and open browser automatically
(cd renderer && npx vite --open) &
RENDERER_PID=$!

echo ""
echo "✅ Yuki is running!"
echo "📱 Open http://localhost:5173 in your browser"
echo ""
echo "Press Ctrl+C to stop."

trap "echo 'Stopping Yuki...'; kill $SERVER_PID $RENDERER_PID 2>/dev/null; exit" INT TERM

wait