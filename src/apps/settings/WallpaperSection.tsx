import { WALLPAPERS, useTheme } from '../../system/themeStore'
import { BoltIcon, CheckIcon } from './icons'

export function WallpaperSection() {
  const wallpaper = useTheme(s => s.wallpaper)
  const setWallpaper = useTheme(s => s.setWallpaper)

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-sm font-semibold text-white/90">Wallpaper</h2>
        <p className="mt-0.5 text-xs text-white/50">
          Escolha o plano de fundo da área de trabalho. A troca é imediata.
        </p>
      </header>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
        {WALLPAPERS.map(item => {
          const active = item.id === wallpaper
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setWallpaper(item.id)}
              aria-pressed={active}
              aria-label={`Aplicar wallpaper ${item.name}`}
              className="group text-left focus-visible:outline-none"
            >
              <div
                className={`relative aspect-video w-full overflow-hidden rounded-lg border transition ${
                  active
                    ? 'border-transparent ring-2 ring-[var(--accent)]'
                    : 'border-white/10 group-hover:border-white/30 group-focus-visible:border-white/40'
                }`}
                style={{ background: item.preview }}
              >
                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                {active && (
                  <span className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] shadow-lg">
                    <CheckIcon className="h-3 w-3 text-white" />
                  </span>
                )}
              </div>
              <div
                className={`mt-1.5 text-xs transition-colors ${
                  active ? 'font-medium text-white/90' : 'text-white/60 group-hover:text-white/85'
                }`}
              >
                {item.name}
              </div>
            </button>
          )
        })}
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-white/40">
        <BoltIcon className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
        Os wallpapers são renderizados ao vivo em WebGL — os cards acima são uma prévia em CSS.
      </p>
    </section>
  )
}
