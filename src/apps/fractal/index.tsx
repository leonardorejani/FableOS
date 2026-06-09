import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from 'react'
import type { AppProps } from '../../system/types'
import { exists, writeFile } from '../../system/vfs'
import { getPalette, PALETTES } from './palettes'
import { FractalRenderer } from './renderer'

type FractalMode = 'mandelbrot' | 'julia'

interface Camera {
  cx: number
  cy: number
  /** extensão vertical da vista no plano complexo */
  span: number
}

interface JuliaConstant {
  re: number
  im: number
}

const MANDEL_HOME: Camera = { cx: -0.6, cy: 0, span: 3 }
const JULIA_HOME: Camera = { cx: 0, cy: 0, span: 3.2 }
const JULIA_DEFAULT: JuliaConstant = { re: -0.7, im: 0.27015 }
/** Limite de zoom: abaixo disso o float32 do shader não tem mais precisão. */
const MIN_SPAN = 1e-5
const MAX_SPAN = 16
const IMAGES_DIR = '/home/user/imagens'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function homeFor(mode: FractalMode): Camera {
  return mode === 'mandelbrot' ? MANDEL_HOME : JULIA_HOME
}

function formatZoom(zoom: number): string {
  if (zoom < 1000) return `${zoom.toFixed(1)}×`
  const exp = Math.floor(Math.log10(zoom))
  const mant = zoom / 10 ** exp
  return `${mant.toFixed(1)}e${exp}×`
}

function formatComplex(re: number, im: number, digits: number): string {
  const sign = im < 0 ? '−' : '+'
  return `${re.toFixed(digits)} ${sign} ${Math.abs(im).toFixed(digits)}i`
}

