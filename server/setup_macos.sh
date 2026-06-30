#!/bin/bash
# ════════════════════════════════════════════════════════════
#  Waifu Assistant — macOS System Control Setup
#  Installs CLI helper tools needed for system control features
#  (media playback, brightness). Run this once after cloning.
# ════════════════════════════════════════════════════════════

set -e

echo "🌸 Setting up system control dependencies for macOS..."
echo ""

# Check Homebrew exists
if ! command -v brew &> /dev/null; then
    echo "❌ Homebrew not found. Install it first from https://brew.sh"
    exit 1
fi

echo "✅ Homebrew found"
echo ""

# ── nowplaying-cli: media play/pause/next/previous control ──
if command -v nowplaying-cli &> /dev/null; then
    echo "✅ nowplaying-cli already installed (media controls)"
else
    echo "📦 Installing nowplaying-cli (media play/pause control)..."
    brew install nowplaying-cli
fi

# ── brightness: screen brightness control ────────────────────
if command -v brightness &> /dev/null; then
    echo "✅ brightness already installed (brightness control)"
else
    echo "📦 Installing brightness (screen brightness control)..."
    brew install brightness
fi

echo ""
echo "🌸 System control setup complete!"
echo ""
echo "⚠️  One manual step remains — enable JavaScript automation in Safari:"
echo "   1. Safari → Settings → Advanced → check 'Show features for web developers'"
echo "   2. A 'Develop' menu will appear in the menu bar"
echo "   3. Develop menu → check 'Allow JavaScript from Apple Events'"
echo "   (This lets Yuki control videos playing in your browser tabs)"
echo ""
echo "You're all set! Restart the server to use system control features."
