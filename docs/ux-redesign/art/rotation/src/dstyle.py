#!/usr/bin/env python3
"""Round 10 style kit: the 'Diablada' look (sculpted SDF objects, glossy enamel + gold/silver, gems, filigree,
warm key + magenta/cyan rims, night-procession bokeh), reusable for any pair of hero objects.
A piece supplies GLSL for objA(p) / objB(p) (local metres, set gMat/gAux/gLoc) and pieceShade(...)."""
import os, sys, math
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glrender import render, HEAD
from c9 import W2, H2, prev, zone_busy, lin_to_srgb, srgb_to_lin, aces, blur, hx, to8

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', '')
import os
os.makedirs(OUT, exist_ok=True)

LIB = HEAD + r'''
uniform vec3 uRAa, uRAb, uRAc, uRBa, uRBb, uRBc; uniform vec3 uCA, uCB; uniform float uSA, uSB;
uniform vec4 uBA, uBB;                // bounding spheres in local units (xyz, r)
uniform vec3 uEA0, uEA1, uEB0, uEB1;  // enamel colours: A/B material x who
const float PI = 3.14159265;
int gMat; vec3 gLoc; float gAux; int gWho;

float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
float sdEll(vec3 p, vec3 r){ float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float sdCap(vec3 p, vec3 a, vec3 b, float r, out float h){ vec3 pa = p - a, ba = b - a; h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
float sdSeg(vec3 p, vec3 a, vec3 b, float r){ float h; return sdCap(p, a, b, r, h); }
float sdCyl(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }
float sdRCyl(vec3 p, float r, float h, float rr){ vec2 d = vec2(length(p.xz) - r + rr, abs(p.y) - h + rr); return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - rr; }
float sdTorus(vec3 p, float R, float r){ return length(vec2(length(p.xz) - R, p.y)) - r; }
float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0); }
float sdRBox(vec3 p, vec3 b, float r){ return sdBox(p, b - r) - r; }
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// tube along a circular arc (centre c, plane (u,v), radius R, angles a0..a1), tube radius r
float arcTube(vec3 p, vec3 c, vec3 u, vec3 v, float R, float a0, float a1, float r){
  vec3 q = p - c; float x = dot(q, u), y = dot(q, v);
  float a = atan(y, x); float mid = 0.5 * (a0 + a1);
  a = mid + mod(a - mid + PI, 2.0 * PI) - PI;
  a = clamp(a, a0, a1);
  return length(p - (c + R * (cos(a) * u + sin(a) * v))) - r;
}
// flared bell (Bessel horn) as a thin shell; axis +z out of the mouth, mouth at z=0; u = depth from the mouth
float bellR(float u, float RM, float U0, float MM){ return RM * pow(U0 / (u + U0), MM); }
float bellShell(vec3 q, float RM, float U0, float MM, float BL, float TH, out float uo){
  float rho = length(q.xy); float u = -q.z;
  float best = 1e9; uo = clamp(u, 0.0, BL);
  float g0 = clamp(u, 0.0, BL), g1 = clamp(U0 * (pow(RM / max(rho, 1e-4), 1.0 / MM) - 1.0), 0.0, BL);
  for (int k = 0; k < 2; k++){
    float s = k == 0 ? g0 : g1;
    for (int it = 0; it < 4; it++){
      float R = bellR(s, RM, U0, MM); float Rp = -MM * R / (s + U0); float Rpp = MM * (MM + 1.0) * R / ((s + U0) * (s + U0));
      float f1 = -(rho - R) * Rp - (u - s); float f2 = Rp * Rp + 1.0 - (rho - R) * Rpp;
      s = clamp(s - f1 / max(f2, 1e-3), 0.0, BL);
    }
    float dd = length(vec2(rho - bellR(s, RM, U0, MM), u - s));
    if (dd < best){ best = dd; uo = s; }
  }
  return best - TH;
}
float hash13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
// filigree helpers (return 0..1 line mask)
float filSpiral(vec2 c, float freq, float w){ float r = length(c), a = atan(c.y, c.x); return smoothstep(w, w * 0.4, abs(fract(r * freq - a / 6.2831) - 0.5)); }
float filRing(float x, float freq, float w){ return smoothstep(w, w * 0.4, abs(fract(x * freq) - 0.5)); }
float filRays(float a, float n, float w){ return smoothstep(w, w * 0.4, abs(fract(a * n / 6.2831) - 0.5)); }
vec3 gemCol(float k){ int i = int(mod(k, 6.0));
  if (i == 0) return vec3(0.9, 0.04, 0.1); if (i == 1) return vec3(0.03, 0.7, 0.3); if (i == 2) return vec3(0.08, 0.3, 0.95);
  if (i == 3) return vec3(1.0, 0.55, 0.03); if (i == 4) return vec3(0.6, 0.08, 0.85); return vec3(0.05, 0.8, 0.78); }
vec3 woolCol(float k){ int i = int(mod(k, 8.0));
  if (i == 0) return vec3(0.85, 0.03, 0.06); if (i == 1) return vec3(1.0, 0.75, 0.02); if (i == 2) return vec3(0.9, 0.05, 0.5); if (i == 3) return vec3(0.05, 0.6, 0.2);
  if (i == 4) return vec3(0.05, 0.25, 0.85); if (i == 5) return vec3(1.0, 0.38, 0.02); if (i == 6) return vec3(0.95, 0.93, 0.88); return vec3(0.02, 0.7, 0.72); }
float objA(vec3 p);
float objB(vec3 p);
void pieceShade(int mat, int who, vec3 loc, float aux, vec3 p, inout vec3 base, inout float rough, inout float metal, inout float glow);
'''

