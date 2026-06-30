"""
System Control Module — macOS
Executes real OS-level actions: volume, brightness, media, app launching,
wifi, web search, and browser URL/search actions.

Each function returns a short string result that gets fed back to the LLM
so it can describe what happened in its own words.
"""

import os
import time
import subprocess
import platform
import urllib.parse

OS_NAME = platform.system()  # 'Darwin' = macOS, 'Windows', 'Linux'


def _run_applescript(script: str) -> str:
    try:
        result = subprocess.run(
            ["osascript", "-e", script],
            capture_output=True, text=True, timeout=5
        )
        return result.stdout.strip()
    except Exception as e:
        return f"error: {e}"


def _run_shell(cmd: list) -> str:
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        return result.stdout.strip()
    except Exception as e:
        return f"error: {e}"


# ── Volume ──────────────────────────────────────────────────
def set_volume(level: int) -> str:
    level = max(0, min(100, level))
    if OS_NAME == "Darwin":
        _run_applescript(f"set volume output volume {level}")
        return f"Volume set to {level}%"
    return "Volume control not yet supported on this OS"


def get_volume() -> str:
    if OS_NAME == "Darwin":
        result = _run_applescript("output volume of (get volume settings)")
        return f"Current volume is {result}%"
    return "Not supported"


def mute() -> str:
    if OS_NAME == "Darwin":
        _run_applescript("set volume output muted true")
        return "Muted"
    return "Not supported"


def unmute() -> str:
    if OS_NAME == "Darwin":
        _run_applescript("set volume output muted false")
        return "Unmuted"
    return "Not supported"


# ── Brightness ──────────────────────────────────────────────
def set_brightness(level: int) -> str:
    level = max(0, min(100, level))
    if OS_NAME == "Darwin":
        normalized = level / 100.0
        result = _run_shell(["brightness", str(normalized)])
        if "error" in result.lower() or result == "":
            return ("Brightness control needs the 'brightness' CLI tool. "
                    "Install it with: brew install brightness")
        return f"Brightness set to {level}%"
    return "Brightness control not yet supported on this OS"


# ── Media Controls ────────────────────────────────────────────
def _has_nowplaying_cli() -> bool:
    result = subprocess.run(["which", "nowplaying-cli"], capture_output=True, text=True)
    return bool(result.stdout.strip())


def media_control(action: str) -> str:
    """
    action: play, pause, next, previous
    Uses nowplaying-cli (taps into macOS's system-wide Now Playing API —
    same mechanism as Control Center / media keys) so it works regardless
    of which app is playing audio: Spotify, Music, YouTube in a browser, etc.
    """
    if OS_NAME != "Darwin":
        return "Not supported on this OS yet"

    if not _has_nowplaying_cli():
        return ("Media control needs a helper tool. Run this once in Terminal: "
                "brew install nowplaying-cli")

    cmd_map = {
        "play": ["nowplaying-cli", "play"],
        "pause": ["nowplaying-cli", "pause"],
        "next": ["nowplaying-cli", "next"],
        "previous": ["nowplaying-cli", "previous"],
    }
    cmd = cmd_map.get(action)
    if not cmd:
        return f"Unknown media action: {action}"

    subprocess.run(cmd, capture_output=True)
    return f"Media: {action}"


def control_browser_video(action: str) -> str:
    """
    Controls an HTML5 <video> element (YouTube, Netflix, etc.) playing in
    the frontmost Safari tab using JavaScript injection via AppleScript.
    action: 'play', 'pause', or 'toggle'
    Requires: Safari > Settings > Advanced > "Allow JavaScript from Apple Events"
    """
    if action == "play":
        js = "document.querySelector('video').play();"
    elif action == "pause":
        js = "document.querySelector('video').pause();"
    else:
        js = ("var v = document.querySelector('video'); "
              "if (v) { v.paused ? v.play() : v.pause(); }")

    script = f'''
    tell application "Safari"
        if (count of windows) > 0 then
            tell current tab of front window
                do JavaScript "{js}"
            end tell
        end if
    end tell
    '''
    result = _run_applescript(script)
    if "error" in result.lower():
        return ("error: Could not control browser video. In Safari, enable "
                "Settings > Advanced > 'Allow JavaScript from Apple Events'")
    return f"Browser video: {action}"


# ── Open URL / Search in Browser ──────────────────────────────
def open_url(url: str) -> str:
    if OS_NAME == "Darwin":
        if not url.startswith("http"):
            url = f"https://www.google.com/search?q={urllib.parse.quote(url)}"
        subprocess.run(["open", url])
        return f"Opened {url}"
    return "Not supported on this OS yet"


def search_in_app(app_name: str, query: str) -> str:
    """
    Open a specific site (youtube, google, wikipedia) and search for query.
    For YouTube specifically, also auto-clicks the first video result after
    the page loads, so "search youtube for X and play it" works in one step.
    """
    site_map = {
        "youtube": f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}",
        "google": f"https://www.google.com/search?q={urllib.parse.quote(query)}",
        "wikipedia": f"https://en.wikipedia.org/wiki/Special:Search?search={urllib.parse.quote(query)}",
    }
    target = app_name.lower()
    search_url = site_map.get(target, f"https://www.google.com/search?q={urllib.parse.quote(query)}")

    if OS_NAME != "Darwin":
        return "Not supported on this OS yet"

    subprocess.run(["open", "-a", "Safari", search_url])

    if target == "youtube":
        # Give the page time to load, then click the first video thumbnail
        time.sleep(2.5)
        js = "document.querySelector('ytd-video-renderer a#thumbnail, a#video-title')?.click();"
        script = f'''
        tell application "Safari"
            tell current tab of front window
                do JavaScript "{js}"
            end tell
        end tell
        '''
        _run_applescript(script)
        return f"Opened YouTube, searched '{query}', and playing the first result"

    return f"Opened {app_name} and searched for {query}"


