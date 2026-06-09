// Engine de fluidos estáveis (Jos Stam, "Stable Fluids") em WebGL2.
// Texturas half-float com ping-pong (double buffering) para velocidade,
// tinta (dye) e pressão. Passes por frame: advecção da velocidade ->
// advecção da tinta -> vorticity confinement -> divergência ->
// iterações Jacobi de pressão -> subtração do gradiente -> display.

const SIM_RESOLUTION = 160
const DYE_RESOLUTION = 512
const PRESSURE_DECAY = 0.8
const MAX_ASPECT = 4

export interface FluidParams {
  dyeDissipation: number
  velocityDissipation: number
  curl: number
  splatRadius: number
  pressureIterations: number
}

export const DEFAULT_PARAMS: FluidParams = {
  dyeDissipation: 0.985,
  velocityDissipation: 0.992,
  curl: 28,
  splatRadius: 0.3,
  pressureIterations: 20,
}

export class FluidUnsupportedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FluidUnsupportedError'
  }
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hue = ((h % 1) + 1) % 1
  const i = Math.floor(hue * 6)
  const f = hue * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0:
      return [v, t, p]
    case 1:
      return [q, v, p]
    case 2:
      return [p, v, t]
    case 3:
      return [p, q, v]
    case 4:
      return [t, p, v]
    default:
      return [v, p, q]
  }
}

// ---------------------------------------------------------------------------
// Shaders (GLSL ES 3.00)
// ---------------------------------------------------------------------------

const VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 uTexelSize;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(uTexelSize.x, 0.0);
  vR = vUv + vec2(uTexelSize.x, 0.0);
  vT = vUv + vec2(0.0, uTexelSize.y);
  vB = vUv - vec2(0.0, uTexelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const FRAG_HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
`

const COPY_SOURCE = `${FRAG_HEADER}
uniform sampler2D uTexture;
void main() {
  fragColor = texture(uTexture, vUv);
}
`

const CLEAR_SOURCE = `${FRAG_HEADER}
uniform sampler2D uTexture;
uniform float uValue;
void main() {
  fragColor = uValue * texture(uTexture, vUv);
}
`

const SPLAT_SOURCE = `${FRAG_HEADER}
uniform sampler2D uTarget;
uniform float uAspectRatio;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspectRatio;
  vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}
