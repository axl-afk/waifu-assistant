<h1 align="center">🌸 Waifu Assistant</h1>

<p align="center">
  <b>A beautiful 3D AI companion with real voice, emotion, and system control.</b><br/>
  Powered by any LLM you choose — local or cloud. Runs on macOS, Linux, Windows, Android, iOS.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-pink?style=flat-square"/>
  <img src="https://img.shields.io/badge/python-3.12-blue?style=flat-square"/>
  <img src="https://img.shields.io/badge/node-20+-green?style=flat-square"/>
  <img src="https://img.shields.io/badge/LLM-any%20OpenAI--compatible-purple?style=flat-square"/>
  <img src="https://img.shields.io/badge/3D-VRM%20%2B%20Three.js-orange?style=flat-square"/>
</p>

<img width="1913" height="1059" alt="Screenshot 2026-07-01 at 2 49 18 AM" src="https://github.com/user-attachments/assets/872f4613-51d1-46af-beb8-37447e6e64e0" />

---

## ✨ What is this?

Waifu Assistant is a cross-platform AI companion app featuring a **beautiful 3D anime-style avatar** that listens to your voice, responds with natural speech, expresses real emotions through face and body animations, and can **control your computer** — just like Siri or Cortana, but open source and way more customizable.

You bring your own LLM. She brings the personality.

---

## 🎬 Features

- 🎤 **Voice conversation** — speak naturally, she hears and responds
- 🗣️ **Natural TTS voice** — powered by Kokoro-82M (free, local, high quality)
- 😊 **Real emotions** — face expressions and full body animations driven by the LLM response
- 💃 **Anime-style movements** — poses, gestures, lip sync, spring bone hair physics
- 🧠 **Pluggable LLM** — use Claude, GPT-4, Gemini, Groq, Ollama (local), or any OpenAI-compatible endpoint
- 🌐 **Web search** — she can look things up in real time
- 🖥️ **System control** — open apps, play/pause music, set volume, brightness, take screenshots, lock screen
- 📱 **Cross-platform** — macOS, Linux, Windows (browser-based renderer works everywhere)
- 🎭 **7 included avatars** — swap between them instantly, or load your own `.vrm` file
- 🔒 **Privacy first** — everything can run fully locally (Ollama + Kokoro + Whisper)

---

## 🚀 Quick Start (macOS)

```bash
git clone https://github.com/axl-afk/waifu-assistant.git
cd waifu-assistant
chmod +x install.sh start.sh
./install.sh
```

Edit `server/.env` with your API key, then:

```bash
./start.sh
```

Open `http://localhost:5173` in your browser — Yuki is ready. 🌸

---

## 🐧 Quick Start (Linux)

```bash
git clone https://github.com/axl-afk/waifu-assistant.git
cd waifu-assistant
chmod +x install_linux.sh start.sh
./install_linux.sh
```

Edit `server/.env` with your API key, then:

```bash
./start.sh
```

---

## ⚙️ Configuration

Edit `server/.env`:

```env
# Which LLM to use (pick one)
LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=your_api_key_here
LLM_MODEL=llama-3.3-70b-versatile

# Optional: web search (free at tavily.com)
TAVILY_API_KEY=your_tavily_key_here

# Character name (optional)
CHARACTER_NAME=Yuki
```

### Supported LLM backends

| Provider | Base URL | Free tier |
|---|---|---|
| Groq | `https://api.groq.com/openai/v1` | ✅ Yes |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | ✅ Yes |
| Claude | `https://api.anthropic.com/v1` | ❌ Paid |
| OpenAI | `https://api.openai.com/v1` | ❌ Paid |
| Ollama (local) | `http://localhost:11434/v1` | ✅ Free |
| Any OpenAI-compatible | your URL | depends |

---

## 🎤 Voice Commands

Talk to Yuki naturally — she understands context:

| You say | She does |
|---|---|
| "Open Spotify and play music" | Launches Spotify, starts playback |
| "Pause" / "Next song" | Controls whatever is playing |
| "Set volume to 50" | Adjusts system volume |
| "Search YouTube for lofi beats" | Opens Safari, searches, plays first video |
| "Open Safari" | Launches the app |
| "Take a screenshot" | Saves to Desktop |
| "Lock the screen" | Locks your computer |
| "What's the weather in Tokyo?" | Web searches and tells you |
| "Who won the game last night?" | Searches and responds |

