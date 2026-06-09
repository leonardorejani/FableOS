// Monitor do sistema — dashboard de desempenho em tempo real do FableOS.
// FPS real via requestAnimationFrame, memória (heap real ou estimada),
// CPU simulada correlacionada ao FPS, info da sessão, janelas e armazenamento.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { AppProps } from '../../system/types'
import { useWindows } from '../../system/windowStore'
import { useVfs } from '../../system/vfs'
import { useTheme } from '../../system/themeStore'
import { getAppMeta } from '../../system/apps'
import {
  LOCALSTORAGE_BUDGET,
  clamp,
  computeStorage,
  formatBytes,
  formatUptime,
  getPlatformName,
  parseBrowser,
  readRealMemory,
  type StorageInfo,
} from './metrics'
import { Gauge, TrendChart } from './charts'

const HISTORY_CAP = 120
const CHART_INTERVAL_MS = 250
const TEXT_INTERVAL_MS = 1000

interface MemoryDisplay {
  percent: number
  usedBytes: number | null
  totalBytes: number | null
  simulated: boolean
}

interface TextMetrics {
  fps: number
  fpsMin: number
  fpsMax: number
  memory: MemoryDisplay
  uptimeSec: number
  cpuAvg: number
}

interface ChartSeries {
  fps: number[]
  mem: number[]
}

