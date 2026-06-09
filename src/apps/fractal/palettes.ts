export type Vec3 = readonly [number, number, number]

/** Coeficientes de paleta de cossenos (estilo Iñigo Quilez): cor(t) = a + b·cos(2π(c·t + d)) */
export interface PaletteCoeffs {
  a: Vec3
  b: Vec3
  c: Vec3
  d: Vec3
}

export interface FractalPalette {
  id: string
  name: string
  coeffs: PaletteCoeffs
  /** Gradiente CSS pré-computado para o seletor da toolbar */
  gradient: string
}

function sampleChannel(a: number, b: number, c: number, d: number, t: number): number {
  const v = a + b * Math.cos(2 * Math.PI * (c * t + d))
  return Math.round(Math.min(1, Math.max(0, v)) * 255)
}

function buildGradient(coeffs: PaletteCoeffs): string {
  const steps = 8
  const stops: string[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const r = sampleChannel(coeffs.a[0], coeffs.b[0], coeffs.c[0], coeffs.d[0], t)
    const g = sampleChannel(coeffs.a[1], coeffs.b[1], coeffs.c[1], coeffs.d[1], t)
    const b = sampleChannel(coeffs.a[2], coeffs.b[2], coeffs.c[2], coeffs.d[2], t)
    stops.push(`rgb(${r},${g},${b}) ${Math.round(t * 100)}%`)
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

function makePalette(id: string, name: string, coeffs: PaletteCoeffs): FractalPalette {
  return { id, name, coeffs, gradient: buildGradient(coeffs) }
}

const COSMOS = makePalette('cosmos', 'Cosmos', {
  a: [0.35, 0.22, 0.55],
  b: [0.45, 0.3, 0.45],
  c: [1, 1, 1],
  d: [0.9, 0.8, 0.95],
})

const FOGO = makePalette('fogo', 'Fogo', {
  a: [0.5, 0.4, 0.15],
  b: [0.5, 0.4, 0.15],
  c: [1, 1, 1],
  d: [0.5, 0.45, 0.35],
})

const OCEANO = makePalette('oceano', 'Oceano', {
  a: [0.1, 0.45, 0.5],
  b: [0.1, 0.42, 0.45],
  c: [1, 1, 1],
  d: [0.3, 0.65, 0.5],
})

export const PALETTES: FractalPalette[] = [COSMOS, FOGO, OCEANO]

export function getPalette(id: string): FractalPalette {
  return PALETTES.find(p => p.id === id) ?? COSMOS
}
