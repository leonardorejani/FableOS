// Componentes visuais de gráfico do Monitor: gráfico de tendência em canvas
// (linha + área com gradiente) e gauge circular em SVG.

import { useEffect, useRef, useState } from 'react'
import { clamp, hexToRgba } from './metrics'

interface TrendChartProps {
  /** Série de valores (mais antigo → mais recente). */
  data: number[]
  /** Capacidade máxima da série; ancora o traçado à direita. */
  capacity: number
  /** Cor da linha (hex do accent, para uso no canvas). */
  color: string
  /** Teto fixo do eixo Y; quando ausente, é calculado a partir dos dados. */
  yMax?: number
}

export function TrendChart({ data, capacity, color, yMax }: TrendChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) {
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w < 4 || size.h < 4) return
    const dpr = window.devicePixelRatio || 1
    const bufferW = Math.round(size.w * dpr)
    const bufferH = Math.round(size.h * dpr)
    if (canvas.width !== bufferW) canvas.width = bufferW
    if (canvas.height !== bufferH) canvas.height = bufferH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawTrend(ctx, size.w, size.h, data, capacity, color, yMax)
  }, [data, capacity, color, yMax, size])

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden rounded-lg border border-white/10 bg-black/20"
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {data.length < 2 ? (
        <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/30">
          coletando dados…
        </span>
      ) : null}
    </div>
  )
}

function drawTrend(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  data: number[],
  capacity: number,
  color: string,
  yMax: number | undefined,
): void {
  ctx.clearRect(0, 0, w, h)

  // Linhas-guia horizontais sutis
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
  ctx.lineWidth = 1
  for (const fraction of [0.25, 0.5, 0.75]) {
    const y = Math.round(h * fraction) + 0.5
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }

  if (data.length < 2) return

  const top = yMax ?? Math.max(80, Math.max(...data) * 1.08)
  const step = capacity > 1 ? w / (capacity - 1) : w
  const x0 = w - (data.length - 1) * step
  const padY = 3
  const toX = (i: number): number => x0 + i * step
  const toY = (v: number): number => h - padY - (clamp(v, 0, top) / top) * (h - padY * 2)

  // Preenchimento com gradiente translúcido abaixo da linha
  const gradient = ctx.createLinearGradient(0, 0, 0, h)
  gradient.addColorStop(0, hexToRgba(color, 0.32))
  gradient.addColorStop(1, hexToRgba(color, 0.02))
  ctx.beginPath()
  ctx.moveTo(toX(0), h)
  for (let i = 0; i < data.length; i++) {
    ctx.lineTo(toX(i), toY(data[i]))
  }
  ctx.lineTo(toX(data.length - 1), h)
  ctx.closePath()
  ctx.fillStyle = gradient
  ctx.fill()

  // Linha principal
  ctx.beginPath()
  for (let i = 0; i < data.length; i++) {
    const x = toX(i)
    const y = toY(data[i])
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()

  // Ponto no valor mais recente
  ctx.beginPath()
  ctx.arc(toX(data.length - 1), toY(data[data.length - 1]), 2.5, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

interface GaugeProps {
  /** Percentual de 0 a 100. */
  value: number
  label: string
}

const GAUGE_RADIUS = 34
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS

export function Gauge({ value, label }: GaugeProps) {
  const pct = clamp(value, 0, 100)
  const dash = (pct / 100) * GAUGE_CIRCUMFERENCE
  return (
    <svg
      viewBox="0 0 84 84"
      className="h-24 w-24 shrink-0"
      role="img"
      aria-label={`${label}: ${Math.round(pct)}%`}
    >
      <circle
        cx="42"
        cy="42"
        r={GAUGE_RADIUS}
        fill="none"
        stroke="rgba(255, 255, 255, 0.08)"
        strokeWidth="7"
      />
      <circle
        cx="42"
        cy="42"
        r={GAUGE_RADIUS}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${GAUGE_CIRCUMFERENCE}`}
        transform="rotate(-90 42 42)"
        style={{ stroke: 'var(--accent)', transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text
        x="42"
        y="41"
        textAnchor="middle"
        dominantBaseline="central"
        fill="rgba(255, 255, 255, 0.92)"
        fontSize="15"
        fontWeight="600"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
      >
        {Math.round(pct)}%
      </text>
      <text x="42" y="57" textAnchor="middle" fill="rgba(255, 255, 255, 0.4)" fontSize="7.5">
        {label}
      </text>
    </svg>
  )
}