export default function MonitorApp({ windowId }: AppProps) {
  const accent = useTheme(s => s.accent)
  const windows = useWindows(s => s.windows)
  const vfsVersion = useVfs(s => s.version)

  const coreCount = useMemo(
    () => clamp(navigator.hardwareConcurrency || 4, 1, 16),
    [],
  )
  const coreBias = useMemo(
    () => Array.from({ length: coreCount }, () => 0.5 + Math.random() * 0.65),
    [coreCount],
  )
  const systemInfo = useMemo(
    () => ({
      browser: parseBrowser(navigator.userAgent),
      platform: getPlatformName(),
      language: navigator.language,
    }),
    [],
  )

  const rootRef = useRef<HTMLDivElement | null>(null)
  const emaRef = useRef(60)
  const fpsHistoryRef = useRef<number[]>([])
  const memHistoryRef = useRef<number[]>([])
  const memWalkRef = useRef(46)
  const cpuValsRef = useRef<number[]>(Array.from({ length: coreCount }, () => 8))

  const [paused, setPaused] = useState(false)
  const [cpu, setCpu] = useState<number[]>(() => [...cpuValsRef.current])
  const [charts, setCharts] = useState<ChartSeries>({ fps: [], mem: [] })
  const [storage, setStorage] = useState<StorageInfo>(() => computeStorage())
  const [text, setText] = useState<TextMetrics>(() => ({
    fps: 0,
    fpsMin: 0,
    fpsMax: 0,
    memory: {
      percent: 0,
      usedBytes: null,
      totalBytes: null,
      simulated: readRealMemory() === null,
    },
    uptimeSec: performance.now() / 1000,
    cpuAvg: 0,
  }))

  // Foco inicial para os atalhos de teclado funcionarem de imediato
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true })
  }, [])

  // Reage a mudanças no VFS feitas por outros apps
  useEffect(() => {
    setStorage(computeStorage())
  }, [vfsVersion])

  // Engine de medição: rAF (FPS) + intervalos de 250 ms (gráficos) e 1 s (textos)
  useEffect(() => {
    if (paused) return

    let rafId = 0
    let chartTimer = 0
    let textTimer = 0
    let running = false
    let lastFrame = 0

    const frame = (t: number): void => {
      if (lastFrame > 0) {
        const dt = t - lastFrame
        if (dt > 0 && dt < 500) {
          const instant = Math.min(1000 / dt, 240)
          emaRef.current += (instant - emaRef.current) * 0.08
        }
      }
      lastFrame = t
      rafId = requestAnimationFrame(frame)
    }

    const chartTick = (): void => {
      const fpsNow = emaRef.current
      const fpsHist = fpsHistoryRef.current
      fpsHist.push(fpsNow)
      if (fpsHist.length > HISTORY_CAP) fpsHist.shift()

      const real = readRealMemory()
      let memPct: number
      if (real) {
        memPct = clamp((real.used / real.total) * 100, 0, 100)
      } else {
        const pull = (52 - memWalkRef.current) * 0.015
        const noise = (Math.random() - 0.5) * 3
        memWalkRef.current = clamp(memWalkRef.current + pull + noise, 26, 82)
        memPct = memWalkRef.current
      }
      const memHist = memHistoryRef.current
      memHist.push(memPct)
      if (memHist.length > HISTORY_CAP) memHist.shift()

      // Carga simulada inversamente correlacionada ao FPS real
      const pressure = clamp(1 - fpsNow / 72, 0.04, 0.97)
      const next = cpuValsRef.current.map((value, i) => {
        const bias = coreBias[i] ?? 0.7
        const target = clamp(pressure * 100 * bias + (Math.random() - 0.5) * 22, 2, 98)
        return clamp(value + (target - value) * 0.22, 1, 99)
      })
      cpuValsRef.current = next

      setCpu(next)
      setCharts({ fps: [...fpsHist], mem: [...memHist] })
    }

    const textTick = (): void => {
      const fpsHist = fpsHistoryRef.current
      const fps = Math.round(emaRef.current)
      const fpsMin = fpsHist.length > 0 ? Math.round(Math.min(...fpsHist)) : fps
      const fpsMax = fpsHist.length > 0 ? Math.round(Math.max(...fpsHist)) : fps

      const real = readRealMemory()
      const memHist = memHistoryRef.current
      const lastPct = memHist.length > 0 ? memHist[memHist.length - 1] : 0
      const memory: MemoryDisplay = real
        ? {
            percent: clamp((real.used / real.total) * 100, 0, 100),
            usedBytes: real.used,
            totalBytes: real.total,
            simulated: false,
          }
        : { percent: lastPct, usedBytes: null, totalBytes: null, simulated: true }

      const cores = cpuValsRef.current
      const cpuAvg =
        cores.length > 0 ? cores.reduce((sum, v) => sum + v, 0) / cores.length : 0

      setText({
        fps,
        fpsMin,
        fpsMax,
        memory,
        uptimeSec: performance.now() / 1000,
        cpuAvg,
      })
      setStorage(computeStorage())
    }

    const start = (): void => {
      if (running) return
      running = true
      lastFrame = 0
      rafId = requestAnimationFrame(frame)
      chartTimer = window.setInterval(chartTick, CHART_INTERVAL_MS)
      textTimer = window.setInterval(textTick, TEXT_INTERVAL_MS)
    }

    const stop = (): void => {
      if (!running) return
      running = false
      cancelAnimationFrame(rafId)
      window.clearInterval(chartTimer)
      window.clearInterval(textTimer)
    }

    const onVisibility = (): void => {
      if (document.hidden) stop()
      else start()
    }

    document.addEventListener('visibilitychange', onVisibility)
    chartTick()
    textTick()
    if (!document.hidden) start()

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [paused, coreBias])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const key = event.key.toLowerCase()
    if (key === 'p' || (event.key === ' ' && (event.target as HTMLElement).tagName !== 'BUTTON')) {
      event.preventDefault()
      setPaused(prev => !prev)
    }
  }

  const orderedWindows = useMemo(
    () => [...windows].sort((a, b) => b.zIndex - a.zIndex),
    [windows],
  )
  const lsPercent = clamp((storage.lsBytes / LOCALSTORAGE_BUDGET) * 100, 0, 100)
  const resolution = `${screen.width} × ${screen.height} · ${Math.round(window.devicePixelRatio * 100) / 100}x`

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="flex h-full w-full flex-col text-white/90 outline-none"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-3">
        <span
          className={`h-2 w-2 rounded-full ${paused ? 'bg-white/25' : 'bg-[var(--accent)]'}`}
          style={paused ? undefined : { boxShadow: '0 0 8px var(--accent)' }}
        />
        <span className="text-sm font-medium text-white/90">Monitor do sistema</span>
        <span className="text-[11px] text-white/35">
          {paused ? 'pausado' : 'tempo real'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[11px] text-white/45" title="Tempo de sessão">
            {formatUptime(text.uptimeSec)}
          </span>
          <button
            type="button"
            onClick={() => setPaused(prev => !prev)}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs hover:bg-white/15"
            title="Atalho: P ou Espaço"
          >
            {paused ? 'Retomar' : 'Pausar'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))' }}
        >
          <Card title="FPS" badge="últimos 30 s">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-semibold text-[var(--accent)]">
                {text.fps}
              </span>
              <span className="text-xs text-white/45">quadros/s</span>
              <span className="ml-auto font-mono text-[11px] text-white/35">
                mín {text.fpsMin} · máx {text.fpsMax}
              </span>
            </div>
            <div className="h-24">
              <TrendChart data={charts.fps} capacity={HISTORY_CAP} color={accent} />
            </div>
          </Card>

          <Card title="CPU" badge={`${coreCount} ${coreCount === 1 ? 'núcleo' : 'núcleos'}`}>
            <div className="flex items-center gap-3">
              <Gauge value={text.cpuAvg} label="média" />
              <div className="flex h-24 flex-1 items-end gap-1">
                {cpu.map((value, i) => (
                  <div
                    key={i}
                    className="relative h-full flex-1 overflow-hidden rounded-sm bg-white/5"
                    title={`Núcleo ${i + 1} — ${Math.round(value)}%`}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 rounded-sm bg-[var(--accent)] transition-[height] duration-300 ease-linear"
                      style={{ height: `${value}%`, opacity: 0.4 + (value / 100) * 0.6 }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-white/35">
              Carga simulada por núcleo, correlacionada ao FPS real.
            </p>
          </Card>

          <Card
            title="Memória"
            badge={text.memory.simulated ? 'estimado' : 'heap JS real'}
          >
            <div className="flex items-center gap-3">
              <Gauge value={text.memory.percent} label="em uso" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {text.memory.usedBytes !== null && text.memory.totalBytes !== null ? (
                  <>
                    <span className="font-mono text-xl text-white/90">
                      {formatBytes(text.memory.usedBytes)}
                    </span>
                    <span className="text-[11px] text-white/45">
                      de {formatBytes(text.memory.totalBytes)} alocados no heap JS
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-mono text-xl text-white/90">
                      {Math.round(text.memory.percent)}%
                    </span>
                    <span className="text-[11px] text-white/45">
                      performance.memory indisponível neste navegador — valores
                      estimados.
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="h-16">
              <TrendChart
                data={charts.mem}
                capacity={HISTORY_CAP}
                color={accent}
                yMax={100}
              />
            </div>
          </Card>

          <Card title="Sistema">
            <dl className="flex flex-col gap-1.5 text-xs">
              <InfoRow label="Tempo ativo" value={formatUptime(text.uptimeSec)} mono />
              <InfoRow label="Navegador" value={systemInfo.browser} />
              <InfoRow label="Resolução" value={resolution} mono />
              <InfoRow label="Plataforma" value={systemInfo.platform} />
              <InfoRow label="Idioma" value={systemInfo.language} mono />
            </dl>
          </Card>

          <Card
            title="Janelas"
            badge={`${windows.length} ${windows.length === 1 ? 'aberta' : 'abertas'}`}
          >
            {orderedWindows.length === 0 ? (
              <p className="py-3 text-center text-xs text-white/35">
                Nenhuma janela aberta.
              </p>
            ) : (
              <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto pr-1">
                {orderedWindows.map(win => (
                  <li
                    key={win.id}
                    className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-white/5"
                  >
                    <span className="text-sm leading-none">
                      {getAppMeta(win.appId)?.icon ?? '·'}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-xs ${
                        win.minimized ? 'text-white/35' : 'text-white/85'
                      }`}
                      title={win.title}
                    >
                      {win.title}
                      {win.minimized ? ' (minimizada)' : ''}
                    </span>
                    {win.id === windowId ? (
                      <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-white/45">
                        esta janela
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => useWindows.getState().focus(win.id)}
                        className="shrink-0 rounded-lg bg-white/10 px-2 py-0.5 text-[10px] opacity-0 transition-opacity hover:bg-white/15 focus:opacity-100 group-hover:opacity-100"
                      >
                        Focar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Armazenamento" badge="VFS + localStorage">
            {storage.error ? (
              <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-200/90">
                {storage.error}
              </p>
            ) : null}
            <div className="grid grid-cols-3 gap-2 text-center">
              <StatBox value={String(storage.files)} label="arquivos" />
              <StatBox value={String(storage.dirs)} label="pastas" />
              <StatBox value={formatBytes(storage.vfsBytes)} label="conteúdo" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-white/45">localStorage (fableos-*)</span>
                <span className="font-mono text-white/60">
                  {formatBytes(storage.lsBytes)} / 5 MB
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-500"
                  style={{ width: `${lsPercent}%` }}
                />
              </div>
              <span className="text-[10px] text-white/35">
                {lsPercent.toFixed(1)}% da cota aproximada de 5 MB
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

interface CardProps {
  title: string
  badge?: string
  children: ReactNode
}

function Card({ title, badge, children }: CardProps) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
      <header className="flex items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
          {title}
        </h2>
        {badge ? (
          <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/45">
            {badge}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  )
}

interface InfoRowProps {
  label: string
  value: string
  mono?: boolean
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="shrink-0 text-white/45">{label}</dt>
      <dd
        className={`truncate text-right text-white/85 ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  )
}

interface StatBoxProps {
  value: string
  label: string
}

function StatBox({ value, label }: StatBoxProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
      <div className="truncate font-mono text-base text-white/90">{value}</div>
      <div className="text-[10px] text-white/45">{label}</div>
    </div>
  )
}
