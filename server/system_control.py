"""
System Control Module — macOS + Linux
Executes real OS-level actions: volume, brightness, media, app launching,
wifi, web search, and browser URL/search actions.
Each function returns a short string result fed back to the LLM.
"""

import os
import time
import subprocess
import platform
import urllib.parse

OS_NAME = platform.system()  # 'Darwin' = macOS, 'Linux', 'Windows'


def _has_cmd(cmd: str) -> bool:
    result = subprocess.run(["which", cmd], capture_output=True, text=True)
    return bool(result.stdout.strip())


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


# ── Volume ─────────────────────────────────────────────────
def set_volume(level: int) -> str:
    level = max(0, min(100, level))
    if OS_NAME == "Darwin":
        _run_applescript(f"set volume output volume {level}")
        return f"Volume set to {level}%"
    elif OS_NAME == "Linux":
        if _has_cmd("pactl"):
            subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{level}%"])
            return f"Volume set to {level}%"
        elif _has_cmd("amixer"):
            subprocess.run(["amixer", "-q", "sset", "Master", f"{level}%"])
            return f"Volume set to {level}%"
        return "Volume control: install pulseaudio (pactl) or alsa-utils (amixer)"
    return "Not supported on this OS"


def mute() -> str:
    if OS_NAME == "Darwin":
        _run_applescript("set volume output muted true")
        return "Muted"
    elif OS_NAME == "Linux":
        if _has_cmd("pactl"):
            subprocess.run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", "1"])
            return "Muted"
    return "Not supported"


def unmute() -> str:
    if OS_NAME == "Darwin":
        _run_applescript("set volume output muted false")
        return "Unmuted"
    elif OS_NAME == "Linux":
        if _has_cmd("pactl"):
            subprocess.run(["pactl", "set-sink-mute", "@DEFAULT_SINK@", "0"])
            return "Unmuted"
    return "Not supported"


# ── Brightness ─────────────────────────────────────────────
def set_brightness(level: int) -> str:
    level = max(0, min(100, level))
    if OS_NAME == "Darwin":
        if not _has_cmd("brightness"):
            return "Install brightness tool: brew install brightness"
        _run_shell(["brightness", str(level / 100.0)])
        return f"Brightness set to {level}%"
    elif OS_NAME == "Linux":
        if _has_cmd("brightnessctl"):
            subprocess.run(["brightnessctl", "set", f"{level}%"], capture_output=True)
            return f"Brightness set to {level}%"
        return "Install brightnessctl: sudo apt install brightnessctl"
    return "Not supported"


# ── Media Controls ─────────────────────────────────────────
def _has_nowplaying_cli() -> bool:
    return _has_cmd("nowplaying-cli")


def _has_playerctl() -> bool:
    return _has_cmd("playerctl")


def media_control(action: str) -> str:
    """
    macOS: uses nowplaying-cli (system-wide, works with any app)
    Linux: uses playerctl (MPRIS — works with Spotify, VLC, Firefox, Chrome, etc.)
    """
    if OS_NAME == "Darwin":
        if not _has_nowplaying_cli():
            return "Install media control tool: brew install nowplaying-cli"
        cmd_map = {
            "play": ["nowplaying-cli", "play"],
            "pause": ["nowplaying-cli", "pause"],
            "next": ["nowplaying-cli", "next"],
            "previous": ["nowplaying-cli", "previous"],
        }
        cmd = cmd_map.get(action)
        if not cmd:
            return f"Unknown action: {action}"
        subprocess.run(cmd, capture_output=True)
        return f"Media: {action}"

    elif OS_NAME == "Linux":
        if not _has_playerctl():
            return "Install playerctl: sudo apt install playerctl"
        cmd_map = {
            "play": ["playerctl", "play"],
            "pause": ["playerctl", "pause"],
            "next": ["playerctl", "next"],
            "previous": ["playerctl", "previous"],
        }
        # play-pause toggle works better for Linux since play alone
        # doesn't always work when nothing is "paused"
        if action in ("play", "pause"):
            result = subprocess.run(
                ["playerctl", "play-pause"], capture_output=True, text=True
            )
        else:
            cmd = cmd_map.get(action)
            if not cmd:
                return f"Unknown action: {action}"
            result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            return ("No media player found. Start Spotify, VLC, or a browser "
                    "with media playing first.")
        return f"Media: {action}"

    return "Media control not supported on this OS yet"


