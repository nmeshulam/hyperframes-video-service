#!/usr/bin/env python3
"""
Pre-downloads AI models during Docker build so Cloud Run has 0 startup latency.
"""
import sys

def download_models():
    print("[download_models] Pre-caching rembg 'silueta' model...")
    try:
        from rembg import new_session
        new_session("silueta")
        print("[download_models] 'silueta' model successfully cached in ~/.u2net/silueta.onnx")
    except Exception as e:
        print(f"[download_models] Warning / Error downloading model: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    download_models()
