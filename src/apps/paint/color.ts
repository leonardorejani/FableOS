export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** Converte "#rgb" ou "#rrggbb" para RGBA opaco. Cai em preto se inválido. */
export function hexToRgba(hex: string): Rgba {
  const clean = hex.replace('#', '').trim()
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map(c => c + c)
          .join('')
      : clean
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return { r: 0, g: 0, b: 0, a: 255 }
  const num = parseInt(full, 16)
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff, a: 255 }
}

/** Converte componentes RGB (0–255) para "#rrggbb". */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
