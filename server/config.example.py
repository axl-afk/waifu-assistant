# ── LLM provider selection ─────────────────────────────────
# This is the ONLY line you need to change to switch models:
#   "openai"    -> OpenAI / OpenRouter / Groq / Together / Azure OpenAI...
#   "local"     -> Ollama / LM Studio / vLLM / llama.cpp / any offline
#                  server that exposes an OpenAI-compatible /v1 API
#   "gemini"    -> Google Gemini
#   "anthropic" -> Claude
LLM_PROVIDER = "openai"

# ── Settings for LLM_PROVIDER = "openai" or "local" ────────
# For "local", just point LLM_BASE_URL at your local server, e.g.:
#   Ollama:      "http://localhost:11434/v1"
#   LM Studio:   "http://localhost:1234/v1"
#   vLLM:        "http://localhost:8000/v1"
# LLM_API_KEY can usually be left as any placeholder string for local servers.
LLM_BASE_URL = "https://api.openai.com/v1"
LLM_API_KEY = "sk-..."
LLM_MODEL = "gpt-4o-mini"

# ── Settings for LLM_PROVIDER = "gemini" ────────────────────
# pip install google-generativeai
GEMINI_API_KEY = ""
GEMINI_MODEL = "gemini-2.0-flash"

# ── Settings for LLM_PROVIDER = "anthropic" ─────────────────
# pip install anthropic
ANTHROPIC_API_KEY = ""
ANTHROPIC_MODEL = "claude-sonnet-4-6"

# ── Everything below is unchanged from before ───────────────
CHARACTER_NAME = "Yuki"
CHARACTER_PROMPT = (
    "You are Yuki, a warm, playful AI companion. "
    "Tag your replies with an emotion like [happy] or [thinking] and, "
    "when relevant, a motion like [greeting] or [peaceSign]."
)
HOST = "0.0.0.0"
PORT = 8000
