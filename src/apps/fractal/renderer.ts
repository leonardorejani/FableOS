import type { PaletteCoeffs } from './palettes'

const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

/**
 * Escape-time suave: nu = n + 1 - log2(log(|z|)).
 * Bailout alto (raio 256 → |z|² > 65536) para um gradiente contínuo, sem bandas.
 * O loop tem limite constante 1000 (exigência do GLSL ES 1.00) com break em u_maxIter.
 */
const FRAG_SRC = `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_scale;
uniform vec2 u_juliaC;
uniform int u_mode;
uniform int u_maxIter;
uniform vec3 u_palA;
uniform vec3 u_palB;
uniform vec3 u_palC;
uniform vec3 u_palD;

vec3 palette(float t) {
  return u_palA + u_palB * cos(6.2831853 * (u_palC * t + u_palD));
}

void main() {
  vec2 p = u_center + (gl_FragCoord.xy - 0.5 * u_resolution) * u_scale;
  vec2 z;
  vec2 c;
  if (u_mode == 0) {
    z = vec2(0.0);
    c = p;
  } else {
    z = p;
    c = u_juliaC;
  }
  float nu = -1.0;
  for (int i = 0; i < 1000; i++) {
    if (i >= u_maxIter) break;
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 65536.0) {
      nu = float(i) + 1.0 - log2(log(length(z)));
      break;
    }
  }
  vec3 col = vec3(0.0);
  if (nu >= 0.0) {
    col = palette(nu * 0.02);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export interface FractalDrawParams {
  centerX: number
  centerY: number
  /** unidades do plano complexo por pixel físico do canvas */
  scale: number
  julia: boolean
  juliaRe: number
  juliaIm: number
  maxIter: number
  palette: PaletteCoeffs
}

interface UniformLocations {
  resolution: WebGLUniformLocation | null
  center: WebGLUniformLocation | null
  scale: WebGLUniformLocation | null
  juliaC: WebGLUniformLocation | null
  mode: WebGLUniformLocation | null
  maxIter: WebGLUniformLocation | null
  palA: WebGLUniformLocation | null
  palB: WebGLUniformLocation | null
  palC: WebGLUniformLocation | null
  palD: WebGLUniformLocation | null
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Não foi possível criar o shader WebGL.')
  gl.shaderSource(shader, src)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? 'erro desconhecido'
    gl.deleteShader(shader)
    throw new Error(`Falha ao compilar o shader: ${info}`)
  }
  return shader
}

/**
 * Encapsula o pipeline WebGL: um triângulo cobrindo a tela inteira e um
 * fragment shader que renderiza Mandelbrot/Julia. `preserveDrawingBuffer`
 * fica ligado para permitir captura via toDataURL.
 */
export class FractalRenderer {
  private readonly gl: WebGLRenderingContext
  private readonly program: WebGLProgram
  private readonly buffer: WebGLBuffer
  private readonly loc: UniformLocations
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    const attrs: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    }
    const gl = (canvas.getContext('webgl', attrs) ??
      canvas.getContext('experimental-webgl', attrs)) as WebGLRenderingContext | null
    if (!gl) throw new Error('WebGL não está disponível neste navegador.')
    this.gl = gl

    const vert = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC)
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC)
    const program = gl.createProgram()
    if (!program) throw new Error('Não foi possível criar o programa WebGL.')
    gl.attachShader(program, vert)
    gl.attachShader(program, frag)
    gl.linkProgram(program)
    gl.deleteShader(vert)
    gl.deleteShader(frag)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program) ?? 'erro desconhecido'
      gl.deleteProgram(program)
      throw new Error(`Falha ao vincular os shaders: ${info}`)
    }
    this.program = program

    const buffer = gl.createBuffer()
    if (!buffer) throw new Error('Não foi possível criar o buffer WebGL.')
    this.buffer = buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

    gl.useProgram(program)
    const aPos = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    this.loc = {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      center: gl.getUniformLocation(program, 'u_center'),
      scale: gl.getUniformLocation(program, 'u_scale'),
      juliaC: gl.getUniformLocation(program, 'u_juliaC'),
      mode: gl.getUniformLocation(program, 'u_mode'),
      maxIter: gl.getUniformLocation(program, 'u_maxIter'),
      palA: gl.getUniformLocation(program, 'u_palA'),
      palB: gl.getUniformLocation(program, 'u_palB'),
      palC: gl.getUniformLocation(program, 'u_palC'),
      palD: gl.getUniformLocation(program, 'u_palD'),
    }
  }

  draw(params: FractalDrawParams): void {
    if (this.disposed) return
    const { gl } = this
    if (gl.isContextLost()) return
    const width = gl.drawingBufferWidth
    const height = gl.drawingBufferHeight
    if (width === 0 || height === 0) return
    gl.viewport(0, 0, width, height)
    gl.useProgram(this.program)
    gl.uniform2f(this.loc.resolution, width, height)
    gl.uniform2f(this.loc.center, params.centerX, params.centerY)
    gl.uniform1f(this.loc.scale, params.scale)
    gl.uniform2f(this.loc.juliaC, params.juliaRe, params.juliaIm)
    gl.uniform1i(this.loc.mode, params.julia ? 1 : 0)
    gl.uniform1i(this.loc.maxIter, params.maxIter)
    const { a, b, c, d } = params.palette
    gl.uniform3f(this.loc.palA, a[0], a[1], a[2])
    gl.uniform3f(this.loc.palB, b[0], b[1], b[2])
    gl.uniform3f(this.loc.palC, c[0], c[1], c[2])
    gl.uniform3f(this.loc.palD, d[0], d[1], d[2])
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const { gl } = this
    gl.deleteBuffer(this.buffer)
    gl.deleteProgram(this.program)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
