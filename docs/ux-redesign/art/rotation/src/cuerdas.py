#!/usr/bin/env python3
"""Charango y cajón: the Andes and the coast. A charango with an enamel-painted soundboard, gold filigree, a gem-set rosette,
silver pegs with gem heads and ribbons tied at the head; a cajón with gold corners, studded edges and its round mouth."""
import sys
from dstyle import run, preview, frame

PIECE = r'''
// ---------------- charango (local metres): length along y (head at +y), soundboard facing +z
float bodyShape(vec2 p){          // 2D figure-eight outline, negative inside
  float lower = length((p - vec2(0.0, -0.075)) / vec2(0.085, 0.09)) - 1.0;
  float upper = length((p - vec2(0.0, 0.05)) / vec2(0.068, 0.07)) - 1.0;
  float waist = length((p - vec2(0.0, -0.01)) / vec2(0.058, 0.06)) - 1.0;
  float k = 0.35;
  float h = clamp(0.5 + 0.5 * (upper - lower) / k, 0.0, 1.0);
  float u = mix(upper, lower, h) - k * h * (1.0 - h);
  u = min(u, waist);
  return u * 0.075;
}
float charango(vec3 q){
  float d = 1e9; gMat = 1; gAux = 0.0; gLoc = q;
  // body: extruded figure-eight with a rounded back (armadillo-like bowl, but wooden)
  float s2 = bodyShape(q.xy);
  float back = max(s2, abs(q.z + 0.012) - 0.024);
  float bowl = sdEll(q - vec3(0.0, -0.03, -0.02), vec3(0.085, 0.16, 0.045));
  float body = max(min(back, max(bowl, s2 + 0.004)), -q.z - 0.06);
  body = max(body, q.z - 0.012);
  d = body; gMat = 1; gLoc = q;
  // soundboard (slightly raised top plate) with the sound hole
  float top = max(s2 + 0.001, abs(q.z - 0.0125) - 0.0015);
  float hole = length(q.xy - vec2(0.0, 0.028)) - 0.021;
  top = max(top, -hole);
  if (top < d){ d = top; gMat = 5; gLoc = q; }
  // rosette ring of gems around the hole
  {
    vec2 c = q.xy - vec2(0.0, 0.028); float a = atan(c.y, c.x); float cell = 6.2831 / 14.0; float ai = (floor(a / cell) + 0.5) * cell;
    float gem = length(q - vec3(cos(ai) * 0.028, 0.028 + sin(ai) * 0.028, 0.0145)) - 0.0042;
    if (gem < d){ d = gem; gMat = 4; gAux = mod(floor(a / cell) + 14.0, 6.0); }
    float ring = length(vec2(length(c) - 0.0215, q.z - 0.013)) - 0.0022;
    if (ring < d){ d = ring; gMat = 2; }
  }
  // bridge
  float bridge = sdRBox(q - vec3(0.0, -0.1, 0.017), vec3(0.04, 0.006, 0.004), 0.002);
  if (bridge < d){ d = bridge; gMat = 6; }
  // neck + fingerboard + frets
  float neck = sdRBox(q - vec3(0.0, 0.2, 0.0), vec3(0.021, 0.1, 0.012), 0.008);
  if (neck < d){ d = neck; gMat = 6; gLoc = q; }
  float fb = sdBox(q - vec3(0.0, 0.17, 0.014), vec3(0.022, 0.13, 0.0025));
  if (fb < d){ d = fb; gMat = 14; gLoc = q; }
  {
    float y = q.y - 0.05;
    float cell = 0.021; float yi = clamp(floor(y / cell + 0.5), 1.0, 12.0) * cell;
    float fret = sdBox(q - vec3(0.0, 0.05 + yi, 0.0172), vec3(0.021, 0.0009, 0.0008));
    if (fret < d){ d = fret; gMat = 3; }
    float dot_ = length(q - vec3(0.0, 0.05 + yi - cell * 0.5, 0.0168)) - 0.0028;
    if (dot_ < d && mod(yi / cell, 2.0) < 0.5){ d = dot_; gMat = 12; }
  }
  // head: carved, with 10 pegs (5 each side) with gem heads
  float head = sdRBox(q - vec3(0.0, 0.345, 0.0), vec3(0.03, 0.05, 0.01), 0.008);
  if (head < d){ d = head; gMat = 5; gLoc = q; }
  for (int k = 0; k < 5; k++){
    float y = 0.31 + 0.017 * float(k);
    for (int sgn = 0; sgn < 2; sgn++){
      float s = sgn == 0 ? 1.0 : -1.0;
      float peg = sdSeg(q, vec3(s * 0.028, y, -0.002), vec3(s * 0.05, y, -0.002), 0.003);
      if (peg < d){ d = peg; gMat = 3; }
      float knob = length(q - vec3(s * 0.056, y, -0.002)) - 0.0068;
      if (knob < d){ d = knob; gMat = 4; gAux = float(k) + float(sgn) * 3.0; }
    }
  }
  // strings: 5 courses of 2 from the bridge to the head
  {
    float x = clamp(floor(q.x / 0.0082 + 0.5), -2.0, 2.0) * 0.0082;
    float str = sdSeg(q, vec3(x - 0.0014, -0.1, 0.021), vec3(x * 0.8 - 0.0014, 0.3, 0.019), 0.0006);
    str = min(str, sdSeg(q, vec3(x + 0.0014, -0.1, 0.021), vec3(x * 0.8 + 0.0014, 0.3, 0.019), 0.0006));
    if (str < d){ d = str; gMat = 3; }
  }
  // ribbons tied at the head, flying back
  for (int k = 0; k < 4; k++){
    float fk = float(k);
    vec3 a = vec3(0.0, 0.39, 0.0);
    vec3 prev = a; float best = 1e9; float sb = 0.0;
    for (int i = 1; i <= 10; i++){
      float s = float(i) / 10.0;
      vec3 cur = a + vec3(-0.06 - 0.03 * fk, 0.1 + 0.02 * fk, 0.0) * s * 3.0 + vec3(0.02 * sin(s * 7.0 + fk), -0.05 * s * s * (1.0 + fk * 0.4), 0.02 * cos(s * 5.0 + fk));
      float hh; float dd = sdCap(q, prev, cur, 0.0, hh);
      vec3 t = normalize(cur - prev);
      dd = max(dd - 0.009, 0.0) + 0.0 ;
      float flat_ = abs(dot(q - mix(prev, cur, hh), normalize(cross(t, vec3(0.0, 0.0, 1.0))))) ;
      dd = max(sdCap(q, prev, cur, 0.0, hh) - 0.009, -1.0);
      if (dd < best){ best = dd; sb = s; }
      prev = cur;
    }
    if (best < d){ d = best; gMat = 10; gAux = fk * 2.0; gLoc = vec3(sb, 0.0, 0.0); }
  }
  return d;
}

// ---------------- cajón (local metres): box 0.3 x 0.47 x 0.3, back face (with the round mouth) toward +z
float cajon(vec3 q){
  float d = 1e9; gMat = 1; gAux = 0.0; gLoc = q;
  float box = sdRBox(q, vec3(0.15, 0.235, 0.15), 0.008);
  float hole = length(q.xy - vec2(0.0, 0.07)) - 0.058;
  box = max(box, -max(hole, -(q.z - 0.13)));
  float cav = sdBox(q, vec3(0.135, 0.22, 0.135));
  box = max(box, -cav);
  d = box; gMat = 1; gLoc = q;
  // back plate painted (the face we see), sides enamel
  if (q.z > 0.142) gMat = 5;
  // gold corner caps on all 8 corners
  vec3 a = abs(q);
  float cap = max(sdRBox(q, vec3(0.1545, 0.2395, 0.1545), 0.011), max(max(0.112 - a.x, 0.197 - a.y), 0.112 - a.z));
  if (cap < d){ d = cap; gMat = 2; gLoc = q; }
  // the cavity seen through the mouth is dark
  if (max(max(a.x - 0.137, a.y - 0.222), a.z - 0.137) < 0.0) gMat = 11;
  // gem studs along the edges of the painted face
  {
    float cell = 0.052;
    float yi = clamp(floor(q.y / cell + 0.5), -3.0, 3.0) * cell;
    float xi = clamp(floor(q.x / cell + 0.5), -2.0, 2.0) * cell;
    float s1 = length(q - vec3(sign(q.x) * 0.128, yi, 0.152)) - 0.0065;
    float s2 = length(q - vec3(xi, sign(q.y) * 0.213, 0.152)) - 0.0065;
    float st = min(s1, s2);
    if (st < d){ d = st; gMat = 4; gAux = mod((yi + xi) / cell + 12.0, 6.0); }
  }
  // gold rim around the mouth
  float rim = length(vec2(length(q.xy - vec2(0.0, 0.07)) - 0.06, q.z - 0.15)) - 0.006;
  if (rim < d){ d = rim; gMat = 2; }
  return d;
}
float objA(vec3 p){ return charango(p); }
float objB(vec3 p){ return cajon(p); }

void pieceShade(int mat, int who, vec3 loc, float aux, vec3 p, inout vec3 base, inout float rough, inout float metal, inout float glow){
  if (who == 0 && mat == 5){
    // soundboard: enamel with gold filigree: a scroll border following the outline, curls and a flower under the bridge
    float s2 = bodyShape(loc.xy);
    float border = smoothstep(0.0022, 0.0008, abs(s2 + 0.006));
    vec2 c = loc.xy - vec2(0.0, 0.028); float r = length(c);
    float halo = filRing(r, 110.0, 0.12) * step(0.026, r) * step(r, 0.05);
    vec2 cell = vec2(fract(loc.x / 0.028) - 0.5, fract(loc.y / 0.028) - 0.5);
    float curl = filSpiral(cell, 3.0, 0.1) * smoothstep(0.42, 0.3, length(cell)) * step(s2, -0.01) * step(0.052, r);
    float fil = max(max(border, halo), curl * 0.9);
    base = mix(base, vec3(1.0, 0.7, 0.25), fil); metal = fil; rough = mix(0.14, 0.2, fil);
    if (loc.y > 0.29){ base = mix(uEB0, vec3(1.0, 0.7, 0.25), filSpiral(loc.xy * 30.0 - vec2(0.0, 10.0), 2.0, 0.1)); }
  }
  if (who == 0 && mat == 1){ base = vec3(0.3, 0.12, 0.05) * (0.8 + 0.2 * sin(loc.y * 300.0 + loc.x * 40.0)); rough = 0.25; }
  if (mat == 6){ base = vec3(0.2, 0.09, 0.04) * (0.85 + 0.15 * sin(loc.y * 500.0)); rough = 0.3; }
  if (who == 1 && mat == 1){
    // sides: enamel with a gold fileteado scroll
    vec2 uv = abs(loc.x) > 0.145 ? vec2(loc.z, loc.y) : vec2(loc.x, loc.y);
    vec2 cell = vec2(fract(uv.x / 0.06) - 0.5, fract(uv.y / 0.06) - 0.5);
    float curl = filSpiral(cell, 3.0, 0.1) * smoothstep(0.42, 0.3, length(cell));
    base = mix(base, vec3(1.0, 0.7, 0.25), curl); metal = curl;
  }
  if (who == 1 && mat == 5){
    // painted face: green enamel, gold filigree border, a bold wreath of flowers around the mouth
    base = uEB1;
    vec2 c = loc.xy - vec2(0.0, 0.07); float r = length(c); float a = atan(c.y, c.x);
    float border = smoothstep(0.003, 0.001, abs(max(abs(loc.x) - 0.118, abs(loc.y) - 0.2)));
    vec2 cell = vec2(fract(loc.x / 0.05) - 0.5, fract(loc.y / 0.05) - 0.5);
    float curl = filSpiral(cell, 3.0, 0.1) * smoothstep(0.42, 0.3, length(cell)) * step(0.13, r) * step(max(abs(loc.x) - 0.105, abs(loc.y) - 0.19), 0.0);
    float fil = max(border, curl * 0.85);
    base = mix(base, vec3(1.0, 0.7, 0.25), fil); metal = fil; rough = mix(0.14, 0.2, fil);
    float cellA = 6.2831 / 9.0; float ai = (floor(a / cellA) + 0.5) * cellA;
    vec2 fc = vec2(cos(ai), sin(ai)) * 0.092;
    vec2 fp = c - fc; float fr = length(fp); float fa = atan(fp.y, fp.x);
    float petal = step(fr, 0.024 * (0.6 + 0.4 * abs(cos(fa * 2.5))));
    float k = mod(floor(a / cellA), 3.0);
    vec3 fcol = k < 1.0 ? vec3(0.85, 0.02, 0.08) : (k < 2.0 ? vec3(1.0, 0.72, 0.05) : vec3(0.95, 0.25, 0.55));
    base = mix(base, fcol, petal); metal *= 1.0 - petal;
    base = mix(base, vec3(1.0, 0.85, 0.3), step(fr, 0.007));
    rough = mix(rough, 0.25, petal);
  }
  if (mat == 10 && who == 0){ base *= 0.85 + 0.15 * sin(loc.x * 60.0); }
}
'''

A = dict(pos=[-2.85, -0.28, 0.0], R=frame([0.62, 0.45, -0.64], [-0.45, 0.88, 0.1]), scale=3.35, bound=(-0.03, 0.14, 0.0, 0.52))
B = dict(pos=[2.98, -0.05, 0.0], R=frame([0.82, -0.2, 0.55], [0.32, 0.9, -0.28]), scale=2.6, bound=(0.0, 0.0, 0.0, 0.34))
COL = {'uEA0': '#123F9E', 'uEA1': '#123F9E', 'uEB0': '#8E0E2A', 'uEB1': '#0B6B45'}
BG = dict(top='#100703', bot='#361409', palette=['#FFC857', '#FF8A3D', '#FFE9B0', '#E0305A', '#FFFFFF', '#7AD0FF'], weights=[0.32, 0.22, 0.2, 0.12, 0.08, 0.06], seed=61)

if __name__ == '__main__':
    small = '--small' in sys.argv
    spp = int(dict(a.split('=') for a in sys.argv if a.startswith('spp=')).get('spp', 6))
    run('cuerdas', PIECE, A, B, COL, BG, small=small, spp=spp)
    if '--prev' in sys.argv and not small:
        preview('cuerdas')
