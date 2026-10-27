#!/usr/bin/env python3
"""Synthetic instrument photos for the Descubrir demo listings (scripts/prototype/maybes-descubrir-seed.sql).

    python3 scripts/prototype/make-descubrir-photos.py <out-dir>

Needs Pillow. Writes <slug>-<n>.jpg for every photo the seed lists: drawn shapes on a studio background, in portrait
and landscape, so the feed shows how photos of any shape fit the screen. Local review only; nothing real is pictured.
Put them where the local gateway serves the listing-photos bucket, for example
    python3 scripts/prototype/make-descubrir-photos.py "$STORAGE_DIR/listing-photos/descubrir"
"""
import math
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "descubrir-photos"
SS = 2  # drawn at twice the size, then reduced: smooth edges

# slug, kind, colour, number of photos, orientation of the first photo ("p" portrait, "l" landscape)
PHOTOS = [
    ("descubrir-fender-telecaster-player", "guitar", (226, 196, 120), 4, "p"),
    ("descubrir-yamaha-p45", "keys", (30, 30, 34), 3, "l"),
    ("descubrir-ibanez-sr300e", "bass", (120, 26, 40), 5, "p"),
    ("descubrir-pearl-roadshow", "drums", (24, 64, 120), 3, "l"),
    ("descubrir-boss-rc-30", "pedal", (210, 60, 50), 2, "l"),
    ("descubrir-marshall-dsl40", "amp", (28, 28, 28), 3, "l"),
    ("descubrir-taylor-114ce", "acoustic", (196, 140, 80), 4, "p"),
    ("descubrir-epiphone-les-paul", "guitar", (150, 40, 30), 3, "p"),
    ("descubrir-roland-td07", "drums", (40, 40, 44), 2, "l"),
    ("descubrir-shure-sm7b", "mic", (60, 60, 64), 2, "p"),
    ("descubrir-cort-action-bass", "bass", (20, 20, 22), 3, "p"),
    ("descubrir-korg-minilogue", "keys", (200, 200, 205), 3, "l"),
    ("descubrir-tc-hall-of-fame", "pedal", (190, 190, 196), 2, "l"),
    ("descubrir-squier-strat", "guitar", (40, 110, 180), 4, "p"),
    ("descubrir-fender-rumble-40", "amp", (40, 40, 42), 2, "l"),
    ("descubrir-gibson-sg", "guitar", (130, 28, 24), 5, "p"),
]


def shade(colour, factor):
    return tuple(max(0, min(255, int(c * factor))) for c in colour)


def background(size, seed):
    rnd = random.Random(seed)
    w, h = size
    top = rnd.choice([(236, 232, 226), (222, 226, 232), (232, 228, 236), (214, 206, 196)])
    bottom = shade(top, rnd.uniform(0.72, 0.86))
    img = Image.new("RGB", size, top)
    px = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        px.line([(0, y), (w, y)], fill=tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))
    # a floor line and a soft vignette
    floor = int(h * rnd.uniform(0.74, 0.82))
    px.rectangle([0, floor, w, h], fill=shade(bottom, 0.92))
    return img


def shadow(img, box):
    layer = Image.new("L", img.size, 0)
    ImageDraw.Draw(layer).ellipse(box, fill=110)
    layer = layer.filter(ImageFilter.GaussianBlur(28 * SS))
    dark = Image.new("RGB", img.size, (30, 26, 22))
    img.paste(dark, (0, 0), layer)


