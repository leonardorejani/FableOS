// Interpretador do fsh (Fable Shell): parsing, execução e saída formatada

import {
  baseName,
  getNode,
  isDir,
  joinPath,
  list,
  mkdir,
  readFile,
  remove,
  rename,
  stats,
  writeFile,
} from '../../system/vfs'
import type { VfsNode } from '../../system/vfs'
import { APP_META, getAppMeta } from '../../system/apps'
import { useWindows } from '../../system/windowStore'
import { useTheme, WALLPAPERS } from '../../system/themeStore'
import type { TermLine, TermSpan } from './types'
import { HOME, errorLine, line, span, textLine } from './types'

export const SHELL_VERSION = '1.0'

/** Momento em que a sessão (página) iniciou — usado pelo neofetch */
const bootTime = Date.now()

export interface ShellContext {
  cwd: string
  history: string[]
}

export interface CommandResult {
  lines: TermLine[]
  clear?: boolean
  newCwd?: string
  reboot?: boolean
}

export interface CommandDef {
  name: string
  usage: string
  description: string
}

export const COMMANDS: CommandDef[] = [
  { name: 'help', usage: 'help', description: 'Lista os comandos disponíveis' },
  { name: 'clear', usage: 'clear', description: 'Limpa a tela do terminal' },
  { name: 'pwd', usage: 'pwd', description: 'Mostra o diretório atual' },
  { name: 'ls', usage: 'ls [-l] [caminho]', description: 'Lista arquivos e diretórios' },
  { name: 'cd', usage: 'cd [caminho]', description: 'Muda o diretório atual (sem argumento vai para ~)' },
  { name: 'cat', usage: 'cat <arquivo>', description: 'Mostra o conteúdo de um arquivo' },
  { name: 'echo', usage: 'echo <texto> [> arq | >> arq]', description: 'Imprime texto ou grava em arquivo' },
  { name: 'mkdir', usage: 'mkdir <caminho>', description: 'Cria diretório (recursivo)' },
  { name: 'touch', usage: 'touch <arquivo>', description: 'Cria arquivo vazio ou atualiza a data' },
  { name: 'rm', usage: 'rm [-r] <caminho>', description: 'Remove arquivo ou diretório (-r para recursivo)' },
  { name: 'mv', usage: 'mv <de> <para>', description: 'Move ou renomeia arquivo/diretório' },
  { name: 'cp', usage: 'cp <de> <para>', description: 'Copia arquivo ou diretório' },
  { name: 'date', usage: 'date', description: 'Mostra data e hora atuais' },
  { name: 'whoami', usage: 'whoami', description: 'Mostra o usuário atual' },
  { name: 'history', usage: 'history', description: 'Histórico de comandos da sessão' },
  { name: 'apps', usage: 'apps', description: 'Lista os aplicativos instalados' },
  { name: 'open', usage: 'open <app> [caminho]', description: 'Abre um aplicativo do FableOS' },
  { name: 'wallpaper', usage: 'wallpaper <id|list>', description: 'Troca o papel de parede' },
  { name: 'theme', usage: 'theme <hex>', description: 'Muda a cor de destaque do sistema' },
  { name: 'neofetch', usage: 'neofetch', description: 'Informações do sistema com estilo' },
  { name: 'reboot', usage: 'reboot', description: 'Reinicia o FableOS' },
]

// ---------------------------------------------------------------------------
// Helpers

/** Resolve um caminho relativo/absoluto/com ~ a partir do cwd */
export function resolvePath(cwd: string, p: string): string {
  if (p === '~') return HOME
  if (p.startsWith('~/')) return joinPath(HOME, p.slice(2))
  return joinPath(cwd, p)
}

