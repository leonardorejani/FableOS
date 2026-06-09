import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../system/themeStore'

const MODE_INDEX: Record<string, number> = {
  aurora: 0,
  nebula: 1,
  gridwave: 2,
  dusk: 3,
}

const VERT = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform int u_mode;
uniform vec3 u_accent;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

vec3 aurora(vec2 uv, float t) {
  float ar = u_res.x / u_res.y;
  vec3 col = mix(vec3(0.012, 0.02, 0.06), vec3(0.03, 0.045, 0.13), uv.y);
  vec2 cell = floor(uv * vec2(ar, 1.0) * 70.0);
  float star = step(0.9965, hash(cell));
  col += star * (0.35 + 0.45 * sin(t * 1.7 + hash(cell + 7.0) * 30.0)) * vec3(0.8, 0.9, 1.0) * uv.y;
  float n = fbm(vec2(uv.x * 3.0, uv.y * 1.4 - t * 0.04));
  float wave = 0.55 + 0.16 * sin(uv.x * 4.2 + t * 0.28) + 0.22 * (n - 0.5);
  float band = smoothstep(0.30, 0.0, abs(uv.y - wave));
  float band2 = smoothstep(0.18, 0.0, abs(uv.y - wave - 0.12 * sin(uv.x * 7.0 - t * 0.2)));
  float tex = fbm(vec2(uv.x * 6.0 + t * 0.09, uv.y * 2.4));
  vec3 acol = mix(vec3(0.10, 0.85, 0.50), u_accent, tex);
  col += band * acol * (0.30 + 0.55 * tex);
  col += band2 * mix(u_accent, vec3(0.3, 0.5, 1.0), tex) * 0.25;
  return col;
}

vec3 nebula(vec2 uv, float t) {
  float ar = u_res.x / u_res.y;
  vec2 p = uv * vec2(ar, 1.0) * 2.6;
  vec2 q = vec2(fbm(p + t * 0.025), fbm(p + vec2(5.2, 1.3)));
  float f = fbm(p + 2.2 * q + vec2(t * 0.018, 0.0));
  vec3 col = mix(vec3(0.02, 0.008, 0.05), vec3(0.24, 0.07, 0.36), clamp(f * f * 2.2, 0.0, 1.0));
  col = mix(col, u_accent * 0.85, q.x * f * 0.55);
  col += pow(f, 3.0) * vec3(0.9, 0.4, 0.7) * 0.35;
  vec2 cell = floor(uv * vec2(ar, 1.0) * 130.0);
  float star = step(0.997, hash(cell));
  col += star * (0.4 + 0.5 * sin(t * 2.0 + hash(cell + 3.0) * 40.0));
  return col;
}

vec3 gridwave(vec2 uv, float t) {
  float ar = u_res.x / u_res.y;
  float horizon = 0.42;
  vec3 col = mix(vec3(0.10, 0.005, 0.18), vec3(0.012, 0.0, 0.05), uv.y);
  if (uv.y < horizon) {
    float py = (horizon - uv.y) + 0.015;
    float z = 0.16 / py;
    float x = (uv.x - 0.5) * z * 3.6 * ar;
    float zz = z * 1.8 + t * 1.1;
    float lx = pow(abs(sin(x * 3.14159)), 24.0);
    float lz = pow(abs(sin(zz * 3.14159)), 24.0);
    float line = clamp(lx + lz, 0.0, 1.0);
    col = mix(vec3(0.03, 0.0, 0.08), vec3(0.012, 0.0, 0.05), py * 2.0);
    col += u_accent * line * smoothstep(0.0, 0.10, py) * 0.95;
  } else {
    vec2 sc = vec2(0.5, horizon + 0.17);
    float d = length((uv - sc) * vec2(ar, 1.0));
    float sun = smoothstep(0.155, 0.148, d);
    float stripes = smoothstep(0.1, 0.6, sin(uv.y * 140.0));
    vec3 suncol = mix(vec3(1.0, 0.30, 0.50), vec3(1.0, 0.82, 0.35), clamp((uv.y - horizon) / 0.34, 0.0, 1.0));
    col += sun * suncol * (0.50 + 0.50 * stripes);
    col += smoothstep(0.45, 0.0, d) * mix(u_accent, vec3(0.5, 0.1, 0.5), 0.5) * 0.35;
    vec2 cell = floor(uv * vec2(ar, 1.0) * 110.0);
    float star = step(0.997, hash(cell));
    col += star * 0.45 * (1.0 - sun);
  }
  return col;
}

