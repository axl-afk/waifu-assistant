import asyncio
import json
import base64
from stt import STTEngine
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from tts import TTSEngine
import system_control
import config

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── LLM Client ────────────────────────────────────────────
client = AsyncOpenAI(
    base_url=config.LLM_BASE_URL,
    api_key=config.LLM_API_KEY,
)

# ── TTS Engine ────────────────────────────────────────────
tts_engine = TTSEngine()

# ── STT Engine ────────────────────────────────────────────
stt_engine = STTEngine()

# ── Session Manager ───────────────────────────────────────
class Session:
    def __init__(self):
        self.history = []
        self.max_history = 20

    def add_user(self, text):
        self.history.append({"role": "user", "content": text})
        self._trim()

    def add_assistant(self, text):
        self.history.append({"role": "assistant", "content": text})
        self._trim()

    def _trim(self):
        if len(self.history) > self.max_history:
            self.history = self.history[-self.max_history:]

    def build_messages(self):
        return [
            {"role": "system", "content": config.CHARACTER_PROMPT}
        ] + self.history

# ── Emotion / Motion tag extraction ───────────────────────
EMOTIONS = ["happy", "sad", "surprised", "embarrassed", "thinking", "excited", "calm", "neutral"]
MOTIONS  = ["greeting", "peaceSign", "shoot", "spin", "modelPose", "squat", "showFullBody"]

def extract_emotion(text):
    low = text.lower()
    for emotion in EMOTIONS:
        if f"[{emotion}]" in low:
            return emotion
    return "neutral"

def extract_motion(text):
    low = text.lower()
    for motion in MOTIONS:
        if f"[{motion.lower()}]" in low:
            return motion
    return None

def remove_emotion_tag(text):
    for emotion in EMOTIONS:
        text = text.replace(f"[{emotion}]", "").replace(f"[{emotion.upper()}]", "")
    for motion in MOTIONS:
        text = text.replace(f"[{motion}]", "").replace(f"[{motion.upper()}]", "")
    return text.strip()

def ends_sentence(text):
    return any(text.strip().endswith(p) for p in [".", "?", "!", "...", "~"])


# ── Step 1: Check if the LLM wants to call system function(s) ─
async def check_for_tool_calls(session, user_text):
    """
    Non-streaming call to see if this message should trigger one or more
    system actions. Executes ALL tool calls returned (not just the first),
    so compound requests like "open Safari and search YouTube" work.
    Returns (combined_result_text, did_call_any: bool)
    """
    # Clean, separate system prompt for tool-checking — NOT the character
    # prompt with [emotion][motion] instructions. Mixing them confuses the
    # model into faking function-call syntax as plain text.
    tool_messages = [
        {
            "role": "system",
            "content": (
                "You are a function-calling assistant. If the user's message "
                "requests one or more system actions, call the appropriate "
                "function(s):\n"
                "- 'open Safari and search YouTube for X' → call search_in_app "
                "with app_name='youtube' and query='X' (this automatically "
                "opens Safari, searches, AND plays the first video — no "
                "separate open_app call needed)\n"
                "- 'open Spotify and play music' → call open_app with "
                "app_name='Spotify', THEN call media_control with "
                "action='play' (both calls together, in that order)\n"
                "- 'pause the video' or 'pause music' → call media_control "
                "with action='pause'\n"
                "- volume, brightness, wifi, screenshots, locking screen, "
                "or general web search → call the matching function\n"
                "Call multiple functions if the request has multiple parts. "
                "Otherwise, do not call any function."
            )
        },
        {"role": "user", "content": user_text}
    ]

    response = await client.chat.completions.create(
        model=config.LLM_MODEL,
        messages=tool_messages,
        tools=system_control.TOOLS,
        tool_choice="auto",
        max_tokens=300,
        temperature=0.1,
    )

    choice = response.choices[0]
    tool_calls = choice.message.tool_calls

    if not tool_calls:
        return None, False

    results = []
    for call in tool_calls:
        fn_name = call.function.name
        try:
            fn_args = json.loads(call.function.arguments)
        except Exception:
            fn_args = {}

        print(f"🔧 Calling function: {fn_name}({fn_args})")
        result = system_control.execute_function(fn_name, fn_args)
        print(f"🔧 Result: {result}")
        results.append(result)

        session.history.append({
            "role": "assistant",
            "content": None,
            "tool_calls": [{
                "id": call.id,
                "type": "function",
                "function": {"name": fn_name, "arguments": call.function.arguments}
            }]
        })
        session.history.append({
            "role": "tool",
            "tool_call_id": call.id,
            "content": result
        })

    return " | ".join(results), True


