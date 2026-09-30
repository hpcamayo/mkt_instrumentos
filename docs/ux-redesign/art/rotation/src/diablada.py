#!/usr/bin/env python3
"""Diablada: two caporal devil masks of the Candelaria (Puno) face each other across the headline.
Sculpted as signed distance fields (face, bulging eyes, bifid nose, fanged grin, ears, ringed horns,
serpents, a toad on the brow), enamel + gold materials, three-light studio, soft shadows, AO.
Background: night procession bokeh composited in numpy."""
import os, sys, math
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glrender import render, HEAD
from c9 import W2, H2, save, prev, zone_busy, lin_to_srgb, srgb_to_lin, aces, blur, hx, fbm

FRAG = HEAD + r'''
uniform vec3 uR1a, uR1b, uR1c, uR2a, uR2b, uR2c; uniform vec3 uC1; uniform vec3 uC2;
const float PI = 3.14159265;
int gMat; vec3 gLoc; float gAux; int gWho;

float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float smax(float a, float b, float k){ return -smin(-a, -b, k); }
float sdEll(vec3 p, vec3 r){ float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
float sdCap(vec3 p, vec3 a, vec3 b, float r, out float h){ vec3 pa = p - a, ba = b - a; h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// ram horn seen from the front: rises from the temple, curls outward and down; ribbed and tapering
float horn(vec3 p, vec3 b, float r0, float turns, float span, out float sOut){
  float d = 1e9; sOut = 0.0;
  vec3 C = b + vec3(span * 0.55, span * 0.75, -0.05);
  vec2 bc = b.xy - C.xy; float R0 = length(bc); float th0 = atan(bc.y, bc.x);
  vec3 prev = b;
  const int N = 18;
  for (int i = 1; i <= N; i++){
    float s = float(i) / float(N);
    float th = th0 - s * turns * 6.2831;
    float R = R0 * (1.0 - 0.62 * s);
    vec3 c = vec3(C.xy + R * vec2(cos(th), sin(th)), b.z - 0.12 * s + 0.1 * sin(s * 3.0));
    float h; float dd = sdCap(p, prev, c, 0.0, h);
    float ss = (float(i - 1) + h) / float(N);
    float r = r0 * (1.0 - 0.86 * ss) * (1.0 + 0.045 * sin(ss * 130.0));
    dd -= r;
    if (dd < d){ d = dd; sOut = ss; }
    prev = c;
  }
  return d;
}
// serpent: wavy tapering tube with an open-jawed head
float snake(vec3 p, vec3 b, vec3 dir, vec3 side, float len, float amp, float ph, out float sOut){
  vec3 up = normalize(cross(dir, side));
  float d = 1e9; sOut = 0.0;
  vec3 prev = b; vec3 last = b; vec3 lastDir = dir;
  const int N = 12;
  for (int i = 1; i <= N; i++){
    float s = float(i) / float(N);
    vec3 cur = b + dir * len * s + side * amp * sin(s * 10.0 + ph) * s + up * amp * 0.8 * cos(s * 8.0 + ph) * s;
    float h; float dd = sdCap(p, prev, cur, 0.0, h);
    float ss = (float(i - 1) + h) / float(N);
    dd -= 0.03 * (0.5 + 0.5 * smoothstep(0.0, 0.35, ss));
    if (dd < d){ d = dd; sOut = ss; }
    lastDir = normalize(cur - prev); prev = cur; last = cur;
  }
  vec3 hp = p - (last + lastDir * 0.06);
  vec3 f = lastDir; vec3 s2 = normalize(cross(f, up)); vec3 u2 = cross(s2, f);
  vec3 q = vec3(dot(hp, s2), dot(hp, u2), dot(hp, f));
  float jawU = sdEll(q - vec3(0.0, 0.02, 0.01), vec3(0.058, 0.03, 0.11));
  jawU = smin(jawU, sdEll(q - vec3(0.0, 0.012, -0.05), vec3(0.07, 0.036, 0.06)), 0.03);
  float jawL = sdEll(q - vec3(0.0, -0.036, 0.0) , vec3(0.045, 0.018, 0.09));
  float hd = min(jawU, jawL);
  hd = smax(hd, -sdEll(q - vec3(0.0, -0.006, 0.075), vec3(0.08, 0.016, 0.07)), 0.008);
  float eyes = length(vec3(abs(q.x), q.y, q.z) - vec3(0.042, 0.04, 0.0)) - 0.018;
  if (hd < d){ d = hd; sOut = 1.1; }
  if (eyes < d){ d = eyes; sOut = 1.3; }
  return d;
}

float mask(vec3 p, int variant){
  float aux = 0.0; vec3 loc = p;
  vec3 pa = vec3(abs(p.x), p.y, p.z);
  // face: broad skull, cheek balls, chin
  float d = sdEll(p, vec3(0.56, 0.66, 0.42));
  d = smin(d, sdEll(p - vec3(0.0, -0.42, 0.12), vec3(0.34, 0.25, 0.3)), 0.12);
  d = smin(d, sdEll(pa - vec3(0.29, -0.17, 0.25), vec3(0.19, 0.16, 0.17)), 0.1);
  // forehead wrinkles (three raised ridges)
  float wr = 1e9;
  for (int k = 0; k < 3; k++){
    float yk = 0.3 + 0.075 * float(k);
    vec3 q = p - vec3(0.0, yk + 0.25 * p.x * p.x, 0.43 - 0.3 * p.x * p.x - 0.12 * float(k));
    wr = min(wr, sdEll(q, vec3(0.22 - 0.03 * float(k), 0.018, 0.03)));
  }
  d = smin(d, wr, 0.03);
  float dm = 1.0;
  // heavy gold brows
  vec3 pb = pa - vec3(0.25, 0.3, 0.34);
  pb.xy = rot2(0.42) * pb.xy;
  float brow = sdEll(pb, vec3(0.23, 0.07, 0.1));
  if (brow < d) dm = 2.0;
  d = smin(d, brow, 0.035);
  // bulging eyes in gold lids with spiky lashes
  vec3 pe = pa - vec3(0.245, 0.11, 0.37);
  float er = variant == 0 ? 0.2 : 0.185;
  float eye = length(pe) - er;
  float lid = length(vec2(length(pe.xy) - er * 1.02, pe.z + 0.03)) - 0.05;
  if (lid < d) dm = 2.0;
  d = smin(d, lid, 0.02);
  // lashes: spikes radiating from the upper lid
  float ang = atan(pe.y, pe.x);
  float cellA = 0.33;
  float ai = clamp(floor(ang / cellA + 0.5), 1.0, 8.0) * cellA;
  vec3 dirL = vec3(cos(ai), sin(ai), 0.25);
  float hL; float lash = sdCap(pe, dirL * er * 1.05, dirL * er * 1.55 + vec3(0.0, 0.0, 0.04), 0.0, hL) - 0.022 * (1.0 - hL);
  if (lash < d){ d = lash; dm = 2.0; }
  if (eye < d){ d = eye; dm = 3.0; loc = pe; }
  // bifid nose
  vec3 pn = pa - vec3(0.068, -0.12, 0.47);
  float nose = sdEll(pn, vec3(0.088, 0.078, 0.088));
  nose = smin(nose, sdEll(p - vec3(0.0, -0.01, 0.44), vec3(0.06, 0.13, 0.07)), 0.05);
  nose = smax(nose, -(length(pn - vec3(0.02, -0.05, 0.05)) - 0.03), 0.01);
  if (nose < d) dm = 1.0;
  d = smin(d, nose, 0.04);
  // grin cavity, teeth and fangs
  vec3 pm = p - vec3(0.0, -0.4, 0.37);
  float cav = sdEll(pm, vec3(0.31, 0.11 + 0.02 * (1.0 - pm.x * pm.x * 8.0), 0.2));
  d = smax(d, -cav, 0.02);
  float teeth = 1e9;
  {
    float tx = clamp(pm.x, -0.25, 0.25);
    float cell = 0.055;
    float xi = (floor(tx / cell) + 0.5) * cell;
    teeth = min(teeth, sdEll(pm - vec3(xi, 0.075, 0.035 - xi * xi * 1.2), vec3(0.022, 0.042, 0.024)));
    teeth = min(teeth, sdEll(pm - vec3(xi, -0.075, 0.035 - xi * xi * 1.2), vec3(0.022, 0.036, 0.024)));
    vec3 pf = vec3(abs(pm.x), pm.y, pm.z);
    float hF; teeth = min(teeth, sdCap(pf, vec3(0.2, 0.08, 0.02), vec3(0.19, -0.1, 0.05), 0.0, hF) - 0.03 * (1.0 - hF * 0.8));
    teeth = min(teeth, sdCap(pf, vec3(0.12, -0.08, 0.05), vec3(0.115, 0.07, 0.07), 0.0, hF) - 0.026 * (1.0 - hF * 0.8));
  }
  if (teeth < d){ d = teeth; dm = 4.0; }
  // pointed ears
  vec3 pr = pa - vec3(0.56, 0.12, -0.02);
  pr.xy = rot2(-0.7) * pr.xy;
  float ear = sdEll(pr, vec3(0.075, 0.27, 0.045));
  if (ear < d) dm = 1.0;
  d = smin(d, ear, 0.05);
  // gold crest of spikes along the midline of the skull
  {
    float a0 = atan(p.y - 0.0, p.z + 0.1);       // angle over the top of the head
    float cellC = 0.22;
    float ci = clamp(floor(a0 / cellC + 0.5), -2.0, 3.0) * cellC;
    vec3 base = vec3(0.0, sin(ci) * 0.66, cos(ci) * 0.44 - 0.1);
    vec3 tip = base + normalize(vec3(0.0, sin(ci), cos(ci))) * 0.17;
    float hC; float crest = sdCap(p, base, tip, 0.0, hC) - 0.045 * (1.0 - hC);
    if (crest < d){ d = crest; dm = 2.0; }
  }
  // spiral horns
  float hs;
  float hn = horn(pa, vec3(0.36, 0.48, 0.05), variant == 0 ? 0.12 : 0.11, variant == 0 ? 0.95 : 1.1, variant == 0 ? 0.42 : 0.36, hs);
  if (hn < d){ d = hn; dm = 5.0; aux = hs; }
  // serpents from the crown and temples
  float ss;
  float sn = snake(p, vec3(-0.1, 0.55, 0.3), normalize(vec3(-0.25, 1.0, 0.3)), vec3(1.0, 0.0, 0.0), 0.72, 0.12, 0.5 + float(variant) * 2.0, ss);
  if (sn < d){ d = sn; dm = 6.0; aux = ss; }
  sn = snake(p, vec3(0.12, 0.56, 0.3), normalize(vec3(0.25, 1.0, 0.4)), vec3(1.0, 0.0, 0.0), 0.64, 0.12, 2.6 + float(variant), ss);
  if (sn < d){ d = sn; dm = 6.0; aux = ss; }
  sn = snake(pa, vec3(0.45, 0.35, 0.2), normalize(vec3(1.0, 0.6, 0.5)), vec3(0.0, 0.0, 1.0), 0.5, 0.1, 1.2 + float(variant), ss);
  if (sn < d){ d = sn; dm = 6.0; aux = ss; }
  gMat = int(dm + 0.5); gAux = aux; gLoc = (gMat == 3) ? loc : p;
  if (cav < 0.0 && gMat == 1) gMat = 8;
  return d;
}

float map(vec3 p){
  float d = 1e9; int m = 0; float a = 0.0; vec3 l = vec3(0);
  vec3 q1 = mat3(uR1a, uR1b, uR1c) * (p - uC1);
  float b1 = length(q1 - vec3(0.0, 0.5, 0.0)) - 1.75;
  if (b1 < 0.2){ float dd = mask(q1, 0); if (dd < d){ d = dd; m = gMat; a = gAux; l = gLoc; gWho = 0; } }
  else d = min(d, b1);
  vec3 q2 = mat3(uR2a, uR2b, uR2c) * (p - uC2);
  float b2 = length(q2 - vec3(0.0, 0.5, 0.0)) - 1.75;
  if (b2 < 0.2){ float dd = mask(q2, 1); if (dd < d){ d = dd; m = gMat; a = gAux; l = gLoc; gWho = 1; } }
  else d = min(d, b2);
  gMat = m; gAux = a; gLoc = l;
  return d;
}
vec3 nrm(vec3 p){ const vec2 k = vec2(1, -1); float h = 0.0006;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h)); }
float shadow(vec3 ro, vec3 rd){ float res = 1.0; float t = 0.02;
  for (int i = 0; i < 40; i++){ float h = map(ro + rd * t); res = min(res, 10.0 * h / t); t += clamp(h, 0.01, 0.2); if (res < 0.002 || t > 3.0) break; }
  return clamp(res, 0.0, 1.0); }
float ao(vec3 p, vec3 n){ float o = 0.0, s = 1.0; for (int i = 1; i <= 5; i++){ float h = 0.02 * float(i * i); o += (h - map(p + n * h)) * s; s *= 0.7; } return clamp(1.0 - 1.6 * o, 0.0, 1.0); }

void main(){
  vec2 jit = hash22(gl_FragCoord.xy + uSample * 13.0) - 0.5;
  vec2 uv = (gl_FragCoord.xy + jit - 0.5 * uRes) / uRes.y;     // y in [-0.5, 0.5]
  vec3 ro = vec3(0.0, 0.15, 12.0);
  vec3 rd = normalize(vec3(uv * 2.0 * 1.25 / 12.0 * 12.0 / 12.0, -1.0));
  rd = normalize(vec3(uv.x * 0.1375, uv.y * 0.1375, -1.0));
  float t = 9.0; bool hit = false;
  for (int i = 0; i < 180; i++){
    float d = map(ro + rd * t);
    if (d < 0.0008){ hit = true; break; }
    t += d * 0.85;
    if (t > 16.0) break;
  }
  if (!hit){ o = vec4(0.0); return; }
  vec3 p = ro + rd * t;
  map(p); int mat = gMat; float aux = gAux; vec3 loc = gLoc; int who = gWho;
  vec3 n = nrm(p);
  vec3 v = -rd;
  float bumpA = 0.0;
  // materials
  vec3 base; float rough = 0.25; float metal = 0.0;
  vec3 faceC = who == 0 ? vec3(0.66, 0.015, 0.02) : vec3(0.01, 0.30, 0.13);
  vec3 goldC = vec3(1.0, 0.70, 0.25);
  vec3 silver = vec3(0.92, 0.93, 0.95);
  vec3 trimC = who == 0 ? goldC : silver;
  if (mat == 1){
    base = faceC; rough = 0.16;
    // painted filigree: spirals on the cheeks and forehead
    vec2 c1 = vec2(abs(loc.x) - 0.3, loc.y + 0.17);
    float r1 = length(c1); float a1 = atan(c1.y, c1.x);
    float spir = abs(fract((r1 * 26.0 - a1 / 6.2831) ) - 0.5);
    float fil = smoothstep(0.1, 0.05, spir) * smoothstep(0.2, 0.05, r1 - 0.02) * step(0.02, r1);
    vec2 c2 = vec2(loc.x, loc.y - 0.52);
    float r2 = length(c2);
    fil = max(fil, smoothstep(0.1, 0.05, abs(fract(r2 * 20.0) - 0.5)) * smoothstep(0.24, 0.12, r2) * step(0.3, loc.y));
    fil = max(fil, smoothstep(0.012, 0.004, abs(abs(loc.x) - 0.52 + 0.4 * loc.y * loc.y)) * step(-0.3, loc.y) * step(loc.y, 0.2));
    base = mix(base, trimC, fil); metal = fil; rough = mix(0.16, 0.2, fil);
  }
  else if (mat == 2){ base = trimC; metal = 1.0; rough = 0.2; }
  else if (mat == 3){
    vec3 e = normalize(loc);
    float c = e.z;
    vec3 irisC = who == 0 ? vec3(0.95, 0.72, 0.02) : vec3(0.95, 0.15, 0.1);
    base = vec3(0.93, 0.91, 0.86);
    float ir = smoothstep(0.66, 0.69, c);
    float rays = 0.75 + 0.25 * sin(atan(e.y, e.x) * 40.0);
    base = mix(base, irisC * rays * (0.5 + 0.7 * smoothstep(0.7, 0.97, c)), ir);
    base = mix(base, vec3(0.05, 0.02, 0.0), smoothstep(0.69, 0.672, c) * ir + (1.0 - smoothstep(0.664, 0.676, c)) * smoothstep(0.64, 0.66, c));
    float slit = smoothstep(0.045, 0.028, abs(e.x) * (1.4 - c)) * smoothstep(0.78, 0.8, c);
    base = mix(base, vec3(0.005), slit);
    float veins = smoothstep(0.6, 0.66, abs(sin(atan(e.y, e.x) * 7.0 + e.z * 15.0))) * (1.0 - ir) * smoothstep(0.1, 0.6, 1.0 - c) * 0.6;
    base = mix(base, vec3(0.65, 0.04, 0.04), veins);
    rough = 0.03;
  }
  else if (mat == 4){ base = vec3(0.94, 0.91, 0.82); rough = 0.18; }
  else if (mat == 5){           // polished metal horns (gold / silver), dark in the grooves, blackened tips
    vec3 m0 = who == 0 ? vec3(1.0, 0.68, 0.24) : vec3(0.9, 0.9, 0.93);
    float ribs = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(aux * 130.0));
    base = m0 * (0.35 + 0.65 * ribs);
    base = mix(base, vec3(0.05, 0.03, 0.02), smoothstep(0.55, 0.95, aux));
    metal = 1.0 - 0.6 * smoothstep(0.55, 0.95, aux); rough = mix(0.16, 0.4, 1.0 - ribs);
  }
  else if (mat == 6){
    vec3 g = who == 0 ? vec3(0.015, 0.22, 0.06) : vec3(0.35, 0.01, 0.03);
    vec3 y = who == 0 ? vec3(0.95, 0.75, 0.05) : vec3(1.0, 0.6, 0.08);
    float u1 = aux * 55.0; float v1 = atan(loc.y, loc.x) * 3.0;
    float dia = abs(fract(u1 + v1) - 0.5) + abs(fract(u1 - v1) - 0.5);
    base = mix(g, g * 1.8 + vec3(0.01), smoothstep(0.55, 0.45, dia));
    base = mix(base, y, smoothstep(0.06, 0.02, abs(dia - 0.5)) * 0.8);
    rough = 0.2;
    if (aux > 1.0 && aux < 1.2) base = g * 1.3;
    if (aux > 1.2) { base = vec3(1.0, 0.85, 0.1); rough = 0.04; }
  }
  else { base = vec3(0.12, 0.0, 0.02); rough = 0.45; }
  // surface detail: hammered brass on metal parts, orange-peel on enamel, scale bumps on serpents
  {
    float fq = metal > 0.5 ? 55.0 : (mat == 6 ? 90.0 : 140.0);
    float amp = metal > 0.5 ? 0.35 : (mat == 6 ? 0.25 : 0.08);
    vec3 q = p * fq; vec3 e = vec3(0.07, 0.0, 0.0);
    float n0 = sin(q.x) * sin(q.y * 1.3 + 1.7) * sin(q.z * 0.9 + 0.3);
    float nx = sin(q.x + e.x) * sin(q.y * 1.3 + 1.7) * sin(q.z * 0.9 + 0.3);
    float ny = sin(q.x) * sin((q.y + e.x) * 1.3 + 1.7) * sin(q.z * 0.9 + 0.3);
    float nz = sin(q.x) * sin(q.y * 1.3 + 1.7) * sin((q.z + e.x) * 0.9 + 0.3);
    n = normalize(n - amp * vec3(nx - n0, ny - n0, nz - n0) / e.x * 0.1);
  }
  float flake = (mat == 1 && metal < 0.5) ? step(0.985, hash12(floor(p.xy * 900.0) + floor(p.z * 900.0) * 7.1)) : 0.0;
  // lights
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
  // environment: dim indigo night, warm street glow below; reflections of the procession lights
  vec3 r = reflect(rd, n);
  vec3 env = mix(vec3(0.02, 0.02, 0.06), vec3(0.35, 0.12, 0.05), smoothstep(0.1, -0.6, r.y));
  env += vec3(1.3, 0.85, 0.5) * smoothstep(0.75, 0.9, dot(r, normalize(vec3(-0.5, 0.55, 0.65)))) * 2.2;   // warm key softbox
  env += vec3(1.0, 0.25, 0.6) * smoothstep(0.7, 0.9, dot(r, normalize(vec3(-0.95, 0.2, -0.2)))) * 1.4;  // magenta rim box
  env += vec3(0.25, 0.6, 1.0) * smoothstep(0.7, 0.9, dot(r, normalize(vec3(0.95, 0.3, -0.1)))) * 1.2;   // cyan rim box
  env += vec3(1.0, 0.6, 0.25) * smoothstep(0.6, 1.0, -r.y) * 0.6;                                        // street glow
  vec3 F0e = mix(vec3(0.04), base, metal);
  vec3 Fe = F0e + (1.0 - F0e) * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  col += env * Fe * (1.0 - rough) * occ;
  col += base * (1.0 - metal) * vec3(0.018, 0.018, 0.04) * occ;
  col *= mix(0.6, 1.0, occ);
  o = vec4(col, 1.0);
}
'''

