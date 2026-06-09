import { create } from 'zustand'

export interface WallpaperDef {
  id: string
  name: string
  preview: string
}

export const WALLPAPERS: WallpaperDef[] = [
  { id: 'aurora', name: 'Aurora', preview: 'linear-gradient(160deg,#03102a,#0b4d3a,#5b2a86)' },
  { id: 'nebula', name: 'Nebulosa', preview: 'linear-gradient(160deg,#0a0118,#3b1054,#a3326e)' },
  { id: 'gridwave', name: 'Synthwave', preview: 'linear-gradient(180deg,#160029,#ff2975 60%,#ffb35c)' },
  { id: 'dusk', name: 'Entardecer', preview: 'linear-gradient(180deg,#1b1033,#c94f6d,#f2a65a)' },
]

export const ACCENT_PRESETS = [
  '#7c6cff',
  '#22d3ee',
  '#34d399',
  '#f472b6',
  '#f59e0b',
  '#ef4444',
  '#60a5fa',
  '#e879f9',
]

const STORAGE_KEY = 'fableos-theme-v1'

interface ThemeState {
  accent: string
  wallpaper: string
  setAccent: (color: string) => void
  setWallpaper: (id: string) => void
}

interface PersistedTheme {
  accent?: string
  wallpaper?: string
}

function loadTheme(): PersistedTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PersistedTheme
  } catch {
    // ignora estado corrompido
  }
  return {}
}

function saveTheme(theme: PersistedTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
  } catch {
    // ignora quota
  }
}

const initial = loadTheme()

export const useTheme = create<ThemeState>()((set, get) => ({
  accent: initial.accent ?? '#7c6cff',
  wallpaper: initial.wallpaper ?? 'aurora',
  setAccent: color => {
    set({ accent: color })
    saveTheme({ accent: color, wallpaper: get().wallpaper })
  },
  setWallpaper: id => {
    set({ wallpaper: id })
    saveTheme({ accent: get().accent, wallpaper: id })
  },
}))
