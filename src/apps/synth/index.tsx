import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppProps } from '../../system/types'
import { useTheme } from '../../system/themeStore'
import {
  DEFAULT_PARAMS,
  SynthEngine,
  createDemoPattern,
  createEmptyPattern,
} from './engine'
import type { SynthParams } from './engine'
import { Card, Slider, WaveSelect, formatCents, formatHz, formatPercent, formatSeconds } from './controls'
import { Keyboard } from './Keyboard'
import { Sequencer } from './Sequencer'
import { Visualizer } from './Visualizer'

// Mapeamento físico (e.code) → nota MIDI, independente de layout.
const KEY_CODE_TO_MIDI = new Map<string, number>([
  ['KeyA', 60],
  ['KeyW', 61],
  ['KeyS', 62],
  ['KeyE', 63],
  ['KeyD', 64],
  ['KeyF', 65],
  ['KeyT', 66],
  ['KeyG', 67],
  ['KeyY', 68],
  ['KeyH', 69],
  ['KeyU', 70],
  ['KeyJ', 71],
  ['KeyK', 72],
  ['KeyO', 73],
  ['KeyL', 74],
  ['KeyP', 75],
  ['Semicolon', 76],
])

const KEY_HINTS = new Map<number, string>([
  [60, 'A'],
  [61, 'W'],
  [62, 'S'],
  [63, 'E'],
  [64, 'D'],
  [65, 'F'],
  [66, 'T'],
  [67, 'G'],
  [68, 'Y'],
  [69, 'H'],
  [70, 'U'],
  [71, 'J'],
  [72, 'K'],
  [73, 'O'],
  [74, 'L'],
  [75, 'P'],
  [76, 'Ç'],
])

// Corte do filtro em escala logarítmica: 100 Hz × 120^v (v ∈ [0,1]) → 100–12000 Hz.
const CUTOFF_RATIO = 120
const CUTOFF_MIN = 100

function cutoffToNorm(freq: number): number {
  return Math.log(freq / CUTOFF_MIN) / Math.log(CUTOFF_RATIO)
}

function normToCutoff(norm: number): number {
  return CUTOFF_MIN * Math.pow(CUTOFF_RATIO, norm)
}

