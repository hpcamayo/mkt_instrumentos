"""Round 9 plumbing only (paths, compositing, save, preview). No shared visual assets: every piece draws its own."""
import io, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
import cairosvg
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import hx, fbm, blur, gradient, to8, srgb_to_lin, lin_to_srgb, aces  # noqa: F401

W2, H2 = 2880, 600
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', '')
os.makedirs(OUT, exist_ok=True)
# text zone of the 1440x300 banner at 2x (h1 + lead + search), used for calm checks
ZONE = (700, 60, 2180, 450)

def grid(h=H2, w=W2):
    return np.mgrid[0:h, 0:w].astype(np.float32)

def svg_rgba(body, w=W2, h=H2):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>'
    return np.asarray(Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg.encode()))).convert('RGBA')).astype(np.float32) / 255

def over(base, rgb, a):
    a = a[..., None] if a.ndim == 2 else a
    return base * (1 - a) + rgb * a

def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)

def save(img, name, q=90):
    im = Image.fromarray(to8(img)); im.save(OUT + name + '.jpg', quality=q, optimize=True, progressive=True); return im

def prev(name, hc='#FFFFFF', sc='#C8CDD6'):
    subprocess.run(['python3', '/home/claude/laria-ux/art/prev2.py', f'{OUT}{name}.jpg:{OUT}_p_{name}.png:{hc}:{sc}'], check=True)

def zone_busy(img):
    """mean local contrast inside the text zone (lower = calmer)"""
    x0, y0, x1, y1 = ZONE
    lum = img[y0:y1, x0:x1].mean(-1)
    return float(np.abs(lum - ndimage.uniform_filter(lum, 25)).mean())
