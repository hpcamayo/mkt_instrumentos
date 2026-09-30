#!/usr/bin/env python3
"""Waqrapuku y tinya: the spiral trumpet made of joined cattle horns and the little drum of the Santiago and the herranza,
dressed for the fiesta: silver bands with gems between the horn segments, a painted tinya trailing coloured ribbons."""
import sys
from dstyle import run, preview, frame

PIECE = r'''
// ---------------- waqrapuku (local metres): spiral in the xy plane facing +z; s=0 mouthpiece (centre) .. s=1 bell (outside)
vec3 wkPt(float s){
  float th = 1.3 - s * 9.2;                   // ~1.5 turns
  float R = 0.045 + 0.19 * pow(s, 0.9);
  return vec3(R * cos(th), R * sin(th), 0.05 * s - 0.025);
}
float wkR(float s){ float seg = fract(s * 9.0); return (0.011 + 0.045 * pow(s, 1.7)) * (0.8 + 0.28 * smoothstep(0.0, 0.9, seg)); }
float waqrapuku(vec3 q){
  float d = 1e9; gMat = 7; gAux = 0.0; gLoc = q;
  vec3 prev = wkPt(0.0);
  const int N = 44;
  float sBest = 0.0;
  for (int i = 1; i <= N; i++){
    float s = float(i) / float(N);
    vec3 cur = wkPt(s);
    float h; float dd = sdCap(q, prev, cur, 0.0, h);
    float ss = (float(i - 1) + h) / float(N);
    dd -= wkR(ss);
    if (dd < d){ d = dd; sBest = ss; }
    prev = cur;
  }
  gMat = 7; gAux = sBest;
  // horn bell: the last cattle horn opens out, dark inside
  vec3 e = wkPt(1.0); vec3 ep = wkPt(0.97); vec3 ax = normalize(e - ep);
  vec3 bx = normalize(cross(ax, vec3(0, 0, 1))); vec3 by = cross(ax, bx);
  vec3 qb = vec3(dot(q - e, bx), dot(q - e, by), dot(q - e, ax) - 0.035);
  float u; float bell = bellShell(qb, 0.085, 0.03, 0.7, 0.06, 0.004, u);
  if (bell < d){ d = bell; gMat = length(qb.xy) < bellR(max(-qb.z, 0.0), 0.085, 0.03, 0.7) ? 11 : 7; gAux = 1.0; }
  float rim = length(vec2(length(qb.xy) - 0.087, qb.z + 0.004)) - 0.007;
  if (rim < d){ d = rim; gMat = 3; }
  // silver bands with gems at the joints between horn segments
  for (int k = 1; k <= 8; k++){
    float s = float(k) / 9.0;
    vec3 c = wkPt(s); vec3 t = normalize(wkPt(s + 0.01) - wkPt(s - 0.01));
    vec3 w = q - c; float along = dot(w, t); vec3 radial = w - t * along;
    float band = length(vec2(length(radial) - wkR(s - 0.004) - 0.002, along)) - 0.006 - 0.003 * s;
    if (band < d){ d = band; gMat = 3; }
    vec3 out_ = normalize(cross(t, vec3(0, 0, 1))) ;
    vec3 gp = c + vec3(0.0, 0.0, wkR(s) + 0.006);
    float gem = length(q - gp) - (0.008 + 0.006 * s);
    if (gem < d){ d = gem; gMat = 4; gAux = float(k); }
  }
  // silver mouthpiece at the centre
  vec3 m0 = wkPt(0.0); vec3 mt = normalize(wkPt(0.0) - wkPt(0.03));
  float hM; float mp = sdCap(q, m0, m0 + mt * 0.05, 0.0, hM) - mix(0.011, 0.016, hM);
  if (mp < d){ d = mp; gMat = 3; }
  return d;
}

// ---------------- tinya (local metres): small drum, axis z (head facing +z), ribbons flowing, a stick
float ribbon(vec3 q, vec3 a, vec3 dir, float len, float ph, float w, out float sOut){
  // a flat ribbon: closest point on a smooth centreline, then distance in the ribbon's own (width, normal) frame
  float d = 1e9; sOut = 0.0;
  vec3 prev = a;
  vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
  const int N = 22;
  for (int i = 1; i <= N; i++){
    float s = float(i) / float(N);
    vec3 cur = a + dir * len * s + side * 0.05 * sin(s * 5.0 + ph) * s + vec3(0.0, 0.0, 0.03 * sin(s * 4.0 + ph * 1.3));
    vec3 t = normalize(cur - prev);
    float h; float dl = sdCap(q, prev, cur, 0.0, h);
    float ss = (float(i - 1) + h) / float(N);
    float tw = ss * 1.6 + ph * 0.5;                        // twist varies continuously with arc length
    vec3 wv = normalize(cos(tw) * side + sin(tw) * vec3(0.0, 0.0, 1.0));
    wv = normalize(wv - t * dot(wv, t));
    vec3 nv = cross(t, wv);
    vec3 r = q - mix(prev, cur, h);
    float along = dot(r, wv), across = dot(r, nv), tang = dot(r, t);
    float dd = length(vec3(max(abs(along) - w * 0.5, 0.0), across, tang)) - 0.0012;
    // only accept when the closest point is interior to the segment (or at the true ends)
    if (dd < d){ d = dd; sOut = ss; }
    prev = cur;
  }
  return d;
}
float tinya(vec3 q){
  float d = 1e9; gMat = 1; gAux = 0.0; gLoc = q;
  float frame_ = sdCyl(q.xzy, 0.135, 0.045);
  d = frame_; gMat = 1; gLoc = q;
  float rimF = length(vec2(length(q.xy) - 0.138, q.z - 0.047)) - 0.009;
  float rimB = length(vec2(length(q.xy) - 0.138, q.z + 0.047)) - 0.009;
  float rim = min(rimF, rimB);
  if (rim < d){ d = rim; gMat = 2; }
  float head = sdCyl((q - vec3(0.0, 0.0, 0.046)).xzy, 0.13, 0.002);
  if (head < d){ d = head; gMat = 8; gLoc = q; }
  // lacing cords around the frame
  float a = atan(q.y, q.x); float cell = 6.2831 / 12.0; float k0 = floor(a / cell);
  float lace = 1e9;
  for (int j = -1; j <= 1; j++){
    float k = k0 + float(j);
    vec3 P0 = vec3(cos(k * cell) * 0.143, sin(k * cell) * 0.143, 0.04);
    vec3 P1 = vec3(cos((k + 0.5) * cell) * 0.143, sin((k + 0.5) * cell) * 0.143, -0.04);
    vec3 P2 = vec3(cos((k + 1.0) * cell) * 0.143, sin((k + 1.0) * cell) * 0.143, 0.04);
    lace = min(lace, min(sdSeg(q, P0, P1, 0.0035), sdSeg(q, P1, P2, 0.0035)));
  }
  if (lace < d){ d = lace; gMat = 13; gAux = 1.0; gLoc = q; }
  // ribbons tied at the bottom of the frame, streaming down and out
  for (int k = 0; k < 5; k++){
    float fk = float(k);
    vec3 at = vec3(-0.06 + 0.03 * fk, -0.135, 0.03);
    vec3 dir = normalize(vec3(-0.35 + 0.18 * fk, -1.0, 0.15));
    float s; float rb = ribbon(q, at, dir, 0.42 + 0.07 * sin(fk * 2.1), fk * 1.7, 0.028, s);
    if (rb < d){ d = rb; gMat = 10; gAux = mod(fk * 3.0, 8.0); gLoc = vec3(s, 0.0, 0.0); }
  }
  // a knot of wool at the top, and the stick
  float pom = length(q - vec3(0.0, 0.15, 0.02)) - 0.03;
  if (pom < d){ d = pom; gMat = 10; gAux = 2.0; }
  float stick = sdSeg(q, vec3(0.16, -0.2, 0.09), vec3(-0.05, 0.08, 0.07), 0.0065);
  if (stick < d){ d = stick; gMat = 6; }
  float tip = length(q - vec3(-0.055, 0.087, 0.07)) - 0.013;
  if (tip < d){ d = tip; gMat = 10; gAux = 0.0; }
  return d;
}
float objA(vec3 p){ return waqrapuku(p); }
float objB(vec3 p){ return tinya(p); }

void pieceShade(int mat, int who, vec3 loc, float aux, vec3 p, inout vec3 base, inout float rough, inout float metal, inout float glow){
  if (mat == 7){
    // cattle horn: each segment pale at its wide end, darkening to its tip, with fine growth rings
    float seg = fract(aux * 9.0);
    vec3 pale = vec3(0.34, 0.26, 0.16), mid = vec3(0.1, 0.05, 0.022), dark = vec3(0.01, 0.006, 0.004);
    base = mix(dark, mid, smoothstep(0.08, 0.45, seg));
    base = mix(base, pale, smoothstep(0.5, 0.85, seg));
    base *= 0.85 + 0.15 * sin(aux * 400.0);
    rough = 0.22;
  }
  if (mat == 1 && who == 1){
    float a = atan(loc.y, loc.x);
    vec2 cell = vec2(fract(a * 8.0 / 6.2831) - 0.5, loc.z / 0.05);
    float curl = filSpiral(cell, 3.2, 0.1) * smoothstep(0.42, 0.28, length(cell));
    float band = filRing(loc.z, 20.0, 0.06) * step(0.03, abs(loc.z));
    float fil = max(curl, band);
    base = mix(base, vec3(1.0, 0.7, 0.25), fil); metal = fil;
  }
  if (mat == 8 && who == 1){
    // head: a painted flower (qantu-like trumpets of red and yellow) on cream
    vec2 c = loc.xy; float r = length(c); float a = atan(c.y, c.x);
    float petals = step(r, 0.085 * (0.7 + 0.3 * abs(cos(a * 3.0))));
    base = vec3(0.94, 0.88, 0.74);
    base = mix(base, vec3(0.78, 0.02, 0.1), petals);
    base = mix(base, vec3(1.0, 0.72, 0.1), step(r, 0.03));
    base = mix(base, vec3(0.05, 0.45, 0.2), smoothstep(0.004, 0.0, abs(r - 0.105) - 0.006));
    rough = 0.55;
  }
  if (mat == 10){ base *= 0.85 + 0.15 * sin(loc.x * 90.0); rough = 0.5; }
}
'''

A = dict(pos=[-2.95, 0.0, 0.0], R=frame([0.92, 0.0, -0.4], [0.05, 1.0, 0.0]), scale=3.2, bound=(0.0, 0.0, 0.0, 0.36))
B = dict(pos=[2.85, 0.18, 0.0], R=frame([0.88, -0.1, 0.46], [0.12, 0.99, 0.0]), scale=3.3, bound=(0.0, -0.18, 0.02, 0.5))
COL = {'uEA0': '#8E0E5A', 'uEA1': '#8E0E5A', 'uEB0': '#123F9E', 'uEB1': '#123F9E'}
BG = dict(top='#07040F', bot='#22103A', palette=['#FFC857', '#FF8A3D', '#FFE9B0', '#B266FF', '#FF4D8A', '#7AD0FF'], weights=[0.3, 0.18, 0.2, 0.14, 0.1, 0.08], seed=41)

if __name__ == '__main__':
    small = '--small' in sys.argv
    spp = int(dict(a.split('=') for a in sys.argv if a.startswith('spp=')).get('spp', 6))
    run('santiago', PIECE, A, B, COL, BG, small=small, spp=spp)
    if '--prev' in sys.argv and not small:
        preview('santiago')
