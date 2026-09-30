#!/usr/bin/env python3
"""Bombo y platillos: the heartbeat and the crash of the band. A rope-tensioned bombo with painted hoops, coloured cords
and a gold sun in relief on its head; a pair of hand cymbals about to meet, gem bells, enamel inlay, leather straps and tassels."""
import sys
from dstyle import run, preview, frame

PIECE = r'''
// ---------------- bombo (local metres): axis along z (front head at +z), y up
float bombo(vec3 q){
  float d = 1e9; gMat = 1; gAux = 0.0; gLoc = q;
  float shell = sdCyl(q.xzy, 0.3, 0.15);
  d = shell; gMat = 1; gLoc = q;
  // painted wooden hoops at both ends
  float hoopF = length(vec2(length(q.xy) - 0.306, q.z - 0.158)) - 0.02;
  float hoopB = length(vec2(length(q.xy) - 0.306, q.z + 0.158)) - 0.02;
  float hoop = min(hoopF, hoopB);
  if (hoop < d){ d = hoop; gMat = 5; gLoc = q; }
  // rope zig-zag between the hoops (16 V's), coloured cords
  {
    float a = atan(q.y, q.x); float cell = 6.2831 / 16.0;
    float k0 = floor(a / cell);
    float rope = 1e9;
    for (int j = -1; j <= 1; j++){
      float k = k0 + float(j);
      float a0 = k * cell, a1 = (k + 0.5) * cell, a2 = (k + 1.0) * cell;
      vec3 P0 = vec3(cos(a0) * 0.318, sin(a0) * 0.318, 0.14);
      vec3 P1 = vec3(cos(a1) * 0.318, sin(a1) * 0.318, -0.14);
      vec3 P2 = vec3(cos(a2) * 0.318, sin(a2) * 0.318, 0.14);
      rope = min(rope, min(sdSeg(q, P0, P1, 0.0065), sdSeg(q, P1, P2, 0.0065)));
    }
    if (rope < d){ d = rope; gMat = 13; gAux = 0.0; gLoc = q; }
    // leather 'ears' gathering each V near the back hoop
    float ak = (k0 + 0.5) * cell;
    vec3 E = vec3(cos(ak) * 0.322, sin(ak) * 0.322, -0.085);
    float ear = sdEll(q - E, vec3(0.018, 0.018, 0.03));
    if (ear < d){ d = ear; gMat = 6; }
  }
  // front head (skin) and the gold sun in relief
  float head = sdCyl((q - vec3(0.0, 0.0, 0.153)).xzy, 0.292, 0.0025);
  if (head < d){ d = head; gMat = 8; gLoc = q; }
  vec3 f = q - vec3(0.0, 0.0, 0.156);
  float face = sdEll(f, vec3(0.105, 0.105, 0.014));
  float r = length(f.xy); float a = atan(f.y, f.x);
  float cellR = 6.2831 / 16.0; float ar = (floor(a / cellR) + 0.5) * cellR;
  vec2 rd = vec2(cos(ar), sin(ar));
  float along = dot(f.xy, rd); float across = dot(f.xy, vec2(-rd.y, rd.x));
  float wid = 0.03 * (1.0 - clamp((along - 0.12) / 0.12, 0.0, 1.0));
  float ray = max(max(abs(across) - wid, abs(along - 0.18) - 0.065), abs(f.z) - 0.007);
  float eyes = sdEll(vec3(abs(f.x) - 0.038, f.y - 0.022, f.z - 0.012), vec3(0.018, 0.012, 0.008));
  float nose = sdEll(f - vec3(0.0, -0.01, 0.015), vec3(0.012, 0.028, 0.01));
  float mouth = sdTorus((f - vec3(0.0, -0.04, 0.012)).xzy, 0.032, 0.0055) + max(0.0, f.y + 0.04) * 2.0;
  float sun = min(min(face, ray), min(min(eyes, nose), mouth));
  if (sun < d){ d = sun; gMat = 2; gLoc = f; }
  float gemE = length(vec3(abs(f.x) - 0.038, f.y - 0.022, f.z - 0.02)) - 0.009;
  if (gemE < d){ d = gemE; gMat = 4; gAux = 0.0; }
  // the mallet resting across the front: stick + wool head
  float stick = sdSeg(q, vec3(-0.34, -0.26, 0.2), vec3(0.08, -0.02, 0.24), 0.011);
  if (stick < d){ d = stick; gMat = 6; }
  float mh = length(q - vec3(0.11, 0.0, 0.245)) - 0.05;
  if (mh < d){ d = mh; gMat = 10; gAux = 0.0; }
  return d;
}

// ---------------- hand cymbal: disc with a domed bell, axis y, facing +y
float cymbal(vec3 q, float R, out float rho){
  rho = length(q.xz);
  float t = rho / R;
  float y = -0.028 * t * t + 0.045 * exp(-pow(rho / 0.055, 2.0)) ;
  float dy = -0.056 * t / R - 0.045 * 2.0 * rho / (0.055 * 0.055) * exp(-pow(rho / 0.055, 2.0));
  float d = abs(q.y - y) / sqrt(1.0 + dy * dy) - 0.0028;
  d = max(d, rho - R);
  return d;
}
float platillos(vec3 q){
  float d = 1e9; gMat = 2; gAux = 0.0; gLoc = q;
  for (int k = 0; k < 2; k++){
    vec3 c = k == 0 ? vec3(-0.1, -0.08, 0.1) : vec3(0.1, 0.12, -0.14);
    vec3 n = k == 0 ? normalize(vec3(-0.35, -0.25, 0.9)) : normalize(vec3(0.3, 0.25, -0.92));
    vec3 u = normalize(cross(n, vec3(0.0, 0.0, 1.0) + vec3(0.3, 0.0, 0.0))); vec3 w = cross(u, n);
    vec3 wc = vec3(dot(q - c, u), dot(q - c, n), dot(q - c, w));
    float rho; float cy = cymbal(wc, 0.225, rho);
    if (cy < d){ d = cy; gMat = 2; gLoc = vec3(rho, float(k), atan(wc.z, wc.x)); gAux = 0.0; }
    // on the outer (convex) side: a gem in the bell, the leather strap loop and a wool tassel
    float gem = length(wc - vec3(0.0, 0.052, 0.0)) - 0.02;
    if (gem < d){ d = gem; gMat = 4; gAux = k == 0 ? 0.0 : 2.0; }
    float strap = sdTorus((wc - vec3(0.0, 0.09, 0.0)).yxz, 0.038, 0.01);
    if (strap < d){ d = strap; gMat = 6; }
    vec3 top = c + n * 0.1;                     // strap point in objB space
    float cord = sdSeg(q, c + n * 0.075, top + vec3(0.0, -0.03, 0.0), 0.004);
    if (cord < d){ d = cord; gMat = 13; gAux = 5.0; }
    float hT; float tas = sdCap(q, top + vec3(0.0, -0.03, 0.0), top + vec3(0.0, -0.12, 0.0), 0.0, hT) - mix(0.008, 0.02, hT);
    tas = max(tas, (top.y - 0.125) - q.y);
    float strands = 0.002 * sin(atan((q - top).z, (q - top).x) * 28.0);
    tas += strands * hT;
    if (tas < d){ d = tas; gMat = 10; gAux = k == 0 ? 0.0 : 2.0; gLoc = q - top; }
  }
  return d;
}
float objA(vec3 p){ return bombo(p); }
float objB(vec3 p){ return platillos(p); }

void pieceShade(int mat, int who, vec3 loc, float aux, vec3 p, inout vec3 base, inout float rough, inout float metal, inout float glow){
  if (mat == 1 && who == 0){
    // shell: enamel with gold stars and curls around the circumference
    float a = atan(loc.y, loc.x); float z = loc.z;
    vec2 cell = vec2(fract(a * 12.0 / 6.2831) - 0.5, z / 0.1);
    float star = smoothstep(0.1, 0.05, abs(length(cell) - 0.22 - 0.06 * sin(atan(cell.y, cell.x) * 5.0)));
    float curl = filSpiral(cell - vec2(0.0, 0.0), 4.0, 0.1) * smoothstep(0.2, 0.1, length(cell));
    float band = filRing(z, 12.0, 0.08) * step(0.11, abs(z));
    float fil = max(max(star, curl), band);
    base = mix(base, vec3(1.0, 0.7, 0.25), fil); metal = fil; rough = mix(0.16, 0.2, fil);
  }
  if (mat == 5 && who == 0){
    float a = atan(loc.y, loc.x);
    float st = step(0.5, fract(a * 24.0 / 6.2831));
    base = mix(vec3(0.75, 0.02, 0.05), vec3(0.96, 0.93, 0.86), st); rough = 0.2;
  }
  if (mat == 10){ float a = atan(loc.z, loc.x); base *= 0.7 + 0.3 * sin(a * 56.0); rough = 0.9; }
  if (mat == 13){ float a = atan(loc.y, loc.x) * 30.0 + loc.z * 200.0; base = mix(vec3(0.85, 0.02, 0.05), vec3(1.0, 0.78, 0.05), step(0.5, fract(a / 6.2831 * 3.0))); }
  if (mat == 8){ base = vec3(0.92, 0.86, 0.72) * (0.9 + 0.1 * sin(length(loc.xy) * 60.0)); }
  if (mat == 2 && who == 0){
    // the sun in relief: gold face, rays alternating red enamel and gold, a gold ring around the face
    float r = length(loc.xy); float a = atan(loc.y, loc.x);
    if (r > 0.1){
      float k = floor(a / (6.2831 / 16.0));
      if (mod(k, 2.0) < 0.5){ base = vec3(0.6, 0.0, 0.035); metal = 0.0; rough = 0.16; }
      else { base = vec3(1.0, 0.6, 0.06); metal = 0.35; rough = 0.3; }
    } else {
      base = vec3(1.0, 0.62, 0.08); metal = 0.35; rough = 0.3;
    }
  }
  if (mat == 2 && who == 1){
    // cymbal: lathe grooves, hammer marks, an enamel inlay ring with gold curls
    float rho = loc.x; float a = loc.z;
    float grooves = 0.5 + 0.5 * sin(rho * 1400.0);
    base = vec3(1.0, 0.72, 0.3) * (0.82 + 0.18 * grooves);
    rough = mix(0.14, 0.24, grooves);
    float inlay = smoothstep(0.004, 0.0, abs(rho - 0.17) - 0.018);
    vec2 cell = vec2(fract(a * 18.0 / 6.2831) - 0.5, (rho - 0.17) / 0.036);
    float curl = filSpiral(cell, 3.0, 0.12) * smoothstep(0.45, 0.3, length(cell));
    vec3 en = who == 1 ? uEA1 : uEA0;
    base = mix(base, mix(en, vec3(1.0, 0.72, 0.3), curl), inlay);
    metal = mix(1.0, curl, inlay);
    rough = mix(rough, 0.16, inlay);
  }
}
'''

A = dict(pos=[-3.05, -0.14, 0.0], R=frame([0.53, 0.0, -0.85], [0.0, 1.0, 0.0]), scale=2.4, bound=(0.0, 0.0, 0.0, 0.46))
B = dict(pos=[2.95, 0.1, 0.0], R=frame([1.0, 0.0, 0.0], [0.0, 1.0, 0.0]), scale=2.5, bound=(0.0, 0.02, -0.02, 0.44))
COL = {'uEA0': '#123F9E', 'uEA1': '#B8101C', 'uEB0': '#B8101C', 'uEB1': '#123F9E'}
BG = dict(top='#12040A', bot='#3A0A18', palette=['#FFC857', '#FF7A2E', '#FFE3A0', '#FF3D5A', '#FFFFFF', '#7AD0FF'], weights=[0.32, 0.22, 0.2, 0.14, 0.08, 0.04], seed=21)

if __name__ == '__main__':
    small = '--small' in sys.argv
    spp = int(dict(a.split('=') for a in sys.argv if a.startswith('spp=')).get('spp', 6))
    run('percusion', PIECE, A, B, COL, BG, small=small, spp=spp)
    if '--prev' in sys.argv and not small:
        preview('percusion')