export default function FractalApp(_props: AppProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<FractalRenderer | null>(null)
  const dragRef = useRef<{ pointerId: number; lastX: number; lastY: number } | null>(null)
  const toastTimerRef = useRef<number | null>(null)

  const [mode, setMode] = useState<FractalMode>('mandelbrot')
  const [camera, setCamera] = useState<Camera>(MANDEL_HOME)
  const [juliaC, setJuliaC] = useState<JuliaConstant>(JULIA_DEFAULT)
  const [followMouse, setFollowMouse] = useState(false)
  const [maxIter, setMaxIter] = useState(250)
  const [paletteId, setPaletteId] = useState('cosmos')
  const [sizeVersion, setSizeVersion] = useState(0)
  const [ready, setReady] = useState(false)
  const [webglError, setWebglError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const cameraRef = useRef(camera)
  cameraRef.current = camera

  const palette = getPalette(paletteId)
  const atPrecisionLimit = camera.span <= MIN_SPAN * 1.001
  const zoom = homeFor(mode).span / camera.span

  // ----- WebGL: criação, perda de contexto e ResizeObserver -----
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    let renderer: FractalRenderer
    try {
      renderer = new FractalRenderer(canvas)
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : 'Falha ao iniciar o WebGL.')
      return
    }
    rendererRef.current = renderer

    const handleContextLost = (e: Event): void => {
      e.preventDefault()
      setWebglError('O contexto WebGL foi perdido. Feche e reabra o aplicativo.')
    }
    canvas.addEventListener('webglcontextlost', handleContextLost)

    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = Math.max(1, Math.round(entry.contentRect.width * dpr))
      const height = Math.max(1, Math.round(entry.contentRect.height * dpr))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        setSizeVersion(v => v + 1)
      }
    })
    observer.observe(wrap)
    setReady(true)

    return () => {
      observer.disconnect()
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      renderer.dispose()
      rendererRef.current = null
    }
  }, [])

  // ----- Render sob demanda: só redesenha quando parâmetros/câmera mudam -----
  const draw = useCallback(() => {
    const renderer = rendererRef.current
    const canvas = canvasRef.current
    if (!renderer || !canvas || canvas.height === 0) return
    renderer.draw({
      centerX: camera.cx,
      centerY: camera.cy,
      scale: camera.span / canvas.height,
      julia: mode === 'julia',
      juliaRe: juliaC.re,
      juliaIm: juliaC.im,
      maxIter,
      palette: palette.coeffs,
    })
  }, [camera, mode, juliaC, maxIter, palette])

  useEffect(() => {
    if (!ready) return
    draw()
  }, [ready, sizeVersion, draw])

  // ----- Navegação -----
  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (rect.height === 0) return
    const cam = cameraRef.current
    const newSpan = clamp(cam.span * factor, MIN_SPAN, MAX_SPAN)
    if (newSpan === cam.span) return
    const unit = cam.span / rect.height
    const px = cam.cx + (clientX - rect.left - rect.width / 2) * unit
    const py = cam.cy - (clientY - rect.top - rect.height / 2) * unit
    const ratio = newSpan / cam.span
    setCamera({ cx: px + (cam.cx - px) * ratio, cy: py + (cam.cy - py) * ratio, span: newSpan })
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0012))
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
  }, [])

  const planeFromClient = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (rect.height === 0) return null
    const cam = cameraRef.current
    const unit = cam.span / rect.height
    return {
      x: cam.cx + (clientX - rect.left - rect.width / 2) * unit,
      y: cam.cy - (clientY - rect.top - rect.height / 2) * unit,
    }
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) return
    rootRef.current?.focus()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // sem captura o arraste segue funcionando enquanto o cursor estiver sobre o canvas
    }
    dragRef.current = { pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY }
    setDragging(true)
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    const drag = dragRef.current
    if (drag && drag.pointerId === e.pointerId) {
      const rect = e.currentTarget.getBoundingClientRect()
      if (rect.height === 0) return
      const dx = e.clientX - drag.lastX
      const dy = e.clientY - drag.lastY
      drag.lastX = e.clientX
      drag.lastY = e.clientY
      if (dx === 0 && dy === 0) return
      setCamera(cam => {
        const unit = cam.span / rect.height
        return { ...cam, cx: cam.cx - dx * unit, cy: cam.cy + dy * unit }
      })
      return
    }
    if (mode === 'julia' && followMouse) {
      const p = planeFromClient(e.clientX, e.clientY)
      if (p) setJuliaC({ re: clamp(p.x, -1.5, 1.5), im: clamp(p.y, -1.5, 1.5) })
    }
  }

  const handlePointerEnd = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // captura já liberada
    }
  }

  const switchMode = (next: FractalMode): void => {
    if (next === mode) return
    setMode(next)
    setCamera(homeFor(next))
  }

  const resetView = (): void => {
    setCamera(homeFor(mode))
  }

  const panBy = (fx: number, fy: number): void => {
    setCamera(cam => ({ ...cam, cx: cam.cx + cam.span * fx, cy: cam.cy + cam.span * fy }))
  }

  const zoomCenter = (factor: number): void => {
    setCamera(cam => ({ ...cam, span: clamp(cam.span * factor, MIN_SPAN, MAX_SPAN) }))
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.target instanceof HTMLInputElement) return
    switch (e.key) {
      case 'r':
      case 'R':
        e.preventDefault()
        resetView()
        break
      case 'm':
      case 'M':
        e.preventDefault()
        switchMode(mode === 'mandelbrot' ? 'julia' : 'mandelbrot')
        break
      case '1':
        setPaletteId('cosmos')
        break
      case '2':
        setPaletteId('fogo')
        break
      case '3':
        setPaletteId('oceano')
        break
      case '+':
      case '=':
        e.preventDefault()
        zoomCenter(0.8)
        break
      case '-':
      case '_':
        e.preventDefault()
        zoomCenter(1.25)
        break
      case 'ArrowLeft':
        e.preventDefault()
        panBy(-0.08, 0)
        break
      case 'ArrowRight':
        e.preventDefault()
        panBy(0.08, 0)
        break
      case 'ArrowUp':
        e.preventDefault()
        panBy(0, 0.08)
        break
      case 'ArrowDown':
        e.preventDefault()
        panBy(0, -0.08)
        break
      default:
        break
    }
  }

  const showToast = (message: string): void => {
    setToast(message)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000)
  }

  const handleCapture = (): void => {
    const canvas = canvasRef.current
    if (!canvas || !rendererRef.current) return
    try {
      // re-render síncrono garante o buffer atual antes da leitura
      draw()
      const dataUrl = canvas.toDataURL('image/png')
      let n = 1
      while (exists(`${IMAGES_DIR}/fractal-${n}.png`)) n += 1
      const name = `fractal-${n}.png`
      writeFile(`${IMAGES_DIR}/${name}`, dataUrl)
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = name
      link.click()
      showToast(`${name} salvo em ${IMAGES_DIR} e baixado`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Não foi possível capturar a imagem.')
    }
  }

  if (webglError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#0b0b14] p-6">
        <div className="max-w-sm rounded-xl border border-white/10 bg-white/5 p-6 text-center">
          <div className="text-sm font-medium text-white/90">WebGL indisponível</div>
          <p className="mt-2 text-xs leading-relaxed text-white/60">
            Este aplicativo precisa de aceleração gráfica WebGL para renderizar os fractais.
          </p>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-white/35">{webglError}</p>
          <p className="mt-3 text-xs text-white/60">
            Verifique se a aceleração de hardware está habilitada nas configurações do navegador.
          </p>
        </div>
      </div>
    )
  }

  const modeButton = (value: FractalMode, label: string): ReactElement => (
    <button
      type="button"
      onClick={() => switchMode(value)}
      className={`rounded-md px-2.5 py-1 text-xs transition ${
        mode === value
          ? 'bg-[var(--accent)] text-white'
          : 'text-white/60 hover:text-white/90'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex h-full w-full flex-col bg-[#0d0d16] outline-none"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/10 px-2 py-1.5">
        <div className="flex rounded-lg bg-white/10 p-0.5" role="group" aria-label="Modo do fractal">
          {modeButton('mandelbrot', 'Mandelbrot')}
          {modeButton('julia', 'Julia')}
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label="Paleta de cores">
          {PALETTES.map(p => (
            <button
              key={p.id}
              type="button"
              title={`Paleta ${p.name}`}
              aria-label={`Paleta ${p.name}`}
              onClick={() => setPaletteId(p.id)}
              className={`h-6 w-10 rounded-md border transition ${
                paletteId === p.id
                  ? 'border-[var(--accent)]'
                  : 'border-white/15 hover:border-white/40'
              }`}
              style={{ background: p.gradient }}
            />
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-white/60">
          Iterações
          <input
            type="range"
            min={100}
            max={1000}
            step={10}
            value={maxIter}
            onChange={e => setMaxIter(Number(e.target.value))}
            className="h-1 w-28 accent-[var(--accent)]"
          />
          <span className="w-9 text-right font-mono text-white/90">{maxIter}</span>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={resetView}
            title="Voltar à vista inicial (R)"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15"
          >
            Reiniciar
          </button>
          <button
            type="button"
            onClick={handleCapture}
            title={`Baixar PNG e salvar em ${IMAGES_DIR}`}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:opacity-90"
          >
            Capturar
          </button>
        </div>
      </div>

      {mode === 'julia' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-white/10 px-2 py-1.5">
          <label className="flex items-center gap-2 text-xs text-white/60">
            c re
            <input
              type="range"
              min={-1.5}
              max={1.5}
              step={0.001}
              value={juliaC.re}
              onChange={e => setJuliaC(prev => ({ ...prev, re: Number(e.target.value) }))}
              className="h-1 w-28 accent-[var(--accent)]"
            />
            <span className="w-14 text-right font-mono text-white/90">{juliaC.re.toFixed(3)}</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-white/60">
            c im
            <input
              type="range"
              min={-1.5}
              max={1.5}
              step={0.001}
              value={juliaC.im}
              onChange={e => setJuliaC(prev => ({ ...prev, im: Number(e.target.value) }))}
              className="h-1 w-28 accent-[var(--accent)]"
            />
            <span className="w-14 text-right font-mono text-white/90">{juliaC.im.toFixed(3)}</span>
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/60 hover:text-white/90">
            <input
              type="checkbox"
              checked={followMouse}
              onChange={e => setFollowMouse(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Seguir mouse
          </label>
        </div>
      )}

      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full touch-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onDoubleClick={e => zoomAt(e.clientX, e.clientY, 0.35)}
        />

        <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-white/10 bg-black/45 px-3 py-2 font-mono text-[11px] leading-relaxed text-white/70 backdrop-blur-md">
          <div>
            <span className="text-white/35">centro </span>
            {formatComplex(camera.cx, camera.cy, 6)}
          </div>
          <div>
            <span className="text-white/35">zoom&nbsp;&nbsp; </span>
            {formatZoom(zoom)}
          </div>
          <div>
            <span className="text-white/35">iter&nbsp;&nbsp; </span>
            {maxIter}
          </div>
          {mode === 'julia' && (
            <div>
              <span className="text-white/35">c&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span>
              {formatComplex(juliaC.re, juliaC.im, 4)}
            </div>
          )}
          {atPrecisionLimit && <div className="mt-1 text-amber-300/90">limite de precisão</div>}
        </div>

        <div className="pointer-events-none absolute bottom-2 left-3 right-3 truncate text-[10px] text-white/35">
          arraste para mover · roda do mouse aproxima no cursor · duplo clique aproxima · R reinicia · M alterna modo · 1–3 paleta · setas movem
        </div>

        {toast && (
          <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/10 bg-black/60 px-3 py-1.5 text-xs text-white/90 backdrop-blur-md">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
