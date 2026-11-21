"""Builds the app icon from a square picture (default: art/icon_source.png).

    python art/make_icon.py [picture]

Writes:
  app/src/main/res/drawable-nodpi/ic_launcher_fg.png  adaptive-icon foreground (432 px = 108 dp at xxxhdpi)
  docs/icon.png                                        512 px copy with rounded corners, for GitHub

The picture is a full square (emblem in the middle, scenery to the edges). The phone's launcher shows only
the middle 72 dp of the 108 dp foreground and cuts it to its own shape (circle, squircle...). So the picture
is drawn at 360 px in the middle of the 432 px canvas: the visible 288 px show its central 80%, which keeps
the whole emblem inside even a round mask. The hidden margin (only seen while the launcher animates the
icon) gets the picture enlarged, so there are no empty edges.
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "art", "icon_source.png")

pic = Image.open(src).convert("RGBA").resize((1024, 1024), Image.LANCZOS)

# Adaptive foreground.
size, inner = 432, 360
fg = pic.resize((size, size), Image.LANCZOS)                      # margin filler
off = (size - inner) // 2
fg.alpha_composite(pic.resize((inner, inner), Image.LANCZOS), (off, off))
fg.save(os.path.join(ROOT, "app", "src", "main", "res", "drawable-nodpi", "ic_launcher_fg.png"))

# docs/icon.png: what the launcher shows (central 80%), with rounded corners.
shown = pic.crop((int(1024 * 0.1), int(1024 * 0.1), int(1024 * 0.9), int(1024 * 0.9))).resize((512, 512), Image.LANCZOS)
mask = Image.new("L", (512, 512), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, 511, 511), radius=110, fill=255)
out = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
out.paste(shown, (0, 0), mask)
os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
out.save(os.path.join(ROOT, "docs", "icon.png"))
print("Icon written: docs/icon.png, res/drawable-nodpi/ic_launcher_fg.png")