# ── Browser video control ─────────────────────────────────
def control_browser_video(action: str) -> str:
    """
    macOS only: injects JavaScript into Safari's active tab to control
    an HTML5 video (YouTube, Netflix, etc.).
    Requires Safari → Develop → Allow JavaScript from Apple Events.
    Linux: playerctl handles browser media via MPRIS (Firefox/Chrome register it).
    """
    if OS_NAME == "Linux":
        return media_control(action)

    if OS_NAME == "Darwin":
        if action == "play":
            js = "document.querySelector('video').play();"
        elif action == "pause":
            js = "document.querySelector('video').pause();"
        else:
            js = ("var v=document.querySelector('video');"
                  "if(v){v.paused?v.play():v.pause();}")

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
            return ("Safari JavaScript not enabled. "
                    "Go to Safari → Develop → Allow JavaScript from Apple Events")
        return f"Browser video: {action}"

    return "Not supported"


# ── App Launching ──────────────────────────────────────────
def open_app(app_name: str) -> str:
    if OS_NAME == "Darwin":
        result = subprocess.run(
            ["open", "-a", app_name], capture_output=True, text=True
        )
        if result.returncode == 0:
            if app_name.lower() in ("spotify", "music"):
                time.sleep(2.5)
            return f"Opened {app_name}"
        return f"Could not find app: {app_name}"

    elif OS_NAME == "Linux":
        # Try common Linux app launcher formats
        app_lower = app_name.lower()
        # Map friendly names to actual Linux binary names
        app_map = {
            "spotify": "spotify",
            "firefox": "firefox",
            "chrome": "google-chrome",
            "chromium": "chromium-browser",
            "files": "nautilus",
            "terminal": "gnome-terminal",
            "settings": "gnome-control-center",
            "calculator": "gnome-calculator",
            "gedit": "gedit",
            "vlc": "vlc",
            "steam": "steam",
            "discord": "discord",
            "code": "code",
            "vscode": "code",
        }
        binary = app_map.get(app_lower, app_lower)
        try:
            subprocess.Popen(
                [binary],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL
            )
            if app_lower in ("spotify",):
                time.sleep(2.5)
            return f"Opened {app_name}"
        except FileNotFoundError:
            return f"Could not find app: {app_name}. Make sure it's installed."

    return "Not supported on this OS yet"


def close_app(app_name: str) -> str:
    if OS_NAME == "Darwin":
        _run_applescript(f'tell application "{app_name}" to quit')
        return f"Closed {app_name}"
    elif OS_NAME == "Linux":
        subprocess.run(["pkill", "-f", app_name.lower()], capture_output=True)
        return f"Closed {app_name}"
    return "Not supported"


# ── Open URL / Search ─────────────────────────────────────
def open_url(url: str) -> str:
    if not url.startswith("http"):
        url = f"https://www.google.com/search?q={urllib.parse.quote(url)}"

    if OS_NAME == "Darwin":
        subprocess.run(["open", url])
        return f"Opened {url}"
    elif OS_NAME == "Linux":
        # xdg-open opens URLs in the default browser on any Linux desktop
        subprocess.Popen(["xdg-open", url], stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)
        return f"Opened {url}"
    return "Not supported"


