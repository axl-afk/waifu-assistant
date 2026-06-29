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

# ── Emotion Extractor ─────────────────────────────────────
EMOTIONS = ["happy", "sad", "surprised", "embarrassed", "thinking", "excited", "calm", "neutral"]

def extract_emotion(text):
    for emotion in EMOTIONS:
        if f"[{emotion}]" in text.lower():
            return emotion
    return "neutral"

def remove_emotion_tag(text):
    for emotion in EMOTIONS:
        text = text.replace(f"[{emotion}]", "").replace(f"[{emotion.upper()}]", "")
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

        if not emotion_sent and any(f"[{e}]" in full_response.lower() for e in EMOTIONS):
            emotion = extract_emotion(full_response)
            await websocket.send_text(json.dumps({
                "type": "avatar_cmd",
                "emotion": emotion
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

    session.add_assistant(remove_emotion_tag(full_response))
    print(f"🤖 Yuki: {remove_emotion_tag(full_response)}")
    await websocket.send_text(json.dumps({"type": "done"}))

# ── WebSocket Handler ─────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    session = Session()
    print("✅ Client connected")

    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            if message["type"] == "text_input":
                text = message["text"].strip()
                if not text:
                    continue
                print(f"👤 User: {text}")
                await run_llm_tts_pipeline(websocket, session, text)

            elif message["type"] == "audio_input":
                audio_b64 = message["data"]
                mime_type = message.get("mimeType", "audio/webm")

                await websocket.send_text(json.dumps({
                    "type": "status",
                    "text": "Transcribing..."
                }))

                transcript = stt_engine.transcribe(audio_b64, mime_type)

                if transcript:
                    print(f"🎤 Heard: {transcript}")
                    await websocket.send_text(json.dumps({
                        "type": "transcript",
                        "text": transcript
                    }))
                    await run_llm_tts_pipeline(websocket, session, transcript)
                else:
                    await websocket.send_text(json.dumps({
                        "type": "status",
                        "text": "Could not hear you, try again"
                    }))

            elif message["type"] == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        print("❌ Client disconnected")

# ── Health Check ──────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "character": config.CHARACTER_NAME}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.HOST, port=config.PORT)