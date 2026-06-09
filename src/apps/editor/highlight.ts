// Tokenização por regex e geração de HTML seguro (spans coloridos) para o editor.

export type LangId = 'text' | 'js' | 'json' | 'md' | 'css' | 'html'

export interface LangOption {
  id: LangId
  label: string
}

export const LANG_OPTIONS: LangOption[] = [
  { id: 'text', label: 'Texto puro' },
  { id: 'js', label: 'JavaScript / TypeScript' },
  { id: 'json', label: 'JSON' },
  { id: 'md', label: 'Markdown' },
  { id: 'css', label: 'CSS' },
  { id: 'html', label: 'HTML' },
]

const EXT_TO_LANG: Record<string, LangId> = {
  js: 'js',
  jsx: 'js',
  ts: 'js',
  tsx: 'js',
  mjs: 'js',
  cjs: 'js',
  json: 'json',
  md: 'md',
  markdown: 'md',
  css: 'css',
  html: 'html',
  htm: 'html',
  xml: 'html',
  svg: 'html',
}

export function detectLang(path: string | null): LangId {
  if (path === null) return 'text'
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return 'text'
  return EXT_TO_LANG[name.slice(dot + 1).toLowerCase()] ?? 'text'
}

export function langLabel(id: LangId): string {
  return LANG_OPTIONS.find(o => o.id === id)?.label ?? 'Texto puro'
}

// ---------------------------------------------------------------------------
// Infraestrutura

const STYLE = {
  comment: 'color:#7f8a9e;font-style:italic',
  string: 'color:#98c379',
  number: 'color:#d19a66',
  keyword: 'color:#c678dd',
  literal: 'color:#56b6c2',
  func: 'color:#61afef',
  tag: 'color:#e06c75',
  attr: 'color:#d19a66',
  prop: 'color:#61afef',
  selector: 'color:#e5c07b',
  heading: 'color:#61afef;font-weight:600',
  bold: 'color:#ffffff;font-weight:700',
  italic: 'font-style:italic;color:#dbe2ef',
  link: 'color:#56b6c2;text-decoration:underline',
  bullet: 'color:var(--accent)',
  quote: 'color:#7f8a9e;font-style:italic',
} as const

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function wrap(html: string, style: string): string {
  return `<span style="${style}">${html}</span>`
}

function firstGroup(m: RegExpExecArray): number {
  for (let i = 1; i < m.length; i++) {
    if (m[i] !== undefined) return i
  }
  return 0
}

type Painter = (m: RegExpExecArray) => string

/** Percorre o código com a regex global, pintando tokens e escapando o resto. */
function paintTokens(code: string, re: RegExp, paint: Painter): string {
  re.lastIndex = 0
  let out = ''
  let last = 0
  let m = re.exec(code)
  while (m !== null) {
    if (m.index > last) out += esc(code.slice(last, m.index))
    if (m[0] === '') {
      // segurança contra match vazio (não deve ocorrer com as regexes abaixo)
      out += esc(code.slice(m.index, m.index + 1))
      last = m.index + 1
      re.lastIndex = last
    } else {
      out += paint(m)
      last = m.index + m[0].length
    }
    m = re.exec(code)
  }
  if (last < code.length) out += esc(code.slice(last))
  return out
}

// ---------------------------------------------------------------------------
// JavaScript / TypeScript

const JS_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\[\s\S]|\$\{[^}]*\}|[^\\`])*`?)|('(?:\\.|[^\\'\n])*'?|"(?:\\.|[^\\"\n])*"?)|(\b(?:abstract|any|as|asserts|async|await|bigint|boolean|break|case|catch|class|const|continue|debugger|declare|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|infer|instanceof|interface|is|keyof|let|namespace|never|new|number|object|of|override|private|protected|public|readonly|return|satisfies|set|static|string|super|switch|symbol|this|throw|try|type|typeof|unknown|var|void|while|with|yield)\b)|(\b(?:true|false|null|undefined|NaN|Infinity)\b)|(\b0[xXbBoO][\da-fA-F_]+n?\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?\b)|([A-Za-z_$][\w$]*(?=\s*\())/g

function paintTemplate(raw: string): string {
  // Varredura com contagem de chaves balanceadas: ${f({ a: 1 })} é uma única
  // interpolação (regex com [^}]* terminaria cedo na primeira }).
  let inner = ''
  let i = 0
  while (i < raw.length) {
    const start = raw.indexOf('${', i)
    if (start === -1) {
      inner += esc(raw.slice(i))
      break
    }
    inner += esc(raw.slice(i, start))
    let depth = 1
    let j = start + 2
    while (j < raw.length && depth > 0) {
      if (raw[j] === '{') depth += 1
      else if (raw[j] === '}') depth -= 1
      j += 1
    }
    if (depth === 0) {
      inner += wrap(esc(raw.slice(start, j)), STYLE.literal)
      i = j
    } else {
      inner += esc(raw.slice(start))
      break
    }
  }
  return wrap(inner, STYLE.string)
}

function paintJs(m: RegExpExecArray): string {
  const t = m[0]
  switch (firstGroup(m)) {
    case 1:
      return wrap(esc(t), STYLE.comment)
    case 2:
      return paintTemplate(t)
    case 3:
      return wrap(esc(t), STYLE.string)
    case 4:
      return wrap(esc(t), STYLE.keyword)
    case 5:
      return wrap(esc(t), STYLE.literal)
    case 6:
      return wrap(esc(t), STYLE.number)
    case 7:
      return wrap(esc(t), STYLE.func)
    default:
      return esc(t)
  }
}

