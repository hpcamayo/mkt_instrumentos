#!/usr/bin/env python3
"""Trombón y saxo: a trombone standing tall (slide up, bell up) and an alto sax leaning in, both dressed for the
fiesta: enamel-painted bells with gold filigree, engraved flowers, gem key cups, pearl touches."""
import sys
from dstyle import run, preview, frame

PIECE = r'''
// ---------------- trombone (local metres): x = forward (bell and slide point +x), y = up, z = toward viewer
float trombone(vec3 q){
  float d = 1e9; gMat = 2; gAux = 0.0; gLoc = q;
  vec3 qb = vec3(q.y - 0.11, q.z, q.x - 0.42);               // bell axis +x, mouth at x=0.42, centred y=0.11
  float u; float bell = bellShell(qb, 0.108, 0.018, 0.75, 0.36, 0.0014, u);
  float inside = length(qb.xy) < bellR(max(-qb.z, 0.0), 0.108, 0.018, 0.75) ? 1.0 : 0.0;
  d = bell; gMat = inside > 0.5 ? 1 : 2; gLoc = qb; gAux = u;
  float rim = length(vec2(length(qb.xy) - 0.109, qb.z + 0.0014)) - 0.0042;
  if (rim < d){ d = rim; gMat = 2; }
  {
    float a = atan(qb.y, qb.x); float cell = 6.2831 / 16.0; float ai = (floor(a / cell) + 0.5) * cell;
    float zg = -0.02; float rg = bellR(-zg, 0.108, 0.018, 0.75) + 0.005;
    float gem = length(qb - vec3(cos(ai) * rg, sin(ai) * rg, zg)) - 0.0068;
    if (gem < d){ d = gem; gMat = 4; gAux = mod(floor(a / cell) + 16.0, 2.0) * 3.0 + 1.0; }
    float ai2 = floor(a / cell) * cell;
    float hS; float sp = sdCap(qb, vec3(cos(ai2) * 0.11, sin(ai2) * 0.11, -0.002), vec3(cos(ai2) * 0.135, sin(ai2) * 0.135, 0.01), 0.0, hS) - 0.005 * (1.0 - hS);
    if (sp < d){ d = sp; gMat = 2; }
  }
  // bell section tube back over the shoulder, tuning-slide loop, forward to the slide receiver
  float t1 = sdSeg(q, vec3(0.06, 0.11, 0.0), vec3(-0.36, 0.11, 0.0), 0.0075);
  float loop = arcTube(q, vec3(-0.36, 0.07, 0.0), vec3(1, 0, 0), vec3(0, 1, 0), 0.04, 1.5708, 4.7124, 0.0078);
  float t2 = sdSeg(q, vec3(-0.36, 0.03, 0.0), vec3(-0.06, 0.03, 0.0), 0.0072);
  // hand slide: two long parallel tubes (side by side in depth), bow at the far end
  float s1 = sdSeg(q, vec3(-0.06, 0.03, 0.0), vec3(0.78, 0.03, 0.0), 0.0072);
  float s2 = sdSeg(q, vec3(-0.06, 0.03, -0.075), vec3(0.78, 0.03, -0.075), 0.0072);
  float bow = arcTube(q, vec3(0.78, 0.03, -0.0375), vec3(1, 0, 0), vec3(0, 0, 1), 0.0375, -1.5708, 1.5708, 0.0078);
  float stock = min(sdSeg(q, vec3(0.05, 0.03, 0.0), vec3(0.05, 0.03, -0.075), 0.0045), sdSeg(q, vec3(-0.02, 0.03, 0.0), vec3(-0.02, 0.03, -0.075), 0.0045));
  float brace = sdSeg(q, vec3(0.0, 0.03, 0.0), vec3(0.0, 0.11, 0.0), 0.004);
  float tubes = min(min(min(t1, loop), min(t2, s1)), min(min(s2, bow), min(stock, brace)));
  if (tubes < d){ d = tubes; gMat = 2; gLoc = q; }
  // outer slide sleeves in silver
  float sl = min(sdSeg(q, vec3(0.32, 0.03, 0.0), vec3(0.78, 0.03, 0.0), 0.0086), sdSeg(q, vec3(0.32, 0.03, -0.075), vec3(0.78, 0.03, -0.075), 0.0086));
  if (sl < d){ d = sl; gMat = 3; }
  // mouthpiece
  {
    float h; float mp = sdCap(q, vec3(-0.06, 0.03, 0.0), vec3(-0.14, 0.03, 0.0), 0.0, h);
    mp -= mix(0.006, 0.013, smoothstep(0.55, 1.0, h));
    mp = min(mp, length(vec2(length((q - vec3(-0.142, 0.03, 0.0)).yz) - 0.013, q.x + 0.142)) - 0.0035);
    if (mp < d){ d = mp; gMat = 3; }
  }
  // gem studs on the braces and the slide bow
  float g1 = length(q - vec3(0.0, 0.07, 0.009)) - 0.008;
  float g2 = length(q - vec3(0.8, 0.03, -0.0375)) - 0.011;
  float g3 = length(q - vec3(-0.4, 0.07, 0.0)) - 0.009;
  if (g1 < d){ d = g1; gMat = 4; gAux = 0.0; }
  if (g2 < d){ d = g2; gMat = 4; gAux = 3.0; }
  if (g3 < d){ d = g3; gMat = 4; gAux = 1.0; }
  return d;
}

// ---------------- alto saxophone (local metres): y = up, z = toward viewer; bell opens up and forward
vec3 saxPt(float s){           // centreline, s in [0,1]: neck, body, bow, bell section
  if (s < 0.14){ float t = s / 0.14; vec3 a = vec3(-0.1, 0.34, 0.0), c = vec3(-0.02, 0.40, 0.0), b = vec3(0.0, 0.30, 0.0);
    return mix(mix(a, c, t), mix(c, b, t), t); }
  if (s < 0.6){ float t = (s - 0.14) / 0.46; return vec3(0.015 * t, 0.30 - 0.44 * t, 0.0); }
  if (s < 0.8){ float t = (s - 0.6) / 0.2; float a = 3.1416 + t * 3.1416; return vec3(0.07 + 0.055 * cos(a), -0.14 + 0.06 * sin(a), 0.0); }
  float t = (s - 0.8) / 0.2; return vec3(0.125 + 0.025 * t, -0.14 + 0.22 * t, 0.012 * t);
}
float saxR(float s){
  if (s < 0.14) return mix(0.0065, 0.0095, s / 0.14);
  if (s < 0.6) return mix(0.0095, 0.029, (s - 0.14) / 0.46);
  if (s < 0.8) return mix(0.029, 0.036, (s - 0.6) / 0.2);
  return mix(0.036, 0.047, (s - 0.8) / 0.2);
}
float sax(vec3 q){
  float d = 1e9; gMat = 2; gAux = 0.0; gLoc = q;
  vec3 prev = saxPt(0.0);
  const int N = 30;
  for (int i = 1; i <= N; i++){
    float s = float(i) / float(N);
    vec3 cur = saxPt(s);
    float h; float dd = sdCap(q, prev, cur, 0.0, h);
    dd -= saxR((float(i - 1) + h) / float(N));
    if (dd < d){ d = dd; }
    prev = cur;
  }
  // bell flare opening up, a little forward
  vec3 bc = saxPt(1.0);
  vec3 ax = normalize(vec3(0.12, 1.0, 0.18));
  vec3 bx = normalize(cross(ax, vec3(0, 0, 1))); vec3 by = cross(ax, bx);
  vec3 qb = vec3(dot(q - bc, bx), dot(q - bc, by), dot(q - bc, ax) - 0.12);
  float u; float bell = bellShell(qb, 0.086, 0.07, 0.75, 0.13, 0.0016, u);
  float inside = length(qb.xy) < bellR(max(-qb.z, 0.0), 0.086, 0.07, 0.75) ? 1.0 : 0.0;
  if (bell < d){ d = bell; gMat = inside > 0.5 ? 5 : 2; gLoc = qb; gAux = u; }
  else d = smin(d, bell, 0.012);
  float rim = length(vec2(length(qb.xy) - 0.087, qb.z + 0.0016)) - 0.0042;
  if (rim < d){ d = rim; gMat = 2; }
  {
    float a = atan(qb.y, qb.x); float cell = 6.2831 / 14.0; float ai = (floor(a / cell) + 0.5) * cell;
    float zg = -0.018; float rg = bellR(-zg, 0.086, 0.07, 0.75) + 0.004;
    float gem = length(qb - vec3(cos(ai) * rg, sin(ai) * rg, zg)) - 0.0058;
    if (gem < d){ d = gem; gMat = 4; gAux = mod(floor(a / cell) + 14.0, 3.0) * 2.0 + 1.0; }
    float ai2 = floor(a / cell) * cell;
    float hS; float sp = sdCap(qb, vec3(cos(ai2) * 0.088, sin(ai2) * 0.088, -0.002), vec3(cos(ai2) * 0.108, sin(ai2) * 0.108, 0.008), 0.0, hS) - 0.0042 * (1.0 - hS);
    if (sp < d){ d = sp; gMat = 2; }
  }
  // mouthpiece (black) and ligature
  float mp = sdSeg(q, vec3(-0.1, 0.34, 0.0), vec3(-0.16, 0.325, 0.0), 0.0085);
  if (mp < d){ d = mp; gMat = 14; }
  float lig = sdSeg(q, vec3(-0.118, 0.336, 0.0), vec3(-0.134, 0.332, 0.0), 0.0105);
  if (lig < d){ d = lig; gMat = 3; }
  // key stacks down the front of the body (pearl touches, then gem cups), rods hugging the side
  for (int k = 0; k < 9; k++){
    float s = 0.2 + 0.042 * float(k);
    vec3 c = saxPt(s); float r = saxR(s);
    vec3 kc = c + vec3(0.0, 0.0, r + 0.003);
    float cup = sdCyl((q - kc).xzy, 0.0105 + 0.0009 * float(k), 0.0035);
    if (cup < d){ d = cup; gMat = 2; }
    float gem = length(q - (kc + vec3(0.0, 0.0, 0.0035))) - (0.0072 + 0.0008 * float(k));
    if (gem < d){ d = gem; gMat = (k == 0 || k == 1 || k == 2 || k == 5 || k == 6) ? 12 : 4; gAux = float(k); }
  }
  for (int k = 0; k < 3; k++){
    float s = 0.64 + 0.05 * float(k);
    vec3 c = saxPt(s); float r = saxR(s);
    vec3 kc = c + vec3(0.0, 0.0, r + 0.004);
    float cup = sdCyl((q - kc).xzy, 0.016, 0.005);
    if (cup < d){ d = cup; gMat = 2; }
    float gem = length(q - (kc + vec3(0.0, 0.0, 0.005))) - 0.0105;
    if (gem < d){ d = gem; gMat = 4; gAux = float(k) + 3.0; }
  }
  float rod = sdSeg(q, saxPt(0.2) + vec3(0.012, 0.0, 0.012), saxPt(0.58) + vec3(0.03, 0.0, 0.02), 0.0022);
  if (rod < d){ d = rod; gMat = 3; }
  return d;
}
float objA(vec3 p){ return trombone(p); }
float objB(vec3 p){ return sax(vec3(-p.x, p.y, p.z)); }

void pieceShade(int mat, int who, vec3 loc, float aux, vec3 p, inout vec3 base, inout float rough, inout float metal, inout float glow){
  if (mat == 1 || mat == 5){
    float a = atan(loc.y, loc.x);
    float BL = who == 0 ? 0.36 : 0.13;
    float u = aux / BL;
    float rays = filRays(a, who == 0 ? 20.0 : 14.0, 0.08) * smoothstep(0.02, 0.06, u) * smoothstep(0.8, 0.4, u);
    vec2 cell = vec2(fract(a * 10.0 / 6.2831 + 0.5) - 0.5, (u - 0.22) * 5.0);
    float curl = filSpiral(cell, 3.0, 0.12) * smoothstep(0.34, 0.2, length(cell));
    float band = filRing(u, 26.0, 0.1) * smoothstep(0.01, 0.02, u) * smoothstep(0.08, 0.05, u);
    float fil = max(max(rays, curl * 0.9), band);
    base = mix(base, vec3(1.0, 0.70, 0.25), fil); metal = fil; rough = mix(0.14, 0.2, fil);
    base *= mix(1.0, 0.35, smoothstep(0.5, 1.0, u));
  }
  if (mat == 2 && who == 1 && p.y < 99.0){
    // enamel collar around the bow with gold curls (dressed like a costume sleeve)
    vec3 bq = loc;
  }
  if (mat == 2 && who == 1){
    // engraved flowers on the sax body: darker lines cut into the gold
    vec2 c = p.xy * 18.0;
    vec2 f = fract(c) - 0.5;
    float e = filSpiral(f, 3.0, 0.09) * smoothstep(0.48, 0.3, length(f));
    base *= 1.0 - 0.45 * e;
  }
}
'''

A = dict(pos=[-3.95, -0.62, 0.0], R=frame([0.55, 0.42, 0.72], [-0.3, 0.9, 0.0]), scale=4.3, bound=(0.2, 0.06, -0.03, 0.62))
B = dict(pos=[3.02, -0.02, 0.0], R=frame([0.85, -0.05, 0.52], [0.12, 0.99, 0.05]), scale=3.45, bound=(-0.03, 0.1, 0.0, 0.45))
COL = {'uEA0': '#A0105C', 'uEA1': '#0A7D86', 'uEB0': '#0A7D86', 'uEB1': '#0A7D86'}
BG = dict(top='#03100F', bot='#0E2A2A', palette=['#FFC857', '#FF8A3D', '#FFE3A0', '#3FD0C8', '#E0306A', '#FFFFFF'], weights=[0.3, 0.2, 0.2, 0.14, 0.1, 0.06], seed=11)

if __name__ == '__main__':
    small = '--small' in sys.argv
    spp = int(dict(a.split('=') for a in sys.argv if a.startswith('spp=')).get('spp', 6))
    run('metales', PIECE, A, B, COL, BG, small=small, spp=spp)
    if '--prev' in sys.argv and not small:
        preview('metales')