def yaw(a, pitch=0.0, roll=0.0):
    a, b, c = math.radians(a), math.radians(pitch), math.radians(roll)
    Ry = np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, math.cos(b), -math.sin(b)], [0, math.sin(b), math.cos(b)]])
    Rz = np.array([[math.cos(c), -math.sin(c), 0], [math.sin(c), math.cos(c), 0], [0, 0, 1]])
    return Ry @ Rx @ Rz

def cols(R, pre):
    # q = R^T (p - c); mat3(c0, c1, c2) has columns c_j = row j of R
    return {f'{pre}a': [float(v) for v in R[0]], f'{pre}b': [float(v) for v in R[1]], f'{pre}c': [float(v) for v in R[2]]}

if __name__ == '__main__':
    small = '--small' in sys.argv
    W, H = (720, 150) if small else (W2, H2)
    spp = 1 if small else int(dict(a.split('=') for a in sys.argv if a.startswith('spp=')).get('spp', 4))
    R1 = yaw(28, -6, 6); R2 = yaw(-28, -6, -6)
    img = render(FRAG, W, H, spp=spp, tile=128,
                 uniforms={**cols(R1, 'uR1'), **cols(R2, 'uR2'), 'uC1': [-2.95, -0.28, 0.0], 'uC2': [2.95, -0.28, 0.0]})
    rgb, a = img[..., :3], img[..., 3:4]
    # ---- night procession background with bokeh (numpy)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    bg = np.zeros((H, W, 3), np.float32)
    top, bot = srgb_to_lin(hx('#0B0A1C')), srgb_to_lin(hx('#2A0F22'))
    bg[:] = top * (1 - (yy / H)[..., None]) + bot * (yy / H)[..., None]
    rng = np.random.default_rng(4)
    bok = np.zeros((H, W, 3), np.float32)
    s = W / W2
    for i in range(90):
        cx = rng.uniform(0, W) if rng.random() < 0.5 else rng.choice([rng.uniform(0, W * 0.24), rng.uniform(W * 0.76, W)])
        cy = rng.uniform(H * 0.55, H * 1.08) if rng.random() < 0.75 else rng.uniform(0, H)
        r = rng.uniform(10, 46) * s
        c = srgb_to_lin(hx(['#FFB347', '#FF6A3D', '#FFD27A', '#E0305A', '#FFE9B0', '#7AD0FF'][rng.choice(6, p=[0.3, 0.2, 0.2, 0.12, 0.12, 0.06])]))
        dd = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
        disc = np.clip((1 - dd) * r / 1.5, 0, 1) * (0.55 + 0.45 * np.clip(dd, 0, 1) ** 3)
        # calmer in the text zone
        zx = abs(cx / W - 0.5) < 0.28 and cy < H * 0.76
        zb = abs(cx / W - 0.5) < 0.28
        bok += disc[..., None] * c * rng.uniform(0.25, 0.8) * (0.0 if zx else (0.45 if zb else 1.0))
    bg += bok * 0.55
    bg = blur(bg, 1.2 * s)
    lin = rgb + bg * (1 - a)
    br = np.clip(lin - 1.0, 0, None)
    lin += blur(br, 4 * s) * 0.3 + blur(br, 16 * s) * 0.15
    out = lin_to_srgb(aces(lin * 1.05))
    out = np.clip(out + np.random.default_rng(2).normal(0, 0.008, out.shape[:2] + (1,)), 0, 1)
    if small:
        Image.fromarray((out * 255).astype(np.uint8)).save(os.path.join(OUT, '_diablada_small.png')+'')
    else:
        save(out, 'diablada')
        print('zone busy', round(zone_busy(out), 4))
        if '--prev' in sys.argv:
            prev('diablada')
