// Parser recursivo descendente para expressões matemáticas.
// Gramática:
//   expr    → term  (('+' | '-') term)*
//   term    → factor (('*' | '/' | '%') factor)*
//   factor  → unary ('^' factor)?          // potência associativa à direita
//   unary   → ('-' | '+') unary | primary
//   primary → número | constante | função '(' expr ')' | '(' expr ')'

export type AngleMode = 'deg' | 'rad'

export interface EvalOptions {
  angleMode: AngleMode
  ans: number
}

export class CalcError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CalcError'
  }
}

type TokenKind = 'number' | 'ident' | 'op' | 'lparen' | 'rparen'

interface Token {
  kind: TokenKind
  text: string
  value: number
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

function isLetter(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const ch = source.charAt(i)

    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i += 1
      continue
    }

    // Números: 12, 3.14, .5 (aceita vírgula como separador decimal)
    if (isDigit(ch) || ch === '.' || ch === ',') {
      let j = i
      let sawDot = false
      let sawDigit = false
      while (j < source.length) {
        const c = source.charAt(j)
        if (isDigit(c)) {
          sawDigit = true
          j += 1
        } else if ((c === '.' || c === ',') && !sawDot) {
          sawDot = true
          j += 1
        } else {
          break
        }
      }
      if (!sawDigit) throw new CalcError('Sintaxe inválida')
      const text = source.slice(i, j).replace(',', '.')
      tokens.push({ kind: 'number', text, value: Number(text) })
      i = j
      continue
    }

    // Identificadores: funções, constantes e ans
    if (isLetter(ch)) {
      let j = i
      while (j < source.length && isLetter(source.charAt(j))) j += 1
      const text = source.slice(i, j)
      tokens.push({ kind: 'ident', text, value: 0 })
      i = j
      continue
    }

    // Símbolos especiais amigáveis
    if (ch === 'π') {
      tokens.push({ kind: 'ident', text: 'pi', value: 0 })
      i += 1
      continue
    }
    if (ch === '√') {
      tokens.push({ kind: 'ident', text: 'sqrt', value: 0 })
      i += 1
      continue
    }
    if (ch === '×' || ch === '÷' || ch === '−') {
      const mapped = ch === '×' ? '*' : ch === '÷' ? '/' : '-'
      tokens.push({ kind: 'op', text: mapped, value: 0 })
      i += 1
      continue
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '%' || ch === '^') {
      tokens.push({ kind: 'op', text: ch, value: 0 })
      i += 1
      continue
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen', text: '(', value: 0 })
      i += 1
      continue
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen', text: ')', value: 0 })
      i += 1
      continue
    }

    throw new CalcError('Sintaxe inválida')
  }
  return tokens
}

function toRadians(x: number, mode: AngleMode): number {
  return mode === 'deg' ? (x * Math.PI) / 180 : x
}

function fromRadians(x: number, mode: AngleMode): number {
  return mode === 'deg' ? (x * 180) / Math.PI : x
}

const FUNCTIONS: Record<string, (x: number, mode: AngleMode) => number> = {
  sin: (x, mode) => Math.sin(toRadians(x, mode)),
  cos: (x, mode) => Math.cos(toRadians(x, mode)),
  tan: (x, mode) => Math.tan(toRadians(x, mode)),
  asin: (x, mode) => fromRadians(Math.asin(x), mode),
  acos: (x, mode) => fromRadians(Math.acos(x), mode),
  atan: (x, mode) => fromRadians(Math.atan(x), mode),
  log: x => Math.log10(x),
  ln: x => Math.log(x),
  sqrt: x => Math.sqrt(x),
  abs: x => Math.abs(x),
}

class Parser {
  private tokens: Token[]
  private pos = 0
  private options: EvalOptions

  constructor(tokens: Token[], options: EvalOptions) {
    this.tokens = tokens
    this.options = options
  }

  parse(): number {
    if (this.tokens.length === 0) throw new CalcError('Sintaxe inválida')
    const value = this.expr()
    if (this.pos < this.tokens.length) throw new CalcError('Sintaxe inválida')
    return value
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }

