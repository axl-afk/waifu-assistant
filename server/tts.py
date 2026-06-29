from kokoro_onnx import Kokoro
import soundfile as sf
import numpy as np
import io

class TTSEngine:
    def __init__(self):
        print("🎤 Loading Kokoro TTS...")
        self.kokoro = Kokoro('kokoro-v0_19.onnx', 'voices.bin')
        self.voice = 'af_bella'
        self.speed = 1.0
        print("✅ TTS ready")

    def synthesize(self, text: str) -> bytes:
        """Convert text to WAV bytes"""
        if not text.strip():
            return b''
        
        samples, sample_rate = self.kokoro.create(
            text,
            voice=self.voice,
            speed=self.speed,
            lang='en-us'
        )
        
        # Convert to bytes
        buffer = io.BytesIO()
        sf.write(buffer, samples, sample_rate, format='WAV', subtype='PCM_16')
        buffer.seek(0)
        return buffer.read()