MAIN = r'''
float map(vec3 p){
  float d = 1e9; int m = 0; float a = 0.0; vec3 l = vec3(0); int w = 0;
  vec3 qa = mat3(uRAa, uRAb, uRAc) * (p - uCA) / uSA;
  float ba = (length(qa - uBA.xyz) - uBA.w) * uSA;
  if (ba < 0.12){ float dd = objA(qa) * uSA; if (dd < d){ d = dd; m = gMat; a = gAux; l = gLoc; w = 0; } }
  else d = min(d, ba);
  vec3 qb = mat3(uRBa, uRBb, uRBc) * (p - uCB) / uSB;
  float bb = (length(qb - uBB.xyz) - uBB.w) * uSB;
  if (bb < 0.12){ float dd = objB(qb) * uSB; if (dd < d){ d = dd; m = gMat; a = gAux; l = gLoc; w = 1; } }
  else d = min(d, bb);
  gMat = m; gAux = a; gLoc = l; gWho = w;
  return d;
}
vec3 nrm(vec3 p){ const vec2 k = vec2(1, -1); float h = 0.0005;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h)); }
float shadow(vec3 ro, vec3 rd){ float res = 1.0; float t = 0.02;
  for (int i = 0; i < 40; i++){ float h = map(ro + rd * t); res = min(res, 10.0 * h / t); t += clamp(h, 0.01, 0.2); if (res < 0.002 || t > 3.0) break; }
  return clamp(res, 0.0, 1.0); }
float ao(vec3 p, vec3 n){ float o = 0.0, s = 1.0; for (int i = 1; i <= 5; i++){ float h = 0.02 * float(i * i); o += (h - map(p + n * h)) * s; s *= 0.7; } return clamp(1.0 - 1.6 * o, 0.0, 1.0); }

void main(){
  vec2 jit = hash22(gl_FragCoord.xy + uSample * 13.0) - 0.5;
  vec2 uv = (gl_FragCoord.xy + jit - 0.5 * uRes) / uRes.y;
  vec3 ro = vec3(0.0, 0.15, 12.0);
  vec3 rd = normalize(vec3(uv.x * 0.1375, uv.y * 0.1375, -1.0));
  float t = 8.0; bool hit = false;
  for (int i = 0; i < 220; i++){
    float d = map(ro + rd * t);
    if (d < 0.0006){ hit = true; break; }
    t += d * 0.85;
    if (t > 17.0) break;
  }
  if (!hit){ o = vec4(0.0); return; }
  vec3 p = ro + rd * t;
  map(p); int mat = gMat; float aux = gAux; vec3 loc = gLoc; int who = gWho;
  vec3 n = nrm(p);
  vec3 v = -rd;
  vec3 base = vec3(0.5); float rough = 0.25; float metal = 0.0; float glow = 0.0;
  vec3 goldC = vec3(1.0, 0.70, 0.25), silverC = vec3(0.92, 0.93, 0.95);
  if (mat == 1){ base = who == 0 ? uEA0 : uEA1; rough = 0.16; }
  else if (mat == 2){ base = goldC; metal = 1.0; rough = 0.2; }
  else if (mat == 3){ base = silverC; metal = 1.0; rough = 0.16; }
  else if (mat == 4){ base = gemCol(aux); rough = 0.03; glow = 0.35; }
  else if (mat == 5){ base = who == 0 ? uEB0 : uEB1; rough = 0.16; }
  else if (mat == 6){ base = vec3(0.36, 0.16, 0.06); rough = 0.24; }
  else if (mat == 7){ base = vec3(0.86, 0.72, 0.5); rough = 0.34; }
  else if (mat == 8){ base = vec3(0.93, 0.88, 0.76); rough = 0.6; }
  else if (mat == 9){ base = vec3(0.82, 0.82, 0.85); metal = 1.0; rough = 0.25; }
  else if (mat == 10){ base = woolCol(aux); rough = 0.95; }
  else if (mat == 11){ base = vec3(0.02, 0.012, 0.01); rough = 0.5; }
  else if (mat == 12){ float ir = dot(n, v); base = vec3(0.9, 0.88, 0.86) + 0.12 * vec3(sin(ir * 12.0), sin(ir * 12.0 + 2.0), sin(ir * 12.0 + 4.0)); rough = 0.12; }
  else if (mat == 13){ base = woolCol(aux); rough = 0.6; }
  else if (mat == 14){ base = vec3(0.018, 0.016, 0.02); rough = 0.1; }
  pieceShade(mat, who, loc, aux, p, base, rough, metal, glow);
  // surface detail: hammered metal, orange-peel enamel
  {
    float fq = metal > 0.5 ? 55.0 : 140.0;
    float amp = metal > 0.5 ? 0.3 : 0.07;
    if (mat == 4 || mat == 12 || mat == 9) amp = 0.0;
    vec3 q = p * fq; vec3 e = vec3(0.07, 0.0, 0.0);
    float n0 = sin(q.x) * sin(q.y * 1.3 + 1.7) * sin(q.z * 0.9 + 0.3);
    float nx = sin(q.x + e.x) * sin(q.y * 1.3 + 1.7) * sin(q.z * 0.9 + 0.3);
    float ny = sin(q.x) * sin((q.y + e.x) * 1.3 + 1.7) * sin(q.z * 0.9 + 0.3);
    float nz = sin(q.x) * sin(q.y * 1.3 + 1.7) * sin((q.z + e.x) * 0.9 + 0.3);
    n = normalize(n - amp * vec3(nx - n0, ny - n0, nz - n0) / e.x * 0.1);
  }
  float flake = ((mat == 1 || mat == 5) && metal < 0.5) ? step(0.985, hash12(floor(p.xy * 900.0) + floor(p.z * 900.0) * 7.1)) : 0.0;
  vec3 L1 = normalize(vec3(-0.45, 0.6, 0.66)); vec3 C1 = vec3(1.0, 0.84, 0.66) * 3.0;
  vec3 L2 = normalize(vec3(-0.9, 0.3, -0.3)); vec3 C2 = vec3(1.0, 0.2, 0.6) * 2.2;
  vec3 L3 = normalize(vec3(0.9, 0.35, -0.25)); vec3 C3 = vec3(0.2, 0.65, 1.0) * 2.0;
  vec3 L4 = normalize(vec3(0.1, -0.7, 0.7)); vec3 C4 = vec3(1.0, 0.45, 0.15) * 0.35;
  float sh = shadow(p + n * 0.003, L1);
  float occ = ao(p, n);
  vec3 col = vec3(0.0);
  vec3 Ls[4] = vec3[4](L1, L2, L3, L4); vec3 Cs[4] = vec3[4](C1, C2, C3, C4);
  for (int i = 0; i < 4; i++){
    vec3 L = Ls[i]; float nl = max(dot(n, L), 0.0);
    float s = i == 0 ? sh : 1.0;
    vec3 h = normalize(L + v);
    float a2 = rough * rough;
    float nh = max(dot(n, h), 0.0);
    float D = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
    vec3 F0 = mix(vec3(0.04), base, metal);
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(h, v), 0.0), 5.0);
    vec3 spec = D * F * 0.25;
    vec3 diff = base * (1.0 - metal) / PI * 3.0;
    col += (diff + spec + flake * pow(nh, 80.0) * 6.0) * Cs[i] * nl * s;
  }
  vec3 r = reflect(rd, n);
  vec3 env = mix(vec3(0.02, 0.02, 0.06), vec3(0.35, 0.12, 0.05), smoothstep(0.1, -0.6, r.y));
  env += vec3(1.3, 0.85, 0.5) * smoothstep(0.75, 0.9, dot(r, normalize(vec3(-0.5, 0.55, 0.65)))) * 2.2;
  env += vec3(1.0, 0.25, 0.6) * smoothstep(0.7, 0.9, dot(r, normalize(vec3(-0.95, 0.2, -0.2)))) * 1.4;
  env += vec3(0.25, 0.6, 1.0) * smoothstep(0.7, 0.9, dot(r, normalize(vec3(0.95, 0.3, -0.1)))) * 1.2;
  env += vec3(1.0, 0.6, 0.25) * smoothstep(0.6, 1.0, -r.y) * 0.6;
  vec3 F0e = mix(vec3(0.04), base, metal);
  vec3 Fe = F0e + (1.0 - F0e) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col += env * Fe * (1.0 - rough) * occ;
  col += base * (1.0 - metal) * vec3(0.018, 0.018, 0.04) * occ;
  if (mat == 10){ col += base * pow(1.0 - max(dot(n, v), 0.0), 2.0) * 0.35; }          // wool fuzz sheen
  col += base * glow * (0.25 + 0.75 * pow(max(dot(n, v), 0.0), 2.0));                  // gems glow from inside
  col *= mix(0.6, 1.0, occ);
  o = vec4(col, 1.0);
}
'''

