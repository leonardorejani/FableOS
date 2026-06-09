import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AppProps } from '../../system/types'
import { CalcError, evaluate, formatResult } from './parser'
import type { AngleMode } from './parser'

interface HistoryEntry {
  expr: string
  result: string
}

const HISTORY_KEY = 'fableos.calculator.history'
const MODE_KEY = 'fableos.calculator.angleMode'
const HISTORY_LIMIT = 50

function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.expr === 'string' && typeof v.result === 'string'
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isHistoryEntry).slice(0, HISTORY_LIMIT)
  } catch {
    return []
  }
}

function loadAngleMode(): AngleMode {
  try {
    return localStorage.getItem(MODE_KEY) === 'rad' ? 'rad' : 'deg'
  } catch {
    return 'deg'
  }
}

type ButtonVariant = 'digit' | 'op' | 'sci' | 'accent' | 'danger'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  digit: 'bg-white/10 hover:bg-white/15 text-white/90 text-sm font-medium',
  op: 'bg-white/5 hover:bg-white/10 text-[var(--accent)] text-sm font-semibold',
  sci: 'bg-white/5 hover:bg-white/10 text-white/60 text-xs',
  accent: 'bg-[var(--accent)] hover:opacity-90 text-white text-sm font-semibold',
  danger: 'bg-white/5 hover:bg-white/10 text-red-300 text-sm font-semibold',
}

interface CalcButtonProps {
  label: string
  onPress: () => void
  variant?: ButtonVariant
  className?: string
  title?: string
}

function CalcButton({ label, onPress, variant = 'digit', className = '', title }: CalcButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={onPress}
      className={`rounded-lg transition-transform duration-75 active:scale-95 ${VARIANT_CLASS[variant]} ${className}`}
    >
      {label}
    </button>
  )
}

