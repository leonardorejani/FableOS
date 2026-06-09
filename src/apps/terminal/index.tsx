import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent, ReactElement } from 'react'
import type { AppProps } from '../../system/types'
import { useWindows } from '../../system/windowStore'
import type { ShellContext, CommandResult } from './interpreter'
import { executeCommand, welcomeLines } from './interpreter'
import { completeInput } from './completion'
import type { TermLine, TermSpan } from './types'
import { HOME, abbreviateCwd, buildPromptSpans, errorLine } from './types'

function spanView(s: TermSpan, key: number): ReactElement {
  let cls: string
  switch (s.color) {
    case 'dim':
      cls = 'text-white/45'
      break
    case 'red':
      cls = 'text-red-400'
      break
    case 'green':
      cls = 'text-emerald-400'
      break
    case 'yellow':
      cls = 'text-amber-300'
      break
    case 'accent':
      cls = ''
      break
    default:
      cls = 'text-white/90'
  }
  if (s.bold) cls += ' font-semibold'
  const style: CSSProperties = {}
  if (s.color === 'accent') style.color = 'var(--accent)'
  if (s.bg) style.backgroundColor = s.bg
  return (
    <span key={key} className={cls} style={style}>
      {s.text}
    </span>
  )
}

function lineView(termLine: TermLine, key: number): ReactElement {
  const isEmpty = termLine.spans.every(s => s.text === '')
  return (
    <div key={key} className="whitespace-pre-wrap break-words leading-[1.5]">
      {isEmpty ? ' ' : termLine.spans.map((s, i) => spanView(s, i))}
    </div>
  )
}

export default function TerminalApp({ windowId }: AppProps) {
  const [lines, setLines] = useState<TermLine[]>(() => welcomeLines())
  const [input, setInput] = useState('')
  const [cwd, setCwd] = useState(HOME)

  const historyRef = useRef<string[]>([])
  const historyIdxRef = useRef<number>(-1)
  const draftRef = useRef('')
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickBottomRef = useRef(true)
  const rebootTimerRef = useRef<number | null>(null)

  // Foco inicial + cleanup do timer de reboot
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
    return () => {
      if (rebootTimerRef.current !== null) window.clearTimeout(rebootTimerRef.current)
    }
  }, [])

  // Título da janela acompanha o cwd
  useEffect(() => {
    useWindows.getState().setTitle(windowId, `Terminal — ${abbreviateCwd(cwd)}`)
  }, [windowId, cwd])

  // Auto-scroll para o fim a cada novo output
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  // Mantém o fim visível quando a janela é redimensionada
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (stickBottomRef.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }, [])

  const focusInput = useCallback((e: MouseEvent<HTMLDivElement>) => {
    // Não rouba o foco enquanto o usuário seleciona texto do scrollback
    const selection = window.getSelection()
    if (selection && selection.toString() !== '') return
    if (e.target !== inputRef.current) inputRef.current?.focus({ preventScroll: true })
  }, [])

  const runCommand = useCallback(
    (raw: string) => {
      const echoed: TermLine = { spans: [...buildPromptSpans(cwd), { text: raw }] }
      const trimmed = raw.trim()
      if (trimmed !== '') historyRef.current.push(trimmed)
      historyIdxRef.current = -1
      draftRef.current = ''

      const ctx: ShellContext = { cwd, history: historyRef.current }
      let result: CommandResult
      try {
        result = executeCommand(trimmed, ctx)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        result = { lines: [errorLine(`fsh: ${message}`)] }
      }

      stickBottomRef.current = true
      if (result.clear) {
        setLines(result.lines)
      } else {
        setLines(prev => [...prev, echoed, ...result.lines])
      }
      if (result.newCwd) setCwd(result.newCwd)
      if (result.reboot) {
        rebootTimerRef.current = window.setTimeout(() => window.location.reload(), 450)
      }
      setInput('')
    },
    [cwd],
  )

  const navigateHistory = useCallback(
    (direction: -1 | 1) => {
      const history = historyRef.current
      if (history.length === 0) return
      let idx = historyIdxRef.current
      if (direction === -1) {
        if (idx === -1) {
          draftRef.current = input
          idx = history.length - 1
        } else if (idx > 0) {
          idx -= 1
        }
        historyIdxRef.current = idx
        setInput(history[idx])
      } else {
        if (idx === -1) return
        idx += 1
        if (idx >= history.length) {
          historyIdxRef.current = -1
          setInput(draftRef.current)
        } else {
          historyIdxRef.current = idx
          setInput(history[idx])
        }
      }
    },
    [input],
  )

  const handleTab = useCallback(() => {
    const result = completeInput(input, cwd)
    if (result.newInput !== null) {
      setInput(result.newInput)
      return
    }
    if (result.options && result.options.length > 0) {
      const promptEcho: TermLine = { spans: [...buildPromptSpans(cwd), { text: input }] }
      const optionSpans: TermSpan[] = []
      result.options.forEach((opt, i) => {
        if (i > 0) optionSpans.push({ text: '  ' })
        optionSpans.push(
          opt.isDir ? { text: opt.label, color: 'accent', bold: true } : { text: opt.label },
        )
      })
      stickBottomRef.current = true
      setLines(prev => [...prev, promptEcho, { spans: optionSpans }])
    }
  }, [input, cwd])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        runCommand(input)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        navigateHistory(-1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        navigateHistory(1)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        handleTab()
      } else if (e.key === 'l' && e.ctrlKey) {
        e.preventDefault()
        setLines([])
      } else if (e.key === 'c' && e.ctrlKey && window.getSelection()?.toString() === '') {
        e.preventDefault()
        const echoed: TermLine = {
          spans: [...buildPromptSpans(cwd), { text: input }, { text: '^C', color: 'dim' }],
        }
        stickBottomRef.current = true
        setLines(prev => [...prev, echoed])
        setInput('')
        historyIdxRef.current = -1
        draftRef.current = ''
      }
    },
    [input, cwd, runCommand, navigateHistory, handleTab],
  )

  return (
    <div
      className="flex h-full w-full flex-col bg-[#0b0d13]/75 font-mono text-[13px]"
      onMouseUp={focusInput}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 select-text overflow-y-auto overflow-x-hidden px-3 py-2"
      >
        {lines.map((l, i) => lineView(l, i))}
        <div className="flex items-baseline">
          <span className="whitespace-pre">
            {buildPromptSpans(cwd).map((s, i) => spanView(s, i))}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="min-w-[40px] flex-1 bg-transparent font-mono text-[13px] text-white/90 outline-none"
            style={{ caretColor: 'var(--accent)' }}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            aria-label="Linha de comando"
          />
        </div>
      </div>
    </div>
  )
}