`

const ADVECTION_SOURCE = `${FRAG_HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 uVelocityTexel;
uniform float uDt;
uniform float uDissipation;
void main() {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uVelocityTexel;
  fragColor = uDissipation * texture(uSource, coord);
  fragColor.a = 1.0;
}
`

const DIVERGENCE_SOURCE = `${FRAG_HEADER}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float divergence = 0.5 * (R - L + T - B);
  fragColor = vec4(divergence, 0.0, 0.0, 1.0);
}
`

const CURL_SOURCE = `${FRAG_HEADER}
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}
`

const VORTICITY_SOURCE = `${FRAG_HEADER}
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity += force * uDt;
  velocity = clamp(velocity, vec2(-1000.0), vec2(1000.0));
  fragColor = vec4(velocity, 0.0, 1.0);
}
`

const PRESSURE_SOURCE = `${FRAG_HEADER}
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}
`

const GRADIENT_SUBTRACT_SOURCE = `${FRAG_HEADER}
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity -= vec2(R - L, T - B);
  fragColor = vec4(velocity, 0.0, 1.0);
}
`

const DISPLAY_SOURCE = `${FRAG_HEADER}
uniform sampler2D uTexture;
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec3 c = texture(uTexture, vUv).rgb;
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(max(c, vec3(0.0)), 1.0);
}
`

// ---------------------------------------------------------------------------
// Infraestrutura WebGL
// ---------------------------------------------------------------------------

interface TexFormat {
  internalFormat: number
  format: number
}

interface RenderTarget {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
  width: number
  height: number
  texelSizeX: number
  texelSizeY: number
}

class DoubleBuffer {
  read: RenderTarget
  write: RenderTarget

  constructor(read: RenderTarget, write: RenderTarget) {
    this.read = read
    this.write = write
  }

  get width(): number {
    return this.read.width
  }

  get height(): number {
    return this.read.height
  }

  get texelSizeX(): number {
    return this.read.texelSizeX
  }

  get texelSizeY(): number {
    return this.read.texelSizeY
  }

  swap(): void {
    const temp = this.read
    this.read = this.write
    this.write = temp
  }
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Falha ao criar shader WebGL.')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? 'erro desconhecido'
    gl.deleteShader(shader)
    throw new Error(`Falha ao compilar shader: ${log}`)
  }
  return shader
}

class GlProgram {
  readonly handle: WebGLProgram
  private readonly gl: WebGL2RenderingContext
  private readonly uniforms = new Map<string, WebGLUniformLocation>()

  constructor(gl: WebGL2RenderingContext, vertexShader: WebGLShader, fragmentSource: string) {
    this.gl = gl
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
    const program = gl.createProgram()
    if (!program) {
      gl.deleteShader(fragment)
      throw new Error('Falha ao criar programa WebGL.')
    }
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) ?? 'erro desconhecido'
      gl.deleteProgram(program)
      throw new Error(`Falha ao linkar programa WebGL: ${log}`)
    }
    this.handle = program
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number
    for (let i = 0; i < count; i++) {
      const info = gl.getActiveUniform(program, i)
      if (!info) continue
      const location = gl.getUniformLocation(program, info.name)
      if (location) this.uniforms.set(info.name, location)
    }
  }

  bind(): void {
    this.gl.useProgram(this.handle)
  }

  u(name: string): WebGLUniformLocation | null {
    return this.uniforms.get(name) ?? null
  }

  dispose(): void {
    this.gl.deleteProgram(this.handle)
  }
}

// ---------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------

export class FluidSimulation {
  readonly params: FluidParams

  private readonly canvas: HTMLCanvasElement
  private readonly gl: WebGL2RenderingContext
  private readonly formatRGBA: TexFormat
  private readonly formatRG: TexFormat
  private readonly formatR: TexFormat

  private readonly vertexShader: WebGLShader
  private readonly copyProgram: GlProgram
  private readonly clearProgram: GlProgram
  private readonly splatProgram: GlProgram
  private readonly advectionProgram: GlProgram
  private readonly divergenceProgram: GlProgram
  private readonly curlProgram: GlProgram
  private readonly vorticityProgram: GlProgram
  private readonly pressureProgram: GlProgram
  private readonly gradientProgram: GlProgram
  private readonly displayProgram: GlProgram

  private readonly vao: WebGLVertexArrayObject
  private readonly vbo: WebGLBuffer
  private readonly ibo: WebGLBuffer

  private velocity!: DoubleBuffer
  private dye!: DoubleBuffer
  private pressure!: DoubleBuffer
  private divergenceFbo!: RenderTarget
  private curlFbo!: RenderTarget

  private disposed = false

  constructor(canvas: HTMLCanvasElement, params?: Partial<FluidParams>) {
    this.canvas = canvas
    this.params = { ...DEFAULT_PARAMS, ...params }

    const gl = canvas.getContext('webgl2', {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      preserveDrawingBuffer: false,
    })
    if (!gl) {
      throw new FluidUnsupportedError('Seu navegador não suporta WebGL2 com float textures.')
    }
    this.gl = gl

    const colorFloat = gl.getExtension('EXT_color_buffer_float')
    const colorHalfFloat = colorFloat ? null : gl.getExtension('EXT_color_buffer_half_float')
    if (!colorFloat && !colorHalfFloat) {
      throw new FluidUnsupportedError('Seu navegador não suporta WebGL2 com float textures.')
    }

    const formatRGBA = this.pickFormat([{ internalFormat: gl.RGBA16F, format: gl.RGBA }])
    const formatRG = this.pickFormat([
      { internalFormat: gl.RG16F, format: gl.RG },
      { internalFormat: gl.RGBA16F, format: gl.RGBA },
    ])
    const formatR = this.pickFormat([
      { internalFormat: gl.R16F, format: gl.RED },
      { internalFormat: gl.RG16F, format: gl.RG },
      { internalFormat: gl.RGBA16F, format: gl.RGBA },
    ])
    if (!formatRGBA || !formatRG || !formatR) {
      throw new FluidUnsupportedError('Seu navegador não suporta WebGL2 com float textures.')
    }
    this.formatRGBA = formatRGBA
    this.formatRG = formatRG
    this.formatR = formatR

    this.vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SOURCE)
    this.copyProgram = new GlProgram(gl, this.vertexShader, COPY_SOURCE)
    this.clearProgram = new GlProgram(gl, this.vertexShader, CLEAR_SOURCE)
    this.splatProgram = new GlProgram(gl, this.vertexShader, SPLAT_SOURCE)
    this.advectionProgram = new GlProgram(gl, this.vertexShader, ADVECTION_SOURCE)
    this.divergenceProgram = new GlProgram(gl, this.vertexShader, DIVERGENCE_SOURCE)
    this.curlProgram = new GlProgram(gl, this.vertexShader, CURL_SOURCE)
    this.vorticityProgram = new GlProgram(gl, this.vertexShader, VORTICITY_SOURCE)
    this.pressureProgram = new GlProgram(gl, this.vertexShader, PRESSURE_SOURCE)
    this.gradientProgram = new GlProgram(gl, this.vertexShader, GRADIENT_SUBTRACT_SOURCE)
    this.displayProgram = new GlProgram(gl, this.vertexShader, DISPLAY_SOURCE)

    this.vao = this.req(gl.createVertexArray(), 'VAO')
    gl.bindVertexArray(this.vao)
    this.vbo = this.req(gl.createBuffer(), 'VBO')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
    this.ibo = this.req(gl.createBuffer(), 'IBO')
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(0)

    this.initFramebuffers()
  }

  // -- API pública ----------------------------------------------------------

  setParams(partial: Partial<FluidParams>): void {
    Object.assign(this.params, partial)
  }

  resize(width: number, height: number): void {
    if (this.disposed || this.gl.isContextLost()) return
    if (this.canvas.width === width && this.canvas.height === height) return
    this.canvas.width = width
    this.canvas.height = height
    this.initFramebuffers()
  }

  frame(dt: number): void {
    if (this.disposed || this.gl.isContextLost()) return
    const clamped = Math.min(Math.max(dt, 0), 1 / 30)
    if (clamped > 0) this.step(clamped)
    this.render()
  }

  splat(x: number, y: number, dx: number, dy: number, color: [number, number, number]): void {
    if (this.disposed || this.gl.isContextLost()) return
    const gl = this.gl
    gl.disable(gl.BLEND)
    const program = this.splatProgram
    program.bind()
    gl.uniform1f(program.u('uAspectRatio'), this.canvas.width / Math.max(1, this.canvas.height))
    gl.uniform2f(program.u('uPoint'), x, y)
    gl.uniform1f(program.u('uRadius'), this.correctRadius(this.params.splatRadius / 100))

    gl.uniform1i(program.u('uTarget'), this.attach(0, this.velocity.read.texture))
    gl.uniform3f(program.u('uColor'), dx, dy, 0)
    this.blit(this.velocity.write)
    this.velocity.swap()

    gl.uniform1i(program.u('uTarget'), this.attach(0, this.dye.read.texture))
    gl.uniform3f(program.u('uColor'), color[0], color[1], color[2])
    this.blit(this.dye.write)
    this.dye.swap()
  }

  splash(count: number): void {
    for (let i = 0; i < count; i++) {
      const [r, g, b] = hsvToRgb(Math.random(), 1, 1)
      this.splat(
        Math.random(),
        Math.random(),
        1000 * (Math.random() - 0.5),
        1000 * (Math.random() - 0.5),
        [r * 0.3, g * 0.3, b * 0.3],
      )
    }
  }

  idleSplat(): void {
    const [r, g, b] = hsvToRgb(Math.random(), 0.85, 1)
    this.splat(
      0.15 + Math.random() * 0.7,
      0.15 + Math.random() * 0.7,
      420 * (Math.random() - 0.5),
      420 * (Math.random() - 0.5),
      [r * 0.12, g * 0.12, b * 0.12],
    )
  }

  reset(): void {
    if (this.disposed || this.gl.isContextLost()) return
    this.clearTarget(this.velocity.read)
    this.clearTarget(this.velocity.write)
    this.clearTarget(this.dye.read)
    this.clearTarget(this.dye.write)
    this.clearTarget(this.pressure.read)
    this.clearTarget(this.pressure.write)
    this.clearTarget(this.divergenceFbo)
    this.clearTarget(this.curlFbo)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    this.copyProgram.dispose()
    this.clearProgram.dispose()
    this.splatProgram.dispose()
    this.advectionProgram.dispose()
    this.divergenceProgram.dispose()
    this.curlProgram.dispose()
    this.vorticityProgram.dispose()
    this.pressureProgram.dispose()
    this.gradientProgram.dispose()
    this.displayProgram.dispose()
    gl.deleteShader(this.vertexShader)
    this.disposeDouble(this.velocity)
    this.disposeDouble(this.dye)
    this.disposeDouble(this.pressure)
    this.disposeTarget(this.divergenceFbo)
    this.disposeTarget(this.curlFbo)
    gl.deleteBuffer(this.vbo)
    gl.deleteBuffer(this.ibo)
    gl.deleteVertexArray(this.vao)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  // -- Passes ---------------------------------------------------------------

  private step(dt: number): void {
    const gl = this.gl
    gl.disable(gl.BLEND)

    // 1. Advecção da velocidade
    const advection = this.advectionProgram
    advection.bind()
    gl.uniform2f(advection.u('uVelocityTexel'), this.velocity.texelSizeX, this.velocity.texelSizeY)
    gl.uniform1f(advection.u('uDt'), dt)
    const velocityId = this.attach(0, this.velocity.read.texture)
    gl.uniform1i(advection.u('uVelocity'), velocityId)
    gl.uniform1i(advection.u('uSource'), velocityId)
    gl.uniform1f(advection.u('uDissipation'), Math.pow(this.params.velocityDissipation, dt * 60))
    this.blit(this.velocity.write)
    this.velocity.swap()

    // 2. Advecção da tinta
    gl.uniform1i(advection.u('uVelocity'), this.attach(0, this.velocity.read.texture))
    gl.uniform1i(advection.u('uSource'), this.attach(1, this.dye.read.texture))
    gl.uniform1f(advection.u('uDissipation'), Math.pow(this.params.dyeDissipation, dt * 60))
    this.blit(this.dye.write)
    this.dye.swap()

    // 3. Vorticity confinement
    if (this.params.curl > 0) {
      const curl = this.curlProgram
      curl.bind()
      gl.uniform2f(curl.u('uTexelSize'), this.velocity.texelSizeX, this.velocity.texelSizeY)
      gl.uniform1i(curl.u('uVelocity'), this.attach(0, this.velocity.read.texture))
      this.blit(this.curlFbo)

      const vorticity = this.vorticityProgram
      vorticity.bind()
      gl.uniform2f(vorticity.u('uTexelSize'), this.velocity.texelSizeX, this.velocity.texelSizeY)
      gl.uniform1i(vorticity.u('uVelocity'), this.attach(0, this.velocity.read.texture))
      gl.uniform1i(vorticity.u('uCurl'), this.attach(1, this.curlFbo.texture))
      gl.uniform1f(vorticity.u('uCurlStrength'), this.params.curl)
      gl.uniform1f(vorticity.u('uDt'), dt)
      this.blit(this.velocity.write)
      this.velocity.swap()
    }

    // 4. Divergência
    const divergence = this.divergenceProgram
    divergence.bind()
    gl.uniform2f(divergence.u('uTexelSize'), this.velocity.texelSizeX, this.velocity.texelSizeY)
    gl.uniform1i(divergence.u('uVelocity'), this.attach(0, this.velocity.read.texture))
    this.blit(this.divergenceFbo)

    // 5. Decaimento da pressão anterior
    const clear = this.clearProgram
    clear.bind()
    gl.uniform1i(clear.u('uTexture'), this.attach(0, this.pressure.read.texture))
    gl.uniform1f(clear.u('uValue'), PRESSURE_DECAY)
    this.blit(this.pressure.write)
    this.pressure.swap()

    // 6. Iterações Jacobi de pressão
    const pressure = this.pressureProgram
    pressure.bind()
    gl.uniform2f(pressure.u('uTexelSize'), this.velocity.texelSizeX, this.velocity.texelSizeY)
    gl.uniform1i(pressure.u('uDivergence'), this.attach(0, this.divergenceFbo.texture))
    const iterations = Math.max(1, Math.round(this.params.pressureIterations))
    for (let i = 0; i < iterations; i++) {
      gl.uniform1i(pressure.u('uPressure'), this.attach(1, this.pressure.read.texture))
      this.blit(this.pressure.write)
      this.pressure.swap()
    }

    // 7. Subtração do gradiente de pressão
    const gradient = this.gradientProgram
    gradient.bind()
    gl.uniform2f(gradient.u('uTexelSize'), this.velocity.texelSizeX, this.velocity.texelSizeY)
    gl.uniform1i(gradient.u('uPressure'), this.attach(0, this.pressure.read.texture))
    gl.uniform1i(gradient.u('uVelocity'), this.attach(1, this.velocity.read.texture))
    this.blit(this.velocity.write)
    this.velocity.swap()
  }

  private render(): void {
    const gl = this.gl
    gl.disable(gl.BLEND)
    const display = this.displayProgram
    display.bind()
    gl.uniform1i(display.u('uTexture'), this.attach(0, this.dye.read.texture))
    this.blit(null)
  }

  // -- Framebuffers ---------------------------------------------------------

  private initFramebuffers(): void {
    const gl = this.gl
    const simRes = this.getResolution(SIM_RESOLUTION)
    const dyeRes = this.getResolution(DYE_RESOLUTION)
    gl.disable(gl.BLEND)

    const prevVelocity: DoubleBuffer | undefined = this.velocity
    this.velocity = this.resizeDouble(prevVelocity, simRes.width, simRes.height, this.formatRG, gl.LINEAR)

    const prevDye: DoubleBuffer | undefined = this.dye
    this.dye = this.resizeDouble(prevDye, dyeRes.width, dyeRes.height, this.formatRGBA, gl.LINEAR)

    const prevPressure: DoubleBuffer | undefined = this.pressure
    if (!prevPressure || prevPressure.width !== simRes.width || prevPressure.height !== simRes.height) {
      if (prevPressure) this.disposeDouble(prevPressure)
      this.pressure = this.createDouble(simRes.width, simRes.height, this.formatR, gl.NEAREST)

      const prevDivergence: RenderTarget | undefined = this.divergenceFbo
      if (prevDivergence) this.disposeTarget(prevDivergence)
      this.divergenceFbo = this.createTarget(simRes.width, simRes.height, this.formatR, gl.NEAREST)

      const prevCurl: RenderTarget | undefined = this.curlFbo
      if (prevCurl) this.disposeTarget(prevCurl)
      this.curlFbo = this.createTarget(simRes.width, simRes.height, this.formatR, gl.NEAREST)
    }
  }

  private resizeDouble(
    prev: DoubleBuffer | undefined,
    width: number,
    height: number,
    format: TexFormat,
    filter: number,
  ): DoubleBuffer {
    if (!prev) return this.createDouble(width, height, format, filter)
    if (prev.width === width && prev.height === height) return prev
    const gl = this.gl
    const next = this.createDouble(width, height, format, filter)
    const copy = this.copyProgram
    copy.bind()
    gl.uniform1i(copy.u('uTexture'), this.attach(0, prev.read.texture))
    this.blit(next.read)
    this.disposeDouble(prev)
    return next
  }

  private createDouble(width: number, height: number, format: TexFormat, filter: number): DoubleBuffer {
    return new DoubleBuffer(
      this.createTarget(width, height, format, filter),
      this.createTarget(width, height, format, filter),
    )
  }

  private createTarget(width: number, height: number, format: TexFormat, filter: number): RenderTarget {
    const gl = this.gl
    const texture = this.req(gl.createTexture(), 'textura')
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, format.internalFormat, width, height, 0, format.format, gl.HALF_FLOAT, null)
    const framebuffer = this.req(gl.createFramebuffer(), 'framebuffer')
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return {
      texture,
      framebuffer,
      width,
      height,
      texelSizeX: 1 / width,
      texelSizeY: 1 / height,
    }
  }

  private clearTarget(target: RenderTarget): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.viewport(0, 0, target.width, target.height)
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  private disposeTarget(target: RenderTarget | undefined): void {
    if (!target) return
    this.gl.deleteTexture(target.texture)
    this.gl.deleteFramebuffer(target.framebuffer)
  }

  private disposeDouble(buffer: DoubleBuffer | undefined): void {
    if (!buffer) return
    this.disposeTarget(buffer.read)
    this.disposeTarget(buffer.write)
  }

  // -- Utilidades -----------------------------------------------------------

  private blit(target: RenderTarget | null): void {
    const gl = this.gl
    if (target) {
      gl.viewport(0, 0, target.width, target.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
  }

  private attach(unit: number, texture: WebGLTexture): number {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0 + unit)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    return unit
  }

  private correctRadius(radius: number): number {
    const aspect = this.canvas.width / Math.max(1, this.canvas.height)
    return aspect > 1 ? radius * aspect : radius
  }

  private getResolution(base: number): { width: number; height: number } {
    const gl = this.gl
    const bufferWidth = Math.max(1, gl.drawingBufferWidth)
    const bufferHeight = Math.max(1, gl.drawingBufferHeight)
    let aspect = bufferWidth / bufferHeight
    if (aspect < 1) aspect = 1 / aspect
    aspect = Math.min(aspect, MAX_ASPECT)
    const min = Math.round(base)
    const max = Math.round(base * aspect)
    return bufferWidth > bufferHeight ? { width: max, height: min } : { width: min, height: max }
  }

  private pickFormat(candidates: TexFormat[]): TexFormat | null {
    for (const candidate of candidates) {
      if (this.supportsFormat(candidate)) return candidate
    }
    return null
  }

  private supportsFormat(format: TexFormat): boolean {
    const gl = this.gl
    const texture = gl.createTexture()
    if (!texture) return false
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, format.internalFormat, 4, 4, 0, format.format, gl.HALF_FLOAT, null)
    const framebuffer = gl.createFramebuffer()
    if (!framebuffer) {
      gl.deleteTexture(texture)
      return false
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(framebuffer)
    gl.deleteTexture(texture)
    return status === gl.FRAMEBUFFER_COMPLETE
  }

  private req<T>(value: T | null, what: string): T {
    if (value === null) throw new Error(`Falha ao criar recurso WebGL (${what}).`)
    return value
  }
}