def rotm(yaw=0.0, pitch=0.0, roll=0.0):
    a, b, c = math.radians(yaw), math.radians(pitch), math.radians(roll)
    Ry = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, math.cos(b), -math.sin(b)], [0, math.sin(b), math.cos(b)]])
    Rz = np.array([[math.cos(c), -math.sin(c), 0], [math.sin(c), math.cos(c), 0], [0, 0, 1]])
    return Ry @ Rx @ Rz

def frame(xdir, ydir):
    """rotation whose local x axis points along xdir and local y as close as possible to ydir"""
    x = np.array(xdir, float); x /= np.linalg.norm(x)
    y = np.array(ydir, float); y = y - x * np.dot(x, y); y /= np.linalg.norm(y)
    z = np.cross(x, y)
    return np.stack([x, y, z], 1)

def _cols(R, pre):
    return {f'{pre}a': [float(v) for v in R[0]], f'{pre}b': [float(v) for v in R[1]], f'{pre}c': [float(v) for v in R[2]]}

def lin(h):
    return [float(v) for v in srgb_to_lin(hx(h))]

def background(W, H, top, bot, palette, seed=4, n=90, weights=None):
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    bg = np.zeros((H, W, 3), np.float32)
    t0, b0 = srgb_to_lin(hx(top)), srgb_to_lin(hx(bot))
    bg[:] = t0 * (1 - (yy / H)[..., None]) + b0 * (yy / H)[..., None]
    rng = np.random.default_rng(seed)
    bok = np.zeros((H, W, 3), np.float32)
    s = W / W2
    k = len(palette); w = np.array(weights if weights else [1.0] * k); w = w / w.sum()
    for i in range(n):
        cx = rng.uniform(0, W) if rng.random() < 0.5 else rng.choice([rng.uniform(0, W * 0.24), rng.uniform(W * 0.76, W)])
        cy = rng.uniform(H * 0.55, H * 1.08) if rng.random() < 0.75 else rng.uniform(0, H)
        r = rng.uniform(10, 46) * s
        c = srgb_to_lin(hx(palette[rng.choice(k, p=w)]))
        dd = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
        disc = np.clip((1 - dd) * r / 1.5, 0, 1) * (0.55 + 0.45 * np.clip(dd, 0, 1) ** 3)
        zx = abs(cx / W - 0.5) < 0.28 and cy < H * 0.76
        zb = abs(cx / W - 0.5) < 0.28
        bok += disc[..., None] * c * rng.uniform(0.25, 0.8) * (0.0 if zx else (0.45 if zb else 1.0))
    bg += bok * 0.55
    return blur(bg, 1.2 * s)

