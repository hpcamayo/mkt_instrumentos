#!/usr/bin/env python3
"""Tiny offline GLSL renderer: headless Chromium (SwiftShader WebGL2) -> linear float image (numpy).
render(frag, w, h, spp=1, tile=256, uniforms={}, textures={}) -> float32 array (h, w, 4), top row first.
Fragment shader gets: uniform vec2 uRes; uniform float uSample; out vec4 o; plus any uniforms/samplers passed."""
import asyncio, base64, json, time
import numpy as np
from playwright.async_api import async_playwright

JS = r'''
async (cfg) => {
  const W = cfg.w, H = cfg.h;
  const c = document.createElement('canvas'); c.width = W; c.height = H; document.body.appendChild(c);
  const gl = c.getContext('webgl2', {preserveDrawingBuffer: true, antialias: false});
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float fb');
  const lin = !!gl.getExtension('OES_texture_float_linear');
  const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x);
    if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
  const VS = `#version 300 es
in vec2 pos; void main(){ gl_Position = vec4(pos, 0., 1.); }`;
  const P = gl.createProgram(); gl.attachShader(P, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(P, sh(gl.FRAGMENT_SHADER, cfg.frag));
  gl.linkProgram(P); if (!gl.getProgramParameter(P, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(P));
  gl.useProgram(P);
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(P, 'pos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(P, n);
  gl.uniform2f(u('uRes'), W, H);
  for (const [k, v] of Object.entries(cfg.uniforms || {})) {
    const l = u(k); if (!l) continue;
    if (Array.isArray(v)) { [null, gl.uniform1fv, gl.uniform2fv, gl.uniform3fv, gl.uniform4fv][Math.min(v.length, 4)].call(gl, l, v); }
    else gl.uniform1f(l, v);
  }
  let unit = 0;
  for (const [k, t] of Object.entries(cfg.textures || {})) {
    const bin = atob(t.data); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const f = new Float32Array(bytes.buffer);
    const tx = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
    const fmt = t.ch === 4 ? [gl.RGBA32F, gl.RGBA] : [gl.R32F, gl.RED];
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], t.w, t.h, 0, fmt[1], gl.FLOAT, f);
    const flt = (t.linear && lin) ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, flt); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, flt);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(u(k), unit); unit++;
  }
  const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, W, H, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.enable(gl.SCISSOR_TEST);
  const T = cfg.tile; const lu = u('uSample');
  for (let s = 0; s < cfg.spp; s++) {
    gl.uniform1f(lu, s);
    for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) {
      gl.scissor(x, y, T, T); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.finish();
      await new Promise(r => setTimeout(r, 0));
    }
  }
  const px = new Float32Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.FLOAT, px);
  const q = new Uint16Array(W * H * 4);
  for (let i = 0; i < px.length; i++) { const v = Math.max(0, px[i] / cfg.spp); q[i] = Math.min(65535, Math.round(Math.sqrt(v / 64) * 65535)); }
  const by = new Uint8Array(q.buffer); let out = ''; const CH = 0x8000;
  for (let i = 0; i < by.length; i += CH) out += String.fromCharCode.apply(null, by.subarray(i, i + CH));
  return btoa(out);
}
'''

def _tex(arr, linear=True):
    a = np.ascontiguousarray(arr, np.float32)
    ch = 4 if a.ndim == 3 and a.shape[2] == 4 else 1
    h, w = a.shape[0], a.shape[1]
    return {'w': w, 'h': h, 'ch': ch, 'linear': linear, 'data': base64.b64encode(a.tobytes()).decode()}

async def _run(cfg):
    async with async_playwright() as p:
        br = await p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-watchdog',
                                           '--js-flags=--max-old-space-size=4096'])
        pg = await br.new_page(); pg.set_default_timeout(0)
        await pg.set_content('<html><body style="margin:0"></body></html>')
        b64 = await pg.evaluate(JS, cfg)
        await br.close()
    return b64

def render(frag, w, h, spp=1, tile=256, uniforms=None, textures=None):
    t0 = time.time()
    cfg = {'frag': frag, 'w': w, 'h': h, 'spp': spp, 'tile': tile, 'uniforms': uniforms or {},
           'textures': {k: (v if isinstance(v, dict) else _tex(v)) for k, v in (textures or {}).items()}}
    b64 = asyncio.run(_run(cfg))
    q = np.frombuffer(base64.b64decode(b64), np.uint16).astype(np.float32).reshape(h, w, 4)
    img = (q / 65535) ** 2 * 64
    print(f'rendered {w}x{h} spp={spp} in {time.time() - t0:.1f}s')
    return img[::-1].copy()

HEAD = '''#version 300 es
precision highp float;
uniform vec2 uRes; uniform float uSample;
out vec4 o;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
'''

if __name__ == '__main__':
    frag = HEAD + '''
void main(){ vec2 j = hash22(gl_FragCoord.xy + uSample * 17.0) - 0.5; vec2 uv = (gl_FragCoord.xy + j) / uRes;
  float d = length((uv - 0.5) * vec2(uRes.x / uRes.y, 1.0)); float acc = 0.0;
  for (int i = 0; i < 200; i++) acc += sin(d * 40.0 + float(i) * 0.1) * 0.005;
  o = vec4(uv, acc, 1.0); }'''
    img = render(frag, 2880, 600, spp=2)
    print(img.shape, img[..., 0].min(), img[..., 0].max(), img[300, 1440])
