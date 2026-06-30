# Waifu Assistant

A customizable AI waifu assistant powered by OpenAI-compatible LLM APIs.

## Installation

```bash
git clone https://github.com/axl-afk/waifu-assistant.git
cd waifu-assistant
chmod +x install.sh start.sh
./install.sh
```

## Configuration

Create or edit `server/.env`:

```env
HOST=0.0.0.0
PORT=8765

LLM_BASE_URL=https://api.groq.com/openai/v1
LLM_API_KEY=YOUR_API_KEY
LLM_MODEL=llama-3.3-70b-versatile

CHARACTER_NAME=Yuki
```

Get an API key from a provider that supports OpenAI-style APIs, such as Groq.

## Run

```bash
./start.sh
```

## Project Structure

```text
waifu-assistant/
├── install.sh
├── start.sh
└── server/
    ├── requirements.txt
    └── .env
```