// ---------------------------------------------------------------------------
// JSON

const JSON_RE =
  /("(?:\\.|[^"\\\n])*")(?=\s*:)|("(?:\\.|[^"\\\n])*")|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b(?:true|false|null)\b)/g

function paintJson(m: RegExpExecArray): string {
  const t = m[0]
  switch (firstGroup(m)) {
    case 1:
      return wrap(esc(t), STYLE.prop)
    case 2:
      return wrap(esc(t), STYLE.string)
    case 3:
      return wrap(esc(t), STYLE.number)
    case 4:
      return wrap(esc(t), STYLE.literal)
    default:
      return esc(t)
  }
}

// ---------------------------------------------------------------------------
// CSS

const CSS_RE =
  /(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(@[\w-]+)|(!important\b)|(#[0-9a-fA-F]{3,8})|([\w-]+(?=\s*:))|(-?\d+(?:\.\d+)?(?:px|em|rem|vh|vw|vmin|vmax|ms|s|deg|rad|turn|fr|ch|ex|pt|pc|cm|mm|in|%)?)|([.#][\w-]+)/g

function paintCss(m: RegExpExecArray): string {
  const t = m[0]
  switch (firstGroup(m)) {
    case 1:
      return wrap(esc(t), STYLE.comment)
    case 2:
      return wrap(esc(t), STYLE.string)
    case 3:
    case 4:
      return wrap(esc(t), STYLE.keyword)
    case 5:
      return wrap(esc(t), STYLE.number)
    case 6:
      return wrap(esc(t), STYLE.prop)
    case 7:
      return wrap(esc(t), STYLE.number)
    case 8:
      return wrap(esc(t), STYLE.selector)
    default:
      return esc(t)
  }
}

// ---------------------------------------------------------------------------
// HTML (duas fases: tags inteiras, depois sub-tokens dentro da tag)

const HTML_RE =
  /(<!--[\s\S]*?-->)|(<![^>]*>)|(<\/?[a-zA-Z][^<>]*>?)|(&[a-zA-Z][a-zA-Z0-9]*;|&#\d+;|&#x[0-9a-fA-F]+;)/g

const TAG_INNER_RE = /^(<\/?)([\w:-]*)([\s\S]*?)(\/?>?)$/

const ATTR_RE = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|([\w-]+(?=\s*=))|([\w-]+)/g

function paintAttr(m: RegExpExecArray): string {
  const t = m[0]
  switch (firstGroup(m)) {
    case 1:
      return wrap(esc(t), STYLE.string)
    case 2:
    case 3:
      return wrap(esc(t), STYLE.attr)
    default:
      return esc(t)
  }
}

function paintTagToken(raw: string): string {
  const mm = TAG_INNER_RE.exec(raw)
  if (!mm) return esc(raw)
  const open = mm[1] ?? ''
  const name = mm[2] ?? ''
  const rest = mm[3] ?? ''
  const close = mm[4] ?? ''
  let out = wrap(esc(open + name), STYLE.tag)
  out += paintTokens(rest, ATTR_RE, paintAttr)
  if (close !== '') out += wrap(esc(close), STYLE.tag)
  return out
}

function paintHtml(m: RegExpExecArray): string {
  const t = m[0]
  switch (firstGroup(m)) {
    case 1:
      return wrap(esc(t), STYLE.comment)
    case 2:
      return wrap(esc(t), STYLE.keyword)
    case 3:
      return paintTagToken(t)
    case 4:
      return wrap(esc(t), STYLE.literal)
    default:
      return esc(t)
  }
}

// ---------------------------------------------------------------------------
// Markdown

const MD_RE =
  /(```[\s\S]*?(?:```|$))|(^#{1,6}[^\n]*)|(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\n]+\*|\b_[^_\n]+_\b)|(!?\[[^\]\n]*\]\([^)\n]*\))|(^[ \t]*(?:[-*+]|\d+\.)[ \t])|(^>[^\n]*)/gm

function paintMd(m: RegExpExecArray): string {
  const t = m[0]
  switch (firstGroup(m)) {
    case 1:
    case 3:
      return wrap(esc(t), STYLE.string)
    case 2:
      return wrap(esc(t), STYLE.heading)
    case 4:
      return wrap(esc(t), STYLE.bold)
    case 5:
      return wrap(esc(t), STYLE.italic)
    case 6:
      return wrap(esc(t), STYLE.link)
    case 7:
      return wrap(esc(t), STYLE.bullet)
    case 8:
      return wrap(esc(t), STYLE.quote)
    default:
      return esc(t)
  }
}

// ---------------------------------------------------------------------------

export function highlight(code: string, lang: LangId): string {
  switch (lang) {
    case 'js':
      return paintTokens(code, JS_RE, paintJs)
    case 'json':
      return paintTokens(code, JSON_RE, paintJson)
    case 'css':
      return paintTokens(code, CSS_RE, paintCss)
    case 'html':
      return paintTokens(code, HTML_RE, paintHtml)
    case 'md':
      return paintTokens(code, MD_RE, paintMd)
    default:
      return esc(code)
  }
}
