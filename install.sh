#!/bin/bash
# ════════════════════════════════════════════════════════════
#  Waifu Assistant — One-Command macOS Installer
#  Run this once after cloning the repo:
#    chmod +x install.sh && ./install.sh
# ════════════════════════════════════════════════════════════

set -e

PURPLE='\033[0;35m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${PURPLE}"
echo "🌸  Waifu Assistant Installer  🌸"
echo -e "${NC}"

# ── Step 1: Check Homebrew ─────────────────────────────────
if ! command -v brew &> /dev/null; then
    echo -e "${YELLOW}Homebrew not found. Installing...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo -e "${GREEN}✅ Homebrew found${NC}"
fi

# ── Step 2: Check Python 3.12 ───────────────────────────────
if ! command -v python3.12 &> /dev/null; then
    echo -e "${YELLOW}Python 3.12 not found. Installing...${NC}"
    brew install python@3.12
else
    echo -e "${GREEN}✅ Python 3.12 found${NC}"
fi

# ── Step 3: Check Node.js ───────────────────────────────────
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}Node.js not found. Installing...${NC}"
    brew install node
else
    echo -e "${GREEN}✅ Node.js found${NC}"
fi

# ── Step 4: Check ffmpeg (needed for voice input) ───────────
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${YELLOW}ffmpeg not found. Installing...${NC}"
    brew install ffmpeg
else
    echo -e "${GREEN}✅ ffmpeg found${NC}"
fi

# ── Step 5: System control helper tools ─────────────────────
if ! command -v nowplaying-cli &> /dev/null; then
    echo -e "${YELLOW}Installing nowplaying-cli (media controls)...${NC}"
    brew install nowplaying-cli
else
    echo -e "${GREEN}✅ nowplaying-cli found${NC}"
fi

if ! command -v brightness &> /dev/null; then
    echo -e "${YELLOW}Installing brightness (screen brightness control)...${NC}"
    brew install brightness
else
    echo -e "${GREEN}✅ brightness found${NC}"
fi

# ── Step 6: Python virtual environment + dependencies ───────
echo ""
echo -e "${PURPLE}Setting up Python environment...${NC}"
cd "$(dirname "$0")/server"

if [ ! -d "venv" ]; then
    python3.12 -m venv venv
fi
source venv/bin/activate

echo "Installing Python packages (this may take a few minutes)..."
pip install --upgrade pip -q
pip install -r requirements.txt -q

# ── Step 7: Download AI models ──────────────────────────────
echo ""
echo -e "${PURPLE}Downloading AI models (TTS voice)...${NC}"
python3.12 download_models.py

# ── Step 8: Set up .env if missing ──────────────────────────
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${YELLOW}Created .env from template — edit it with your API key before running!${NC}"
fi

deactivate

# ── Step 9: Node dependencies for the 3D renderer ───────────
echo ""
echo -e "${PURPLE}Setting up 3D renderer...${NC}"
cd "../renderer"
npm install --silent

cd ..

echo ""
echo -e "${GREEN}🌸 Installation complete! 🌸${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit server/.env and add your LLM API key (Gemini, Groq, Claude, etc.)"
echo "  2. Enable Safari JavaScript automation:"
echo "     Safari → Settings → Advanced → 'Show features for web developers'"
echo "     Develop menu → 'Allow JavaScript from Apple Events'"
echo "  3. Run: ./start.sh"
echo ""
