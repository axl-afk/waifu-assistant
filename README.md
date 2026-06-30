# Waifu Assistant

A customizable AI voice assistant with a real-time 3D animated character.

## Features

* 🎤 Voice interaction
* 🧠 Powered by OpenAI-compatible LLM APIs
* 🧍 Real-time 3D animated assistant
* 💻 Execute system information commands using voice
* ⚙️ Customizable character and AI model

## Installation

```bash
git clone https://github.com/axl-afk/waifu-assistant.git
cd waifu-assistant
chmod +x install.sh start.sh
./install.sh
```

## Configuration

Edit `server/.env`:

```env
HOST=0.0.0.0
PORT=8765

LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=YOUR_API_KEY
LLM_MODEL=llama-3.3-70b-versatile

CHARACTER_NAME=Yuki
```

Get an API key from any OpenAI-compatible provider, such as Groq.

## Run

```bash
./start.sh
```
