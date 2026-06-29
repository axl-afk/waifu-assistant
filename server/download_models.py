import urllib.request
import os

MODELS = [
    {
        "name": "kokoro-v0_19.onnx",
        "url": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/kokoro-v0_19.onnx"
    },
    {
        "name": "voices.bin",
        "url": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files/voices.bin"
    }
]

def download(name, url):
    if os.path.exists(name):
        print(f"✅ {name} already exists, skipping")
        return
    print(f"⬇️  Downloading {name}...")
    urllib.request.urlretrieve(url, name)
    print(f"✅ {name} downloaded")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    for model in MODELS:
        download(model["name"], model["url"])
    print("🌸 All models ready!")