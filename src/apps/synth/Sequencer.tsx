import { NUM_STEPS } from './engine'

const TRACK_NAMES = ['Bumbo', 'Caixa', 'Chimbal', 'Baixo']

interface SequencerProps {
  pattern: boolean[][]
  currentStep: number
  playing: boolean
  bpm: number
  onToggleCell: (track: number, step: number) => void
  onTogglePlay: () => void
  onClear: () => void
  onDemo: () => void
  onBpmChange: (bpm: number) => void
}

function cellClass(active: boolean, current: boolean, beatAlt: boolean): string {
  const base = 'h-8 min-w-0 rounded-md transition-all duration-75 '
  if (active) {
    return base + (current ? 'bg-[var(--accent)] brightness-125 shadow-[0_0_10px_var(--accent)]' : 'bg-[var(--accent)] hover:opacity-85')
  }
  if (current) return base + 'bg-white/25'
  return base + (beatAlt ? 'bg-white/[0.04] hover:bg-white/15' : 'bg-white/10 hover:bg-white/20')
}

/** Sequenciador 16 passos × 4 trilhas com transporte. */
export function Sequencer({
  pattern,
  currentStep,
  playing,
  bpm,
  onToggleCell,
  onTogglePlay,
  onClear,
  onDemo,
  onBpmChange,
}: SequencerProps) {
  const steps = Array.from({ length: NUM_STEPS }, (_, i) => i)
  const isEmpty = pattern.every(row => row.every(cell => !cell))

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onTogglePlay}
          className={`rounded-lg px-4 py-1.5 text-xs font-semibold text-white transition-colors ${
            playing ? 'bg-white/10 hover:bg-white/15' : 'bg-[var(--accent)] hover:opacity-90'
          }`}
        >
          {playing ? 'Parar' : 'Tocar'}
        </button>
        <div className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1">
          <span className="text-[10px] uppercase tracking-wider text-white/35">BPM</span>
          <input
            type="range"
            min={60}
            max={180}
            step={1}
            value={bpm}
            onChange={e => onBpmChange(Number(e.target.value))}
            className="h-4 w-28 cursor-pointer accent-[var(--accent)]"
          />
          <span className="w-7 text-right font-mono text-xs text-white/60">{bpm}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onDemo}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15"
          >
            Demo
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={isEmpty}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/90 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Limpar
          </button>
        </div>
      </div>

      <div
        className="grid flex-1 content-start gap-1"
        style={{ gridTemplateColumns: `56px repeat(${NUM_STEPS}, minmax(0, 1fr))` }}
      >
        <div />
        {steps.map(step => (
          <div
            key={`ind-${step}`}
            className={`h-1 self-center rounded-full transition-colors duration-75 ${
              step === currentStep ? 'bg-[var(--accent)]' : 'bg-white/10'
            }`}
          />
        ))}
        {pattern.map((row, track) => (
          <TrackRow
            key={TRACK_NAMES[track] ?? track}
            name={TRACK_NAMES[track] ?? `Trilha ${track + 1}`}
            row={row}
            track={track}
            currentStep={currentStep}
            onToggleCell={onToggleCell}
          />
        ))}
      </div>

      {isEmpty && !playing && (
        <p className="text-center text-xs text-white/35">
          Padrão vazio — clique nas células para criar um groove, ou carregue a Demo.
        </p>
      )}
    </div>
  )
}

interface TrackRowProps {
  name: string
  row: boolean[]
  track: number
  currentStep: number
  onToggleCell: (track: number, step: number) => void
}

function TrackRow({ name, row, track, currentStep, onToggleCell }: TrackRowProps) {
  return (
    <>
      <span className="self-center truncate pr-1 text-xs text-white/60">{name}</span>
      {row.map((active, step) => (
        <button
          key={step}
          type="button"
          aria-label={`${name}, passo ${step + 1}${active ? ', ativo' : ''}`}
          onClick={() => onToggleCell(track, step)}
          className={cellClass(active, step === currentStep, Math.floor(step / 4) % 2 === 1)}
        />
      ))}
    </>
  )
}
