import { useEffect, useRef, useState } from 'react'
import { APP_META } from '../system/apps'
import { useWindows } from '../system/windowStore'

export function StartMenu({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = query.trim().toLowerCase()
  const apps = APP_META.filter(
    a => !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q),
  )

  return (
    <div data-startmenu className="absolute inset-0 z-[9500]" onMouseDown={onClose}>
      <div
        className="slide-up absolute bottom-14 left-2 flex w-[560px] max-w-[calc(100vw-16px)] flex-col gap-3 rounded-2xl border border-white/15 bg-[#0a0c18]/90 p-4 shadow-2xl shadow-black/60 backdrop-blur-2xl"
        onMouseDown={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar aplicativos…"
          className="h-10 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-[var(--accent)]"
          onKeyDown={e => {
            if (e.key === 'Enter' && apps.length > 0) {
              useWindows.getState().openApp(apps[0].id)
              onClose()
            }
          }}
        />

        <div className="grid max-h-80 grid-cols-4 gap-1 overflow-y-auto">
          {apps.map(app => (
            <button
              key={app.id}
              className="flex flex-col items-center gap-2 rounded-xl p-3 text-center transition-colors hover:bg-white/8"
              onClick={() => {
                useWindows.getState().openApp(app.id)
                onClose()
              }}
              title={app.description}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl"
                style={{ background: `${app.tint}22`, border: `1px solid ${app.tint}44` }}
              >
                {app.icon}
              </span>
              <span className="text-xs text-white/80">{app.name}</span>
            </button>
          ))}
          {apps.length === 0 && (
            <div className="col-span-4 py-8 text-center text-sm text-white/35">
              Nenhum app encontrado
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 pt-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[#22d3ee] text-xs font-bold text-white">
              U
            </span>
            <span className="text-xs text-white/60">usuario@fableos</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/30">FableOS 1.0 · Claude Fable 5</span>
            <button
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
              onClick={() => location.reload()}
              title="Reiniciar"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path
                  d="M12 7A5 5 0 1 1 7 2c1.8 0 3.4 1 4.3 2.4M11.5 1.5v3h-3"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
