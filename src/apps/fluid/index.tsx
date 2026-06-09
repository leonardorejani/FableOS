import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { AppProps } from '../../system/types'
import { DEFAULT_PARAMS, FluidSimulation, FluidUnsupportedError, hsvToRgb } from './simulation'
import type { FluidParams } from './simulation'

const SPLAT_FORCE = 6000
const IDLE_DELAY_MS = 3000

interface PointerPos {
  x: number
  y: number
}

interface ControlSliderProps {
  label: string
  title: string
  min: number
  max: number
  step: number
  value: number
  display: string
  disabled: boolean
  onChange: (value: number) => void
}

function ControlSlider({ label, title, min, max, step, value, display, disabled, onChange }: ControlSliderProps) {
  return (
    <label
      title={title}
      className="flex min-w-[185px] flex-1 cursor-pointer items-center gap-2 text-xs text-white/60"
    >
      <span className="w-[92px] shrink-0 truncate">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={event => onChange(Number(event.target.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
      />
      <span className="w-11 shrink-0 text-right font-mono text-[10px] text-white/35">{display}</span>
    </label>
  )
}

export default function FluidApp(_props: AppProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<FluidSimulation | null>(null)
  const pointersRef = useRef<Map<number, PointerPos>>(new Map())
  const hueRef = useRef(Math.random())
  const lastInteractionRef = useRef(0)
  const nextAutoRef = useRef(0)
  const paramsRef = useRef<FluidParams>({ ...DEFAULT_PARAMS })

  const [params, setParams] = useState<FluidParams>({ ...DEFAULT_PARAMS })
  const [error, setError] = useState<string | null>(null)
  const [fps, setFps] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [hasInteracted, setHasInteracted] = useState(false)

  // Sincroniza sliders com a engine
  useEffect(() => {
    paramsRef.current = params
    simRef.current?.setParams(params)
  }, [params])

  // Ciclo de vida da simulação (recriada a cada "attempt")
  useEffect(() => {
    const canvas = canvasRef.current
    const holder = containerRef.current
    if (!canvas || !holder) return

    let sim: FluidSimulation | null = null
    try {
      sim = new FluidSimulation(canvas, paramsRef.current)
    } catch (err) {
      if (err instanceof FluidUnsupportedError) {
        setError(err.message)
      } else if (err instanceof Error) {
        setError(`Falha ao iniciar a simulação: ${err.message}`)
      } else {
        setError('Falha desconhecida ao iniciar a simulação.')
      }
      return
    }
    simRef.current = sim
    setError(null)

    const applySize = (): void => {
      if (!sim) return
      const rect = holder.getBoundingClientRect()
      // Ignora medidas degeneradas (janela minimizada/oculta) para preservar a cena
      if (rect.width < 40 || rect.height < 40) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      sim.resize(Math.max(2, Math.round(rect.width * dpr)), Math.max(2, Math.round(rect.height * dpr)))
    }
    applySize()
    sim.splash(4)

    let raf: number | null = null
    let last = performance.now()
    let fpsWindowStart = last
    let fpsFrames = 0
    nextAutoRef.current = last + IDLE_DELAY_MS + 600

    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 30)
      last = now
      if (!sim) return

      // Splats automáticos suaves quando ocioso
      if (now - lastInteractionRef.current > IDLE_DELAY_MS && now >= nextAutoRef.current) {
        sim.idleSplat()
        nextAutoRef.current = now + 2400 + Math.random() * 1800
      }

      sim.frame(dt)

      fpsFrames += 1
      if (now - fpsWindowStart >= 500) {
        setFps(Math.round((fpsFrames * 1000) / (now - fpsWindowStart)))
        fpsWindowStart = now
        fpsFrames = 0
      }
    }

    const start = (): void => {
      if (raf === null) {
        last = performance.now()
        fpsWindowStart = last
        fpsFrames = 0
        raf = requestAnimationFrame(loop)
      }
    }
    const stop = (): void => {
      if (raf !== null) {
        cancelAnimationFrame(raf)
        raf = null
      }
    }
    start()

    const onVisibility = (): void => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    let resizeTimer: number | null = null
    const observer = new ResizeObserver(() => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null
        applySize()
      }, 150)
    })
    observer.observe(holder)

    const onContextLost = (event: Event): void => {
      event.preventDefault()
      stop()
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer)
        resizeTimer = null
      }
      observer.disconnect()
      setError('O contexto gráfico foi perdido pelo navegador. Tente novamente.')
    }
    canvas.addEventListener('webglcontextlost', onContextLost)

    const pointers = pointersRef.current
    return () => {
      stop()
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      pointers.clear()
      simRef.current = null
      sim?.dispose()
      sim = null
    }
  }, [attempt])

  const markInteraction = (): void => {
    lastInteractionRef.current = performance.now()
  }

  const toUv = (event: ReactPointerEvent<HTMLCanvasElement>): PointerPos => {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) / Math.max(1, rect.width),
      y: 1 - (event.clientY - rect.top) / Math.max(1, rect.height),
    }
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const sim = simRef.current
    if (!sim) return
    rootRef.current?.focus({ preventScroll: true })
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // captura indisponível: segue sem ela
    }
    const pos = toUv(event)
    pointersRef.current.set(event.pointerId, pos)
    // Cada novo arrasto desloca a matiz
    hueRef.current = (hueRef.current + 0.11) % 1
    const [r, g, b] = hsvToRgb(hueRef.current, 1, 1)
    sim.splat(pos.x, pos.y, 0, 0, [r * 0.2, g * 0.2, b * 0.2])
    markInteraction()
    if (!hasInteracted) setHasInteracted(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const sim = simRef.current
    const prev = pointersRef.current.get(event.pointerId)
    if (!sim || !prev) return
    const pos = toUv(event)
    pointersRef.current.set(event.pointerId, pos)
    const rect = event.currentTarget.getBoundingClientRect()
    const aspect = rect.width / Math.max(1, rect.height)
    let dx = pos.x - prev.x
    let dy = pos.y - prev.y
    if (aspect < 1) dx *= aspect
    if (aspect > 1) dy /= aspect
    const dist = Math.hypot(dx, dy)
    if (dist <= 0) return
    // Matiz avança gradualmente conforme o arrasto
    hueRef.current = (hueRef.current + Math.min(dist * 0.6, 0.02)) % 1
    const [r, g, b] = hsvToRgb(hueRef.current, 1, 1)
    sim.splat(pos.x, pos.y, dx * SPLAT_FORCE, dy * SPLAT_FORCE, [r * 0.18, g * 0.18, b * 0.18])
    markInteraction()
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    pointersRef.current.delete(event.pointerId)
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // ponteiro já liberado
    }
  }

  const handleReset = (): void => {
    simRef.current?.reset()
    markInteraction()
  }

  const handleSplash = (): void => {
    simRef.current?.splash(5)
    markInteraction()
    if (!hasInteracted) setHasInteracted(true)
  }

  const handleRetry = (): void => {
    setError(null)
    setFps(null)
    setAttempt(value => value + 1)
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!simRef.current) return
    const key = event.key.toLowerCase()
    if (key === 'r') {
      event.preventDefault()
      handleReset()
    } else if (key === 's') {
      event.preventDefault()
      handleSplash()
    }
  }

  const updateParam = (key: keyof FluidParams, value: number): void => {
    setParams(prev => ({ ...prev, [key]: value }))
  }

  const disabled = error !== null

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex h-full w-full flex-col overflow-hidden bg-black outline-none"
    >
      <div ref={containerRef} className="relative min-h-0 flex-1">
        <canvas
          key={attempt}
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onLostPointerCapture={handlePointerEnd}
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        />

        {!error && fps !== null && (
          <div className="pointer-events-none absolute right-2 top-2 rounded-md border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[10px] text-white/60 backdrop-blur-sm">
            {fps} fps
          </div>
        )}

        {!error && !hasInteracted && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-[11px] text-white/60 backdrop-blur-sm">
              Arraste sobre a tela para injetar fluido · R limpa · S dá um splash
            </span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/5 p-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6 text-[var(--accent)]"
                  aria-hidden="true"
                >
                  <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
                </svg>
              </div>
              <h2 className="text-sm font-medium text-white/90">Simulação indisponível</h2>
              <p className="mt-2 text-xs leading-relaxed text-white/60">{error}</p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-4 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:opacity-90"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/10 bg-white/5 px-3 py-2 backdrop-blur-md ${
          disabled ? 'pointer-events-none opacity-40' : ''
        }`}
      >
        <ControlSlider
          label="Tinta"
          title="Dissipação da tinta (quanto menor, mais rápido a cor some)"
          min={0.9}
          max={1}
          step={0.001}
          value={params.dyeDissipation}
          display={params.dyeDissipation.toFixed(3)}
          disabled={disabled}
          onChange={value => updateParam('dyeDissipation', value)}
        />
        <ControlSlider
          label="Velocidade"
          title="Dissipação da velocidade (atrito do fluido)"
          min={0.9}
          max={1}
          step={0.001}
          value={params.velocityDissipation}
          display={params.velocityDissipation.toFixed(3)}
          disabled={disabled}
          onChange={value => updateParam('velocityDissipation', value)}
        />
        <ControlSlider
          label="Vorticidade"
          title="Intensidade do vorticity confinement (redemoinhos)"
          min={0}
          max={50}
          step={1}
          value={params.curl}
          display={String(Math.round(params.curl))}
          disabled={disabled}
          onChange={value => updateParam('curl', value)}
        />
        <ControlSlider
          label="Raio do splat"
          title="Tamanho da área injetada a cada toque"
          min={0.05}
          max={1}
          step={0.01}
          value={params.splatRadius}
          display={params.splatRadius.toFixed(2)}
          disabled={disabled}
          onChange={value => updateParam('splatRadius', value)}
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={disabled}
            title="Limpar a cena (R)"
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15 disabled:cursor-not-allowed"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleSplash}
            disabled={disabled}
            title="5 splats aleatórios coloridos (S)"
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:cursor-not-allowed"
          >
            Splash
          </button>
        </div>
      </div>
    </div>
  )
}