def run(name, piece, A, B, colors, bg, small=False, spp=6, exposure=1.05):
    """A/B: dict(pos=[x,y,z], rot=(yaw,pitch,roll), scale=s, bound=(x,y,z,r) in local units)"""
    W, H = (720, 150) if small else (W2, H2)
    RA = A['R'] if 'R' in A else rotm(*A['rot']); RB = B['R'] if 'R' in B else rotm(*B['rot'])
    uni = {**_cols(RA, 'uRA'), **_cols(RB, 'uRB'), 'uCA': A['pos'], 'uCB': B['pos'], 'uSA': A['scale'], 'uSB': B['scale'],
           'uBA': list(A['bound']), 'uBB': list(B['bound'])}
    uni.update({k: lin(v) for k, v in colors.items()})
    img = render(LIB + piece + MAIN, W, H, spp=1 if small else spp, tile=128, uniforms=uni)
    rgb, a = img[..., :3], img[..., 3:4]
    back = background(W, H, **bg)
    lin_ = rgb + back * (1 - a)
    s = W / W2
    br = np.clip(lin_ - 1.0, 0, None)
    lin_ += blur(br, 4 * s) * 0.3 + blur(br, 16 * s) * 0.15
    out = lin_to_srgb(aces(lin_ * exposure))
    out = np.clip(out + np.random.default_rng(2).normal(0, 0.008, out.shape[:2] + (1,)), 0, 1)
    if small:
        Image.fromarray(to8(out)).save(OUT + f'_{name}_small.png')
        return out
    Image.fromarray(to8(out)).save(OUT + name + '.jpg', quality=90, optimize=True, progressive=True)
    print(name, 'zone busy', round(zone_busy(out), 4))
    return out

def preview(name):
    import subprocess
    subprocess.run(['python3', '/home/claude/laria-ux/art/prev2.py', f'{OUT}{name}.jpg:{OUT}_p_{name}.png:#FFFFFF:#C8CDD6'], check=True)
