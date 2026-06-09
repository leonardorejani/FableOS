import type { VfsNode } from '../../system/vfs'
import { normalizePath } from '../../system/vfs'
import type { IconName } from './icons'

export interface Shortcut {
  label: string
  path: string
  icon: IconName
}

export const HOME_PATH = '/home/user'

export const SHORTCUTS: Shortcut[] = [
  { label: 'Início', path: HOME_PATH, icon: 'home' },
  { label: 'Documentos', path: `${HOME_PATH}/documentos`, icon: 'doc' },
  { label: 'Imagens', path: `${HOME_PATH}/imagens`, icon: 'image' },
  { label: 'Músicas', path: `${HOME_PATH}/musicas`, icon: 'music' },
  { label: 'Projetos', path: `${HOME_PATH}/projetos`, icon: 'code' },
  { label: 'Raiz', path: '/', icon: 'disk' },
]

export function iconForEntry(name: string, isDirectory: boolean): string {
  if (isDirectory) return '📁'
  const dot = name.lastIndexOf('.')
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  switch (ext) {
    case 'md':
    case 'txt':
      return '📄'
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
      return '📜'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return '🖼️'
    case 'json':
      return '⚙️'
    default:
      return '📃'
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes
  let unit = 'B'
  for (const u of units) {
    if (value < 1024) break
    value /= 1024
    unit = u
  }
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unit}`
}

export function nodeBytes(node: VfsNode): number {
  if (node.type === 'file') return node.content.length
  let total = 0
  for (const child of Object.values(node.children)) total += nodeBytes(child)
  return total
}

export function formatCount(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/** Retorna mensagem de erro, ou null se o nome é válido. */
export function validateName(name: string): string | null {
  if (name === '.' || name === '..') return 'Esse nome é reservado pelo sistema.'
  if (name.includes('/')) return 'O nome não pode conter o caractere "/".'
  return null
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Ocorreu um erro inesperado.'
}

export function initialPathFromPayload(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'path' in payload) {
    const p = (payload as { path?: unknown }).path
    if (typeof p === 'string' && p.length > 0) return normalizePath(p)
  }
  return null
}

export interface Crumb {
  label: string
  path: string
}

export function breadcrumbSegments(path: string): Crumb[] {
  const n = normalizePath(path)
  const crumbs: Crumb[] = [{ label: 'Raiz', path: '/' }]
  if (n === '/') return crumbs
  let acc = ''
  for (const part of n.slice(1).split('/')) {
    acc += `/${part}`
    crumbs.push({ label: part, path: acc })
  }
  return crumbs
}