---

## 🏗️ Architecture

```
Browser (Three.js + VRM)          Python Server           LLM Backend
┌──────────────────────┐          ┌─────────────┐        ┌────────────┐
│  3D Avatar + UI      │◄────────►│  FastAPI    │◄──────►│ Claude /   │
│  Lip sync            │ WebSocket│  WebSocket  │        │ GPT-4 /    │
│  Emotions/poses      │          │  STT (Whisper)       │ Gemini /   │
│  Voice playback      │          │  TTS (Kokoro)        │ Ollama     │
│  Mic input           │          │  System control      └────────────┘
└──────────────────────┘          └─────────────┘
```

The **server** can run on any machine — your PC, a home server, a VPS, or even a friend's computer. The browser client just needs the server URL. This means your phone can connect to your home PC's LLM over Tailscale or your local network.

---

## 📦 Project Structure

```
waifu-assistant/
├── install.sh              # macOS one-command installer
├── install_linux.sh        # Linux one-command installer
├── start.sh                # Start both server + renderer
├── server/
│   ├── main.py             # FastAPI WebSocket server
│   ├── config.py           # Configuration
│   ├── stt.py              # Speech-to-text (faster-whisper)
│   ├── tts.py              # Text-to-speech (Kokoro)
│   ├── system_control.py   # OS control (volume, apps, media, etc.)
│   ├── download_models.py  # Download TTS/STT models
│   ├── requirements.txt    # Python dependencies
│   └── .env.example        # Config template
└── renderer/
    ├── index.html          # App shell
    ├── main.js             # Three.js + VRM avatar + WebSocket client
    └── public/
        ├── avatars/        # VRM model files
        └── motions/        # VRMA animation clips
```

---

## 🎭 Custom Avatars

Load any VRM 1.0 model:
1. Create your own for free at **vroid.com**
2. Download free models from **hub.vroid.com**
3. Click any **Avatar N** button in the top-right to switch
4. Drop your `.vrm` file into `renderer/public/avatars/`

---

## 🖥️ System Control Setup

### macOS

The installer handles everything. One manual step:

> Safari → Settings → Advanced → "Show features for web developers"
> Then: Develop menu → "Allow JavaScript from Apple Events"

This enables Yuki to control videos playing in your browser (YouTube, Netflix, etc.).

### Linux

Uses `playerctl` for media control (installed automatically). Works with Spotify, VLC, Firefox, Chrome, and any MPRIS-compatible media player.

### Windows

Coming soon — contributions welcome!

---

## 🔌 Connecting Your Phone

To use Yuki on your phone while the server runs on your PC:

1. Install **Tailscale** on both devices (free at tailscale.com)
2. Get your PC's Tailscale IP (looks like `100.x.x.x`)
3. Open `http://100.x.x.x:5173` in your phone's browser
4. Or update the server URL in settings to `ws://100.x.x.x:8765/ws`

---

## 🛠️ Manual Setup (without install script)

**Server:**
```bash
cd server
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3.12 download_models.py
cp .env.example .env
# edit .env with your API key
python3.12 main.py
```

**Renderer:**
```bash
cd renderer
npm install
npx vite
```

---

## 🤝 Contributing

Pull requests welcome! Some good first issues:

- Windows system control support
- Android/iOS Flutter app wrapper
- More VRMA motion clips
- Additional TTS voice options
- Wake word detection ("Hey Yuki")
- Memory / long-term context

Please open an issue before starting on a large feature.

---

## License

This project is licensed under the GNU AGPL v3.0.

Commercial licenses are available for proprietary and commercial use.

Contact: [armanaxlo0o@gmail.com](mailto:armanaxlo0o@gmail.com)


---

## 🙏 Credits

- [three-vrm](https://github.com/pixiv/three-vrm) by Pixiv — VRM rendering
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — speech recognition
- [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) — text to speech
- [VRoid Studio](https://vroid.com/en/studio) — avatar creation

---

<p align="center">Made with 🌸 by <a href="https://github.com/axl-afk">axl-afk</a></p>
