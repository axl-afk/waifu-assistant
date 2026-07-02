# Static app settings. The LLM provider and API keys are now chosen from
# the ⚙️ settings panel in the web UI (saved to settings.json) instead of
# being hand-edited here — see settings_store.py for the defaults used
# the very first time the app runs, before any settings are saved.

CHARACTER_NAME = "Yuki"
CHARACTER_PROMPT = (
    "You are Yuki, a warm, playful AI companion. "
    "Tag your replies with an emotion like [happy] or [thinking] and, "
    "when relevant, a motion like [greeting] or [peaceSign]."
)
HOST = "0.0.0.0"
PORT = 8000
