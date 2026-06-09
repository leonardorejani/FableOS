import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type {
  ChangeEvent,
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  SyntheticEvent,
} from 'react'
import type { AppProps } from '../../system/types'
import { useWindows } from '../../system/windowStore'
import { baseName, normalizePath, readFile, writeFile } from '../../system/vfs'
import { detectLang, highlight, LANG_OPTIONS, langLabel } from './highlight'
import type { LangId } from './highlight'
import PathModal from './PathModal'

const CODE_METRICS: CSSProperties = { fontSize: 13, lineHeight: '20px', tabSize: 2 }

const BTN =
  'rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/15'
const BTN_PRIMARY =
  'rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90'

interface EditorBoot {
  content: string
  path: string | null
  loadError: string | null
}

interface CursorPos {
  line: number
  col: number
}

interface ToastState {
  kind: 'info' | 'error'
  text: string
}

type ModalKind = 'open' | 'saveas' | null

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Erro inesperado.'
}

function payloadPath(payload: unknown): string | null {
  if (typeof payload === 'object' && payload !== null && 'path' in payload) {
    const p = (payload as { path: unknown }).path
    if (typeof p === 'string' && p.trim() !== '') return p
  }
  return null
}

function bootFrom(payload: unknown): EditorBoot {
  const p = payloadPath(payload)
  if (p === null) return { content: '', path: null, loadError: null }
  try {
    return { content: readFile(p), path: normalizePath(p), loadError: null }
  } catch (err) {
    return { content: '', path: null, loadError: errMsg(err) }
  }
}

function cursorPos(text: string, index: number): CursorPos {
  let line = 1
  let lineStart = 0
  let nl = text.indexOf('\n')
  while (nl !== -1 && nl < index) {
    line += 1
    lineStart = nl + 1
    nl = text.indexOf('\n', nl + 1)
  }
  return { line, col: index - lineStart + 1 }
}

function countLines(text: string): number {
  let count = 1
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) count += 1
  return count
}

