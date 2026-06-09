// Tab completion: comandos, ids de apps/wallpapers e caminhos do VFS

import { list } from '../../system/vfs'
import { APP_META } from '../../system/apps'
import { WALLPAPERS } from '../../system/themeStore'
import { COMMANDS, resolvePath } from './interpreter'

export interface CompletionOption {
  label: string
  isDir: boolean
}

export interface CompletionResult {
  /** Novo valor do input (null se nada a completar) */
  newInput: string | null
  /** Opções a exibir quando há múltiplas alternativas */
  options: CompletionOption[] | null
}

const NO_COMPLETION: CompletionResult = { newInput: null, options: null }

function commonPrefix(items: string[]): string {
  if (items.length === 0) return ''
  let prefix = items[0]
  for (const item of items.slice(1)) {
    while (prefix !== '' && !item.startsWith(prefix)) {
      prefix = prefix.slice(0, -1)
    }
  }
  return prefix
}

/** Completa a partir de uma lista fixa de palavras (comandos, ids…) */
function completeWord(head: string, token: string, candidates: string[]): CompletionResult {
  const matches = candidates.filter(c => c.startsWith(token))
  if (matches.length === 0) return NO_COMPLETION
  if (matches.length === 1) {
    return { newInput: head + matches[0] + ' ', options: null }
  }
  const lcp = commonPrefix(matches)
  if (lcp.length > token.length) {
    return { newInput: head + lcp, options: null }
  }
  return {
    newInput: null,
    options: matches.map(m => ({ label: m, isDir: false })),
  }
}

/** Completa um caminho do VFS relativo ao cwd */
function completePath(head: string, token: string, cwd: string): CompletionResult {
  const slashIdx = token.lastIndexOf('/')
  const dirText = slashIdx >= 0 ? token.slice(0, slashIdx + 1) : ''
  const prefix = token.slice(slashIdx + 1)
  const baseDir = dirText === '' ? cwd : resolvePath(cwd, dirText)

  let entries
  try {
    entries = list(baseDir)
  } catch {
    return NO_COMPLETION
  }

  const matches = entries.filter(e => e.name.startsWith(prefix))
  if (matches.length === 0) return NO_COMPLETION
  if (matches.length === 1) {
    const m = matches[0]
    const suffix = m.node.type === 'dir' ? '/' : ' '
    return { newInput: head + dirText + m.name + suffix, options: null }
  }
  const lcp = commonPrefix(matches.map(m => m.name))
  if (lcp.length > prefix.length) {
    return { newInput: head + dirText + lcp, options: null }
  }
  return {
    newInput: null,
    options: matches.map(m => ({
      label: m.name + (m.node.type === 'dir' ? '/' : ''),
      isDir: m.node.type === 'dir',
    })),
  }
}

/**
 * Calcula a completion para o input atual.
 * O token sendo completado é o trecho após o último espaço.
 */
export function completeInput(input: string, cwd: string): CompletionResult {
  const lastSpace = input.lastIndexOf(' ')
  const head = input.slice(0, lastSpace + 1)
  const token = input.slice(lastSpace + 1)

  const wordsBefore = head.trim() === '' ? [] : head.trim().split(/\s+/)

  // Primeiro token: nome de comando
  if (wordsBefore.length === 0) {
    return completeWord(
      head,
      token,
      COMMANDS.map(c => c.name),
    )
  }

  // Argumentos com vocabulário próprio
  if (wordsBefore[0] === 'open' && wordsBefore.length === 1) {
    return completeWord(
      head,
      token,
      APP_META.map(a => a.id),
    )
  }
  if (wordsBefore[0] === 'wallpaper' && wordsBefore.length === 1) {
    return completeWord(head, token, ['list', ...WALLPAPERS.map(w => w.id)])
  }

  // Demais argumentos: caminhos do VFS
  return completePath(head, token, cwd)
}
