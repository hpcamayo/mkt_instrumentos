#!/usr/bin/env python3
"""Trompeta y tuba: the two voices of a town brass band, dressed for the fiesta like Candelaria masks:
gold bodies, enamel-painted bells with gold filigree, gem-studded rims and valve caps, pearl buttons."""
import sys
from dstyle import run, preview

PIECE = r'''
// ---------------- trumpet (local metres; x toward the bell, y up, z toward the viewer)
float trumpet(vec3 q){
  float d = 1e9; gMat = 2; gAux = 0.0; gLoc = q;
  // bell: axis +x, mouth at x=0.30, centred on y=0.045
  vec3 qb = vec3(q.y - 0.045, q.z, q.x - 0.30);
  float u; float bell = bellShell(qb, 0.062, 0.0092, 0.7, 0.2, 0.0011, u);
  float inside = length(qb.xy) < bellR(max(-qb.z, 0.0), 0.062, 0.0092, 0.7) ? 1.0 : 0.0;
  d = bell; gMat = inside > 0.5 ? 1 : 2; gLoc = qb; gAux = u;
  float rim = length(vec2(length(qb.xy) - 0.0625, qb.z + 0.0012)) - 0.0028;
  if (rim < d){ d = rim; gMat = 2; }
  // gem ring on the outer flare, a crown of little gold spikes at the rim
  {
    float a = atan(qb.y, qb.x); float cell = 6.2831 / 14.0; float ai = (floor(a / cell) + 0.5) * cell;
    float zg = -0.014; float rg = bellR(-zg, 0.062, 0.0092, 0.7) + 0.0035;
    vec3 gc = vec3(cos(ai) * rg, sin(ai) * rg, zg);
    float gem = length(qb - gc) - 0.0042;
    if (gem < d){ d = gem; gMat = 4; gAux = mod(floor(a / cell) + 14.0, 3.0) * 2.0; }
    float ai2 = floor(a / cell) * cell;
    vec3 sb = vec3(cos(ai2) * 0.064, sin(ai2) * 0.064, -0.001);
    vec3 st = vec3(cos(ai2) * 0.079, sin(ai2) * 0.079, 0.006);
    float hS; float sp = sdCap(qb, sb, st, 0.0, hS) - 0.0032 * (1.0 - hS);
    if (sp < d){ d = sp; gMat = 2; }
  }
  // bell tube and the back bow
  float t1 = sdSeg(q, vec3(0.10, 0.045, 0.0), vec3(-0.12, 0.045, 0.0), 0.0062);
  float bow = arcTube(q, vec3(-0.12, 0.0175, 0.0), vec3(1, 0, 0), vec3(0, 1, 0), 0.0275, 1.5708, 4.7124, 0.0058);
  float t2 = sdSeg(q, vec3(-0.12, -0.01, 0.0), vec3(-0.035, -0.01, 0.0), 0.0055);
  // leadpipe (behind the valves), front tuning slide back into valve 1
  float lp = sdSeg(q, vec3(-0.215, 0.0, -0.02), vec3(0.14, 0.0, -0.02), 0.0052);
  float ts = arcTube(q, vec3(0.14, -0.0175, -0.02), vec3(1, 0, 0), vec3(0, 1, 0), 0.0175, -1.5708, 1.5708, 0.0058);
  float t3 = sdSeg(q, vec3(0.14, -0.035, -0.02), vec3(0.035, -0.035, 0.0), 0.0058);
  // valve slides hanging below
  float vs1 = min(sdSeg(q, vec3(0.035, -0.05, 0.0), vec3(0.085, -0.05, 0.0), 0.0048), sdSeg(q, vec3(0.085, -0.074, 0.0), vec3(0.035, -0.074, 0.0), 0.0048));
  vs1 = min(vs1, arcTube(q, vec3(0.085, -0.062, 0.0), vec3(1, 0, 0), vec3(0, 1, 0), 0.012, -1.5708, 1.5708, 0.0048));
  float vs3 = min(sdSeg(q, vec3(-0.035, -0.05, 0.0), vec3(-0.095, -0.05, 0.0), 0.0048), sdSeg(q, vec3(-0.095, -0.074, 0.0), vec3(-0.035, -0.074, 0.0), 0.0048));
  vs3 = min(vs3, arcTube(q, vec3(-0.095, -0.062, 0.0), vec3(1, 0, 0), vec3(0, 1, 0), 0.012, 1.5708, 4.7124, 0.0048));
  float ring = length(vec2(length((q - vec3(-0.07, -0.082, 0.0)).xy) - 0.009, q.z)) - 0.0022;
  float tubes = min(min(min(t1, bow), min(t2, lp)), min(min(ts, t3), min(min(vs1, vs3), ring)));
  if (tubes < d){ d = tubes; gMat = 2; gLoc = q; }
  // mouthpiece (silver)
  {
    float h; float mp = sdCap(q, vec3(-0.215, 0.0, -0.02), vec3(-0.29, 0.0, -0.02), 0.0, h);
    mp -= mix(0.0055, 0.0095, smoothstep(0.55, 1.0, h));
    float cupRim = length(vec2(length((q - vec3(-0.292, 0.0, -0.02)).yz) - 0.0095, q.x + 0.292)) - 0.0028;
    mp = min(mp, cupRim);
    if (mp < d){ d = mp; gMat = 3; }
  }
  // three valves: gold casings, silver caps with gem cabochons, pearl buttons
  for (int k = 0; k < 3; k++){
    float x = -0.035 + 0.035 * float(k);
    vec3 v = q - vec3(x, -0.015, 0.0);
    float cas = sdCyl(v, 0.0115, 0.05);
    if (cas < d){ d = cas; gMat = 2; gLoc = v; }
    float cap = min(sdRCyl(v - vec3(0.0, 0.053, 0.0), 0.0128, 0.004, 0.0015), sdRCyl(v + vec3(0.0, 0.053, 0.0), 0.0128, 0.004, 0.0015));
    if (cap < d){ d = cap; gMat = 3; }
    float stem = sdCyl(v - vec3(0.0, 0.066, 0.0), 0.0026, 0.012);
    if (stem < d){ d = stem; gMat = 3; }
    float btn = sdRCyl(v - vec3(0.0, 0.08, 0.0), 0.0092, 0.0028, 0.0018);
    if (btn < d){ d = btn; gMat = 12; }
    float gem = length(v - vec3(0.0, 0.0, 0.0118)) - 0.0048;     // cabochon on the casing front
    if (gem < d){ d = gem; gMat = 4; gAux = float(k) * 2.0 + 1.0; }
  }
  return d;
}

// ---------------- sousaphone (local metres): bell axis +z toward the viewer/left, mouth at z=0
float tuba(vec3 q){
  float d = 1e9; gMat = 2; gAux = 0.0; gLoc = q;
  float u; float bell = bellShell(q, 0.30, 0.10, 0.85, 0.82, 0.002, u);
  float inside = length(q.xy) < bellR(max(-q.z, 0.0), 0.30, 0.10, 0.85) ? 1.0 : 0.0;
  d = bell; gMat = inside > 0.5 ? 1 : 2; gLoc = q; gAux = u;
  float rim = length(vec2(length(q.xy) - 0.302, q.z + 0.002)) - 0.0075;
  if (rim < d){ d = rim; gMat = 2; }
  {
    float a = atan(q.y, q.x); float cell = 6.2831 / 22.0; float ai = (floor(a / cell) + 0.5) * cell;
    float zg = -0.03; float rg = bellR(-zg, 0.30, 0.10, 0.85) + 0.008;
    vec3 gc = vec3(cos(ai) * rg, sin(ai) * rg, zg);
    float gem = length(q - gc) - 0.0125;
    if (gem < d){ d = gem; gMat = 4; gAux = mod(floor(a / cell) + 22.0, 3.0) * 2.0 + 1.0; }
    float ai2 = floor(a / cell) * cell;
    vec3 sb = vec3(cos(ai2) * 0.305, sin(ai2) * 0.305, -0.002);
    vec3 st = vec3(cos(ai2) * 0.36, sin(ai2) * 0.36, 0.03);
    float hS; float sp = sdCap(q, sb, st, 0.0, hS) - 0.011 * (1.0 - hS);
    if (sp < d){ d = sp; gMat = 2; }
  }
  // neck of the bell continuing back and down into the big wrap
  float neck = arcTube(q, vec3(0.0, -0.3, -0.82), vec3(0, 1, 0), vec3(0, 0, -1), 0.3, 0.0, 1.9, 0.045);
  // the great circular wrap (around the player), in a plane tilted back
  vec3 w = q - vec3(-0.05, -0.62, -0.95);
  w.yz = rot2(0.35) * w.yz;
  float wrap = sdTorus(w.xzy, 0.42, 0.04);
  float wrap2 = sdTorus((w - vec3(0.0, 0.07, 0.0)).xzy, 0.36, 0.022);
  // valve block at the front-bottom of the wrap
  float tubes = min(min(neck, wrap), wrap2);
  if (tubes < d){ d = tubes; gMat = 2; gLoc = q; }
  vec3 vb = q - vec3(0.12, -0.72, -0.62);
  for (int k = 0; k < 3; k++){
    vec3 v = vb - vec3(0.055 * float(k), 0.0, 0.0);
    float cas = sdCyl(v, 0.02, 0.07);
    if (cas < d){ d = cas; gMat = 2; gLoc = v; }
    float cap = sdRCyl(v - vec3(0.0, 0.075, 0.0), 0.022, 0.006, 0.002);
    if (cap < d){ d = cap; gMat = 3; }
    float btn = sdRCyl(v - vec3(0.0, 0.1, 0.0), 0.015, 0.004, 0.003);
    if (btn < d){ d = btn; gMat = 12; }
    float stem = sdCyl(v - vec3(0.0, 0.088, 0.0), 0.004, 0.012);
    if (stem < d){ d = stem; gMat = 3; }
    float gem = length(v - vec3(0.0, 0.0, 0.021)) - 0.008;
    if (gem < d){ d = gem; gMat = 4; gAux = float(k) * 2.0; }
  }
  return d;
}
float objA(vec3 p){ return trumpet(p); }
float objB(vec3 p){ return tuba(p); }

void pieceShade(int mat, int who, vec3 loc, float aux, vec3 p, inout vec3 base, inout float rough, inout float metal, inout float glow){
  if (mat == 1){
    // bell interior: enamel with gold rays, curls between them and a band near the rim
    float a = atan(loc.y, loc.x);
    float R = who == 0 ? 0.062 : 0.30;
    float u = aux / (who == 0 ? 0.2 : 0.82);                // 0 at the mouth -> 1 deep inside
    float rays = filRays(a, 16.0, 0.08) * smoothstep(0.02, 0.06, u) * smoothstep(0.7, 0.35, u);
    vec2 cell = vec2(fract(a * 16.0 / 6.2831 + 0.5) - 0.5, (u - 0.18) * 6.0);
    float curl = filSpiral(cell, 3.2, 0.12) * smoothstep(0.34, 0.2, length(cell));
    float band = filRing(u, 30.0, 0.1) * smoothstep(0.01, 0.02, u) * smoothstep(0.075, 0.05, u);
    float fil = max(max(rays, curl * 0.9), band);
    base = mix(base, vec3(1.0, 0.70, 0.25), fil); metal = fil; rough = mix(0.14, 0.2, fil);
    base *= mix(1.0, 0.35, smoothstep(0.45, 1.0, u));       // darker down the throat
  }
}
'''

A = dict(pos=[-3.3, -0.61, 0.0], rot=(-22, 8, 36), scale=5.0, bound=(0.0, 0.0, 0.0, 0.34))
B = dict(pos=[2.74, 0.3, 0.0], rot=(-38, -10, 4), scale=2.4, bound=(0.0, -0.4, -0.55, 1.05))
COL = {'uEA0': '#B0101E', 'uEA1': '#0B6B45', 'uEB0': '#0B6B45', 'uEB1': '#B0101E'}
BG = dict(top='#0B0A1C', bot='#2A0F22', palette=['#FFB347', '#FF6A3D', '#FFD27A', '#E0305A', '#FFE9B0', '#7AD0FF'], weights=[0.3, 0.2, 0.2, 0.12, 0.12, 0.06], seed=4)

if __name__ == '__main__':
    small = '--small' in sys.argv
    spp = int(dict(a.split('=') for a in sys.argv if a.startswith('spp=')).get('spp', 6))
    run('bronces', PIECE, A, B, COL, BG, small=small, spp=spp)
    if '--prev' in sys.argv and not small:
        preview('bronces')
