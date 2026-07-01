#!/bin/bash
# ════════════════════════════════════════════════════════════
#  Waifu Assistant — One-Command Linux Installer
#  Supports: Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch
#  Run: chmod +x install_linux.sh && ./install_linux.sh
# ════════════════════════════════════════════════════════════

set -e

PURPLE='\033[0;35m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${PURPLE}"
echo "🌸  Waifu Assistant — Linux Installer  🌸"
echo -e "${NC}"

# ── Detect distro ─────────────────────────────────────────
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
else
    DISTRO="unknown"
fi

echo "Detected: $DISTRO"
echo ""

install_packages_apt() {
    sudo apt-get update -qq
    sudo apt-get install -y "$@" -qq
}

install_packages_dnf() {
    sudo dnf install -y "$@" -q
}

install_packages_pacman() {
    sudo pacman -Sy --noconfirm "$@"
}

install_pkg() {
    case $DISTRO in
        ubuntu|debian|linuxmint|pop)
            install_packages_apt "$@"
            ;;
        fedora|rhel|centos)
            install_packages_dnf "$@"
            ;;
        arch|manjaro|endeavouros)
            install_packages_pacman "$@"
            ;;
        *)
            echo -e "${YELLOW}Unknown distro — trying apt...${NC}"
            install_packages_apt "$@"
            ;;
    esac
}

# ── Step 1: System dependencies ───────────────────────────
echo -e "${PURPLE}Installing system dependencies...${NC}"

case $DISTRO in
    ubuntu|debian|linuxmint|pop)
        install_packages_apt \
            python3.12 python3.12-venv python3.12-dev \
            ffmpeg \
            nodejs npm \
            playerctl \
            brightnessctl \
            curl wget git
        ;;
    fedora|rhel|centos)
        install_packages_dnf \
            python3.12 python3.12-devel \
            ffmpeg \
            nodejs npm \
            playerctl \
            brightnessctl \
            curl wget git
        ;;
    arch|manjaro|endeavouros)
        install_packages_pacman \
            python \
            ffmpeg \
            nodejs npm \
            playerctl \
            brightnessctl \
            curl wget git
        ;;
esac

echo -e "${GREEN}✅ System dependencies installed${NC}"

# ── Step 2: Python virtual environment ────────────────────
echo ""
echo -e "${PURPLE}Setting up Python environment...${NC}"
cd "$(dirname "$0")/server"

if [ ! -d "venv" ]; then
    python3.12 -m venv venv 2>/dev/null || python3 -m venv venv
fi
source venv/bin/activate

echo "Installing Python packages (this may take a few minutes)..."
pip install --upgrade pip -q
pip install -r requirements.txt -q

# ── Step 3: Download AI models ────────────────────────────
echo ""
echo -e "${PURPLE}Downloading AI models (TTS voice)...${NC}"
python3 download_models.py

deactivate

# ── Step 4: Setup .env ────────────────────────────────────
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${YELLOW}Created .env — edit it with your API key!${NC}"
fi

# ── Step 5: Node dependencies ─────────────────────────────
echo ""
echo -e "${PURPLE}Setting up 3D renderer...${NC}"
cd "../renderer"
npm install --silent

cd ..

# ── Step 6: Brightness permissions (Linux needs udev rule) ─
echo ""
echo -e "${PURPLE}Setting up brightness control permissions...${NC}"
if ! groups $USER | grep -q video; then
    sudo usermod -aG video $USER
    echo -e "${YELLOW}Added $USER to 'video' group for brightness control.${NC}"
    echo -e "${YELLOW}You may need to log out and back in for this to take effect.${NC}"
fi

echo ""
echo -e "${GREEN}🌸 Installation complete! 🌸${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit server/.env and add your LLM API key"
echo "  2. Run: ./start.sh"
echo ""
echo "Media control works with any MPRIS player: Spotify, VLC, Firefox, Chrome, etc."
echo "Just start playing something and say 'pause' or 'next song' to Yuki."
echo ""