/** Tokeniza respeitando aspas simples e duplas */
export function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let hasToken = false
  let quote: '"' | "'" | null = null
  for (const ch of input) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      hasToken = true
    } else if (ch === ' ' || ch === '\t') {
      if (current !== '' || hasToken) {
        tokens.push(current)
        current = ''
        hasToken = false
      }
    } else {
      current += ch
    }
  }
  if (quote !== null) throw new Error(`aspas não fechadas: ${quote}`)
  if (current !== '' || hasToken) tokens.push(current)
  return tokens
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h} h ${m} min`
  if (m > 0) return `${m} min ${s} s`
  return `${s} s`
}

function browserName(): string {
  const ua = navigator.userAgent
  if (ua.includes('Edg/')) return 'Microsoft Edge'
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera'
  if (ua.includes('Chrome/')) return 'Chrome'
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Safari/')) return 'Safari'
  return 'Desconhecido'
}

function usageError(cmd: string): CommandResult {
  const def = COMMANDS.find(c => c.name === cmd)
  return { lines: [errorLine(`fsh: ${cmd}: uso: ${def ? def.usage : cmd}`)] }
}

function copyNode(srcPath: string, destPath: string): void {
  const node = getNode(srcPath)
  if (!node) throw new Error(`Não encontrado: ${srcPath}`)
  if (destPath === srcPath || destPath.startsWith(srcPath + '/')) {
    throw new Error('Não é possível copiar um diretório para dentro dele mesmo')
  }
  if (node.type === 'file') {
    writeFile(destPath, node.content)
  } else {
    mkdir(destPath)
    for (const entry of list(srcPath)) {
      copyNode(srcPath + '/' + entry.name, destPath + '/' + entry.name)
    }
  }
}

// ---------------------------------------------------------------------------
// Comandos

function cmdHelp(): CommandResult {
  const out: TermLine[] = [
    textLine(`fsh ${SHELL_VERSION} — comandos disponíveis:`, 'dim'),
    line(),
  ]
  for (const c of COMMANDS) {
    out.push(line(span('  ' + c.usage.padEnd(32), 'accent'), span(c.description)))
  }
  out.push(line())
  out.push(textLine('Dicas: Tab completa caminhos, ↑/↓ navegam no histórico, Ctrl+L limpa a tela.', 'dim'))
  return { lines: out }
}

function cmdLs(ctx: ShellContext, args: string[]): CommandResult {
  const long = args.includes('-l')
  const paths = args.filter(a => !a.startsWith('-'))
  const target = resolvePath(ctx.cwd, paths[0] ?? '.')
  const node = getNode(target)
  if (!node) {
    return { lines: [errorLine(`fsh: ls: ${paths[0] ?? target}: arquivo ou diretório não encontrado`)] }
  }
  if (node.type === 'file') {
    return long
      ? { lines: [longEntryLine(baseName(target), node)] }
      : { lines: [textLine(baseName(target))] }
  }
  const entries = list(target)
  if (entries.length === 0) {
    return { lines: [textLine('(vazio)', 'dim')] }
  }
  if (long) {
    const out: TermLine[] = [textLine(`total ${entries.length}`, 'dim')]
    for (const e of entries) out.push(longEntryLine(e.name, e.node))
    return { lines: out }
  }
  const spans: TermSpan[] = []
  entries.forEach((e, i) => {
    if (i > 0) spans.push(span('  '))
    if (e.node.type === 'dir') spans.push({ text: e.name + '/', color: 'accent', bold: true })
    else spans.push(span(e.name))
  })
  return { lines: [line(...spans)] }
}

function longEntryLine(name: string, node: VfsNode): TermLine {
  const isDirectory = node.type === 'dir'
  const typeChar = isDirectory ? 'd' : '-'
  const size = isDirectory
    ? `${Object.keys(node.children).length} itens`
    : `${node.content.length} B`
  const meta = `${typeChar}  ${size.padStart(10)}  ${formatDate(node.mtime)}  `
  return isDirectory
    ? line(span(meta, 'dim'), { text: name + '/', color: 'accent', bold: true })
    : line(span(meta, 'dim'), span(name))
}

function cmdCd(ctx: ShellContext, args: string[]): CommandResult {
  const target = args[0] ? resolvePath(ctx.cwd, args[0]) : HOME
  const node = getNode(target)
  const label = args[0] ?? '~'
  if (!node) return { lines: [errorLine(`fsh: cd: caminho não encontrado: ${label}`)] }
  if (node.type !== 'dir') return { lines: [errorLine(`fsh: cd: não é um diretório: ${label}`)] }
  return { lines: [], newCwd: target }
}

function cmdCat(ctx: ShellContext, args: string[]): CommandResult {
  if (args.length === 0) return usageError('cat')
  const out: TermLine[] = []
  for (const arg of args) {
    const content = readFile(resolvePath(ctx.cwd, arg))
    const rows = content.split('\n')
    if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop()
    for (const row of rows) out.push(textLine(row))
  }
  return { lines: out }
}

function cmdEcho(ctx: ShellContext, args: string[]): CommandResult {
  let redirect: '>' | '>>' | null = null
  let redirectIdx = -1
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '>' || args[i] === '>>') {
      redirect = args[i] as '>' | '>>'
      redirectIdx = i
      break
    }
  }
  if (!redirect) {
    return { lines: [textLine(args.join(' '))] }
  }
  const text = args.slice(0, redirectIdx).join(' ')
  const targetArg = args[redirectIdx + 1]
  if (!targetArg) {
    return { lines: [errorLine(`fsh: echo: destino ausente após "${redirect}"`)] }
  }
  const target = resolvePath(ctx.cwd, targetArg)
  if (redirect === '>>') {
    let prev = ''
    const node = getNode(target)
    if (node?.type === 'file') prev = node.content
    writeFile(target, prev + text + '\n')
  } else {
    writeFile(target, text + '\n')
  }
  return { lines: [] }
}

function cmdMkdir(ctx: ShellContext, args: string[]): CommandResult {
  if (args.length === 0) return usageError('mkdir')
  for (const arg of args) mkdir(resolvePath(ctx.cwd, arg))
  return { lines: [] }
}

function cmdTouch(ctx: ShellContext, args: string[]): CommandResult {
  if (args.length === 0) return usageError('touch')
  for (const arg of args) {
    const target = resolvePath(ctx.cwd, arg)
    const node = getNode(target)
    if (node?.type === 'dir') {
      return { lines: [errorLine(`fsh: touch: ${arg}: é um diretório`)] }
    }
    writeFile(target, node?.type === 'file' ? node.content : '')
  }
  return { lines: [] }
}

function cmdRm(ctx: ShellContext, args: string[]): CommandResult {
  const recursive = args.some(a => a === '-r' || a === '-rf' || a === '-fr')
  const targets = args.filter(a => !a.startsWith('-'))
  if (targets.length === 0) return usageError('rm')
  const out: TermLine[] = []
  for (const arg of targets) {
    const target = resolvePath(ctx.cwd, arg)
    const node = getNode(target)
    if (!node) {
      out.push(errorLine(`fsh: rm: ${arg}: arquivo ou diretório não encontrado`))
      continue
    }
    if (node.type === 'dir' && Object.keys(node.children).length > 0 && !recursive) {
      out.push(errorLine(`fsh: rm: ${arg}: diretório não vazio (use rm -r)`))
      continue
    }
    remove(target)
  }
  return { lines: out }
}

function cmdMv(ctx: ShellContext, args: string[]): CommandResult {
  if (args.length !== 2) return usageError('mv')
  const from = resolvePath(ctx.cwd, args[0])
  let to = resolvePath(ctx.cwd, args[1])
  if (isDir(to)) to = joinPath(to, baseName(from))
  rename(from, to)
  return { lines: [] }
}

function cmdCp(ctx: ShellContext, args: string[]): CommandResult {
  if (args.length !== 2) return usageError('cp')
  const from = resolvePath(ctx.cwd, args[0])
  let to = resolvePath(ctx.cwd, args[1])
  if (isDir(to)) to = joinPath(to, baseName(from))
  copyNode(from, to)
  return { lines: [] }
}

function cmdHistory(ctx: ShellContext): CommandResult {
  if (ctx.history.length === 0) {
    return { lines: [textLine('(histórico vazio)', 'dim')] }
  }
  const width = String(ctx.history.length).length
  return {
    lines: ctx.history.map((cmd, i) =>
      line(span(`  ${String(i + 1).padStart(width)}  `, 'dim'), span(cmd)),
    ),
  }
}

function cmdApps(): CommandResult {
  const out: TermLine[] = [textLine('Aplicativos instalados:', 'dim'), line()]
  for (const app of APP_META) {
    out.push(
      line(
        span('  ' + app.id.padEnd(13), 'accent'),
        span(app.name.padEnd(16)),
        span(app.description, 'dim'),
      ),
    )
  }
  out.push(line())
  out.push(textLine('Use "open <id>" para abrir um aplicativo.', 'dim'))
  return { lines: out }
}

function cmdOpen(ctx: ShellContext, args: string[]): CommandResult {
  if (args.length === 0) return usageError('open')
  const appId = args[0]
  const meta = getAppMeta(appId)
  if (!meta) {
    return {
      lines: [errorLine(`fsh: open: aplicativo desconhecido: ${appId}. Digite "apps" para listar.`)],
    }
  }
  let payload: unknown
  if (args[1] && appId === 'editor') {
    payload = { path: resolvePath(ctx.cwd, args[1]) }
  }
  useWindows.getState().openApp(appId, payload !== undefined ? { payload } : undefined)
  return { lines: [textLine(`Abrindo ${meta.name}…`, 'dim')] }
}

function cmdWallpaper(args: string[]): CommandResult {
  const theme = useTheme.getState()
  if (args.length === 0 || args[0] === 'list') {
    const out: TermLine[] = [textLine('Papéis de parede disponíveis:', 'dim'), line()]
    for (const w of WALLPAPERS) {
      const current = w.id === theme.wallpaper
      out.push(
        line(
          span('  ' + w.id.padEnd(12), 'accent'),
          span(w.name.padEnd(14)),
          current ? span('(atual)', 'green') : span(''),
        ),
      )
    }
    out.push(line())
    out.push(textLine('Use "wallpaper <id>" para trocar.', 'dim'))
    return { lines: out }
  }
  const target = WALLPAPERS.find(w => w.id === args[0])
  if (!target) {
    const ids = WALLPAPERS.map(w => w.id).join(', ')
    return { lines: [errorLine(`fsh: wallpaper: id desconhecido: ${args[0]}. Opções: ${ids}`)] }
  }
  theme.setWallpaper(target.id)
  return { lines: [textLine(`Papel de parede alterado para "${target.name}".`)] }
}

function cmdTheme(args: string[]): CommandResult {
  if (args.length === 0) return usageError('theme')
  const raw = args[0].startsWith('#') ? args[0].slice(1) : args[0]
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) {
    return { lines: [errorLine(`fsh: theme: cor inválida: ${args[0]} (use hex, ex: theme #22d3ee)`)] }
  }
  const hex = '#' + raw.toLowerCase()
  useTheme.getState().setAccent(hex)
  return {
    lines: [line(span('Cor de destaque alterada para '), span(hex, 'accent'), span(' '), { text: '    ', bg: hex })],
  }
}

