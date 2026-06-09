import { create } from 'zustand'
import type { Bounds, WindowState } from './types'
import { getAppMeta } from './apps'

export const TASKBAR_HEIGHT = 48

interface OpenOptions {
  payload?: unknown
  title?: string
}

interface WindowStore {
  windows: WindowState[]
  focusedId: string | null
  openApp: (appId: string, options?: OpenOptions) => string
  close: (id: string) => void
  focus: (id: string) => void
  minimize: (id: string) => void
  toggleMaximize: (id: string) => void
  setBounds: (id: string, bounds: Partial<Bounds>) => void
  setTitle: (id: string, title: string) => void
}

let zCounter = 10
let idCounter = 0

export const useWindows = create<WindowStore>()((set, get) => ({
  windows: [],
  focusedId: null,

  openApp: (appId, options) => {
    const meta = getAppMeta(appId)
    if (!meta) throw new Error(`App desconhecido: ${appId}`)
    const id = `win-${++idCounter}`
    const vw = window.innerWidth
    const vh = window.innerHeight - TASKBAR_HEIGHT
    const width = Math.min(meta.defaultSize.width, vw - 24)
    const height = Math.min(meta.defaultSize.height, vh - 24)
    const offset = (get().windows.length % 7) * 28
    const x = Math.max(8, Math.min(90 + offset, vw - width - 8))
    const y = Math.max(8, Math.min(48 + offset, vh - height - 8))
    const win: WindowState = {
      id,
      appId,
      title: options?.title ?? meta.name,
      x,
      y,
      width,
      height,
      zIndex: ++zCounter,
      minimized: false,
      maximized: false,
      payload: options?.payload,
    }
    set(s => ({ windows: [...s.windows, win], focusedId: id }))
    return id
  },

  close: id =>
    set(s => ({
      windows: s.windows.filter(w => w.id !== id),
      focusedId: s.focusedId === id ? null : s.focusedId,
    })),

  focus: id =>
    set(s => ({
      windows: s.windows.map(w =>
        w.id === id ? { ...w, zIndex: ++zCounter, minimized: false } : w,
      ),
      focusedId: id,
    })),

  minimize: id =>
    set(s => ({
      windows: s.windows.map(w => (w.id === id ? { ...w, minimized: true } : w)),
      focusedId: s.focusedId === id ? null : s.focusedId,
    })),

  toggleMaximize: id =>
    set(s => ({
      windows: s.windows.map(w => {
        if (w.id !== id) return w
        if (w.maximized) {
          const prev = w.prevBounds ?? { x: 90, y: 48, width: 800, height: 500 }
          return { ...w, maximized: false, ...prev, zIndex: ++zCounter }
        }
        return {
          ...w,
          maximized: true,
          prevBounds: { x: w.x, y: w.y, width: w.width, height: w.height },
          zIndex: ++zCounter,
        }
      }),
      focusedId: id,
    })),

  setBounds: (id, bounds) =>
    set(s => ({
      windows: s.windows.map(w => (w.id === id ? { ...w, ...bounds } : w)),
    })),

  setTitle: (id, title) =>
    set(s => ({
      windows: s.windows.map(w => (w.id === id ? { ...w, title } : w)),
    })),
}))