# ── Shared LLM + TTS pipeline ─────────────────────────────
async def run_llm_tts_pipeline(websocket, session, user_text):
    session.add_user(user_text)

    try:
        tool_result, did_call = await check_for_tool_calls(session, user_text)
    except Exception as e:
        print(f"Tool check error: {e}")
        did_call = False

    if did_call:
        await websocket.send_text(json.dumps({
            "type": "status",
            "text": f"⚙️ {tool_result}"
        }))

    full_response = ""
    sentence_buffer = ""
    emotion_sent = False

    stream = await client.chat.completions.create(
        model=config.LLM_MODEL,
        messages=session.build_messages(),
        stream=True,
        max_tokens=300,
        temperature=0.8,
    )

    async for chunk in stream:
        token = chunk.choices[0].delta.content
        if not token:
            continue

        full_response += token
        sentence_buffer += token

        if not emotion_sent and any(f"[{e}]" in full_response.lower() for e in EMOTIONS):
            emotion = extract_emotion(full_response)
            motion  = extract_motion(full_response)
            await websocket.send_text(json.dumps({
                "type": "avatar_cmd",
                "emotion": emotion,
                "motion": motion
            }))
            emotion_sent = True

        clean_token = remove_emotion_tag(token)
        if clean_token:
            await websocket.send_text(json.dumps({
                "type": "llm_token",
                "token": clean_token
            }))

        if ends_sentence(sentence_buffer):
            clean_sentence = remove_emotion_tag(sentence_buffer).strip()
            if clean_sentence:
                await websocket.send_text(json.dumps({
                    "type": "sentence",
                    "text": clean_sentence
                }))
                try:
                    audio_bytes = tts_engine.synthesize(clean_sentence)
                    audio_b64 = base64.b64encode(audio_bytes).decode()
                    await websocket.send_text(json.dumps({
                        "type": "audio",
                        "data": audio_b64,
                        "sequence": len(full_response)
                    }))
                except Exception as e:
                    print(f"TTS error: {e}")
            sentence_buffer = ""

    if sentence_buffer.strip():
        clean = remove_emotion_tag(sentence_buffer).strip()
        if clean:
            await websocket.send_text(json.dumps({
                "type": "sentence",
                "text": clean
            }))
            try:
                audio_bytes = tts_engine.synthesize(clean)
                audio_b64 = base64.b64encode(audio_bytes).decode()
                await websocket.send_text(json.dumps({
                    "type": "audio",
                    "data": audio_b64,
                    "sequence": len(full_response)
                }))
            except Exception as e:
                print(f"TTS error: {e}")

    if not emotion_sent:
        await websocket.send_text(json.dumps({
            "type": "avatar_cmd",
            "emotion": "neutral",
            "motion": None
        }))

    session.add_assistant(remove_emotion_tag(full_response))
    print(f"🤖 {config.CHARACTER_NAME}: {remove_emotion_tag(full_response)}")
    await websocket.send_text(json.dumps({"type": "done"}))

# ── WebSocket Handler ─────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = Session()
    print("✅ Client connected")

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60)
            except asyncio.TimeoutError:
                try:
                    await websocket.send_text(json.dumps({"type": "pong"}))
                except Exception:
                    break
                continue

            message = json.loads(data)

            if message["type"] == "text_input":
                text = message.get("text", "").strip()
                if not text:
                    continue
                print(f"👤 User: {text}")
                try:
                    await run_llm_tts_pipeline(websocket, session, text)
                except Exception as e:
                    print(f"Pipeline error: {e}")
                    await websocket.send_text(json.dumps({
                        "type": "status",
                        "text": "Something went wrong, try again"
                    }))
                    await websocket.send_text(json.dumps({"type": "done"}))

            elif message["type"] == "audio_input":
                audio_b64 = message["data"]
                mime_type = message.get("mimeType", "audio/webm")

                await websocket.send_text(json.dumps({
                    "type": "status",
                    "text": "Transcribing..."
                }))

                try:
                    transcript = stt_engine.transcribe(audio_b64, mime_type)
                except Exception as e:
                    print(f"STT error: {e}")
                    transcript = None

                if transcript:
                    print(f"🎤 Heard: {transcript}")
                    await websocket.send_text(json.dumps({
                        "type": "transcript",
                        "text": transcript
                    }))
                    try:
                        await run_llm_tts_pipeline(websocket, session, transcript)
                    except Exception as e:
                        print(f"Pipeline error: {e}")
                        await websocket.send_text(json.dumps({
                            "type": "status",
                            "text": "Something went wrong, try again"
                        }))
                        await websocket.send_text(json.dumps({"type": "done"}))
                else:
                    await websocket.send_text(json.dumps({
                        "type": "status",
                        "text": "Could not hear you, try again"
                    }))
                    await websocket.send_text(json.dumps({"type": "done"}))

            elif message["type"] == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        print("❌ Client disconnected")
    except Exception as e:
        print(f"⚠️ WebSocket error: {e}")

# ── Health Check ──────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "character": config.CHARACTER_NAME}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.HOST, port=config.PORT)