function cmdNeofetch(): CommandResult {
  const theme = useTheme.getState()
  const fsInfo = stats()
  const art = [
    '███████╗',
    '██╔════╝',
    '█████╗  ',
    '██╔══╝  ',
    '██║     ',
    '╚═╝     ',
    '        ',
    '        ',
    '        ',
  ]
  const labelValue = (label: string, value: string): TermSpan[] => [
    { text: label, color: 'accent', bold: true },
    span(value),
  ]
  const info: TermSpan[][] = [
    [
      { text: 'user', color: 'green', bold: true },
      span('@'),
      { text: 'fableos', color: 'green', bold: true },
    ],
    [span('─────────────────────────', 'dim')],
    labelValue('OS:         ', 'FableOS 1.0'),
    labelValue('Kernel:     ', 'React 19'),
    labelValue('Shell:      ', `fsh ${SHELL_VERSION}`),
    labelValue('Resolução:  ', `${window.innerWidth}x${window.innerHeight}`),
    labelValue('Uptime:     ', formatUptime(Date.now() - bootTime)),
    labelValue('Navegador:  ', browserName()),
    labelValue('Arquivos:   ', `${fsInfo.files} arquivos, ${fsInfo.dirs} diretórios`),
  ]
  const out: TermLine[] = [line()]
  const rows = Math.max(art.length, info.length)
  for (let i = 0; i < rows; i++) {
    const artText = art[i] ?? ' '.repeat(8)
    const infoSpans = info[i] ?? []
    out.push(line({ text: '  ' + artText + '   ', color: 'accent', bold: true }, ...infoSpans))
  }
  const palette = ['#ef4444', '#f59e0b', '#34d399', '#22d3ee', '#60a5fa', '#e879f9', '#f8fafc']
  const blocks: TermSpan[] = [span('  ' + ' '.repeat(8) + '   ')]
  for (const c of palette) blocks.push({ text: '   ', bg: c })
  blocks.push({ text: '   ', bg: theme.accent })
  out.push(line(...blocks))
  out.push(
    line(
      span('  ' + ' '.repeat(8) + '   '),
      span('accent atual: ', 'dim'),
      span(theme.accent, 'accent'),
    ),
  )
  out.push(line())
  return { lines: out }
}

