import { Suspense } from 'react'
import type React from 'react'
import type { WindowState } from '../system/types'
import { useWindows, TASKBAR_HEIGHT } from '../system/windowStore'
import { getAppMeta } from '../system/apps'
import { APP_COMPONENTS } from '../system/registry'

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLES: { dir: ResizeDir; className: string }[] = [
  { dir: 'n', className: 'top-0 left-2 right-2 h-1.5 cursor-n-resize' },
  { dir: 's', className: 'bottom-0 left-2 right-2 h-1.5 cursor-s-resize' },
  { dir: 'e', className: 'right-0 top-2 bottom-2 w-1.5 cursor-e-resize' },
  { dir: 'w', className: 'left-0 top-2 bottom-2 w-1.5 cursor-w-resize' },
  { dir: 'ne', className: 'top-0 right-0 h-3 w-3 cursor-ne-resize' },
  { dir: 'nw', className: 'top-0 left-0 h-3 w-3 cursor-nw-resize' },
  { dir: 'se', className: 'bottom-0 right-0 h-3 w-3 cursor-se-resize' },
  { dir: 'sw', className: 'bottom-0 left-0 h-3 w-3 cursor-sw-resize' },
]

function Spinner() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[var(--accent)]" />
    </div>
  )
}

export function Window({ win }: { win: WindowState }) {
  const focused = useWindows(s => s.focusedId === win.id)
  const meta = getAppMeta(win.appId)
  const Comp = APP_COMPONENTS[win.appId]

  const startDrag = (e: React.PointerEvent) => {
    if (win.maximized || e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    const orig = { x: win.x, y: win.y }
    const onMove = (ev: PointerEvent) => {
      const nx = orig.x + ev.clientX - startX
      const ny = orig.y + ev.clientY - startY
      useWindows.getState().setBounds(win.id, {
        x: Math.min(Math.max(nx, -win.width + 120), window.innerWidth - 120),
        y: Math.min(Math.max(ny, 0), window.innerHeight - TASKBAR_HEIGHT - 36),
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startResize = (dir: ResizeDir) => (e: React.PointerEvent) => {
    e.stopPropagation()
    if (win.maximized || e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    const orig = { x: win.x, y: win.y, width: win.width, height: win.height }
    const min = meta?.minSize ?? { width: 320, height: 240 }
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const b = { ...orig }
      if (dir.includes('e')) b.width = Math.max(min.width, orig.width + dx)
      if (dir.includes('s')) b.height = Math.max(min.height, orig.height + dy)
      if (dir.includes('w')) {
        const w2 = Math.max(min.width, orig.width - dx)
        b.x = orig.x + (orig.width - w2)
        b.width = w2
      }
      if (dir.includes('n')) {
        const h2 = Math.max(min.height, orig.height - dy)
        b.y = Math.max(0, orig.y + (orig.height - h2))
        b.height = h2
      }
      useWindows.getState().setBounds(win.id, b)
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const style: React.CSSProperties = win.maximized
    ? { left: 0, top: 0, width: '100%', height: `calc(100% - ${TASKBAR_HEIGHT}px)`, zIndex: win.zIndex }
    : { left: win.x, top: win.y, width: win.width, height: win.height, zIndex: win.zIndex }

  return (
    <div
      data-window
      className={`win-open absolute flex flex-col overflow-hidden border bg-[#0b0d1a]/85 shadow-2xl backdrop-blur-xl ${
        win.maximized ? 'rounded-none' : 'rounded-xl'
      } ${focused ? 'border-white/20 shadow-black/60' : 'border-white/10 shadow-black/30'} ${
        win.minimized ? 'hidden' : ''
      }`}
      style={style}
      onPointerDown={() => useWindows.getState().focus(win.id)}
    >
      <div
        className={`flex h-9 shrink-0 items-center gap-2 border-b border-white/5 px-3 ${
          focused ? 'bg-white/5' : 'bg-transparent'
        }`}
        onPointerDown={startDrag}
        onDoubleClick={() => useWindows.getState().toggleMaximize(win.id)}
      >
        <span className="text-sm leading-none">{meta?.icon ?? '🪟'}</span>
        <span className={`flex-1 truncate text-xs font-medium ${focused ? 'text-white/90' : 'text-white/50'}`}>
          {win.title}
        </span>
        <div className="flex items-center gap-1" onPointerDown={e => e.stopPropagation()}>
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
            onClick={() => useWindows.getState().minimize(win.id)}
            title="Minimizar"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M1 5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"
            onClick={() => useWindows.getState().toggleMaximize(win.id)}
            title={win.maximized ? 'Restaurar' : 'Maximizar'}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <rect x="1.5" y="1.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
          <button
            className="flex h-6 w-6 items-center justify-center rounded-md text-white/60 hover:bg-red-500/80 hover:text-white"
            onClick={() => useWindows.getState().close(win.id)}
            title="Fechar"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <Suspense fallback={<Spinner />}>
          {Comp ? <Comp windowId={win.id} payload={win.payload} /> : <Spinner />}
        </Suspense>
      </div>

      {!win.maximized &&
        HANDLES.map(h => (
          <div key={h.dir} className={`absolute z-10 ${h.className}`} onPointerDown={startResize(h.dir)} />
        ))}
    </div>
  )
}