def guitar(d, cx, cy, s, colour, bass=False, offset=False):
    neck_len = (1.25 if bass else 1.0) * s
    # body: lower and upper bouts
    d.ellipse([cx - 0.36 * s, cy - 0.05 * s, cx + 0.36 * s, cy + 0.62 * s], fill=colour, outline=shade(colour, 0.55), width=4 * SS)
    d.ellipse([cx - 0.28 * s, cy - 0.30 * s, cx + 0.30 * s, cy + 0.22 * s], fill=colour, outline=shade(colour, 0.55), width=4 * SS)
    if offset:
        d.polygon([(cx + 0.12 * s, cy - 0.30 * s), (cx + 0.34 * s, cy - 0.46 * s), (cx + 0.30 * s, cy - 0.18 * s)], fill=colour)
    d.ellipse([cx - 0.22 * s, cy - 0.10 * s, cx + 0.24 * s, cy + 0.44 * s], fill=shade(colour, 1.12))
    # pickguard and pickups
    d.polygon([(cx - 0.20 * s, cy + 0.02 * s), (cx + 0.06 * s, cy - 0.14 * s), (cx + 0.18 * s, cy + 0.30 * s), (cx - 0.12 * s, cy + 0.40 * s)], fill=(240, 236, 228))
    for i, y in enumerate([0.02, 0.14, 0.26] if not bass else [0.08, 0.24]):
        d.rounded_rectangle([cx - 0.09 * s, cy + y * s, cx + 0.09 * s, cy + (y + 0.05) * s], radius=6 * SS, fill=(30, 30, 30))
    d.rectangle([cx - 0.08 * s, cy + 0.42 * s, cx + 0.08 * s, cy + 0.46 * s], fill=(170, 170, 176))
    for k in range(3):
        d.ellipse([cx + (0.16 + 0.05 * k) * s, cy + (0.36 + 0.04 * k) * s, cx + (0.20 + 0.05 * k) * s, cy + (0.40 + 0.04 * k) * s], fill=(200, 196, 180))
    # neck, frets, headstock
    nw = 0.07 * s if not bass else 0.08 * s
    top = cy - 0.30 * s - neck_len
    d.rectangle([cx - nw / 2, top, cx + nw / 2, cy - 0.12 * s], fill=(176, 120, 64))
    for f in range(1, 22):
        y = cy - 0.12 * s - (neck_len + 0.18 * s) * (1 - 0.94 ** f)
        d.line([(cx - nw / 2, y), (cx + nw / 2, y)], fill=(210, 210, 214), width=2 * SS)
    d.polygon([(cx - nw * 0.6, top), (cx + nw * 0.9, top - 0.05 * s), (cx + nw * 1.3, top - 0.26 * s), (cx - nw * 0.4, top - 0.24 * s)], fill=shade(colour, 0.8))
    strings = 4 if bass else 6
    for k in range(strings):
        x = cx - nw * 0.36 + k * (nw * 0.72 / (strings - 1))
        d.line([(x, top - 0.02 * s), (x, cy + 0.44 * s)], fill=(236, 236, 240), width=1 * SS + (1 if bass else 0))


def acoustic(d, cx, cy, s, colour):
    d.ellipse([cx - 0.40 * s, cy + 0.02 * s, cx + 0.40 * s, cy + 0.70 * s], fill=colour, outline=shade(colour, 0.5), width=5 * SS)
    d.ellipse([cx - 0.30 * s, cy - 0.28 * s, cx + 0.30 * s, cy + 0.26 * s], fill=colour, outline=shade(colour, 0.5), width=5 * SS)
    d.ellipse([cx - 0.11 * s, cy + 0.06 * s, cx + 0.11 * s, cy + 0.28 * s], fill=(34, 24, 18), outline=shade(colour, 0.6), width=6 * SS)
    d.rectangle([cx - 0.12 * s, cy + 0.48 * s, cx + 0.12 * s, cy + 0.52 * s], fill=(52, 34, 22))
    top = cy - 1.25 * s
    d.rectangle([cx - 0.04 * s, top, cx + 0.04 * s, cy - 0.20 * s], fill=(96, 62, 34))
    for f in range(1, 19):
        y = cy - 0.20 * s - (1.05 * s) * (1 - 0.93 ** f)
        d.line([(cx - 0.04 * s, y), (cx + 0.04 * s, y)], fill=(210, 204, 190), width=2 * SS)
    d.rounded_rectangle([cx - 0.07 * s, top - 0.24 * s, cx + 0.07 * s, top], radius=10 * SS, fill=(70, 44, 26))
    for k in range(6):
        x = cx - 0.03 * s + k * 0.012 * s
        d.line([(x, top), (x, cy + 0.50 * s)], fill=(236, 226, 200), width=1 * SS)


def keys(d, cx, cy, s, colour):
    w, h = 1.6 * s, 0.42 * s
    d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], radius=18 * SS, fill=colour)
    kx0, ky0, kx1, ky1 = cx - w * 0.46, cy - h * 0.05, cx + w * 0.46, cy + h * 0.42
    n = 36
    kw = (kx1 - kx0) / n
    for i in range(n):
        d.rectangle([kx0 + i * kw, ky0, kx0 + (i + 1) * kw - 2 * SS, ky1], fill=(248, 248, 246))
    for i in range(n - 1):
        if i % 7 not in (2, 6):
            d.rectangle([kx0 + (i + 0.65) * kw, ky0, kx0 + (i + 1.35) * kw, ky0 + (ky1 - ky0) * 0.6], fill=(20, 20, 22))
    for k in range(6):
        d.ellipse([cx - w * 0.44 + k * 0.08 * s, cy - h * 0.38, cx - w * 0.44 + k * 0.08 * s + 0.05 * s, cy - h * 0.38 + 0.05 * s], fill=shade(colour, 1.8) if sum(colour) < 200 else (60, 60, 64))
    d.rectangle([cx + w * 0.12, cy - h * 0.40, cx + w * 0.40, cy - h * 0.18], fill=(70, 140, 200))


