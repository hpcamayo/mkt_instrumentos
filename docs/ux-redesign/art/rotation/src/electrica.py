#!/usr/bin/env python3
"""Eléctrica y amplificador: the store's modern gear dressed for the same fiesta: an electric guitar with an enamel body,
gold filigree, a pearl pickguard and gem knobs, plugged by a braided cable into a combo amp with a gold grille,
a red jewel pilot light and gem knobs."""
import sys
from dstyle import run, preview, frame

PIECE = r'''
// ---------------- electric guitar (local metres): length along y (head at +y), top facing +z
float gBody2(vec2 p){
  float lower = length((p - vec2(0.0, -0.1)) / vec2(0.165, 0.13)) - 1.0;
  float upper = length((p - vec2(0.0, 0.05)) / vec2(0.14, 0.1)) - 1.0;
  float hornB = length((p - vec2(-0.085, 0.14)) / vec2(0.052, 0.1)) - 1.0;
  float hornT = length((p - vec2(0.075, 0.115)) / vec2(0.048, 0.075)) - 1.0;
  float d = min(lower, upper) * 0.12;
  d = smin(d, hornB * 0.05, 0.02); d = smin(d, hornT * 0.045, 0.02);
  float cut = (length(p - vec2(0.0, 0.2)) - 0.075);
  float waistL = length(p - vec2(-0.215, 0.0)) - 0.075;
  float waistR = length(p - vec2(0.215, -0.005)) - 0.08;
  d = smax(d, -cut, 0.02); d = smax(d, -waistL, 0.02); d = smax(d, -waistR, 0.02);
  return d;
}
float guitar(vec3 q){
  float d = 1e9; gMat = 1; gAux = 0.0; gLoc = q;
  float b2 = gBody2(q.xy);
  float body = max(b2, abs(q.z) - 0.022) - 0.006;
  d = body; gMat = 1; gLoc = q;
  // pearl pickguard with engraved gold scrolls
  vec2 pg = q.xy - vec2(0.03, -0.02);
  float guard = max(max(length(pg / vec2(0.12, 0.17)) - 1.0, -(length(q.xy - vec2(0.0, 0.2)) - 0.085)) * 0.1, abs(q.z - 0.029) - 0.0015);
  if (guard < d){ d = guard; gMat = 12; gLoc = q; }
  // three single-coil pickups
  for (int k = 0; k < 3; k++){
    float y = 0.02 - 0.055 * float(k);
    float pu = sdRBox(q - vec3(0.0, y, 0.031), vec3(0.042, 0.009, 0.004), 0.006);
    if (pu < d){ d = pu; gMat = 14; }
    float x = clamp(floor(q.x / 0.0105 + 0.5), -2.0, 3.0) * 0.0105 - 0.0052;
    float pole = length(q - vec3(x, y, 0.035)) - 0.0028;
    if (pole < d){ d = pole; gMat = 3; }
  }
  // bridge (gold), knobs (gem cabochons on gold skirts), jack
  float bridge = sdRBox(q - vec3(0.0, -0.13, 0.03), vec3(0.04, 0.018, 0.005), 0.003);
  if (bridge < d){ d = bridge; gMat = 2; }
  for (int k = 0; k < 3; k++){
    vec3 kc = vec3(0.07 + 0.015 * float(k), -0.1 - 0.035 * float(k), 0.033);
    float skirt = sdCyl((q - kc).xzy, 0.012, 0.006);
    if (skirt < d){ d = skirt; gMat = 2; }
    float gem = length(q - kc - vec3(0.0, 0.0, 0.007)) - 0.009;
    if (gem < d){ d = gem; gMat = 4; gAux = float(k) * 2.0; }
  }
  // neck, rosewood fingerboard with pearl dots and silver frets, headstock with 6 tuners
  float neck = sdRBox(q - vec3(0.0, 0.34, -0.004), vec3(0.023, 0.2, 0.011), 0.008);
  if (neck < d){ d = neck; gMat = 6; }
  float fb = sdBox(q - vec3(0.0, 0.34, 0.009), vec3(0.024, 0.2, 0.003));
  if (fb < d){ d = fb; gMat = 11; gLoc = q; }
  {
    float y = q.y - 0.14;
    float cell = 0.018; float yi = clamp(floor(y / cell + 0.5), 1.0, 21.0) * cell;
    float fret = sdBox(q - vec3(0.0, 0.14 + yi, 0.0125), vec3(0.024, 0.0008, 0.0008));
    if (fret < d){ d = fret; gMat = 3; }
    float dot_ = length(q - vec3(0.0, 0.14 + yi - cell * 0.5, 0.0118)) - 0.0035;
    float idx = yi / cell;
    if (dot_ < d && (abs(idx - 3.0) < 0.1 || abs(idx - 5.0) < 0.1 || abs(idx - 7.0) < 0.1 || abs(idx - 9.0) < 0.1 || abs(idx - 12.0) < 0.1 || abs(idx - 15.0) < 0.1)){ d = dot_; gMat = 4; gAux = idx; }
  }
  float head = sdRBox(q - vec3(-0.012, 0.6, -0.004), vec3(0.03, 0.07, 0.008), 0.012);
  if (head < d){ d = head; gMat = 1; gLoc = q; }
  for (int k = 0; k < 6; k++){
    float y = 0.555 + 0.018 * float(k);
    float post = sdCyl(q - vec3(-0.028, y, 0.01), 0.0045, 0.01);
    float key = sdRBox(q - vec3(-0.058, y, -0.004), vec3(0.012, 0.005, 0.003), 0.002);
    float t = min(post, key);
    if (t < d){ d = t; gMat = 2; }
  }
  // strings
  {
    float x = clamp(floor(q.x / 0.0095 + 0.5), -2.0, 3.0) * 0.0095 - 0.0047;
    float yy = clamp(q.y, -0.13, 0.54);
    float str = length(vec2(q.x - x * mix(1.0, 0.7, clamp((yy + 0.13) / 0.67, 0.0, 1.0)), q.z - 0.036 + 0.018 * clamp((yy + 0.13) / 0.67, 0.0, 1.0))) - 0.0006;
    str = max(str, max(q.y - 0.54, -0.13 - q.y));
    if (str < d){ d = str; gMat = 3; }
  }
  // output jack on the lower edge + the first stretch of braided cable heading right
  float jack = sdCyl((q - vec3(0.15, -0.14, 0.0)).yxz, 0.009, 0.012);
  if (jack < d){ d = jack; gMat = 3; }
  return d;
}

// ---------------- combo amp (local metres): box 0.52 x 0.42 x 0.25, front toward +z
float amp(vec3 q){
  float d = 1e9; gMat = 5; gAux = 0.0; gLoc = q;
  float box = sdRBox(q, vec3(0.26, 0.21, 0.125), 0.02);
  d = box; gMat = 5; gLoc = q;
  // recessed grille (gold weave) and the control panel strip on top
  float gr = sdBox(q - vec3(0.0, -0.035, 0.125), vec3(0.225, 0.14, 0.012));
  d = max(d, -gr);
  float grille = sdBox(q - vec3(0.0, -0.035, 0.117), vec3(0.228, 0.143, 0.002));
  if (grille < d){ d = grille; gMat = 9; gLoc = q; }
  float piping = length(vec2(max(abs(q.x) - 0.228, abs(q.y + 0.035) - 0.143), q.z - 0.125)) - 0.004;
  piping = max(piping, -max(abs(q.x) - 0.224, abs(q.y + 0.035) - 0.139));
  if (piping < d){ d = piping; gMat = 2; }
  float panel = sdRBox(q - vec3(0.0, 0.16, 0.12), vec3(0.235, 0.03, 0.01), 0.004);
  if (panel < d){ d = panel; gMat = 2; gLoc = q; }
  for (int k = 0; k < 6; k++){
    vec3 kc = vec3(-0.19 + 0.06 * float(k), 0.16, 0.135);
    float skirt = sdCyl((q - kc).xzy, 0.013, 0.006);
    if (skirt < d){ d = skirt; gMat = 14; }
    float gem = length(q - kc - vec3(0.0, 0.0, 0.008)) - 0.0105;
    if (gem < d){ d = gem; gMat = 4; gAux = float(k); }
  }
  // the red jewel pilot light
  float jewel = length(q - vec3(0.21, 0.16, 0.14)) - 0.017;
  if (jewel < d){ d = jewel; gMat = 4; gAux = 0.0; gLoc = vec3(9.0); }
  // gold emblem on the grille: a small sun
  vec3 e = q - vec3(0.0, 0.05, 0.121);
  float emb = max(length(e.xy) - 0.028 - 0.006 * step(0.5, fract(atan(e.y, e.x) * 12.0 / 6.2831)), abs(e.z) - 0.004);
  if (emb < d){ d = emb; gMat = 2; }
  // metal corners and the leather handle
  vec3 a = abs(q);
  float cap = max(sdRBox(q, vec3(0.264, 0.214, 0.129), 0.022), max(max(0.215 - a.x, 0.165 - a.y), 0.08 - a.z));
  if (cap < d){ d = cap; gMat = 3; }
  vec3 hq = (q - vec3(0.0, 0.212, 0.0)) / vec3(1.0, 0.45, 1.0);
  float handle = max(length(vec2(length(hq.xy) - 0.085, hq.z / 0.35)) * 0.45 - 0.006, -(q.y - 0.212));
  if (handle < d){ d = handle; gMat = 6; }
  return d;
}
float objA(vec3 p){ return guitar(p); }
float objB(vec3 p){ return amp(p); }

void pieceShade(int mat, int who, vec3 loc, float aux, vec3 p, inout vec3 base, inout float rough, inout float metal, inout float glow){
  if (who == 0 && mat == 1){
    // enamel body: gold filigree border + curls, and a sunburst of gold rays from the bridge
    float b2 = gBody2(loc.xy);
    float border = smoothstep(0.0025, 0.001, abs(b2 + 0.008));
    vec2 cell = vec2(fract(loc.x / 0.035) - 0.5, fract(loc.y / 0.035) - 0.5);
    float curl = filSpiral(cell, 3.0, 0.1) * smoothstep(0.42, 0.3, length(cell)) * step(b2, -0.014);
    float fil = max(border, curl);
    if (loc.y > 0.5){ fil = filSpiral((loc.xy - vec2(-0.012, 0.6)) * 25.0, 2.0, 0.1) * 0.9; }
    base = mix(base, vec3(1.0, 0.7, 0.25), fil); metal = fil; rough = mix(0.12, 0.2, fil);
    if (abs(loc.z) < 0.02 && abs(b2) < 0.01){ base = vec3(1.0, 0.7, 0.25); metal = 1.0; }   // gold binding on the edge
  }
  if (who == 0 && mat == 12){
    // pearl pickguard with an engraved gold vine
    float v = smoothstep(0.0022, 0.0008, abs(loc.x - 0.09 - 0.02 * sin(loc.y * 40.0)));
    float leaf = filSpiral(vec2(fract(loc.y / 0.04) - 0.5, (loc.x - 0.09) / 0.04) , 3.0, 0.12) * smoothstep(0.4, 0.2, abs(loc.x - 0.09) / 0.04);
    base = mix(base, vec3(1.0, 0.7, 0.25), max(v, leaf * 0.8)); metal = max(v, leaf * 0.8);
  }
  if (mat == 11){ base = vec3(0.07, 0.035, 0.02) * (0.85 + 0.15 * sin(loc.y * 400.0)); rough = 0.4; }
  if (mat == 6){ base = vec3(0.55, 0.36, 0.18) * (0.88 + 0.12 * sin(loc.y * 300.0)); rough = 0.3; }
  if (who == 1 && mat == 5){
    // tolex in deep enamel with gold studs in a diamond lattice
    vec2 uv = abs(loc.z) > 0.12 ? loc.xy : (abs(loc.x) > 0.25 ? loc.zy : loc.xz);
    vec2 c = fract(uv / 0.05 + vec2(0.5 * floor(uv.y / 0.05), 0.0)) - 0.5;
    float stud = step(length(c), 0.12);
    base = mix(base, vec3(1.0, 0.7, 0.25), stud); metal = stud; rough = mix(0.3, 0.2, stud);
  }
  if (who == 1 && mat == 9){
    // gold grille cloth: basket weave
    float wx = sin(loc.x * 700.0), wy = sin(loc.y * 700.0);
    float weave = 0.5 + 0.5 * (step(0.0, wx * wy) * 2.0 - 1.0) * 0.6;
    base = vec3(0.62, 0.4, 0.14) * (0.55 + 0.45 * weave); metal = 0.75; rough = 0.45;
  }
  if (who == 1 && mat == 4 && loc.x > 8.0){ base = vec3(1.0, 0.05, 0.03); glow = 2.5; }
  if (who == 1 && mat == 2 && loc.y > 0.13){
    float engr = filSpiral(vec2(fract(loc.x / 0.03) - 0.5, (loc.y - 0.16) / 0.03), 3.0, 0.1);
    base *= 1.0 - 0.35 * engr;
  }
}
'''

A = dict(pos=[-2.75, -0.22, 0.0], R=frame([0.55, 0.78, -0.3], [-0.8, 0.55, 0.2]), scale=2.3, bound=(-0.01, 0.2, 0.0, 0.52))
B = dict(pos=[3.0, -0.06, 0.0], R=frame([0.84, 0.0, 0.54], [0.0, 1.0, 0.0]), scale=2.4, bound=(0.0, 0.02, 0.0, 0.4))
COL = {'uEA0': '#A0101E', 'uEA1': '#A0101E', 'uEB0': '#0E3A7A', 'uEB1': '#0E3A7A'}
BG = dict(top='#07051A', bot='#1B0C3A', palette=['#FFC857', '#FF6A3D', '#FFE9B0', '#B266FF', '#FF3D7F', '#7AD0FF'], weights=[0.3, 0.18, 0.2, 0.12, 0.12, 0.08], seed=71)

if __name__ == '__main__':
    small = '--small' in sys.argv
    spp = int(dict(a.split('=') for a in sys.argv if a.startswith('spp=')).get('spp', 6))
    run('electrica', PIECE, A, B, COL, BG, small=small, spp=spp)
    if '--prev' in sys.argv and not small:
        preview('electrica')
