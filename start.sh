#!/bin/bash
# ════════════════════════════════════════════════════════════
#  Waifu Assistant — Start Script
#  Launches both the server and renderer, opens the browser.
# ════════════════════════════════════════════════════════════

cd "$(dirname "$0")"

echo "🌸 Starting Waifu Assistant..."

# Start the Python server in the background
(cd server && source venv/bin/activate && python3.12 main.py) &
SERVER_PID=$!

# Give the server a moment to boot (loading TTS/STT models)
sleep 3

# Start the Vite renderer in the background
(cd renderer && npx vite --open) &
RENDERER_PID=$!

echo ""
echo "✅ Server running (PID $SERVER_PID)"
echo "✅ Renderer running (PID $RENDERER_PID)"
echo ""
echo "Press Ctrl+C to stop everything."

# Forward Ctrl+C to kill both background processes cleanly
trap "echo 'Stopping...'; kill $SERVER_PID $RENDERER_PID 2>/dev/null; exit" INT TERM

wait