vec3 dusk(vec2 uv, float t) {
  float ar = u_res.x / u_res.y;
  vec3 top = vec3(0.05, 0.03, 0.11);
  vec3 mid = mix(u_accent, vec3(0.85, 0.30, 0.42), 0.40);
  vec3 bot = vec3(0.93, 0.52, 0.25);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.55, uv.y));
  col = mix(col, top, smoothstep(0.42, 1.0, uv.y));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 c = vec2(
      0.22 + 0.28 * fi + 0.06 * sin(t * 0.09 + fi * 2.1),
      0.30 + 0.14 * fi + 0.05 * cos(t * 0.12 + fi * 1.7)
    );
    float d = length((uv - c) * vec2(ar, 1.0));
    col += exp(-d * 9.0) * mix(u_accent, vec3(1.0, 0.72, 0.40), fi * 0.4) * 0.22;
  }
  col += (noise(uv * 320.0) - 0.5) * 0.025;
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 col;
  if (u_mode == 0) col = aurora(uv, u_time);
  else if (u_mode == 1) col = nebula(uv, u_time);
  else if (u_mode == 2) col = gridwave(uv, u_time);
  else col = dusk(uv, u_time);
  vec2 d = uv - 0.5;
  col *= 1.0 - dot(d, d) * 0.5;
  gl_FragColor = vec4(col, 1.0);
}
`

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [0.49, 0.42, 1.0]
  const v = parseInt(m[1], 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

export function Wallpaper() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wallpaper = useTheme(s => s.wallpaper)
  const accent = useTheme(s => s.accent)
  const modeRef = useRef(MODE_INDEX[wallpaper] ?? 0)
  const accentRef = useRef<[number, number, number]>(hexToRgb(accent))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    modeRef.current = MODE_INDEX[wallpaper] ?? 0
  }, [wallpaper])

  useEffect(() => {
    accentRef.current = hexToRgb(accent)
  }, [accent])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, depth: false })
    if (!gl) {
      setFailed(true)
      return
    }

    const compile = (type: number, src: string): WebGLShader | null => {
      const sh = gl.createShader(type)
      if (!sh) return null
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null
      return sh
    }

    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    const prog = gl.createProgram()
    if (!vs || !fs || !prog) {
      setFailed(true)
      return
    }
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      setFailed(true)
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uMode = gl.getUniformLocation(prog, 'u_mode')
    const uAccent = gl.getUniformLocation(prog, 'u_accent')

    let raf = 0
    let running = true
    const start = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      const w = Math.round(canvas.clientWidth * dpr)
      const h = Math.round(canvas.clientHeight * dpr)
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    const frame = () => {
      if (!running) return
      resize()
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, (performance.now() - start) / 1000)
      gl.uniform1i(uMode, modeRef.current)
      const [r, g, b] = accentRef.current
      gl.uniform3f(uAccent, r, g, b)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      raf = requestAnimationFrame(frame)
    }

    const onVisibility = () => {
      if (document.hidden) {
        running = false
        cancelAnimationFrame(raf)
      } else if (!running) {
        running = true
        raf = requestAnimationFrame(frame)
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    raf = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVisibility)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  if (failed) {
    return (
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(160deg, #03102a, #0b2d4a 55%, #5b2a86)' }}
      />
    )
  }

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
}
