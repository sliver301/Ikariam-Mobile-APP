"""Builds the app icon from a square picture (default: art/icon_source.png).

    python art/make_icon.py [picture]

Writes:
  app/src/main/res/drawable-nodpi/ic_launcher_fg.png  adaptive-icon foreground (432 px = 108 dp at xxxhdpi)
  docs/icon.png                                        512 px copy with see-through corners, for GitHub

The picture already has its own rounded frame. The phone's launcher shows only the middle 72 dp of the
108 dp foreground and cuts it to its own shape, so the picture goes in that middle part (a little larger,
so the outermost edge of the frame is trimmed). The plain white corners become see-through; whatever the
launcher shape leaves there shows the bronze background colour (res/values/colors.xml, ic_bg).
"""
import os
import sys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "art", "icon_source.png")

pic = Image.open(src).convert("RGBA")
pic = pic.resize((1024, 1024), Image.LANCZOS)

# White corners outside the frame -> transparent (flood fill from each corner).
MARK = (255, 0, 254)
tmp = pic.convert("RGB")
for corner in [(0, 0), (1023, 0), (0, 1023), (1023, 1023)]:
    ImageDraw.floodfill(tmp, corner, MARK, thresh=40)
px = tmp.load()
alpha = pic.getchannel("A")
ap = alpha.load()
for y in range(1024):
    for x in range(1024):
        if px[x, y] == MARK:
            ap[x, y] = 0
pic.putalpha(alpha)

# docs/icon.png
os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
pic.resize((512, 512), Image.LANCZOS).save(os.path.join(ROOT, "docs", "icon.png"))

# Adaptive foreground: 432 px canvas, picture over the middle 288 px (scaled up 6% to trim the outer edge).
size = 432
show = int(288 * 1.06)
fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
fg.alpha_composite(pic.resize((show, show), Image.LANCZOS), ((size - show) // 2, (size - show) // 2))
fg.save(os.path.join(ROOT, "app", "src", "main", "res", "drawable-nodpi", "ic_launcher_fg.png"))
print("Icon written: docs/icon.png, res/drawable-nodpi/ic_launcher_fg.png")
