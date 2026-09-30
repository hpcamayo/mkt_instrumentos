"""Shared helpers for round 5 art (2880x600 = 2x of the 1440x300 banner)."""
import math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

W2, H2 = 2880, 600
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', '')
MONO = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'
os.makedirs(OUT, exist_ok=True)

def hx(h):
    h = h.lstrip('#'); return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255

def srgb_to_lin(c): return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lin_to_srgb(c):
    c = np.clip(c, 0, None); return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)

def aces(x):
    a, b, c, d, e = 2.51, 0.03, 2.43, 0.59, 0.14
    return np.clip((x * (a * x + b)) / (x * (c * x + d) + e), 0, 1)

def blur(a, s):
    if a.ndim == 3: return np.stack([ndimage.gaussian_filter(a[..., k], s) for k in range(a.shape[2])], -1)
    return ndimage.gaussian_filter(a, s)

def bloom(lin, thresh=0.8, radii=(4, 12, 32), gains=(0.35, 0.25, 0.2)):
    br = np.clip(lin - thresh, 0, None)
    out = lin.copy()
    for r, g in zip(radii, gains):
        out += blur(br, r) * g
    return out

def grain(a, amt=0.02, seed=0, mono=True):
    rng = np.random.default_rng(seed)
    g = rng.normal(0, 1, a.shape[:2] + ((1,) if mono else (3,))).astype(np.float32)
    return a + g * amt

def fbm(h, w, seed, octaves=5, base=8, lac=2.0, gain=0.5):
    rng = np.random.default_rng(seed); out = np.zeros((h, w), np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        gh = max(2, int(base * lac ** o)); gw = max(2, int(gh * w / h))
        g = rng.random((gh + 1, gw + 1)).astype(np.float32)
        up = np.asarray(Image.fromarray(g).resize((w, h), Image.BICUBIC), np.float32)
        out += up * amp; tot += amp; amp *= gain
    return out / tot

def ellipse_calm(h=H2, w=W2, cx=0.5, cy=0.45, rx=0.28, ry=0.62, p=1.2):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = ((x / w - cx) / rx) ** 2 + ((y / h - cy) / ry) ** 2
    return np.clip(1 - d, 0, 1) ** p

def to8(img):
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)

def save(img, name, q=90):
    im = Image.fromarray(to8(img)); im.save(OUT + name + '.jpg', quality=q, optimize=True, progressive=True); return im

def gradient(t, stops):
    """t in [0,1] array -> RGB using [(pos, '#hex'), ...]"""
    t = np.clip(t, 0, 1); out = np.zeros(t.shape + (3,), np.float32)
    for (a, c1), (b, c2) in zip(stops[:-1], stops[1:]):
        m = (t >= a) & (t <= b)
        k = ((t - a) / max(b - a, 1e-6))[..., None]
        out[m] = (hx(c1) * (1 - k) + hx(c2) * k)[m]
    return out

def label(img_u8, text, xy, size=20, fill=(255, 255, 255), anchor='ls', font=MONO):
    im = Image.fromarray(img_u8) if isinstance(img_u8, np.ndarray) else img_u8
    d = ImageDraw.Draw(im); d.text(xy, text, fill=fill, font=ImageFont.truetype(font, size), anchor=anchor)
    return im

# --- a stereo huayno phrase (charango + bass + cajón), Karplus-Strong, reused by several pieces
def huayno(sr=8000, dur=12.0, seed=9):
    n = int(sr * dur); rng = np.random.default_rng(seed)
    L = np.zeros(n, np.float32); R = np.zeros(n, np.float32)
    def ks(freq, length, bright=0.996):
        N = max(2, int(sr / freq)); buf = rng.uniform(-1, 1, N).astype(np.float32); out = np.zeros(length, np.float32)
        for i in range(length):
            j = i % N; out[i] = buf[j]; buf[j] = bright * 0.5 * (buf[j] + buf[(j + 1) % N])
        return out
    A = 440.0; scale = [0, 3, 5, 7, 10, 12, 15]
    phrase = [0, 2, 3, 4, 3, 2, 0, 1, 2, 1, 0, -1, 0, 2, 4, 5, 4, 3, 2, 0, 1, 0, 2, 3, 4, 3, 2, 0]
    t = 0.2; beat = 0.36
    for i, deg in enumerate(phrase):
        semis = scale[deg % 7] + 12 * (deg // 7); f = A * 2 ** ((semis - 12) / 12) * 2
        Ln = int(sr * 0.8); s0 = int(sr * t); e = min(n, s0 + Ln)
        note = ks(f, Ln) * 0.6 + ks(f * 2, Ln, 0.992) * 0.2
        L[s0:e] += note[:e - s0] * 0.9; R[s0:e] += note[:e - s0] * 0.45
        t += beat * (1.5 if i % 4 == 3 else 1.0)
        if t > dur - 0.8: break
    bassline = [0, 0, 3, 4, 0, 0, 4, 3]
    for k in range(int(dur / (beat * 2))):
        s0 = int(sr * (0.2 + k * beat * 2)); ln = int(sr * 0.5)
        f = 55 * 2 ** (scale[bassline[k % 8] % 7] / 12)
        env = np.exp(-np.arange(ln) / (sr * 0.18))
        b = (np.sin(2 * math.pi * f * np.arange(ln) / sr) + 0.3 * np.sin(4 * math.pi * f * np.arange(ln) / sr)) * env
        e = min(n, s0 + ln); L[s0:e] += b[:e - s0].astype(np.float32) * 0.5; R[s0:e] += b[:e - s0].astype(np.float32) * 0.9
        s1 = int(sr * (0.2 + k * beat * 2 + beat * 1.5))
        slap = rng.normal(0, 1, 900) * np.exp(-np.arange(900) / 120.0)
        if s1 + 900 < n: R[s1:s1 + 900] += slap.astype(np.float32) * 0.35; L[s1:s1 + 900] += slap.astype(np.float32) * 0.12
    m = max(np.abs(L).max(), np.abs(R).max()); return L / m, R / m, sr

def noise1d(n, seed, octaves=6, base=4, gain=0.5):
    """smooth 1D fbm in [0,1] of length n; base = control points in the first octave"""
    rng = np.random.default_rng(seed); x = np.linspace(0, 1, n); out = np.zeros(n, np.float32); amp = 1.0; tot = 0
    for o in range(octaves):
        k = int(base * 2 ** o) + 2; cp = rng.random(k)
        xs = np.linspace(0, 1, k)
        from scipy.interpolate import CubicSpline
        out += CubicSpline(xs, cp)(x).astype(np.float32) * amp; tot += amp; amp *= gain
    return out / tot
