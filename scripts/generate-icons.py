#!/usr/bin/env python3
"""
Membuat sumber ikon & splash untuk @capacitor/assets dari logo Readlify (www/icons/logo.svg).
Hasil di assets/: icon-only, icon-foreground, icon-background, splash, splash-dark.
Jalankan:  pip install cairosvg pillow ; python3 scripts/generate-icons.py
"""
import io, os, re
import cairosvg
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SVG = open(os.path.join(ROOT, 'www', 'icons', 'logo.svg'), encoding='utf-8').read()
OUT = os.path.join(ROOT, 'assets')
os.makedirs(OUT, exist_ok=True)

# Ambil <defs> dan bagian "buku" saja (tanpa kotak latar membulat) untuk ikon adaptif.
defs = re.search(r'<defs>.*?</defs>', SVG, re.S).group(0)
body = SVG.split('<!-- page-edge stack')[1]
body = '<!-- page-edge stack' + body.replace('</svg>', '')


def svg_png(inner, size, bg=None):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">{defs}{inner}</svg>'
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size, output_height=size)
    im = Image.open(io.BytesIO(png)).convert('RGBA')
    if bg:
        base = Image.new('RGBA', (size, size), bg); base.alpha_composite(im); im = base
    return im


def book_at(size, book_h):
    """Buku (x 62..186, y 62..196 pada kanvas logo 256) diskalakan ke tinggi book_h lalu dipusatkan."""
    s = book_h / 134.0
    cx, cy = (62 + 186) / 2, (62 + 196) / 2
    tx, ty = size / 2 - cx * s, size / 2 - cy * s
    return f'<g transform="translate({tx:.2f},{ty:.2f}) scale({s:.4f})">{body}</g>'


# Ikon adaptif: buku di zona aman (±66% tengah), latar krem bergradasi.
svg_png(book_at(1024, 470), 1024).save(f'{OUT}/icon-foreground.png')
grad = Image.new('RGBA', (1024, 1024))
top, bot = (0xFA, 0xF3, 0xE7), (0xEF, 0xE2, 0xC9)
for y in range(1024):
    f = y / 1023
    c = tuple(round(top[i] + (bot[i] - top[i]) * f) for i in range(3)) + (255,)
    for x in range(0, 1024, 1024):
        grad.paste(c, (0, y, 1024, y + 1))
grad.save(f'{OUT}/icon-background.png')

# Ikon utuh (dipakai untuk ikon lama/legacy): logo asli apa adanya.
cairosvg.svg2png(bytestring=SVG.encode(), write_to=f'{OUT}/icon-only.png', output_width=1024, output_height=1024)

# Splash: logo di tengah kanvas 2732x2732, versi terang & gelap.
logo = Image.open(io.BytesIO(cairosvg.svg2png(bytestring=SVG.encode(), output_width=620, output_height=620))).convert('RGBA')
for name, bg in (('splash', '#F7F1E7'), ('splash-dark', '#211E1A')):
    base = Image.new('RGBA', (2732, 2732), bg)
    base.alpha_composite(logo, ((2732 - 620) // 2, (2732 - 620) // 2))
    base.convert('RGB').save(f'{OUT}/{name}.png')
print('ok:', sorted(os.listdir(OUT)))
