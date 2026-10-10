#!/usr/bin/env python3
"""
Optimized AI Background Removal for Cloud Run CPU.
Uses rembg with the 'silueta' ONNX model (fast & low memory footprint).
Downscales input to 512px for segmentation, then upscales the alpha mask
back to original resolution to preserve full image sharpness.
"""
import sys
import os
import argparse
from PIL import Image

def remove_background(input_path: str, output_fg_path: str, output_bg_path: str = None, max_dim: float = 512.0):
    try:
        from rembg import new_session, remove
    except ImportError:
        print("[remove_bg] Error: 'rembg' is not installed. Please install rembg.", file=sys.stderr)
        sys.exit(1)

    if not os.path.exists(input_path):
        print(f"[remove_bg] Error: Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[remove_bg] Loading image: {input_path}")
    image = Image.open(input_path)
    orig_size = image.size

    # Initialize session (silueta model)
    session = new_session("silueta")

    # Cloud Run optimization: downscale to 512px for rapid CPU segmentation
    ratio = min(max_dim / float(orig_size[0]), max_dim / float(orig_size[1]))

    if ratio < 1.0:
        new_size = (int(orig_size[0] * ratio), int(orig_size[1] * ratio))
        small_img = image.resize(new_size, Image.Resampling.LANCZOS)
        small_fg = remove(small_img, session=session)
        mask = small_fg.getchannel('A')
        big_mask = mask.resize(orig_size, Image.Resampling.LANCZOS)

        fg_result = image.copy()
        if fg_result.mode != 'RGBA':
            fg_result = fg_result.convert('RGBA')
        fg_result.putalpha(big_mask)
    else:
        fg_result = remove(image, session=session)

    os.makedirs(os.path.dirname(os.path.abspath(output_fg_path)), exist_ok=True)
    fg_result.save(output_fg_path, "PNG")
    print(f"[remove_bg] Saved foreground layer to: {output_fg_path}")

    if output_bg_path:
        os.makedirs(os.path.dirname(os.path.abspath(output_bg_path)), exist_ok=True)
        bg = image.copy()
        if bg.mode != 'RGB':
            bg = bg.convert('RGB')
        bg.save(output_bg_path, "JPEG", quality=92)
        print(f"[remove_bg] Saved background layer to: {output_bg_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract foreground and background layers")
    parser.add_argument("--input", "-i", required=True, help="Input image path")
    parser.add_argument("--fg", required=True, help="Output foreground PNG path")
    parser.add_argument("--bg", required=False, help="Output background JPEG path")
    parser.add_argument("--max-dim", type=float, default=512.0, help="Max dimension for segmentation")

    args = parser.parse_args()
    remove_background(args.input, args.fg, args.bg, args.max_dim)