def drums(d, cx, cy, s, colour):
    d.ellipse([cx - 0.34 * s, cy - 0.10 * s, cx + 0.34 * s, cy + 0.58 * s], fill=colour, outline=(210, 210, 214), width=8 * SS)
    d.ellipse([cx - 0.27 * s, cy - 0.03 * s, cx + 0.27 * s, cy + 0.51 * s], fill=(236, 232, 222))
    for side in (-1, 1):
        x = cx + side * 0.22 * s
        d.ellipse([x - 0.16 * s, cy - 0.40 * s, x + 0.16 * s, cy - 0.14 * s], fill=colour, outline=(210, 210, 214), width=5 * SS)
        d.ellipse([x - 0.13 * s, cy - 0.40 * s, x + 0.13 * s, cy - 0.30 * s], fill=(236, 232, 222))
        cxm = cx + side * 0.62 * s
        d.line([(cxm, cy - 0.55 * s), (cxm, cy + 0.60 * s)], fill=(160, 160, 166), width=4 * SS)
        d.ellipse([cxm - 0.26 * s, cy - 0.62 * s, cxm + 0.26 * s, cy - 0.50 * s], fill=(214, 176, 80), outline=(170, 136, 60), width=3 * SS)
    d.ellipse([cx + 0.36 * s, cy + 0.10 * s, cx + 0.66 * s, cy + 0.32 * s], fill=colour, outline=(210, 210, 214), width=5 * SS)


def amp(d, cx, cy, s, colour):
    w, h = 1.15 * s, 0.85 * s
    d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], radius=22 * SS, fill=colour, outline=(12, 12, 12), width=6 * SS)
    d.rectangle([cx - w * 0.44, cy - h * 0.40, cx + w * 0.44, cy - h * 0.18], fill=(190, 160, 90))
    for k in range(8):
        d.ellipse([cx - w * 0.40 + k * w * 0.105, cy - h * 0.34, cx - w * 0.40 + k * w * 0.105 + 0.05 * s, cy - h * 0.34 + 0.05 * s], fill=(30, 30, 30))
    d.rectangle([cx - w * 0.44, cy - h * 0.12, cx + w * 0.44, cy + h * 0.42], fill=(58, 54, 50))
    for y in range(int(cy - h * 0.12), int(cy + h * 0.42), 6 * SS):
        d.line([(cx - w * 0.44, y), (cx + w * 0.44, y)], fill=(70, 66, 62), width=1 * SS)
    d.rounded_rectangle([cx - 0.12 * s, cy + h * 0.02, cx + 0.12 * s, cy + h * 0.10], radius=4 * SS, fill=(236, 232, 220))


def pedal(d, cx, cy, s, colour):
    w, h = 0.62 * s, 0.86 * s
    d.rounded_rectangle([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], radius=26 * SS, fill=colour, outline=shade(colour, 0.6), width=6 * SS)
    for k in range(3):
        x = cx - w * 0.28 + k * w * 0.28
        d.ellipse([x - 0.06 * s, cy - h * 0.36, x + 0.06 * s, cy - h * 0.36 + 0.12 * s], fill=(28, 28, 30))
        d.line([(x, cy - h * 0.36 + 0.01 * s), (x, cy - h * 0.36 + 0.05 * s)], fill=(240, 240, 240), width=3 * SS)
    d.rectangle([cx - w * 0.36, cy - h * 0.05, cx + w * 0.36, cy + h * 0.16], fill=shade(colour, 0.75))
    d.ellipse([cx - 0.09 * s, cy + h * 0.24, cx + 0.09 * s, cy + h * 0.24 + 0.18 * s], fill=(200, 200, 206), outline=(120, 120, 126), width=4 * SS)
    d.ellipse([cx - 0.02 * s, cy - h * 0.16, cx + 0.02 * s, cy - h * 0.12], fill=(240, 60, 40))