# ── App Launching ─────────────────────────────────────────────
def open_app(app_name: str) -> str:
    if OS_NAME == "Darwin":
        result = subprocess.run(["open", "-a", app_name], capture_output=True, text=True)
        if result.returncode == 0:
            # Give heavier apps (Spotify, Music) a moment to finish launching
            # so an immediately-following play/pause command doesn't fire
            # before the app is ready to receive it.
            if app_name.lower() in ("spotify", "music"):
                time.sleep(2.5)
            return f"Opened {app_name}"
        return f"Could not find app: {app_name}"
    return "Not supported on this OS yet"


def close_app(app_name: str) -> str:
    if OS_NAME == "Darwin":
        script = f'tell application "{app_name}" to quit'
        _run_applescript(script)
        return f"Closed {app_name}"
    return "Not supported on this OS yet"


# ── WiFi ────────────────────────────────────────────────────
def toggle_wifi(enable: bool) -> str:
    if OS_NAME == "Darwin":
        state = "on" if enable else "off"
        _run_shell(["networksetup", "-setairportpower", "en0", state])
        return f"WiFi turned {state}"
    return "Not supported on this OS yet"


# ── Screenshot ──────────────────────────────────────────────
def take_screenshot() -> str:
    if OS_NAME == "Darwin":
        path = os.path.expanduser("~/Desktop/yuki_screenshot.png")
        subprocess.run(["screencapture", path])
        return "Screenshot saved to Desktop"
    return "Not supported on this OS yet"


# ── Lock Screen ───────────────────────────────────────────────
def lock_screen() -> str:
    if OS_NAME == "Darwin":
        subprocess.run(["pmset", "displaysleepnow"])
        return "Screen locked"
    return "Not supported on this OS yet"


# ── Web Search (Tavily) ───────────────────────────────────────
def web_search(query: str) -> str:
    """Search the internet for current information using Tavily"""
    import requests
    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        return "Web search not configured — missing TAVILY_API_KEY"
    try:
        response = requests.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "max_results": 3,
                "search_depth": "basic"
            },
            timeout=8
        )
        data = response.json()
        results = data.get("results", [])
        if not results:
            return "No results found"
        summary = "\n".join([f"- {r['title']}: {r['content'][:200]}" for r in results[:3]])
        return summary
    except Exception as e:
        return f"Search error: {e}"


# ══════════════════════════════════════════════════════════
#  Function Registry (for LLM function calling)
# ══════════════════════════════════════════════════════════
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the internet for current information, news, facts, or anything you don't know",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "The search query"}
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "open_url",
            "description": "Open a website URL or perform a Google search in the default browser",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "A full URL, or a search query if not a URL"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_in_app",
            "description": "Open a specific website (youtube, google, wikipedia) and search for a query there",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_name": {"type": "string", "description": "Which site to search: youtube, google, or wikipedia"},
                    "query": {"type": "string", "description": "What to search for"}
                },
                "required": ["app_name", "query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "set_volume",
            "description": "Set the system volume to a specific level",
            "parameters": {
                "type": "object",
                "properties": {
                    "level": {"type": "integer", "description": "Volume level 0-100"}
                },
                "required": ["level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "set_brightness",
            "description": "Set the screen brightness to a specific level",
            "parameters": {
                "type": "object",
                "properties": {
                    "level": {"type": "integer", "description": "Brightness level 0-100"}
                },
                "required": ["level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "media_control",
            "description": "Control music/media playback",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["play", "pause", "next", "previous"],
                        "description": "Media action to perform"
                    }
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "open_app",
            "description": "Open/launch an application by name",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_name": {"type": "string", "description": "Name of the app, e.g. 'Safari', 'Spotify', 'Notes'"}
                },
                "required": ["app_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "close_app",
            "description": "Close/quit an application by name",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_name": {"type": "string", "description": "Name of the app to close"}
                },
                "required": ["app_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "toggle_wifi",
            "description": "Turn WiFi on or off",
            "parameters": {
                "type": "object",
                "properties": {
                    "enable": {"type": "boolean", "description": "true to turn on, false to turn off"}
                },
                "required": ["enable"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "take_screenshot",
            "description": "Take a screenshot of the screen",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "lock_screen",
            "description": "Lock the computer screen",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mute",
            "description": "Mute system audio",
            "parameters": {"type": "object", "properties": {}}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "unmute",
            "description": "Unmute system audio",
            "parameters": {"type": "object", "properties": {}}
        }
    },
]

FUNCTION_MAP = {
    "web_search": web_search,
    "open_url": open_url,
    "search_in_app": search_in_app,
    "set_volume": set_volume,
    "set_brightness": set_brightness,
    "media_control": media_control,
    "open_app": open_app,
    "close_app": close_app,
    "toggle_wifi": toggle_wifi,
    "take_screenshot": take_screenshot,
    "lock_screen": lock_screen,
    "mute": mute,
    "unmute": unmute,
}


def execute_function(name: str, arguments: dict) -> str:
    fn = FUNCTION_MAP.get(name)
    if not fn:
        return f"Unknown function: {name}"
    try:
        return fn(**arguments)
    except Exception as e:
        return f"Error executing {name}: {e}"
