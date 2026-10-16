#!/usr/bin/env python3
"""Annotate raw Simulator screenshots for the blog.

  python3 scripts/screens/annotate.py scripts/screens/shots.json [--raw /tmp/lp-shots]

shots.json is a list of {"slug", "out", "raw", "alt"[, "width", "raw_path"]}; `raw` is the capture name (without extension) in --raw; `raw_path` points at any PNG instead (e.g. a real app screenshot).
If <raw>.json exists (element frame in points, from the XCUITest), a highlight box is drawn around it in
the brand accent colour. Output: WebP, ~1170 px wide, <= 120 KB, under src/assets/screens/<slug>/<out>.webp.
"""
import json, sys, io, pathlib
from PIL import Image, ImageDraw

ACCENT = (99, 102, 241)       # --color-accent (#6366F1)
TARGET_W = 1170
MAX_BYTES = 120 * 1024
POINT_SCALE = 3.0             # Simulator iPhone 18 Pro renders at 3x

def annotate(img, frame):
    if not frame:
        return img
    x, y, w, h = [v * POINT_SCALE for v in (frame['x'], frame['y'], frame['w'], frame['h'])]
    pad = 10
    box = (x - pad, y - pad, x + w + pad, y + h + pad)
    overlay = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    d.rounded_rectangle(box, radius=34, fill=ACCENT + (46,), outline=ACCENT + (255,), width=10)
    return Image.alpha_composite(img.convert('RGBA'), overlay).convert('RGB')

def save_webp(img, path, width=TARGET_W):
    scale = width / img.width
    img = img.resize((width, round(img.height * scale)), Image.LANCZOS)
    for q in range(84, 40, -4):
        buf = io.BytesIO()
        img.save(buf, 'WEBP', quality=q, method=6)
        if buf.tell() <= MAX_BYTES:
            break
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(buf.getvalue())
    return buf.tell(), q

def main():
    cfg = json.load(open(sys.argv[1]))
    raw_dir = pathlib.Path(sys.argv[sys.argv.index('--raw') + 1]) if '--raw' in sys.argv else pathlib.Path('/tmp/lp-shots')
    root = pathlib.Path(__file__).resolve().parents[2] / 'src' / 'assets' / 'screens'
    for s in cfg:
        raw_base = pathlib.Path(s['raw_path']) if 'raw_path' in s else raw_dir / f"{s['raw']}.png"
        png = raw_base
        if not png.exists():
            print('MISSING', png); continue
        fr = raw_base.with_suffix('.json')
        frame = json.load(open(fr)) if fr.exists() else None
        img = annotate(Image.open(png).convert('RGB'), frame)
        size, q = save_webp(img, root / s['slug'] / f"{s['out']}.webp", s.get('width', TARGET_W))
        print(f"{s['slug']}/{s['out']}.webp  {size//1024} KB (q{q}){' [highlight]' if frame else ''}")

if __name__ == '__main__':
    main()
