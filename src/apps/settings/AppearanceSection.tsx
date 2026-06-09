import { ACCENT_PRESETS, useTheme } from '../../system/themeStore'
import { CheckIcon } from './icons'

function toColorInputValue(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#7c6cff'
}

export function AppearanceSection() {
  const accent = useTheme(s => s.accent)
  const setAccent = useTheme(s => s.setAccent)

  return (
    <section className="space-y-7">
      <header>
        <h2 className="text-sm font-semibold text-white/90">Aparência</h2>
        <p className="mt-0.5 text-xs text-white/50">
          A cor de destaque é aplicada na hora em todo o sistema — sem botão salvar.
        </p>
      </header>

      <div>
        <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-white/40">
          Cor de destaque
        </h3>
        <div className="flex flex-wrap gap-3">
          {ACCENT_PRESETS.map(preset => {
            const active = preset.toLowerCase() === accent.toLowerCase()
            return (
              <button
                key={preset}
                type="button"
                title={preset.toUpperCase()}
                aria-label={`Usar a cor ${preset.toUpperCase()}`}
                aria-pressed={active}
                onClick={() => setAccent(preset)}
                className={`relative h-11 w-11 rounded-full transition-transform duration-150 hover:scale-110 focus-visible:scale-110 focus-visible:outline-none ${
                  active ? 'ring-2 ring-white' : 'ring-1 ring-white/15 hover:ring-white/40'
                }`}
                style={{ backgroundColor: preset }}
              >
                {active && (
                  <CheckIcon className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-white/40">
          Cor personalizada
        </h3>
        <label className="flex w-fit cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition-colors hover:bg-white/10">
          <span
            className="relative h-7 w-7 overflow-hidden rounded-full ring-1 ring-white/25"
            style={{ backgroundColor: accent }}
          >
            <input
              type="color"
              value={toColorInputValue(accent)}
              onChange={e => setAccent(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Escolher cor personalizada"
            />
          </span>
          <span className="text-xs text-white/70">Escolher qualquer cor</span>
          <span className="font-mono text-xs text-white/45">{accent.toUpperCase()}</span>
        </label>
      </div>

      <div>
        <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-white/40">
          Pré-visualização ao vivo
        </h3>
        <div className="max-w-sm overflow-hidden rounded-xl border border-white/10 bg-[#14161f] shadow-2xl">
          <div className="flex h-8 items-center gap-1.5 border-b border-white/10 bg-white/5 px-3">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
            <span className="ml-2 truncate text-[11px] text-white/55">Minha janela — FableOS</span>
          </div>
          <div className="space-y-3 p-4">
            <div className="h-2 w-3/4 rounded bg-white/10" />
            <div className="h-2 w-1/2 rounded bg-white/10" />
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full w-2/3 rounded-full transition-colors"
                style={{ backgroundColor: accent }}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors"
                style={{ backgroundColor: accent }}
              >
                Botão principal
              </span>
              <span className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/70">
                Secundário
              </span>
              <span
                className="ml-auto flex h-5 w-9 items-center rounded-full p-0.5 transition-colors"
                style={{ backgroundColor: accent }}
              >
                <span className="ml-auto h-4 w-4 rounded-full bg-white shadow" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