  private isOp(symbols: string[]): Token | undefined {
    const t = this.peek()
    if (t && t.kind === 'op' && symbols.includes(t.text)) return t
    return undefined
  }

  private expr(): number {
    let value = this.term()
    for (;;) {
      const op = this.isOp(['+', '-'])
      if (!op) break
      this.pos += 1
      const right = this.term()
      value = op.text === '+' ? value + right : value - right
    }
    return value
  }

  private term(): number {
    let value = this.unary()
    for (;;) {
      const op = this.isOp(['*', '/', '%'])
      if (!op) break
      this.pos += 1
      const right = this.unary()
      if (op.text === '*') {
        value *= right
      } else {
        if (right === 0) throw new CalcError('Divisão por zero')
        value = op.text === '/' ? value / right : value % right
      }
    }
    return value
  }

  // Precedência: unário ACIMA da potência, para que -2^2 = -(2^2) = -4,
  // enquanto o expoente volta por unary para permitir 2^-3.
  private unary(): number {
    const op = this.isOp(['-', '+'])
    if (op) {
      this.pos += 1
      const value = this.unary()
      return op.text === '-' ? -value : value
    }
    return this.power()
  }

  private power(): number {
    const base = this.primary()
    if (this.isOp(['^'])) {
      this.pos += 1
      const exponent = this.unary() // associatividade à direita
      return Math.pow(base, exponent)
    }
    return base
  }

  private primary(): number {
    const t = this.tokens[this.pos]
    if (!t) throw new CalcError('Sintaxe inválida')
    this.pos += 1

    if (t.kind === 'number') return t.value

    if (t.kind === 'lparen') {
      const value = this.expr()
      this.expectRparen()
      return value
    }

    if (t.kind === 'ident') {
      const name = t.text.toLowerCase()
      if (name === 'pi') return Math.PI
      if (name === 'e') return Math.E
      if (name === 'ans') return this.options.ans

      const fn = FUNCTIONS[name]
      if (!fn) {
        const next = this.peek()
        if (next && next.kind === 'lparen') throw new CalcError(`Função desconhecida: ${t.text}`)
        throw new CalcError(`Símbolo desconhecido: ${t.text}`)
      }

      const next = this.peek()
      if (!next || next.kind !== 'lparen') throw new CalcError('Sintaxe inválida')
      this.pos += 1
      const arg = this.expr()
      this.expectRparen()
      return fn(arg, this.options.angleMode)
    }

    throw new CalcError('Sintaxe inválida')
  }

  private expectRparen(): void {
    const t = this.peek()
    if (!t || t.kind !== 'rparen') throw new CalcError('Sintaxe inválida')
    this.pos += 1
  }
}

/** Avalia uma expressão. Lança CalcError com mensagem amigável em pt-BR. */
export function evaluate(expression: string, options: EvalOptions): number {
  const tokens = tokenize(expression)
  return new Parser(tokens, options).parse()
}

/**
 * Formata um número finito: até 12 dígitos significativos, sem zeros à
 * direita; notação científica para |x| ≥ 1e12 ou |x| ≤ 1e-9 (x ≠ 0).
 */
export function formatResult(x: number): string {
  if (!Number.isFinite(x)) return String(x)
  if (x === 0) return '0'

  const abs = Math.abs(x)
  if (abs >= 1e12 || abs <= 1e-9) {
    const parts = x.toExponential(11).split('e')
    let mantissa = parts[0]
    const exponent = (parts[1] ?? '0').replace('+', '')
    if (mantissa.includes('.')) {
      mantissa = mantissa.replace(/0+$/, '').replace(/\.$/, '')
    }
    return `${mantissa}e${exponent}`
  }

  const magnitude = Math.floor(Math.log10(abs))
  const decimals = Math.min(Math.max(11 - magnitude, 0), 100)
  let text = x.toFixed(decimals)
  if (text.includes('.')) {
    text = text.replace(/0+$/, '').replace(/\.$/, '')
  }
  return text === '-0' ? '0' : text
}