def search_in_app(app_name: str, query: str) -> str:
    site_map = {
        "youtube": f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}",
        "google": f"https://www.google.com/search?q={urllib.parse.quote(query)}",
        "wikipedia": f"https://en.wikipedia.org/wiki/Special:Search?search={urllib.parse.quote(query)}",
    }
    target = app_name.lower()
    search_url = site_map.get(target,
                              f"https://www.google.com/search?q={urllib.parse.quote(query)}")

    if OS_NAME == "Darwin":
        subprocess.run(["open", "-a", "Safari", search_url])
        if target == "youtube":
            time.sleep(2.5)
            js = ("document.querySelector("
                  "'ytd-video-renderer a#thumbnail, a#video-title')?.click();")
            _run_applescript(
                f'tell application "Safari" to tell current tab of front window '
                f'to do JavaScript "{js}"'
            )
            return f"Searched YouTube for '{query}' and playing first result"
        return f"Searched {app_name} for '{query}'"

    elif OS_NAME == "Linux":
        subprocess.Popen(["xdg-open", search_url],
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return f"Opened {app_name} and searched for '{query}'"

    return "Not supported"


# ── WiFi ──────────────────────────────────────────────────
def toggle_wifi(enable: bool) -> str:
    state = "on" if enable else "off"
    if OS_NAME == "Darwin":
        _run_shell(["networksetup", "-setairportpower", "en0", state])
        return f"WiFi turned {state}"
    elif OS_NAME == "Linux":
        if _has_cmd("nmcli"):
            subprocess.run(
                ["nmcli", "radio", "wifi", state], capture_output=True
            )
            return f"WiFi turned {state}"
        return "Install NetworkManager for WiFi control"
    return "Not supported"


# ── Screenshot ────────────────────────────────────────────
def take_screenshot() -> str:
    path = os.path.expanduser("~/Desktop/yuki_screenshot.png")
    if OS_NAME == "Darwin":
        subprocess.run(["screencapture", path])
        return "Screenshot saved to Desktop"
    elif OS_NAME == "Linux":
        if _has_cmd("gnome-screenshot"):
            subprocess.run(["gnome-screenshot", "-f", path])
            return "Screenshot saved to Desktop"
        elif _has_cmd("scrot"):
            subprocess.run(["scrot", path])
            return "Screenshot saved to Desktop"
        elif _has_cmd("import"):
            subprocess.run(["import", "-window", "root", path])
            return "Screenshot saved to Desktop"
        return "Install gnome-screenshot or scrot for screenshots"
    return "Not supported"


# ── Lock Screen ───────────────────────────────────────────
def lock_screen() -> str:
    if OS_NAME == "Darwin":
        subprocess.run(["pmset", "displaysleepnow"])
        return "Screen locked"
    elif OS_NAME == "Linux":
        if _has_cmd("loginctl"):
            subprocess.run(["loginctl", "lock-session"])
            return "Screen locked"
        elif _has_cmd("gnome-screensaver-command"):
            subprocess.run(["gnome-screensaver-command", "--lock"])
            return "Screen locked"
        elif _has_cmd("xdg-screensaver"):
            subprocess.run(["xdg-screensaver", "lock"])
            return "Screen locked"
        return "Could not lock screen — try installing gnome-screensaver"
    return "Not supported"


# ── Web Search (Tavily) ───────────────────────────────────
def web_search(query: str) -> str:
    import requests
    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        return "Web search not configured — add TAVILY_API_KEY to .env (free at tavily.com)"
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
        return "\n".join(
            [f"- {r['title']}: {r['content'][:200]}" for r in results[:3]]
        )
    except Exception as e:
        return f"Search error: {e}"


# ══════════════════════════════════════════════════════════
#  Function Registry (LLM function calling)
# ══════════════════════════════════════════════════════════
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": "Search the internet for current information, news, or facts",
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
            "description": "Open a website URL or Google search in the default browser",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "A URL or search query"}
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_in_app",
            "description": "Open YouTube, Google, or Wikipedia and search for a query",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_name": {
                        "type": "string",
                        "description": "youtube, google, or wikipedia"
                    },
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
            "description": "Set the system volume",
            "parameters": {
                "type": "object",
                "properties": {
                    "level": {"type": "integer", "description": "Volume 0-100"}
                },
                "required": ["level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "set_brightness",
            "description": "Set the screen brightness",
            "parameters": {
                "type": "object",
                "properties": {
                    "level": {"type": "integer", "description": "Brightness 0-100"}
                },
                "required": ["level"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "media_control",
            "description": "Control music/media playback — play, pause, next, previous",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["play", "pause", "next", "previous"]
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
            "description": "Open/launch an application",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_name": {
                        "type": "string",
                        "description": "App name e.g. 'Spotify', 'Firefox', 'VS Code'"
                    }
                },
                "required": ["app_name"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "close_app",
            "description": "Close/quit an application",
            "parameters": {
                "type": "object",
                "properties": {
                    "app_name": {"type": "string", "description": "App name to close"}
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
                    "enable": {"type": "boolean", "description": "true=on, false=off"}
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
