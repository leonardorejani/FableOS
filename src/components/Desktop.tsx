import { useEffect, useState } from 'react'
import type React from 'react'
import { useWindows } from '../system/windowStore'
import { useTheme, WALLPAPERS } from '../system/themeStore'
import { Wallpaper } from './Wallpaper'
import { Window } from './Window'
import { Taskbar } from './Taskbar'
import { StartMenu } from './StartMenu'
import { DesktopIcons } from './DesktopIcons'

interface MenuPos {
  x: number
  y: number
}

function ContextMenu({ pos, onClose }: { pos: MenuPos; onClose: () => void }) {
  const items: { label: string; action: () => void }[] = [
    { label: 'Novo terminal', action: () => useWindows.getState().openApp('terminal') },
    {
      label: 'Trocar wallpaper',
      action: () => {
        const theme = useTheme.getState()
        const idx = WALLPAPERS.findIndex(w => w.id === theme.wallpaper)
        theme.setWallpaper(WALLPAPERS[(idx + 1) % WALLPAPERS.length].id)
      },
    },
    { label: 'Ajustes', action: () => useWindows.getState().openApp('settings') },
    { label: 'Sobre o FableOS', action: () => useWindows.getState().openApp('about') },
  ]

  const x = Math.min(pos.x, window.innerWidth - 200)
  const y = Math.min(pos.y, window.innerHeight - 48 - items.length * 36 - 16)

  return (
    <div className="absolute inset-0 z-[9400]" onMouseDown={onClose} onContextMenu={e => e.preventDefault()}>
      <div
        className="slide-up absolute w-48 rounded-xl border border-white/15 bg-[#0a0c18]/95 p-1.5 shadow-2xl backdrop-blur-2xl"
        style={{ left: x, top: y }}
        onMouseDown={e => e.stopPropagation()}
      >
        {items.map(item => (
          <button
            key={item.label}
            className="flex w-full items-center rounded-lg px-3 py-2 text-left text-xs text-white/80 hover:bg-white/10 hover:text-white"
            onClick={() => {
              item.action()
              onClose()
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Desktop() {
  const windows = useWindows(s => s.windows)
  const accent = useTheme(s => s.accent)
  const [startOpen, setStartOpen] = useState(false)
  const [menu, setMenu] = useState<MenuPos | null>(null)

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', accent)
  }, [accent])

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const target = e.target as HTMLElement
    if (target.closest('[data-window],[data-taskbar],[data-startmenu]')) return
    setMenu({ x: e.clientX, y: e.clientY })
  }

  return (
    <div className="fade-in relative h-full w-full overflow-hidden" onContextMenu={onContextMenu}>
      <Wallpaper />
      <DesktopIcons />
      {windows.map(w => (
        <Window key={w.id} win={w} />
      ))}
      {menu && <ContextMenu pos={menu} onClose={() => setMenu(null)} />}
      {startOpen && <StartMenu onClose={() => setStartOpen(false)} />}
      <Taskbar onStart={() => setStartOpen(o => !o)} />
    </div>
  )
}