export default function CalculatorApp(_props: AppProps) {
  const [expr, setExpr] = useState('')
  const [ans, setAns] = useState(0)
  const [angleMode, setAngleMode] = useState<AngleMode>(loadAngleMode)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [caretTarget, setCaretTarget] = useState<number | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Reposiciona o cursor do input após inserções vindas dos botões.
  useLayoutEffect(() => {
    if (caretTarget === null) return
    const el = inputRef.current
    if (el) {
      el.focus()
      el.setSelectionRange(caretTarget, caretTarget)
    }
    setCaretTarget(null)
  }, [caretTarget])

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
    } catch {
      // armazenamento indisponível: segue sem persistir
    }
  }, [history])

  useEffect(() => {
    try {
      localStorage.setItem(MODE_KEY, angleMode)
    } catch {
      // armazenamento indisponível: segue sem persistir
    }
  }, [angleMode])

  // Resultado live: avalia enquanto digita, silenciosamente.
  const liveResult = useMemo(() => {
    const trimmed = expr.trim()
    if (!trimmed) return null
    try {
      const value = evaluate(trimmed, { angleMode, ans })
      if (!Number.isFinite(value)) return null
      return formatResult(value)
    } catch {
      return null
    }
  }, [expr, angleMode, ans])

  const insert = (text: string, caretBack = 0) => {
    const el = inputRef.current
    const start = el?.selectionStart ?? expr.length
    const end = el?.selectionEnd ?? expr.length
    setExpr(expr.slice(0, start) + text + expr.slice(end))
    setError(null)
    setCaretTarget(start + text.length - caretBack)
  }

  const backspace = () => {
    const el = inputRef.current
    const start = el?.selectionStart ?? expr.length
    const end = el?.selectionEnd ?? expr.length
    setError(null)
    if (start !== end) {
      setExpr(expr.slice(0, start) + expr.slice(end))
      setCaretTarget(start)
    } else if (start > 0) {
      setExpr(expr.slice(0, start - 1) + expr.slice(start))
      setCaretTarget(start - 1)
    } else {
      setCaretTarget(0)
    }
  }

  const clearAll = () => {
    setExpr('')
    setError(null)
    setCaretTarget(0)
  }

  const handleEquals = () => {
    const trimmed = expr.trim()
    if (!trimmed) return
    try {
      const value = evaluate(trimmed, { angleMode, ans })
      if (!Number.isFinite(value)) {
        setError('Resultado indefinido')
        return
      }
      const formatted = formatResult(value)
      setAns(value)
      setHistory(prev => [{ expr: trimmed, result: formatted }, ...prev].slice(0, HISTORY_LIMIT))
      setExpr(formatted)
      setError(null)
      setCaretTarget(formatted.length)
    } catch (err) {
      setError(err instanceof CalcError ? err.message : 'Sintaxe inválida')
    }
  }

  const restoreEntry = (entry: HistoryEntry) => {
    setExpr(entry.expr)
    setError(null)
    setCaretTarget(entry.expr.length)
  }

  const handleRootKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === '=') {
      e.preventDefault()
      handleEquals()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      clearAll()
      return
    }
    // Dentro do input, a edição nativa cuida do resto (dígitos, backspace…).
    if (e.target === inputRef.current) return
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (e.key === 'Backspace') {
      e.preventDefault()
      backspace()
      return
    }
    if (/^[0-9+\-*/%^().,]$/.test(e.key)) {
      e.preventDefault()
      insert(e.key === ',' ? '.' : e.key)
    }
  }

  const trimmedExpr = expr.trim()
  const resultLine = error ?? liveResult ?? (trimmedExpr ? ' ' : '0')

  return (
    <div className="flex h-full w-full select-none flex-col" onKeyDown={handleRootKeyDown}>
      {/* Display */}
      <div className="px-3 pt-3">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <input
            ref={inputRef}
            type="text"
            value={expr}
            onChange={e => {
              setExpr(e.target.value)
              setError(null)
            }}
            placeholder="Digite uma expressão"
            spellCheck={false}
            autoComplete="off"
            aria-label="Expressão"
            className="w-full bg-transparent text-right font-mono text-sm text-white/90 outline-none placeholder:text-white/35"
          />
          <div
            className={`mt-1 overflow-x-auto whitespace-nowrap text-right font-mono leading-9 ${
              error ? 'text-base text-red-400' : 'text-2xl text-white/90'
            }`}
            style={{ height: '2.25rem', scrollbarWidth: 'none' }}
            aria-live="polite"
          >
            {resultLine}
          </div>
        </div>
      </div>

      {/* Barra: DEG/RAD, ans, histórico */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex overflow-hidden rounded-lg border border-white/10 text-[10px] font-semibold">
          <button
            type="button"
            onClick={() => setAngleMode('deg')}
            className={`px-2.5 py-1 transition-colors ${
              angleMode === 'deg' ? 'bg-[var(--accent)] text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            DEG
          </button>
          <button
            type="button"
            onClick={() => setAngleMode('rad')}
            className={`px-2.5 py-1 transition-colors ${
              angleMode === 'rad' ? 'bg-[var(--accent)] text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            RAD
          </button>
        </div>
        <div className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-white/35" title="Último resultado">
          ans = {formatResult(ans)}
        </div>
        <button
          type="button"
          onClick={() => setHistoryOpen(open => !open)}
          className="rounded-lg bg-white/10 px-2.5 py-1 text-[10px] text-white/60 hover:bg-white/15"
        >
          Histórico ({history.length}) {historyOpen ? '▴' : '▾'}
        </button>
      </div>

      {/* Histórico colapsável */}
      {historyOpen && (
        <div className="mx-3 mb-2 flex max-h-36 flex-col overflow-hidden rounded-lg border border-white/10 bg-white/5">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-2 py-1">
            <span className="text-[10px] uppercase tracking-wide text-white/35">Últimas operações</span>
            <button
              type="button"
              onClick={() => setHistory([])}
              disabled={history.length === 0}
              className="text-[10px] text-white/60 hover:text-white/90 disabled:cursor-default disabled:text-white/35"
            >
              Limpar
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto">
            {history.length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-white/35">Nenhum cálculo ainda</div>
            ) : (
              history.map((entry, index) => (
                <button
                  key={`${entry.expr}-${entry.result}-${index}`}
                  type="button"
                  onClick={() => restoreEntry(entry)}
                  title="Restaurar expressão"
                  className="flex w-full items-baseline justify-between gap-2 px-2 py-1 text-left font-mono hover:bg-white/10"
                >
                  <span className="truncate text-[11px] text-white/60">{entry.expr}</span>
                  <span className="shrink-0 text-xs text-white/90">= {entry.result}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Botões */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-3 pb-3">
        <div className="grid shrink-0 grid-cols-5 gap-1.5">
          <CalcButton label="sin" variant="sci" onPress={() => insert('sin(')} className="py-1.5" />
          <CalcButton label="cos" variant="sci" onPress={() => insert('cos(')} className="py-1.5" />
          <CalcButton label="tan" variant="sci" onPress={() => insert('tan(')} className="py-1.5" />
          <CalcButton label="ln" variant="sci" onPress={() => insert('ln(')} className="py-1.5" />
          <CalcButton label="log" variant="sci" onPress={() => insert('log(')} className="py-1.5" />
          <CalcButton label="√" variant="sci" onPress={() => insert('√(')} className="py-1.5" />
          <CalcButton label="x²" variant="sci" onPress={() => insert('^2')} className="py-1.5" />
          <CalcButton label="xʸ" variant="sci" onPress={() => insert('^')} className="py-1.5" />
          <CalcButton label="π" variant="sci" onPress={() => insert('π')} className="py-1.5" />
          <CalcButton label="e" variant="sci" onPress={() => insert('e')} className="py-1.5" />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-6 gap-1.5">
          <CalcButton label="C" variant="danger" onPress={clearAll} title="Limpar (Esc)" />
          <CalcButton label="⌫" variant="op" onPress={backspace} title="Apagar (Backspace)" />
          <CalcButton label="(" variant="op" onPress={() => insert('(')} />
          <CalcButton label=")" variant="op" onPress={() => insert(')')} />

          <CalcButton label="7" onPress={() => insert('7')} />
          <CalcButton label="8" onPress={() => insert('8')} />
          <CalcButton label="9" onPress={() => insert('9')} />
          <CalcButton label="÷" variant="op" onPress={() => insert('/')} />

          <CalcButton label="4" onPress={() => insert('4')} />
          <CalcButton label="5" onPress={() => insert('5')} />
          <CalcButton label="6" onPress={() => insert('6')} />
          <CalcButton label="×" variant="op" onPress={() => insert('*')} />

          <CalcButton label="1" onPress={() => insert('1')} />
          <CalcButton label="2" onPress={() => insert('2')} />
          <CalcButton label="3" onPress={() => insert('3')} />
          <CalcButton label="−" variant="op" onPress={() => insert('-')} />

          <CalcButton label="0" onPress={() => insert('0')} />
          <CalcButton label="." onPress={() => insert('.')} />
          <CalcButton label="%" variant="op" onPress={() => insert('%')} title="Módulo" />
          <CalcButton label="+" variant="op" onPress={() => insert('+')} />

          <CalcButton label="ans" variant="sci" onPress={() => insert('ans')} title="Último resultado" />
          <CalcButton label="=" variant="accent" onPress={handleEquals} className="col-span-3" title="Calcular (Enter)" />
        </div>
      </div>
    </div>
  )
}
