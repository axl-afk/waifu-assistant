"""
Local settings store for the LLM provider + API keys.

Lets the web UI change which model Yuki uses (and its API key) at
runtime via /settings, instead of the user hand-editing config.py and
restarting the server.

Settings persist to settings.json next to this file. Add settings.json
to .gitignore — it holds API keys.
"""
import json
import os
import threading

_LOCK = threading.Lock()
_PATH = os.path.join(os.path.dirname(__file__), "settings.json")

DEFAULTS = {
    "LLM_PROVIDER": "openai",       # "openai" | "local" | "gemini" | "anthropic"
    "LLM_BASE_URL": "https://api.openai.com/v1",
    "LLM_API_KEY": "",
    "LLM_MODEL": "gpt-4o-mini",
    "GEMINI_API_KEY": "",
    "GEMINI_MODEL": "gemini-2.0-flash",
    "ANTHROPIC_API_KEY": "",
    "ANTHROPIC_MODEL": "claude-sonnet-4-6",
}

_KEY_FIELDS = ("LLM_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY")


def load():
    with _LOCK:
        saved = {}
        if os.path.exists(_PATH):
            try:
                with open(_PATH, "r") as f:
                    saved = json.load(f)
            except Exception:
                saved = {}
        return {**DEFAULTS, **saved}


def save(partial: dict):
    """Merge new values in. Masked placeholders (see mask() below) are
    ignored so re-saving the form without touching a key field doesn't
    wipe out the stored key."""
    with _LOCK:
        current = load()
        for k, v in partial.items():
            if k not in DEFAULTS:
                continue
            if isinstance(v, str) and v.startswith("•"):
                continue  # unchanged masked key from the UI, skip
            current[k] = v
        with open(_PATH, "w") as f:
            json.dump(current, f, indent=2)
        return current


def mask(settings: dict):
    """Return a copy safe to send to the browser: keys are shown as
    bullets + last 4 chars only, never in full."""
    out = dict(settings)
    for field in _KEY_FIELDS:
        val = out.get(field) or ""
        out[field] = ("•" * 6 + val[-4:]) if val else ""
    return out


class SettingsConfig:
    """Wraps a settings dict as an object with attributes, matching what
    llm_providers.get_provider(config) expects (config.LLM_PROVIDER etc.),
    plus the static app settings that still live in config.py."""
    def __init__(self, settings_dict):
        for k, v in settings_dict.items():
            setattr(self, k, v)
        import config as _base
        self.CHARACTER_NAME = _base.CHARACTER_NAME
        self.CHARACTER_PROMPT = _base.CHARACTER_PROMPT
        self.HOST = _base.HOST
        self.PORT = _base.PORT


def get_config():
    return SettingsConfig(load())