export default function EditorApp({ windowId, payload }: AppProps) {
  const [boot] = useState<EditorBoot>(() => bootFrom(payload))
  const [content, setContent] = useState<string>(boot.content)
  const [savedContent, setSavedContent] = useState<string>(boot.content)
  const [path, setPath] = useState<string | null>(boot.path)
  const [manualLang, setManualLang] = useState<'auto' | LangId>('auto')
  const [cursor, setCursor] = useState<CursorPos>({ line: 1, col: 1 })
  const [modal, setModal] = useState<ModalKind>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [docVersion, setDocVersion] = useState<number>(0)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<number | null>(null)

  const setTitle = useWindows(s => s.setTitle)

  const dirty = content !== savedContent
  const effLang: LangId = manualLang === 'auto' ? detectLang(path) : manualLang

  const html = useMemo(() => highlight(content, effLang), [content, effLang])
  const lineCount = useMemo(() => countLines(content), [content])
  const lineNums = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => String(i + 1)),
    [lineCount],
  )

  // Título da janela: "• nome.ext — Código" quando há alterações não salvas.
  useEffect(() => {
    const name = path === null ? 'sem título' : baseName(path)
    setTitle(windowId, `${dirty ? '• ' : ''}${name} — Código`)
  }, [dirty, path, setTitle, windowId])

  const showToast = useCallback((kind: ToastState['kind'], text: string) => {
    setToast({ kind, text })
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }, [])

  // Erro de carregamento do payload (arquivo inexistente etc.)
  useEffect(() => {
    if (boot.loadError !== null) showToast('error', boot.loadError)
  }, [boot, showToast])

  // Cleanup do toast no unmount.
  useEffect(() => {
    return () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    }
  }, [])

  const syncScroll = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop
      preRef.current.scrollLeft = ta.scrollLeft
    }
    if (gutterRef.current) {
      gutterRef.current.style.transform = `translateY(${-ta.scrollTop}px)`
    }
  }, [])

  // Re-sincroniza após cada re-render do highlight (o conteúdo do <pre> muda).
  useLayoutEffect(() => {
    syncScroll()
  }, [html, syncScroll])

  // Novo documento carregado: volta ao topo, cursor no início, foco no editor.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (ta) {
      ta.scrollTop = 0
      ta.scrollLeft = 0
      ta.setSelectionRange(0, 0)
      ta.focus()
    }
    setCursor({ line: 1, col: 1 })
    syncScroll()
  }, [docVersion, syncScroll])

  // Devolve o foco ao editor quando um modal fecha.
  useEffect(() => {
    if (modal === null) taRef.current?.focus()
  }, [modal])

  const updateCursor = useCallback((el: HTMLTextAreaElement) => {
    setCursor(cursorPos(el.value, el.selectionStart))
  }, [])

  const requestSave = useCallback(() => {
    if (path === null) {
      setModal('saveas')
      return
    }
    try {
      writeFile(path, content)
      setSavedContent(content)
      showToast('info', `Salvo em ${path}`)
    } catch (err) {
      showToast('error', errMsg(err))
    }
  }, [path, content, showToast])

  const confirmSaveAs = useCallback(
    (value: string): string | null => {
      const trimmed = value.trim()
      if (trimmed === '') return 'Informe o caminho do arquivo.'
      if (trimmed.endsWith('/')) return 'Informe também o nome do arquivo (ex.: notas.txt).'
      const target = normalizePath(trimmed)
      if (target === '/') return 'Caminho inválido.'
      try {
        writeFile(target, content)
      } catch (err) {
        return errMsg(err)
      }
      setPath(target)
      setSavedContent(content)
      setModal(null)
      showToast('info', `Salvo em ${target}`)
      return null
    },
    [content, showToast],
  )

  const confirmOpen = useCallback((value: string): string | null => {
    const trimmed = value.trim()
    if (trimmed === '') return 'Informe o caminho do arquivo.'
    const target = normalizePath(trimmed)
    let text: string
    try {
      text = readFile(target)
    } catch (err) {
      return errMsg(err)
    }
    setContent(text)
    setSavedContent(text)
    setPath(target)
    setManualLang('auto')
    setModal(null)
    setDocVersion(v => v + 1)
    return null
  }, [])

  const handleRootKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (modal !== null) return
    if (!(e.ctrlKey || e.metaKey)) return
    const k = e.key.toLowerCase()
    if (k === 's') {
      e.preventDefault()
      if (e.shiftKey) setModal('saveas')
      else requestSave()
    } else if (k === 'o') {
      e.preventDefault()
      setModal('open')
    }
  }

  const handleTaKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      let inserted = false
      try {
        // Preserva o histórico de undo quando suportado.
        inserted = document.execCommand('insertText', false, '  ')
      } catch {
        inserted = false
      }
      if (!inserted) {
        ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end')
        setContent(ta.value)
        updateCursor(ta)
      }
    }
  }

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setContent(e.target.value)
    updateCursor(e.target)
  }

  const handleSelect = (e: SyntheticEvent<HTMLTextAreaElement>): void => {
    updateCursor(e.currentTarget)
  }

  // Gutter: números antes/na/depois da linha ativa (linha ativa em destaque).
  const activeLine = Math.min(cursor.line, lineCount)
  const beforeNums = lineNums.slice(0, activeLine - 1).join('\n')
  const afterNums = lineNums.slice(activeLine).join('\n')
  const gutterDigits = Math.max(String(lineCount).length, 2)

  const statusLabel = dirty ? 'Modificado' : path !== null ? 'Salvo' : 'Novo'

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      onKeyDown={handleRootKeyDown}
    >
      {/* Toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 px-2">
        <button className={BTN} title="Abrir arquivo (Ctrl+O)" onClick={() => setModal('open')}>
          Abrir
        </button>
        <button className={BTN_PRIMARY} title="Salvar (Ctrl+S)" onClick={requestSave}>
          Salvar
        </button>
        <button
          className={BTN}
          title="Salvar como (Ctrl+Shift+S)"
          onClick={() => setModal('saveas')}
        >
          Salvar como
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-white/35">Linguagem</span>
          <select
            value={manualLang}
            onChange={e => setManualLang(e.target.value as 'auto' | LangId)}
            className="rounded-lg border border-white/10 bg-white/10 px-2 py-1 text-xs text-white/80 outline-none transition-colors hover:bg-white/15 focus:border-[var(--accent)]"
            style={{ colorScheme: 'dark' }}
            title="Seleção manual de linguagem"
          >
            <option value="auto">Automática ({langLabel(detectLang(path))})</option>
            {LANG_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Área do editor */}
      <div className="flex min-h-0 flex-1 bg-black/25">
        {/* Gutter de números de linha */}
        <div
          className="relative h-full shrink-0 select-none overflow-hidden border-r border-white/10 bg-white/[0.03] font-mono"
          style={{ fontSize: 13, width: `calc(${gutterDigits}ch + 1.5rem)` }}
        >
          <div
            ref={gutterRef}
            className="absolute inset-x-0 top-0 whitespace-pre pr-2 pt-3 text-right text-white/30 will-change-transform"
            style={CODE_METRICS}
          >
            {beforeNums}
            {beforeNums !== '' ? '\n' : ''}
            <span style={{ color: 'var(--accent)' }}>{lineNums[activeLine - 1] ?? '1'}</span>
            {afterNums !== '' ? '\n' + afterNums : ''}
          </div>
        </div>

        {/* Highlight atrás + textarea transparente na frente */}
        <div className="relative min-w-0 flex-1">
          <pre
            ref={preRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-3 font-mono text-white/90"
            style={CODE_METRICS}
            dangerouslySetInnerHTML={{ __html: html + '\n' }}
          />
          <textarea
            ref={taRef}
            value={content}
            onChange={handleChange}
            onScroll={syncScroll}
            onKeyDown={handleTaKeyDown}
            onSelect={handleSelect}
            onClick={handleSelect}
            onKeyUp={handleSelect}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={'Comece a digitar, ou use "Abrir" (Ctrl+O) para carregar um arquivo…'}
            className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre border-0 bg-transparent p-3 font-mono text-transparent caret-white outline-none selection:bg-white/20 placeholder:text-white/25"
            style={CODE_METRICS}
          />
        </div>
      </div>

      {/* Barra de status */}
      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-white/10 px-3 text-[11px] text-white/50">
        <span className="min-w-0 flex-1 truncate font-mono" title={path ?? 'sem título'}>
          {path ?? 'sem título'}
        </span>
        <span className={dirty ? 'shrink-0 text-[var(--accent)]' : 'shrink-0 text-white/35'}>
          {statusLabel}
        </span>
        <span className="shrink-0">
          Ln {cursor.line}, Col {cursor.col}
        </span>
        <span className="shrink-0">{content.length.toLocaleString('pt-BR')} caracteres</span>
        <span className="shrink-0 text-white/60">{langLabel(effLang)}</span>
      </div>

      {/* Toast */}
      {toast !== null && (
        <div
          className={`absolute bottom-9 right-3 z-20 max-w-[80%] truncate rounded-lg border px-3 py-2 text-xs shadow-xl backdrop-blur ${
            toast.kind === 'error'
              ? 'border-red-400/40 bg-red-950/70 text-red-200'
              : 'border-white/10 bg-black/70 text-white/80'
          }`}
          role="status"
        >
          {toast.text}
        </div>
      )}

      {/* Modais */}
      {modal === 'open' && (
        <PathModal
          title="Abrir arquivo"
          confirmLabel="Abrir"
          initialValue={path ?? '/home/user/'}
          note={dirty ? 'Atenção: alterações não salvas serão perdidas.' : undefined}
          onConfirm={confirmOpen}
          onCancel={() => setModal(null)}
        />
      )}
      {modal === 'saveas' && (
        <PathModal
          title="Salvar como"
          confirmLabel="Salvar"
          initialValue={path ?? '/home/user/documentos/'}
          onConfirm={confirmSaveAs}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  )
}
