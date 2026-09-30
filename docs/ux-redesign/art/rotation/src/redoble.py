#!/usr/bin/env python3
"""Tarola y clarinetes: the snare that drives the pasacalle and the clarinets that sing over it. A lacquered snare with
chrome hoops and gem lugs, a painted chakana on its head, crossed sticks; two black clarinets crossed, silver keys, gold filigree."""
import sys
from dstyle import run, preview, frame

PIECE = r'''
// ---------------- snare drum (local metres): axis y, top head at +y
float tarola(vec3 q){
  float d = 1e9; gMat = 1; gAux = 0.0; gLoc = q;
  float shell = sdCyl(q, 0.18, 0.072);
  d = shell; gMat = 1; gLoc = q;
  float hoopT = length(vec2(length(q.xz) - 0.184, q.y - 0.078)) - 0.009;
  float hoopB = length(vec2(length(q.xz) - 0.184, q.y + 0.078)) - 0.009;
  float hoop = min(hoopT, hoopB);
  if (hoop < d){ d = hoop; gMat = 3; }
  float head = sdCyl(q - vec3(0.0, 0.074, 0.0), 0.178, 0.0022);
  if (head < d){ d = head; gMat = 8; gLoc = q; }
  // lugs with gems and tension rods, 8 around
  float a = atan(q.z, q.x); float cell = 6.2831 / 8.0; float ai = (floor(a / cell) + 0.5) * cell;
  vec3 l = q - vec3(cos(ai) * 0.192, 0.0, sin(ai) * 0.192);
  float lug = sdRBox(vec3(dot(l.xz, vec2(cos(ai), sin(ai))), l.y, dot(l.xz, vec2(-sin(ai), cos(ai)))), vec3(0.012, 0.03, 0.011), 0.006);
  if (lug < d){ d = lug; gMat = 3; }
  float gem = length(l - vec3(cos(ai) * 0.013, 0.0, sin(ai) * 0.013)) - 0.0075;
  if (gem < d){ d = gem; gMat = 4; gAux = mod(floor(a / cell) + 8.0, 3.0) * 2.0; }
  float rod = min(sdSeg(l, vec3(0.0, 0.03, 0.0), vec3(0.0, 0.085, 0.0), 0.003), sdSeg(l, vec3(0.0, -0.03, 0.0), vec3(0.0, -0.085, 0.0), 0.003));
  if (rod < d){ d = rod; gMat = 3; }
  // crossed sticks resting on the head, gold ferrules at the butts
  for (int k = 0; k < 2; k++){
    float s = k == 0 ? 1.0 : -1.0;
    vec3 A = vec3(-0.2 * s, 0.09, 0.14), B = vec3(0.24 * s, 0.13, -0.16);
    float h; float st = sdCap(q, A, B, 0.0, h) - mix(0.0075, 0.0045, smoothstep(0.7, 1.0, h));
    if (st < d){ d = st; gMat = 6; gAux = h; }
    float tip = length(q - (B + normalize(B - A) * 0.006)) - 0.0065;
    if (tip < d){ d = tip; gMat = 4; gAux = 1.0 + 2.0 * float(k); }
    float fer = sdSeg(q, A, A + normalize(B - A) * 0.03, 0.0085);
    if (fer < d){ d = fer; gMat = 2; }
  }
  return d;
}

// ---------------- clarinet (local metres): along y (mouthpiece at +y, bell at -y), keys facing +z
float clarinet(vec3 q){
  float d = 1e9; gMat = 14; gAux = 0.0; gLoc = q;
  float y = q.y;
  float r = 0.0135 + 0.022 * pow(smoothstep(-0.2, -0.33, y), 2.2);    // bell flares at the bottom
  float body = max(length(q.xz) - r, max(y - 0.30, -0.33 - y));
  d = body; gMat = 14; gLoc = q;
  float bellRim = length(vec2(length(q.xz) - 0.0355, y + 0.33)) - 0.003;
  if (bellRim < d){ d = bellRim; gMat = 3; }
  // silver tenon rings
  for (int k = 0; k < 4; k++){
    float yk = k == 0 ? 0.25 : (k == 1 ? 0.14 : (k == 2 ? -0.06 : -0.2));
    float ring = length(vec2(length(q.xz) - 0.0148, y - yk)) - 0.0028;
    if (ring < d){ d = ring; gMat = 3; }
  }
  // mouthpiece (black, tapering) and ligature
  float h; float mp = sdCap(q, vec3(0.0, 0.3, 0.0), vec3(0.0, 0.39, 0.004), 0.0, h) - mix(0.012, 0.007, h);
  if (mp < d){ d = mp; gMat = 14; }
  float lig = length(vec2(length(q.xz - vec2(0.0, 0.002)) - 0.0125, y - 0.33)) - 0.0035;
  if (lig < d){ d = lig; gMat = 3; }
  // key rings around tone holes (silver) with gem centres, pearl touch pads
  float cellY = 0.037; float yi = clamp(floor(y / cellY + 0.5), -4.0, 6.0) * cellY;
  vec3 kq = q - vec3(0.0, yi, 0.0142);
  float ringK = length(vec2(length(kq.xy) - 0.0062, kq.z)) - 0.0019;
  if (ringK < d){ d = ringK; gMat = 3; }
  float gemK = length(kq - vec3(0.0, 0.0, -0.001)) - 0.0042;
  if (gemK < d){ d = gemK; gMat = mod(yi / cellY + 20.0, 3.0) < 1.0 ? 12 : 4; gAux = mod(yi / cellY + 20.0, 6.0); }
  // long rods along the side and two lever keys
  float rod1 = sdSeg(q, vec3(0.011, -0.16, 0.009), vec3(0.011, 0.2, 0.009), 0.0019);
  float rod2 = sdSeg(q, vec3(-0.011, -0.22, 0.009), vec3(-0.011, 0.06, 0.009), 0.0019);
  float lev = min(sdSeg(q, vec3(0.011, 0.12, 0.012), vec3(0.018, 0.07, 0.018), 0.0028), sdSeg(q, vec3(-0.011, -0.1, 0.012), vec3(-0.02, -0.15, 0.016), 0.0028));
  float rods = min(min(rod1, rod2), lev);
  if (rods < d){ d = rods; gMat = 3; }
  return d;
}
float clarinets(vec3 q){
  // two clarinets crossed in an X
  float d1 = clarinet(vec3(rot2(0.42) * q.xy, q.z - 0.02) - vec3(0.02, 0.0, 0.0));
  int m1 = gMat; vec3 l1 = gLoc; float a1 = gAux;
  float d2 = clarinet(vec3(rot2(-0.42) * q.xy, q.z + 0.03) - vec3(-0.02, 0.0, 0.0));
  if (d1 < d2){ gMat = m1; gLoc = l1; gAux = a1; return d1; }
  return d2;
}
float objA(vec3 p){ return tarola(p); }
float objB(vec3 p){ return clarinets(p); }

void pieceShade(int mat, int who, vec3 loc, float aux, vec3 p, inout vec3 base, inout float rough, inout float metal, inout float glow){
  if (mat == 1){
    // lacquered shell: gold scrolls and a band of rhombs around the middle
    float a = atan(loc.z, loc.x);
    vec2 cell = vec2(fract(a * 10.0 / 6.2831) - 0.5, loc.y / 0.075);
    float curl = filSpiral(cell * vec2(1.0, 0.8), 3.5, 0.1) * smoothstep(0.38, 0.25, length(cell));
    float rh = smoothstep(0.012, 0.004, abs(abs(cell.x) + abs(cell.y * 0.5) - 0.3));
    float band = filRing(loc.y, 16.0, 0.06) * step(0.055, abs(loc.y));
    float fil = max(max(curl, rh), band);
    base = mix(base, vec3(1.0, 0.7, 0.25), fil); metal = fil; rough = mix(0.14, 0.2, fil);
  }
  if (mat == 8){
    // coated head painted with a gold stepped chakana on a deep blue disc, red and gold rings
    vec2 c = abs(loc.xz); float r = length(loc.xz);
    float s = 0.03;
    float chak = max(max(step(c.x, 3.0 * s) * step(c.y, s), step(c.x, s) * step(c.y, 3.0 * s)), step(c.x, 2.0 * s) * step(c.y, 2.0 * s));
    chak *= step(0.02, r);
    float disc = step(r, 0.135);
    base = vec3(0.93, 0.9, 0.84);
    base = mix(base, vec3(0.05, 0.13, 0.45), disc);
    base = mix(base, vec3(1.0, 0.66, 0.16), chak);
    float ring1 = smoothstep(0.003, 0.0, abs(r - 0.14) - 0.004);
    float ring2 = smoothstep(0.003, 0.0, abs(r - 0.155) - 0.006);
    base = mix(base, vec3(1.0, 0.66, 0.16), ring1);
    base = mix(base, vec3(0.62, 0.02, 0.05), ring2);
    metal = 0.3 * max(chak, ring1);
    rough = 0.5;
  }
  if (mat == 14){
    // black grenadilla with painted gold filigree bands
    float y = loc.y;
    float band = smoothstep(0.004, 0.0, abs(fract(y / 0.09 + 0.25) - 0.5) - 0.07);
    float a = atan(loc.z, loc.x);
    vec2 cell = vec2(fract(a * 5.0 / 6.2831) - 0.5, (fract(y / 0.09 + 0.25) - 0.5) / 0.14);
    float curl = filSpiral(cell, 3.0, 0.1) * smoothstep(0.4, 0.28, length(cell));
    float fil = band * curl + smoothstep(0.003, 0.0, abs(abs(fract(y / 0.09 + 0.25) - 0.5) - 0.068));
    base = mix(base, vec3(1.0, 0.7, 0.25), clamp(fil, 0.0, 1.0)); metal = clamp(fil, 0.0, 1.0);
  }
  if (mat == 6){ base = mix(vec3(0.72, 0.5, 0.26), vec3(0.55, 0.35, 0.16), smoothstep(0.3, 0.9, aux)) * (0.9 + 0.1 * sin(p.x * 900.0 + p.y * 300.0)); rough = 0.3; }
}
'''

A = dict(pos=[-3.0, -0.3, 0.0], R=frame([1.0, 0.0, -0.15], [0.05, 0.8, 0.6]), scale=3.6, bound=(0.0, 0.03, 0.0, 0.34))
B = dict(pos=[2.95, 0.46, 0.0], R=frame([0.94, 0.0, -0.34], [0.0, 1.0, 0.0]), scale=3.4, bound=(0.0, 0.03, 0.0, 0.42))
COL = {'uEA0': '#9E0B1A', 'uEA1': '#9E0B1A', 'uEB0': '#123F9E', 'uEB1': '#123F9E'}
BG = dict(top='#03060F', bot='#0C1636', palette=['#FFC857', '#FF8A3D', '#FFE9B0', '#5AA8FF', '#E0305A', '#FFFFFF'], weights=[0.3, 0.18, 0.2, 0.18, 0.08, 0.06], seed=31)

if __name__ == '__main__':
    small = '--small' in sys.argv
    spp = int(dict(a.split('=') for a in sys.argv if a.startswith('spp=')).get('spp', 6))
    run('redoble', PIECE, A, B, COL, BG, small=small, spp=spp)
    if '--prev' in sys.argv and not small:
        preview('redoble')
