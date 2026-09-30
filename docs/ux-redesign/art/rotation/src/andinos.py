#!/usr/bin/env python3
"""Siku y quena: the breath of the altiplano. A two-row siku of cane (ira and arka) bound with a woven band, gold caps,
gems and big wool pompoms; a quena with silver rings, gem-set holes and a tassel. Dressed like a Candelaria costume."""
import sys
from dstyle import run, preview, frame

PIECE = r'''
// ---------------- siku (local metres): tubes vertical (y), rows along x, front row toward +z
float siku(vec3 q){
  float d = 1e9; gMat = 7; gAux = 0.0; gLoc = q;
  // ira (7 tubes, front) and arka (6 tubes, back), lengths decreasing to the right
  for (int row = 0; row < 2; row++){
    int n = row == 0 ? 7 : 6;
    float z = row == 0 ? 0.013 : -0.013;
    float x0 = row == 0 ? -0.1 : -0.085;
    float cell = 0.03;
    float xi = clamp(floor((q.x - x0) / cell + 0.5), 0.0, float(n - 1));
    float x = x0 + xi * cell;
    float len = 0.36 * pow(0.9, xi + (row == 0 ? 0.0 : 0.5));
    vec3 tq = q - vec3(x, 0.0, z);
    float tube = max(length(tq.xz) - 0.0125, max(tq.y - 0.0, -len - tq.y));
    float inner = max(length(tq.xz) - 0.0095, max(tq.y - 0.01, -(len - 0.02) - tq.y));
    tube = max(tube, -inner);
    if (tube < d){ d = tube; gMat = 7; gAux = xi + float(row) * 10.0; gLoc = tq; }
    // gold cap ring at the mouth of every tube, with a tiny gem
    float cap = length(vec2(length(tq.xz) - 0.0128, tq.y + 0.004)) - 0.0035;
    if (cap < d){ d = cap; gMat = 2; }
    float gem = length(tq - vec3(0.0, -0.022, row == 0 ? 0.0135 : -0.0135)) - 0.0048;
    if (gem < d){ d = gem; gMat = 4; gAux = xi + float(row) * 3.0; }
  }
  // woven band wrapping both rows (a flat strap), and a second one lower
  float band = sdRBox(q - vec3(0.0, -0.075, 0.0), vec3(0.125, 0.018, 0.03), 0.006);
  if (band < d){ d = band; gMat = 13; gAux = 0.0; gLoc = q; }
  float band2 = sdRBox(q - vec3(-0.02, -0.19, 0.0), vec3(0.1, 0.01, 0.028), 0.005);
  if (band2 < d){ d = band2; gMat = 13; gAux = 1.0; gLoc = q; }
  // big wool pompoms hanging on cords from the short end of the band (the staircase stays visible)
  for (int k = 0; k < 3; k++){
    float fk = float(k);
    vec3 at = vec3(0.1 + 0.012 * fk, -0.08 - 0.01 * fk, 0.02 - 0.015 * fk);
    vec3 pc = at + vec3(0.03 + 0.035 * fk, -0.09 - 0.05 * fk, 0.015);
    float cord = sdSeg(q, at, pc, 0.0025);
    if (cord < d){ d = cord; gMat = 13; gAux = 3.0; gLoc = q; }
    vec3 pq = q - pc;
    float pom = length(pq) - (0.03 + 0.0035 * sin(atan(pq.y, pq.x) * 14.0) * sin(atan(pq.z, pq.x) * 11.0));
    if (pom < d){ d = pom; gMat = 10; gAux = fk * 2.0 + 1.0; gLoc = pq; }
  }
  return d;
}

// ---------------- quena (local metres): along y, notch at the top (+y), holes facing +z
float quena(vec3 q){
  float d = 1e9; gMat = 6; gAux = 0.0; gLoc = q;
  float body = max(length(q.xz) - 0.0125, max(q.y - 0.2, -0.2 - q.y));
  float bore = max(length(q.xz) - 0.009, max(q.y - 0.21, -0.21 - q.y));
  body = max(body, -bore);
  // U-notch at the top on the back side
  float notch = sdEll(q - vec3(0.0, 0.2, -0.012), vec3(0.006, 0.014, 0.01));
  body = max(body, -notch);
  // finger holes on the front (6) and thumb hole on the back
  for (int k = 0; k < 6; k++){
    float y = 0.07 - 0.028 * float(k);
    float h = length((q - vec3(0.0, y, 0.0)).xy) - 0.0042;
    body = max(body, -max(h, -q.z));
  }
  d = body; gMat = 6; gLoc = q;
  // silver rings with gems between the holes, gold filigree band at the ends
  for (int k = 0; k < 4; k++){
    float y = k == 0 ? 0.185 : (k == 1 ? 0.12 : (k == 2 ? -0.1 : -0.19));
    float ring = length(vec2(length(q.xz) - 0.013, q.y - y)) - 0.0032;
    if (ring < d){ d = ring; gMat = k == 0 || k == 3 ? 2 : 3; }
    float gem = length(q - vec3(0.0, y, 0.0165)) - 0.0056;
    if (gem < d){ d = gem; gMat = 4; gAux = float(k) + 2.0; }
  }
  // tassel of wool from the lower end
  float cord = sdSeg(q, vec3(0.0, -0.19, 0.0), vec3(0.03, -0.25, 0.0), 0.0022);
  if (cord < d){ d = cord; gMat = 13; gAux = 5.0; gLoc = q; }
  float hT; float tas = sdCap(q, vec3(0.03, -0.25, 0.0), vec3(0.045, -0.34, 0.0), 0.0, hT) - mix(0.008, 0.024, hT);
  if (tas < d){ d = tas; gMat = 10; gAux = 0.0; gLoc = q; }
  return d;
}
float quenas(vec3 q){
  float d1 = quena(vec3(rot2(0.38) * q.xy, q.z - 0.02));
  int m1 = gMat; vec3 l1 = gLoc; float a1 = gAux;
  float d2 = quena(vec3(rot2(-0.2) * (q.xy - vec2(0.075, -0.03)), q.z + 0.02));
  if (d1 < d2){ gMat = m1; gLoc = l1; gAux = a1; return d1; }
  gAux += 2.0;
  return d2;
}
float objA(vec3 p){ return siku(p); }
float objB(vec3 p){ return quena(p); }

void pieceShade(int mat, int who, vec3 loc, float aux, vec3 p, inout vec3 base, inout float rough, inout float metal, inout float glow){
  if (mat == 7){
    // cane tubes: warm yellow, node rings, pyrographed zig-zags; alternate tubes painted enamel with gold curls
    float tone = fract(aux * 0.37);
    base = mix(vec3(0.5, 0.36, 0.14), vec3(0.62, 0.46, 0.2), tone);
    float y = loc.y;
    float node = smoothstep(0.004, 0.0, abs(fract(y / 0.11) - 0.5) - 0.46);
    base *= 1.0 - 0.45 * node;
    float a = atan(loc.z, loc.x);
    float zz = smoothstep(0.012, 0.0, abs(fract(a * 3.0 / 6.2831 + y * 30.0) - 0.5) - 0.35) * step(-0.07, y) * step(y, -0.03);
    base = mix(base, vec3(0.08, 0.04, 0.02), zz * 0.8);
    if (mod(aux, 2.0) < 0.5 && aux < 10.0){
      float en = step(y, -0.1) * step(-0.3, y);
      vec3 enc = mod(aux, 4.0) < 1.0 ? uEA0 : uEA1;
      vec2 cell = vec2(fract(a * 2.0 / 6.2831) - 0.5, fract(y / 0.05) - 0.5);
      float curl = filSpiral(cell, 3.0, 0.1) * smoothstep(0.42, 0.3, length(cell));
      base = mix(base, mix(enc, vec3(1.0, 0.7, 0.25), curl), en);
      metal = en * curl; rough = mix(0.3, 0.16, en);
    }
  }
  if (mat == 13){
    // woven band: stepped diamonds and stripes in wool colours
    float x = loc.x * 120.0, y = loc.y * 120.0;
    float stripe = floor(y * 0.5);
    float dia = abs(fract(x * 0.12) - 0.5) + abs(fract(y * 0.24) - 0.5);
    float k = aux * 3.0 + stripe + (dia < 0.3 ? 4.0 : 0.0);
    base = woolCol(k); rough = 0.9;
  }
  if (mat == 10){ base *= 0.8 + 0.2 * sin(dot(normalize(loc + 1e-4), vec3(40.0, 31.0, 23.0))); }
  if (mat == 6){
    // quena: dark wood with fine grain and painted gold curls between the rings
    base = vec3(0.16, 0.07, 0.03) * (0.85 + 0.15 * sin(loc.y * 600.0 + sin(loc.x * 300.0) * 3.0));
    float a = atan(loc.z, loc.x);
    vec2 cell = vec2(fract(a * 3.0 / 6.2831) - 0.5, fract(loc.y / 0.035) - 0.5);
    float curl = filSpiral(cell, 3.0, 0.1) * smoothstep(0.42, 0.3, length(cell)) * step(0.13, loc.y);
    base = mix(base, vec3(1.0, 0.7, 0.25), curl); metal = curl; rough = mix(0.3, 0.2, curl);
  }
}
'''

A = dict(pos=[-3.3, 0.92, 0.0], R=frame([0.86, -0.12, -0.5], [0.1, 1.0, 0.05]), scale=3.9, bound=(0.02, -0.17, 0.0, 0.34))
B = dict(pos=[2.85, 0.02, 0.0], R=frame([0.6, -0.72, 0.35], [0.72, 0.62, 0.0]), scale=6.2, bound=(0.0, -0.06, 0.0, 0.33))
COL = {'uEA0': '#A0101E', 'uEA1': '#123F9E', 'uEB0': '#123F9E', 'uEB1': '#123F9E'}
BG = dict(top='#020D08', bot='#0B2A17', palette=['#FFC857', '#FF8A3D', '#FFE9B0', '#7BE08A', '#E0306A', '#7AD0FF'], weights=[0.3, 0.2, 0.2, 0.12, 0.1, 0.08], seed=51)

if __name__ == '__main__':
    small = '--small' in sys.argv
    spp = int(dict(a.split('=') for a in sys.argv if a.startswith('spp=')).get('spp', 6))
    run('andinos', PIECE, A, B, COL, BG, small=small, spp=spp)
    if '--prev' in sys.argv and not small:
        preview('andinos')
