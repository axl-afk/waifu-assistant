import asyncio
import json
import base64
from stt import STTEngine
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from tts import TTSEngine
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
        # tags are case-sensitive in the prompt (e.g. [peaceSign]) but we match
        # case-insensitively against a lowercased haystack, so lowercase motion keys too
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

# ── Shared LLM + TTS pipeline ─────────────────────────────
async def run_llm_tts_pipeline(websocket, session, user_text):
    session.add_user(user_text)
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

        # Fire the avatar_cmd (emotion + motion) exactly once, as soon as the
        # tags appear anywhere in what we've accumulated so far.
        if not emotion_sent and any(f"[{e}]" in full_response.lower() for e in EMOTIONS):
            emotion = extract_emotion(full_response)
            motion  = extract_motion(full_response)
            await websocket.send_text(json.dumps({
                "type": "avatar_cmd",
                "emotion": emotion,
                "motion": motion
            }))
            emotion_sent = True

        # Stream this token to the chat bubble regardless of whether the
        # emotion tag has fired yet — this used to be nested inside the
        # "not emotion_sent" block above, which meant every token AFTER the
        # first one stopped being sent for the rest of the response.
        clean_token = remove_emotion_tag(token)
        if clean_token:
            await websocket.send_text(json.dumps({
                "type": "llm_token",
                "token": clean_token
            }))

        # Flush + synthesize whenever the buffer completes a sentence —
        # also no longer gated behind emotion_sent.
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

    # Flush any trailing partial sentence that never hit a terminator
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

    # Safety net: if the model never emitted a recognizable [emotion] tag at
    # all, we still need to tell the frontend to settle back to idle instead
    # of leaving it on whatever motion was last played.
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
            # A read timeout here lets us notice a half-dead connection (e.g.
            # wifi drop) instead of hanging on receive_text() forever, which
            # was contributing to silent "stuck" sessions that only looked
            # like disconnects client-side.
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=60)
            except asyncio.TimeoutError:
                # No message in 60s — send a server-initiated ping so the
                # client's onclose fires promptly if the socket is actually
                # dead, instead of looking "stuck" until a longer OS-level
                # timeout kicks in.
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
                    # IMPORTANT: still tell the client we're "done" so
                    # autoListen (which waits for the 'done' event before
                    # re-arming the mic) doesn't get stuck forever after a
                    # failed transcription.
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
