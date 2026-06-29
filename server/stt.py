from faster_whisper import WhisperModel
import numpy as np
import io
import base64
import subprocess
import tempfile
import os

class STTEngine:
    def __init__(self):
        print("🎤 Loading Whisper STT...")
        self.model = WhisperModel(
            "small",
            device="cpu",
            compute_type="int8"
        )
        print("✅ STT ready")

    def transcribe(self, audio_b64: str, mime_type: str = 'audio/webm') -> str:
        """Convert base64 audio to text"""
        try:
            # Decode base64
            audio_bytes = base64.b64decode(audio_b64)

            # Write to temp file
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as f:
                f.write(audio_bytes)
                webm_path = f.name

            # Convert webm to wav using ffmpeg
            wav_path = webm_path.replace('.webm', '.wav')
            subprocess.run([
                'ffmpeg', '-y',
                '-i', webm_path,
                '-ar', '16000',
                '-ac', '1',
                '-f', 'wav',
                wav_path
            ], capture_output=True)

            # Transcribe
            segments, _ = self.model.transcribe(
                wav_path,
                beam_size=1,
                vad_filter=True,
                language=None
            )

            transcript = " ".join([s.text for s in segments]).strip()

            # Cleanup temp files
            os.unlink(webm_path)
            os.unlink(wav_path)

            return transcript

        except Exception as e:
            print(f"STT error: {e}")
            return ""