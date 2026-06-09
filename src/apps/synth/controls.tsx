import type { ReactNode } from 'react'
import type { Waveform } from './engine'

// ── Card de seção ───────────────────────────────────────────────────────────

interface CardProps {
  title: string
  children: ReactNode
}

export function Card({ title, children }: CardProps) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-3">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/35">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

// ── Slider rotulado ─────────────────────────────────────────────────────────

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  display: string
  onChange: (value: number) => void
}

export function Slider({ label, value, min, max, step, display, onChange }: SliderProps) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-white/60">{label}</span>
        <span className="font-mono text-[10px] text-white/35">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-4 w-full cursor-pointer accent-[var(--accent)]"
      />
    </label>
  )
}

// ── Seletor de forma de onda ────────────────────────────────────────────────

const WAVES: { id: Waveform; label: string }[] = [
  { id: 'sine', label: 'Sen' },
  { id: 'square', label: 'Quad' },
  { id: 'sawtooth', label: 'Serra' },
  { id: 'triangle', label: 'Tri' },
]

interface WaveSelectProps {
  label: string
  value: Waveform
  onChange: (wave: Waveform) => void
}

export function WaveSelect({ label, value, onChange }: WaveSelectProps) {
  return (
    <div>
      <span className="mb-1 block text-xs text-white/60">{label}</span>
      <div className="grid grid-cols-4 gap-1">
        {WAVES.map(wave => (
          <button
            key={wave.id}
            type="button"
            onClick={() => onChange(wave.id)}
            className={`rounded-md px-1 py-1 text-[10px] transition-colors ${
              value === wave.id
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/90'
            }`}
          >
            {wave.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Formatadores de valores ─────────────────────────────────────────────────

export function formatSeconds(value: number): string {
  return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function formatHz(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${Math.round(value)} Hz`
}

export function formatCents(value: number): string {
  return `${value > 0 ? '+' : ''}${Math.round(value)} ct`
}
