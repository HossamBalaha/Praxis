#!/usr/bin/env python3
"""Generate favicon PNGs, web favicon.ico, and desktop icon.ico from logo.svg using cairosvg + Pillow.

Usage:
    python3 scripts/gen-favicons.py

Resolves `public/` relative to this script's location, so it runs
from any clone / checkout / sandbox.
"""
import cairosvg
import io
import os
from PIL import Image

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
PUBLIC = os.path.join(PROJECT_ROOT, "public")
SVG = os.path.join(PUBLIC, "logo.svg")

if not os.path.isfile(SVG):
  raise SystemExit(f"logo.svg not found at {SVG}")

SIZES = {
  "favicon-16x16.png"         : 16,
  "favicon-32x32.png"         : 32,
  "favicon-96x96.png"         : 96,
  "apple-touch-icon.png"      : 180,
  "android-chrome-192x192.png": 192,
  "android-chrome-512x512.png": 512,
  "mstile-150x150.png"        : 150,
}

for name, size in SIZES.items():
  png_bytes = cairosvg.svg2png(url=SVG, output_width=size, output_height=size)
  img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
  img.save(os.path.join(PUBLIC, name))
  print(f"  {name} ({size}x{size})")

# favicon.ico — lightweight multi-size web ICO (16/32/48).
ico_sizes = [16, 32, 48]
ico_images = []
for s in ico_sizes:
  png_bytes = cairosvg.svg2png(url=SVG, output_width=s, output_height=s)
  ico_images.append(Image.open(io.BytesIO(png_bytes)).convert("RGBA"))
ico_images[0].save(
  os.path.join(PUBLIC, "favicon.ico"),
  format="ICO",
  sizes=[(s, s) for s in ico_sizes],
  append_images=ico_images[1:],
)
print("  favicon.ico (web multi-size: 16/32/48)")

# icon.ico — high-DPI desktop ICO (16/32/48/64/128/256) for Windows executables.
desktop_ico_sizes = [16, 32, 48, 64, 128, 256]
desktop_ico_images = []
for s in desktop_ico_sizes:
  png_bytes = cairosvg.svg2png(url=SVG, output_width=s, output_height=s)
  desktop_ico_images.append(Image.open(io.BytesIO(png_bytes)).convert("RGBA"))
desktop_ico_images[0].save(
  os.path.join(PUBLIC, "icon.ico"),
  format="ICO",
  sizes=[(s, s) for s in desktop_ico_sizes],
  append_images=desktop_ico_images[1:],
)
print("  icon.ico (desktop multi-size: 16/32/48/64/128/256)")

print("Done.")
