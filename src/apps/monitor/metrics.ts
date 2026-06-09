// Utilitários de medição, leitura de APIs do navegador e formatação
// usados pelo Monitor do sistema.

import { stats } from '../../system/vfs'

export const LOCALSTORAGE_BUDGET = 5 * 1024 * 1024 // ~5 MB de cota típica

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim()
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map(c => c + c)
          .join('')
      : clean
  const num = Number.parseInt(full, 16)
  if (full.length !== 6 || Number.isNaN(num)) {
    return `rgba(124, 108, 255, ${alpha})`
  }
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = -1
  do {
    value /= 1024
    unit += 1
  } while (value >= 1024 && unit < units.length - 1)
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`
}

export function formatUptime(totalSeconds: number): string {
  const total = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

export interface RealMemory {
  used: number
  total: number
}

interface PerformanceMemoryInfo {
  usedJSHeapSize: number
  totalJSHeapSize: number
  jsHeapSizeLimit: number
}

/** Lê performance.memory (apenas Chromium). Retorna null quando indisponível. */
export function readRealMemory(): RealMemory | null {
  try {
    const perf = performance as Performance & { memory?: PerformanceMemoryInfo }
    const memory = perf.memory
    if (
      !memory ||
      typeof memory.usedJSHeapSize !== 'number' ||
      typeof memory.totalJSHeapSize !== 'number' ||
      memory.totalJSHeapSize <= 0
    ) {
      return null
    }
    return { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize }
  } catch {
    return null
  }
}

/** Identifica navegador + versão principal a partir do userAgent. */
export function parseBrowser(userAgent: string): string {
  const rules: { name: string; regex: RegExp }[] = [
    { name: 'Edge', regex: /Edg(?:e|A|iOS)?\/([\d.]+)/ },
    { name: 'Firefox', regex: /Firefox\/([\d.]+)/ },
    { name: 'Chrome', regex: /Chrome\/([\d.]+)/ },
    { name: 'Safari', regex: /Version\/([\d.]+).*Safari/ },
  ]
  for (const rule of rules) {
    const match = userAgent.match(rule.regex)
    if (match && match[1]) {
      const major = match[1].split('.')[0]
      return `${rule.name} ${major}`
    }
  }
  return 'Desconhecido'
}

interface NavigatorUAData {
  platform?: string
}

export function getPlatformName(): string {
  try {
    const nav = navigator as Navigator & { userAgentData?: NavigatorUAData }
    const fromUaData = nav.userAgentData?.platform
    if (fromUaData) return fromUaData
    if (navigator.platform) return navigator.platform
  } catch {
    // segue para o fallback
  }
  return 'Desconhecida'
}

export interface StorageInfo {
  files: number
  dirs: number
  vfsBytes: number
  lsBytes: number
  error: string | null
}

/** Coleta estatísticas do VFS e uso aproximado do localStorage (chaves fableos-*). */
export function computeStorage(): StorageInfo {
  let files = 0
  let dirs = 0
  let vfsBytes = 0
  let error: string | null = null

  try {
    const vfsStats = stats()
    files = vfsStats.files
    dirs = vfsStats.dirs
    vfsBytes = vfsStats.bytes
  } catch {
    error = 'Não foi possível ler o sistema de arquivos.'
  }

  let lsBytes = 0
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('fableos-')) {
        const value = localStorage.getItem(key) ?? ''
        lsBytes += key.length + value.length
      }
    }
  } catch {
    error = error ?? 'Não foi possível ler o localStorage.'
  }

  return { files, dirs, vfsBytes, lsBytes, error }
}