// ---------------------------------------------------------------------------
// Dispatcher

export function executeCommand(raw: string, ctx: ShellContext): CommandResult {
  const tokens = tokenize(raw)
  if (tokens.length === 0) return { lines: [] }
  const cmd = tokens[0]
  const args = tokens.slice(1)

  switch (cmd) {
    case 'help':
      return cmdHelp()
    case 'clear':
      return { lines: [], clear: true }
    case 'pwd':
      return { lines: [textLine(ctx.cwd)] }
    case 'ls':
      return cmdLs(ctx, args)
    case 'cd':
      return cmdCd(ctx, args)
    case 'cat':
      return cmdCat(ctx, args)
    case 'echo':
      return cmdEcho(ctx, args)
    case 'mkdir':
      return cmdMkdir(ctx, args)
    case 'touch':
      return cmdTouch(ctx, args)
    case 'rm':
      return cmdRm(ctx, args)
    case 'mv':
      return cmdMv(ctx, args)
    case 'cp':
      return cmdCp(ctx, args)
    case 'date':
      return {
        lines: [
          textLine(
            new Date().toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'medium' }),
          ),
        ],
      }
    case 'whoami':
      return { lines: [textLine('user')] }
    case 'history':
      return cmdHistory(ctx)
    case 'apps':
      return cmdApps()
    case 'open':
      return cmdOpen(ctx, args)
    case 'wallpaper':
      return cmdWallpaper(args)
    case 'theme':
      return cmdTheme(args)
    case 'neofetch':
      return cmdNeofetch()
    case 'reboot':
      return { lines: [textLine('Reiniciando o FableOS…', 'yellow')], reboot: true }
    default:
      return { lines: [errorLine(`fsh: comando não encontrado: ${cmd}. Digite "help".`)] }
  }
}

/** Mensagem de boas-vindas exibida no primeiro render */
export function welcomeLines(): TermLine[] {
  return [
    line(
      { text: 'FableOS Terminal', color: 'accent', bold: true },
      span(` — fsh v${SHELL_VERSION}`, 'dim'),
    ),
    textLine('Digite "help" para ver os comandos disponíveis.', 'dim'),
    line(),
  ]
}
