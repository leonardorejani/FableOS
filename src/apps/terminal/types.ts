// Tipos e helpers de renderização do terminal (linhas e spans coloridos)

export type SpanColor = 'plain' | 'dim' | 'accent' | 'green' | 'red' | 'yellow'

export interface TermSpan {
  text: string
  color?: SpanColor
  /** Cor CSS de fundo (usado nos blocos do neofetch / theme) */
  bg?: string
  bold?: boolean
}

export interface TermLine {
  spans: TermSpan[]
}

export function span(text: string, color?: SpanColor): TermSpan {
  return { text, color }
}

export function line(...spans: TermSpan[]): TermLine {
  return { spans }
}

export function textLine(text: string, color?: SpanColor): TermLine {
  return { spans: [{ text, color }] }
}

export function errorLine(text: string): TermLine {
  return textLine(text, 'red')
}

export const HOME = '/home/user'

/** /home/user → ~ ; /home/user/docs → ~/docs */
export function abbreviateCwd(cwd: string): string {
  if (cwd === HOME) return '~'
  if (cwd.startsWith(HOME + '/')) return '~' + cwd.slice(HOME.length)
  return cwd
}

/** Spans do prompt: user@fableos:<cwd>$ */
export function buildPromptSpans(cwd: string): TermSpan[] {
  return [
    { text: 'user', color: 'green', bold: true },
    { text: '@', color: 'green' },
    { text: 'fableos', color: 'green', bold: true },
    { text: ':', color: 'plain' },
    { text: abbreviateCwd(cwd), color: 'accent', bold: true },
    { text: '$ ', color: 'plain' },
  ]
}
