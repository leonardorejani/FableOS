// Primitivas de desenho em canvas: células com gradiente, fantasma e
// miniaturas de peças para os painéis de reserva/próximas.

import type { PieceType } from './game'
import { PIECE_SHAPES } from './game'

export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#22d3ee',
  O: '#facc15',
  T: '#a855f7',
  S: '#4ade80',
  Z: '#ef4444',
  J: '#3b82f6',
  L: '#fb923c',
}

const DISABLED_COLOR = '#64748b'

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

/** Clareia (amount > 0) ou escurece (amount < 0) uma cor hex. */
export function shade(hex: string, amount: number): string {
  const raw = hex.replace('#', '')
  const r = parseInt(raw.slice(0, 2), 16)
  const g = parseInt(raw.slice(2, 4), 16)
  const b = parseInt(raw.slice(4, 6), 16)
  const target = amount >= 0 ? 255 : 0
  const t = Math.abs(amount)
  const mix = (c: number): number => clampChannel(c + (target - c) * t)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

/** Célula sólida com leve gradiente vertical, brilho no topo e borda escura. */
export function drawCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  color: string,
): void {
  const gradient = ctx.createLinearGradient(px, py, px, py + size)
  gradient.addColorStop(0, shade(color, 0.3))
  gradient.addColorStop(0.5, color)
  gradient.addColorStop(1, shade(color, -0.3))
  ctx.fillStyle = gradient
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.32)'
  ctx.fillRect(px + 2, py + 2, size - 4, Math.max(1, Math.floor(size * 0.12)))
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
  ctx.lineWidth = 1
  ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1)
}

/** Silhueta translúcida usada pela ghost piece. */
export function drawGhostCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  size: number,
  color: string,
): void {
  ctx.fillStyle = shade(color, 0.1)
  ctx.globalAlpha = 0.14
  ctx.fillRect(px + 1, py + 1, size - 2, size - 2)
  ctx.globalAlpha = 0.5
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3)
  ctx.globalAlpha = 1
}

/** Desenha a peça centralizada em um canvas pequeno (painéis laterais). */
export function drawMiniPiece(
  canvas: HTMLCanvasElement,
  type: PieceType | null,
  disabled: boolean,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.clientWidth || 64
  const cssH = canvas.clientHeight || 40
  canvas.width = Math.max(1, Math.round(cssW * dpr))
  canvas.height = Math.max(1, Math.round(cssH * dpr))
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssW, cssH)
  if (!type) return

  const cells = PIECE_SHAPES[type][0]
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [cx, cy] of cells) {
    minX = Math.min(minX, cx)
    minY = Math.min(minY, cy)
    maxX = Math.max(maxX, cx)
    maxY = Math.max(maxY, cy)
  }
  const cols = maxX - minX + 1
  const rows = maxY - minY + 1
  const cell = Math.max(
    4,
    Math.min(14, Math.floor((cssW - 8) / cols), Math.floor((cssH - 8) / rows)),
  )
  const offsetX = (cssW - cols * cell) / 2
  const offsetY = (cssH - rows * cell) / 2
  const color = disabled ? DISABLED_COLOR : PIECE_COLORS[type]
  for (const [cx, cy] of cells) {
    drawCell(ctx, offsetX + (cx - minX) * cell, offsetY + (cy - minY) * cell, cell, color)
  }
}