def mic(d, cx, cy, s, colour):
    d.polygon([(cx - 0.10 * s, cy - 0.05 * s), (cx + 0.10 * s, cy - 0.05 * s), (cx + 0.06 * s, cy + 0.80 * s), (cx - 0.06 * s, cy + 0.80 * s)], fill=colour)
    d.ellipse([cx - 0.22 * s, cy - 0.48 * s, cx + 0.22 * s, cy + 0.02 * s], fill=(150, 150, 156), outline=(90, 90, 96), width=5 * SS)
    for k in range(-5, 6):  # the grille's mesh, kept inside its outline
        half = math.sqrt(max(0.0, 1 - (k * 0.035 / 0.20) ** 2))
        d.line([(cx + k * 0.035 * s, cy - 0.23 * s - 0.21 * s * half), (cx + k * 0.035 * s, cy - 0.23 * s + 0.21 * s * half)], fill=(110, 110, 116), width=1 * SS)
        half = math.sqrt(max(0.0, 1 - (k * 0.04 / 0.23) ** 2))
        d.line([(cx - 0.20 * s * half, cy - 0.23 * s + k * 0.04 * s), (cx + 0.20 * s * half, cy - 0.23 * s + k * 0.04 * s)], fill=(110, 110, 116), width=1 * SS)
    d.rectangle([cx - 0.11 * s, cy + 0.10 * s, cx + 0.11 * s, cy + 0.16 * s], fill=(200, 200, 206))


DRAW = {
    "guitar": lambda d, cx, cy, s, c, i: guitar(d, cx, cy, s, c, offset=i % 2 == 1),
    "bass": lambda d, cx, cy, s, c, i: guitar(d, cx, cy, s, c, bass=True),
    "acoustic": lambda d, cx, cy, s, c, i: acoustic(d, cx, cy, s, c),
    "keys": lambda d, cx, cy, s, c, i: keys(d, cx, cy, s, c),
    "drums": lambda d, cx, cy, s, c, i: drums(d, cx, cy, s, c),
    "amp": lambda d, cx, cy, s, c, i: amp(d, cx, cy, s, c),
    "pedal": lambda d, cx, cy, s, c, i: pedal(d, cx, cy, s, c),
    "mic": lambda d, cx, cy, s, c, i: mic(d, cx, cy, s, c),
}

TALL = {"guitar", "bass", "acoustic", "mic"}


def drawn(kind, colour, index):
    """The instrument alone on a transparent layer, cropped to its edges."""
    layer = Image.new("RGBA", (2000 * SS, 2000 * SS), (0, 0, 0, 0))
    DRAW[kind](ImageDraw.Draw(layer), 1000 * SS, 1180 * SS, 400 * SS, shade(colour, 1.0 if index % 3 != 2 else 0.85), index)
    return layer.crop(layer.getbbox())


def photo(slug, kind, colour, index, first):
    seed = f"{slug}-{index}"
    rnd = random.Random(seed)
    portrait = (first == "p") if index == 0 else rnd.random() < (0.6 if kind in TALL else 0.25)
    size = (1080, 1440) if portrait else (1440, 1080)
    w, h = size[0] * SS, size[1] * SS
    img = background((w, h), seed)
    thing = drawn(kind, colour, index)
    # The first photo shows it whole; the others turn it a little or come closer to one part of it.
    close = index > 0 and rnd.random() < 0.5
    if close:
        tw, th = thing.size
        if tw < th:  # the body of a guitar, the head of a microphone
            top = int(th * (0.5 if kind != "mic" else 0.0))
            thing = thing.crop((0, top, tw, top + int(th * 0.5)))
        else:  # one side of a keyboard, a kit, an amplifier or a pedal
            left = int(tw * rnd.choice([0.0, 0.4]))
            thing = thing.crop((left, 0, left + int(tw * 0.6), th))
    elif index > 0:
        thing = thing.rotate(rnd.uniform(-10, 10), resample=Image.BICUBIC, expand=True)
    fill = 1.05 if close else 0.8
    scale = min(fill * w / thing.width, fill * h / thing.height)
    thing = thing.resize((max(1, int(thing.width * scale)), max(1, int(thing.height * scale))), Image.LANCZOS)
    x = (w - thing.width) // 2 + (int(rnd.uniform(-0.06, 0.06) * w) if index > 0 else 0)
    y = (h - thing.height) // 2 if close else min(int(h * 0.9) - thing.height, (h - thing.height) // 2 + int(h * 0.05))
    if not close:
        shadow(img, [x + thing.width * 0.08, y + thing.height - 0.03 * h, x + thing.width * 0.92, y + thing.height + 0.03 * h])
    img.paste(thing, (x, y), thing)
    img = img.resize(size, Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    img.save(os.path.join(OUT, f"{slug}-{index + 1}.jpg"), "JPEG", quality=82, optimize=True)


def main():
    count = 0
    for slug, kind, colour, total, first in PHOTOS:
        for index in range(total):
            photo(slug, kind, colour, index, first)
            count += 1
    print(f"{count} photos in {OUT}")


if __name__ == "__main__":
    main()
