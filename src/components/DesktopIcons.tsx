import { useState } from 'react'
import { APP_META } from '../system/apps'
import { useWindows } from '../system/windowStore'

export function DesktopIcons() {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div
      className="absolute bottom-12 left-0 top-0 flex w-full flex-col flex-wrap content-start gap-1 p-3"
      onClick={e => {
        if (e.target === e.currentTarget) setSelected(null)
      }}
    >
      {APP_META.filter(a => a.desktop).map(app => (
        <button
          key={app.id}
          className={`flex w-20 flex-col items-center gap-1.5 rounded-lg p-2 transition-colors ${
            selected === app.id ? 'bg-white/15 ring-1 ring-white/25' : 'hover:bg-white/8'
          }`}
          onClick={() => setSelected(app.id)}
          onDoubleClick={() => {
            useWindows.getState().openApp(app.id)
            setSelected(null)
          }}
          title={app.description}
        >
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl shadow-lg"
            style={{ background: `${app.tint}26`, border: `1px solid ${app.tint}55` }}
          >
            {app.icon}
          </span>
          <span className="line-clamp-2 text-center text-[11px] leading-tight text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {app.name}
          </span>
        </button>
      ))}
    </div>
  )
}
