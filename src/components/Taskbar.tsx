import { useEffect, useState } from 'react'
import { useWindows } from '../system/windowStore'
import { getAppMeta } from '../system/apps'

function Clock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col items-end justify-center px-3 leading-tight">
      <span className="text-xs font-medium text-white/90">
        {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </span>
      <span className="text-[10px] text-white/45">
        {now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
      </span>
    </div>
  )
}

export function Taskbar({ onStart }: { onStart: () => void }) {
  const windows = useWindows(s => s.windows)
  const focusedId = useWindows(s => s.focusedId)

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void document.documentElement.requestFullscreen()
    }
  }

  return (
    <div
      data-taskbar
      className="absolute bottom-0 left-0 right-0 z-[9000] flex h-12 items-center gap-2 border-t border-white/10 bg-[#070811]/80 px-2 backdrop-blur-xl"
    >
      <button
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent)] to-[#22d3ee] text-base font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        onClick={onStart}
        title="Iniciar"
      >
        F
      </button>

      <div className="h-6 w-px bg-white/10" />

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {windows.map(w => {
          const meta = getAppMeta(w.appId)
          const active = focusedId === w.id && !w.minimized
          return (
            <button
              key={w.id}
              className={`group flex h-9 max-w-44 shrink-0 items-center gap-2 rounded-lg px-2.5 text-xs transition-colors ${
                active
                  ? 'bg-white/15 text-white'
                  : 'text-white/60 hover:bg-white/8 hover:text-white/90'
              }`}
              onClick={() => {
                const store = useWindows.getState()
                if (active) store.minimize(w.id)
                else store.focus(w.id)
              }}
              title={w.title}
            >
              <span className="text-sm leading-none">{meta?.icon ?? '🪟'}</span>
              <span className="truncate">{w.title}</span>
              <span
                className={`ml-auto h-1 w-1 shrink-0 rounded-full ${
                  active ? 'bg-[var(--accent)]' : w.minimized ? 'bg-white/25' : 'bg-white/50'
                }`}
              />
            </button>
          )
        })}
      </div>

      <button
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
        onClick={toggleFullscreen}
        title="Tela cheia"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M1.5 5V1.5H5M9 1.5h3.5V5M12.5 9v3.5H9M5 12.5H1.5V9"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <Clock />
    </div>
  )
}
