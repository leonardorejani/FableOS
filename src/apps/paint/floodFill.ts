import type { Rgba } from './color'

/**
 * Preenchimento por inundação (balde) ITERATIVO, usando scanline com pilha
 * explícita — nunca recursão. Opera direto no ImageData (pixels do device).
 *
 * @param img        ImageData do canvas inteiro (modificado in-place)
 * @param startX     coluna inicial em pixels do device
 * @param startY     linha inicial em pixels do device
 * @param fill       cor de preenchimento
 * @param tolerance  tolerância por canal (0–255) para bordas com antialias
 * @returns true se algum pixel foi alterado
 */
export function floodFill(
  img: ImageData,
  startX: number,
  startY: number,
  fill: Rgba,
  tolerance: number,
): boolean {
  const { width, height, data } = img
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return false

  const startIdx = (startY * width + startX) * 4
  const tr = data[startIdx]
  const tg = data[startIdx + 1]
  const tb = data[startIdx + 2]
  const ta = data[startIdx + 3]

  // Já está exatamente na cor de preenchimento: nada a fazer.
  if (tr === fill.r && tg === fill.g && tb === fill.b && ta === fill.a) return false

  const matches = (i: number): boolean =>
    Math.abs(data[i] - tr) <= tolerance &&
    Math.abs(data[i + 1] - tg) <= tolerance &&
    Math.abs(data[i + 2] - tb) <= tolerance &&
    Math.abs(data[i + 3] - ta) <= tolerance

  // Bitmap de visitados evita loop infinito quando a cor de preenchimento
  // cai dentro da tolerância da cor alvo.
  const visited = new Uint8Array(width * height)
  const stack: number[] = [startX, startY]
  let changed = false

  while (stack.length > 0) {
    const y = stack.pop() as number
    const x = stack.pop() as number
    if (visited[y * width + x] || !matches((y * width + x) * 4)) continue

    // anda para a esquerda até o início do trecho contíguo
    let px = x
    while (px > 0 && !visited[y * width + px - 1] && matches((y * width + px - 1) * 4)) px--

    let spanAbove = false
    let spanBelow = false

    // varre o trecho para a direita pintando e agendando linhas vizinhas
    while (px < width) {
      const pos = y * width + px
      if (visited[pos] || !matches(pos * 4)) break
      visited[pos] = 1
      const i = pos * 4
      data[i] = fill.r
      data[i + 1] = fill.g
      data[i + 2] = fill.b
      data[i + 3] = fill.a
      changed = true

      if (y > 0) {
        const above = pos - width
        const ok = !visited[above] && matches(above * 4)
        if (ok && !spanAbove) {
          stack.push(px, y - 1)
          spanAbove = true
        } else if (!ok) {
          spanAbove = false
        }
      }
      if (y < height - 1) {
        const below = pos + width
        const ok = !visited[below] && matches(below * 4)
        if (ok && !spanBelow) {
          stack.push(px, y + 1)
          spanBelow = true
        } else if (!ok) {
          spanBelow = false
        }
      }
      px++
    }
  }

  return changed
}