export default function SynthApp(_props: AppProps) {
  const engineRef = useRef<SynthEngine | null>(null)
  if (engineRef.current === null) engineRef.current = new SynthEngine()
  const engine = engineRef.current

  const rootRef = useRef<HTMLDivElement | null>(null)
  const accent = useTheme(s => s.accent)

  const [params, setParams] = useState<SynthParams>(DEFAULT_PARAMS)
  const [pattern, setPattern] = useState<boolean[][]>(createEmptyPattern)
  const [bpm, setBpm] = useState(120)
  const [playing, setPlaying] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [audioReady, setAudioReady] = useState(false)
  const [audioError, setAudioError] = useState(false)
  const [pressed, setPressed] = useState<ReadonlySet<number>>(() => new Set<number>())

  // ── Sincronização engine ↔ estado ──────────────────────────────────────────

  useEffect(() => {
    engine.updateParams(params)
  }, [engine, params])

  useEffect(() => {
    engine.setPattern(pattern)
  }, [engine, pattern])

  useEffect(() => {
    engine.setBpm(bpm)
  }, [engine, bpm])

  useEffect(() => {
    engine.onStep = step => setCurrentStep(step)
    return () => {
      engine.onStep = null
      engine.dispose()
    }
  }, [engine])

  // ── Ativação do áudio (gesto do usuário) ───────────────────────────────────

  const activateAudio = useCallback((): boolean => {
    const ok = engine.ensureContext()
    if (ok) setAudioReady(true)
    else setAudioError(true)
    return ok
  }, [engine])

  // ── Notas ──────────────────────────────────────────────────────────────────

  const handleNoteOn = useCallback(
    (midi: number) => {
      if (!activateAudio()) return
      engine.noteOn(midi)
      setPressed(prev => {
        const next = new Set(prev)
        next.add(midi)
        return next
      })
    },
    [activateAudio, engine],
  )

  const handleNoteOff = useCallback(
    (midi: number) => {
      engine.noteOff(midi)
      setPressed(prev => {
        if (!prev.has(midi)) return prev
        const next = new Set(prev)
        next.delete(midi)
        return next
      })
    },
    [engine],
  )

  // ── Transporte ─────────────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    if (engine.playing) {
      engine.stopSequencer()
      setPlaying(false)
      return
    }
    if (!activateAudio()) return
    if (engine.startSequencer()) setPlaying(true)
  }, [activateAudio, engine])

  const handleClear = useCallback(() => {
    const empty = createEmptyPattern()
    engine.setPattern(empty)
    setPattern(empty)
  }, [engine])

  const handleDemo = useCallback(() => {
    const demo = createDemoPattern()
    engine.setPattern(demo)
    setPattern(demo)
    engine.setBpm(124)
    setBpm(124)
    if (!engine.playing) {
      if (!activateAudio()) return
      if (engine.startSequencer()) setPlaying(true)
    }
  }, [activateAudio, engine])

  const toggleCell = useCallback((track: number, step: number) => {
    setPattern(prev => prev.map((row, t) => (t === track ? row.map((cell, s) => (s === step ? !cell : cell)) : row)))
  }, [])

  // ── Teclado físico (com guarda de repeat e de foco) ────────────────────────

  const noteOnRef = useRef(handleNoteOn)
  const noteOffRef = useRef(handleNoteOff)
  const togglePlayRef = useRef(togglePlay)
  noteOnRef.current = handleNoteOn
  noteOffRef.current = handleNoteOff
  togglePlayRef.current = togglePlay

  useEffect(() => {
    const held = new Set<string>()

    const hasFocus = (): boolean => {
      const root = rootRef.current
      return root !== null && document.activeElement !== null && root.contains(document.activeElement)
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!hasFocus()) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) togglePlayRef.current()
        return
      }
      const midi = KEY_CODE_TO_MIDI.get(e.code)
      if (midi === undefined) return
      e.preventDefault()
      if (e.repeat || held.has(e.code)) return
      held.add(e.code)
      noteOnRef.current(midi)
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      if (!held.has(e.code)) return
      held.delete(e.code)
      const midi = KEY_CODE_TO_MIDI.get(e.code)
      if (midi !== undefined) noteOffRef.current(midi)
    }

    const releaseHeld = (): void => {
      for (const code of held) {
        const midi = KEY_CODE_TO_MIDI.get(code)
        if (midi !== undefined) noteOffRef.current(midi)
      }
      held.clear()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', releaseHeld)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', releaseHeld)
      releaseHeld()
    }
  }, [])

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  // ── Parâmetros ─────────────────────────────────────────────────────────────

  const setParam = useCallback(<K extends keyof SynthParams>(key: K, value: SynthParams[K]) => {
    setParams(prev => ({ ...prev, [key]: value }))
  }, [])

  const cutoffNorm = useMemo(() => cutoffToNorm(params.cutoff), [params.cutoff])

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onPointerDownCapture={activateAudio}
      className="flex h-full w-full flex-col bg-black/20 text-white/90 outline-none"
    >
      {!audioReady && (
        <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
          {audioError
            ? 'Não foi possível iniciar o áudio neste navegador.'
            : 'Clique em qualquer lugar ou toque uma tecla para ativar o áudio.'}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Coluna esquerda: controles do sintetizador */}
        <div className="w-60 shrink-0 space-y-2 overflow-y-auto border-r border-white/10 p-2">
          <Card title="Osciladores">
            <WaveSelect label="Osc 1" value={params.osc1Wave} onChange={w => setParam('osc1Wave', w)} />
            <WaveSelect label="Osc 2" value={params.osc2Wave} onChange={w => setParam('osc2Wave', w)} />
            <Slider
              label="Detune Osc 2"
              value={params.osc2Detune}
              min={-100}
              max={100}
              step={1}
              display={formatCents(params.osc2Detune)}
              onChange={v => setParam('osc2Detune', v)}
            />
            <Slider
              label="Mix Osc 1 / 2"
              value={params.osc2Mix}
              min={0}
              max={1}
              step={0.01}
              display={formatPercent(params.osc2Mix)}
              onChange={v => setParam('osc2Mix', v)}
            />
          </Card>

          <Card title="Envelope (ADSR)">
            <Slider
              label="Ataque"
              value={params.attack}
              min={0}
              max={2}
              step={0.005}
              display={formatSeconds(params.attack)}
              onChange={v => setParam('attack', v)}
            />
            <Slider
              label="Decaimento"
              value={params.decay}
              min={0}
              max={2}
              step={0.005}
              display={formatSeconds(params.decay)}
              onChange={v => setParam('decay', v)}
            />
            <Slider
              label="Sustentação"
              value={params.sustain}
              min={0}
              max={1}
              step={0.01}
              display={formatPercent(params.sustain)}
              onChange={v => setParam('sustain', v)}
            />
            <Slider
              label="Liberação"
              value={params.release}
              min={0}
              max={3}
              step={0.005}
              display={formatSeconds(params.release)}
              onChange={v => setParam('release', v)}
            />
          </Card>

          <Card title="Filtro lowpass">
            <Slider
              label="Corte"
              value={cutoffNorm}
              min={0}
              max={1}
              step={0.001}
              display={formatHz(params.cutoff)}
              onChange={v => setParam('cutoff', normToCutoff(v))}
            />
            <Slider
              label="Ressonância"
              value={params.resonance}
              min={0.1}
              max={20}
              step={0.1}
              display={params.resonance.toFixed(1)}
              onChange={v => setParam('resonance', v)}
            />
          </Card>

          <Card title="Delay">
            <Slider
              label="Tempo"
              value={params.delayTime}
              min={0}
              max={0.8}
              step={0.005}
              display={formatSeconds(params.delayTime)}
              onChange={v => setParam('delayTime', v)}
            />
            <Slider
              label="Realimentação"
              value={params.delayFeedback}
              min={0}
              max={0.85}
              step={0.01}
              display={formatPercent(params.delayFeedback)}
              onChange={v => setParam('delayFeedback', v)}
            />
            <Slider
              label="Envio"
              value={params.delayMix}
              min={0}
              max={1}
              step={0.01}
              display={formatPercent(params.delayMix)}
              onChange={v => setParam('delayMix', v)}
            />
          </Card>

          <Card title="Saída">
            <Slider
              label="Volume master"
              value={params.masterVolume}
              min={0}
              max={1}
              step={0.01}
              display={formatPercent(params.masterVolume)}
              onChange={v => setParam('masterVolume', v)}
            />
          </Card>
        </div>

        {/* Coluna direita: visualizador + sequenciador */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-2">
          <div className="relative h-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/40">
            <span className="absolute left-2 top-1.5 z-10 text-[10px] uppercase tracking-wider text-white/35">
              Visualizador
            </span>
            <Visualizer engine={engine} accent={accent} />
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-white/10 bg-white/5 p-3">
            <Sequencer
              pattern={pattern}
              currentStep={currentStep}
              playing={playing}
              bpm={bpm}
              onToggleCell={toggleCell}
              onTogglePlay={togglePlay}
              onClear={handleClear}
              onDemo={handleDemo}
              onBpmChange={setBpm}
            />
          </div>
        </div>
      </div>

      {/* Teclado na largura toda */}
      <div className="h-36 shrink-0 px-2 pb-2">
        <Keyboard pressed={pressed} hints={KEY_HINTS} onNoteOn={handleNoteOn} onNoteOff={handleNoteOff} />
      </div>
    </div>
  )
}
