import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ComponentType,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import type { AppProps } from '../../system/types'
import { useWindows } from '../../system/windowStore'
import { exists, writeFile } from '../../system/vfs'
import { hexToRgba, rgbToHex } from './color'
import { floodFill } from './floodFill'
import {
  BrushIcon,
  BucketIcon,
  DownloadIcon,
  EllipseIcon,
  EraserIcon,
  LineIcon,
  PickerIcon,
  RectIcon,
  RedoIcon,
  SaveIcon,
  TrashIcon,
  UndoIcon,
} from './icons'

type ShapeTool = 'line' | 'rect' | 'ellipse'
type Tool = 'brush' | 'eraser' | ShapeTool | 'bucket' | 'picker'
type DrawTool = 'brush' | 'eraser' | ShapeTool
type ModalKind = 'none' | 'save' | 'clear'

interface ToolDef {
  id: Tool
  label: string
  shortcut: string
  icon: ComponentType<{ className?: string }>
}

interface Snapshot {
  dataUrl: string
  w: number
  h: number
}

interface DrawState {
  tool: DrawTool
  startX: number
  startY: number
  lastX: number
  lastY: number
  midX: number
  midY: number
  shift: boolean
  moved: boolean
  pendingSnap: Snapshot | null
}

interface Toast {
  text: string
  error: boolean
}

const MAX_UNDO = 30
const FILL_TOLERANCE = 24
const SAVE_DIR = '/home/user/imagens'

const TOOL_DEFS: ToolDef[] = [
  { id: 'brush', label: 'Pincel', shortcut: '1', icon: BrushIcon },
  { id: 'eraser', label: 'Borracha', shortcut: '2', icon: EraserIcon },
  { id: 'line', label: 'Linha', shortcut: '3', icon: LineIcon },
  { id: 'rect', label: 'Retângulo', shortcut: '4', icon: RectIcon },
  { id: 'ellipse', label: 'Elipse', shortcut: '5', icon: EllipseIcon },
  { id: 'bucket', label: 'Balde de tinta', shortcut: '6', icon: BucketIcon },
  { id: 'picker', label: 'Conta-gotas', shortcut: '7', icon: PickerIcon },
]

const PALETTE: string[] = [
  '#000000', '#7f7f7f', '#880015', '#ed1c24',
  '#ff7f27', '#fff200', '#22b14c', '#00a2e8',
  '#3f48cc', '#a349a4', '#ffffff', '#c3c3c3',
  '#b97a57', '#ffaec9', '#ffc90e', '#efe4b0',
]

function buildSavePath(rawName: string): string | null {
  const name = rawName.trim().replace(/[/\\]/g, '-')
  if (!name || name === '.png') return null
  const file = name.toLowerCase().endsWith('.png') ? name : `${name}.png`
  return `${SAVE_DIR}/${file}`
}

interface IconButtonProps {
  title: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}

function IconButton({ title, disabled, onClick, children }: IconButtonProps) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white/95 disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  )
}

export default function PaintApp({ windowId }: AppProps) {
  const isFocused = useWindows(s => s.focusedId === windowId)

  const [tool, setTool] = useState<Tool>('brush')
  const [color, setColor] = useState('#000000')
  const [size, setSize] = useState(4)
  const [dims, setDims] = useState({ w: 0, h: 0 })
  const [modal, setModal] = useState<ModalKind>('none')
  const [saveName, setSaveName] = useState('desenho')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [, setHistTick] = useState(0)

  const areaRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const dprRef = useRef(1)
  const cssSizeRef = useRef({ w: 0, h: 0 })
  const undoRef = useRef<Snapshot[]>([])
  const redoRef = useRef<Snapshot[]>([])
  const drawingRef = useRef<DrawState | null>(null)
  const prevToolRef = useRef<Tool>('brush')
  const toastTimerRef = useRef<number | null>(null)
  const restoreSeqRef = useRef(0)
  const resizeRafRef = useRef<number | null>(null)
  const pendingSizeRef = useRef<{ w: number; h: number } | null>(null)

  const bumpHist = useCallback(() => setHistTick(t => t + 1), [])

  const getCanvasCtx = useCallback(
    (): CanvasRenderingContext2D | null =>
      canvasRef.current?.getContext('2d', { willReadFrequently: true }) ?? null,
    [],
  )

  const getOverlayCtx = useCallback(
    (): CanvasRenderingContext2D | null => overlayRef.current?.getContext('2d') ?? null,
    [],
  )

  const clearOverlay = useCallback(() => {
    const octx = getOverlayCtx()
    if (!octx) return
    const { w, h } = cssSizeRef.current
    octx.clearRect(0, 0, w, h)
  }, [getOverlayCtx])

  const snapshot = useCallback((): Snapshot | null => {
    const canvas = canvasRef.current
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null
    try {
      return {
        dataUrl: canvas.toDataURL('image/png'),
        w: cssSizeRef.current.w,
        h: cssSizeRef.current.h,
      }
    } catch {
      return null
    }
  }, [])

  const pushSnapshot = useCallback(
    (snap: Snapshot) => {
      undoRef.current.push(snap)
      if (undoRef.current.length > MAX_UNDO) undoRef.current.shift()
      redoRef.current = []
      bumpHist()
    },
    [bumpHist],
  )

  const pushUndo = useCallback(() => {
    const snap = snapshot()
    if (snap) pushSnapshot(snap)
  }, [snapshot, pushSnapshot])

  const restoreSnapshot = useCallback(
    (snap: Snapshot) => {
      const ctx = getCanvasCtx()
      if (!ctx) return
      const seq = ++restoreSeqRef.current
      const img = new Image()
      img.onload = () => {
        // ignora restaurações antigas quando o usuário desfaz/refaz em sequência
        if (!canvasRef.current || seq !== restoreSeqRef.current) return
        const { w, h } = cssSizeRef.current
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, snap.w, snap.h)
      }
      img.src = snap.dataUrl
    },
    [getCanvasCtx],
  )

  const undo = useCallback(() => {
    const prev = undoRef.current.pop()
    if (!prev) return
    const cur = snapshot()
    if (cur) {
      redoRef.current.push(cur)
      if (redoRef.current.length > MAX_UNDO) redoRef.current.shift()
    }
    restoreSnapshot(prev)
    bumpHist()
  }, [snapshot, restoreSnapshot, bumpHist])

  const redo = useCallback(() => {
    const next = redoRef.current.pop()
    if (!next) return
    const cur = snapshot()
    if (cur) {
      undoRef.current.push(cur)
      if (undoRef.current.length > MAX_UNDO) undoRef.current.shift()
    }
    restoreSnapshot(next)
    bumpHist()
  }, [snapshot, restoreSnapshot, bumpHist])

  const showToast = useCallback((text: string, error = false) => {
    setToast({ text, error })
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  const selectTool = useCallback(
    (next: Tool) => {
      setTool(prev => {
        if (next === 'picker' && prev !== 'picker') prevToolRef.current = prev
        return next
      })
      clearOverlay()
    },
    [clearOverlay],
  )

  const doClear = useCallback(() => {
    const ctx = getCanvasCtx()
    if (!ctx) return
    pushUndo()
    const { w, h } = cssSizeRef.current
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    setModal('none')
    showToast('Tela limpa.')
  }, [getCanvasCtx, pushUndo, showToast])

  const download = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || canvas.width === 0) return
    try {
      const link = document.createElement('a')
      link.href = canvas.toDataURL('image/png')
      link.download = 'fableos-desenho.png'
      link.click()
      showToast('Download de fableos-desenho.png iniciado.')
    } catch {
      showToast('Não foi possível gerar o PNG.', true)
    }
  }, [showToast])

  const openSaveModal = useCallback(() => {
    setSaveError(null)
    setModal('save')
  }, [])

  const doSave = useCallback(() => {
    const path = buildSavePath(saveName)
    if (!path) {
      setSaveError('Digite um nome válido para o arquivo.')
      return
    }
    const canvas = canvasRef.current
    if (!canvas || canvas.width === 0) {
      setSaveError('A tela ainda não foi inicializada.')
      return
    }
    try {
      writeFile(path, canvas.toDataURL('image/png'))
      setModal('none')
      showToast(`Salvo em ${path}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar o arquivo.')
    }
  }, [saveName, showToast])

  // ----- dimensionamento do canvas (preserva o desenho ao redimensionar) -----
  useEffect(() => {
    const area = areaRef.current
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!area || !canvas || !overlay) return

    const applySize = (w: number, h: number): void => {
      if (w < 4 || h < 4) return
      const dpr = Math.max(1, window.devicePixelRatio || 1)
      const pw = Math.round(w * dpr)
      const ph = Math.round(h * dpr)
      if (canvas.width === pw && canvas.height === ph) return

      // guarda o conteúdo atual para redesenhar no novo tamanho
      let saved: HTMLCanvasElement | null = null
      let savedCssW = 0
      let savedCssH = 0
      if (canvas.width > 0 && canvas.height > 0) {
        saved = document.createElement('canvas')
        saved.width = canvas.width
        saved.height = canvas.height
        const sctx = saved.getContext('2d')
        if (sctx) sctx.drawImage(canvas, 0, 0)
        savedCssW = canvas.width / dprRef.current
        savedCssH = canvas.height / dprRef.current
      }

      canvas.width = pw
      canvas.height = ph
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      overlay.width = pw
      overlay.height = ph
      overlay.style.width = `${w}px`
      overlay.style.height = `${h}px`
      dprRef.current = dpr
      cssSizeRef.current = { w, h }

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        if (saved && savedCssW > 0) ctx.drawImage(saved, 0, 0, savedCssW, savedCssH)
      }
      const octx = overlay.getContext('2d')
      if (octx) octx.setTransform(dpr, 0, 0, dpr, 0, 0)
      setDims({ w: Math.round(w), h: Math.round(h) })
    }

    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (!entry) return
      pendingSizeRef.current = { w: entry.contentRect.width, h: entry.contentRect.height }
      if (resizeRafRef.current === null) {
        resizeRafRef.current = requestAnimationFrame(() => {
          resizeRafRef.current = null
          const pending = pendingSizeRef.current
          if (pending) applySize(pending.w, pending.h)
        })
      }
    })
    observer.observe(area)
    return () => {
      observer.disconnect()
      if (resizeRafRef.current !== null) {
        cancelAnimationFrame(resizeRafRef.current)
        resizeRafRef.current = null
      }
    }
  }, [])

  // ----- atalhos de teclado (apenas com a janela em foco) -----
  useEffect(() => {
    if (!isFocused) return
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target
      const isTyping =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase()
        if (key === 'z') {
          e.preventDefault()
          if (e.shiftKey) redo()
          else undo()
          return
        }
        if (key === 'y') {
          e.preventDefault()
          redo()
          return
        }
        if (key === 's') {
          e.preventDefault()
          openSaveModal()
          return
        }
        return
      }
      if (modal !== 'none') {
        if (e.key === 'Escape') {
          e.preventDefault()
          setModal('none')
        } else if (e.key === 'Enter' && modal === 'clear') {
          e.preventDefault()
          doClear()
        }
        return
      }
      if (isTyping) return
      const def = TOOL_DEFS.find(t => t.shortcut === e.key)
      if (def) {
        selectTool(def.id)
        return
      }
      if (e.key === '[') setSize(s => Math.max(1, s - 1))
      else if (e.key === ']') setSize(s => Math.min(40, s + 1))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isFocused, modal, undo, redo, openSaveModal, doClear, selectTool])

  // limpa o timer do toast no unmount
  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    },
    [],
  )

  // ----- desenho -----
  const getPos = (e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const drawShapeOn = (
    ctx: CanvasRenderingContext2D,
    shape: ShapeTool,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    shift: boolean,
  ): void => {
    ctx.strokeStyle = color
    ctx.lineWidth = size
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (shape === 'line') {
      let ex = x1
      let ey = y1
      if (shift) {
        // trava o ângulo em múltiplos de 45°
        const dx = x1 - x0
        const dy = y1 - y0
        const snapped = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
        const len = Math.hypot(dx, dy)
        ex = x0 + Math.cos(snapped) * len
        ey = y0 + Math.sin(snapped) * len
      }
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(ex, ey)
      ctx.stroke()
      return
    }
    let w = x1 - x0
    let h = y1 - y0
    if (shift) {
      // quadrado / círculo perfeitos
      const m = Math.max(Math.abs(w), Math.abs(h))
      w = m * Math.sign(w || 1)
      h = m * Math.sign(h || 1)
    }
    if (shape === 'rect') {
      ctx.strokeRect(Math.min(x0, x0 + w), Math.min(y0, y0 + h), Math.abs(w), Math.abs(h))
    } else {
      ctx.beginPath()
      ctx.ellipse(x0 + w / 2, y0 + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  const drawHoverPreview = (x: number, y: number): void => {
    const octx = getOverlayCtx()
    if (!octx) return
    clearOverlay()
    octx.beginPath()
    octx.arc(x, y, Math.max(0.5, size / 2), 0, Math.PI * 2)
    octx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
    octx.lineWidth = 1
    octx.stroke()
  }

  const pickColorAt = (x: number, y: number): void => {
    const canvas = canvasRef.current
    const ctx = getCanvasCtx()
    if (!canvas || !ctx || canvas.width === 0) return
    const dpr = dprRef.current
    const px = Math.min(canvas.width - 1, Math.max(0, Math.floor(x * dpr)))
    const py = Math.min(canvas.height - 1, Math.max(0, Math.floor(y * dpr)))
    try {
      const d = ctx.getImageData(px, py, 1, 1).data
      const hex = rgbToHex(d[0], d[1], d[2])
      setColor(hex)
      setTool(prevToolRef.current)
      showToast(`Cor capturada: ${hex}`)
    } catch {
      showToast('Não foi possível capturar a cor.', true)
    }
  }

  const applyBucketAt = (x: number, y: number): void => {
    const canvas = canvasRef.current
    const ctx = getCanvasCtx()
    if (!canvas || !ctx || canvas.width === 0) return
    const dpr = dprRef.current
    const px = Math.floor(x * dpr)
    const py = Math.floor(y * dpr)
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return
    try {
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const snap = snapshot()
      if (floodFill(img, px, py, hexToRgba(color), FILL_TOLERANCE)) {
        if (snap) pushSnapshot(snap)
        ctx.putImageData(img, 0, 0)
      }
    } catch {
      showToast('Não foi possível preencher a área.', true)
    }
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0) return
    const canvas = canvasRef.current
    const ctx = getCanvasCtx()
    if (!canvas || !ctx || canvas.width === 0) return
    const { x, y } = getPos(e)

    if (tool === 'picker') {
      pickColorAt(x, y)
      return
    }
    if (tool === 'bucket') {
      applyBucketAt(x, y)
      return
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // ponteiro já não está mais ativo
    }
    clearOverlay()

    if (tool === 'brush' || tool === 'eraser') {
      pushUndo()
      ctx.fillStyle = tool === 'eraser' ? '#ffffff' : color
      ctx.beginPath()
      ctx.arc(x, y, Math.max(0.5, size / 2), 0, Math.PI * 2)
      ctx.fill()
      drawingRef.current = {
        tool,
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        midX: x,
        midY: y,
        shift: e.shiftKey,
        moved: false,
        pendingSnap: null,
      }
    } else {
      drawingRef.current = {
        tool,
        startX: x,
        startY: y,
        lastX: x,
        lastY: y,
        midX: x,
        midY: y,
        shift: e.shiftKey,
        moved: false,
        pendingSnap: snapshot(),
      }
    }
  }

  const handlePointerMove = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    const st = drawingRef.current
    if (!st) {
      if (tool === 'brush' || tool === 'eraser') {
        const { x, y } = getPos(e)
        drawHoverPreview(x, y)
      }
      return
    }

    if (st.tool === 'brush' || st.tool === 'eraser') {
      const ctx = getCanvasCtx()
      if (!ctx) return
      ctx.strokeStyle = st.tool === 'eraser' ? '#ffffff' : color
      ctx.lineWidth = size
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const native = e.nativeEvent
      const coalesced =
        typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
      const events = coalesced.length > 0 ? coalesced : [native]
      const rect = e.currentTarget.getBoundingClientRect()
      for (const ev of events) {
        const x = ev.clientX - rect.left
        const y = ev.clientY - rect.top
        const mx = (st.lastX + x) / 2
        const my = (st.lastY + y) / 2
        // traço suavizado: curva quadrática entre pontos médios
        ctx.beginPath()
        ctx.moveTo(st.midX, st.midY)
        ctx.quadraticCurveTo(st.lastX, st.lastY, mx, my)
        ctx.stroke()
        st.lastX = x
        st.lastY = y
        st.midX = mx
        st.midY = my
      }
      st.moved = true
      return
    }

    // formas: pré-visualização ao vivo no overlay
    const { x, y } = getPos(e)
    st.lastX = x
    st.lastY = y
    st.shift = e.shiftKey
    st.moved = st.moved || Math.abs(x - st.startX) > 0.5 || Math.abs(y - st.startY) > 0.5
    const octx = getOverlayCtx()
    if (!octx) return
    clearOverlay()
    drawShapeOn(octx, st.tool, st.startX, st.startY, x, y, e.shiftKey)
  }

  const finishStroke = (e: ReactPointerEvent<HTMLCanvasElement>, commit: boolean): void => {
    const st = drawingRef.current
    if (!st) return
    drawingRef.current = null
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      // captura já liberada
    }
    if (st.tool === 'brush' || st.tool === 'eraser') return
    clearOverlay()
    if (!commit || !st.moved) return
    const ctx = getCanvasCtx()
    if (!ctx) return
    if (st.pendingSnap) pushSnapshot(st.pendingSnap)
    drawShapeOn(ctx, st.tool, st.startX, st.startY, st.lastX, st.lastY, st.shift)
  }

  const handlePointerLeave = (): void => {
    if (!drawingRef.current) clearOverlay()
  }

  // ----- estado derivado -----
  const canUndo = undoRef.current.length > 0
  const canRedo = redoRef.current.length > 0
  const savePath = modal === 'save' ? buildSavePath(saveName) : null
  const willOverwrite = savePath !== null && exists(savePath)

  return (
    <div className="relative flex h-full w-full select-none flex-col text-white/90">
      {/* barra superior */}
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-white/10 px-2">
        <IconButton title="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={undo}>
          <UndoIcon />
        </IconButton>
        <IconButton title="Refazer (Ctrl+Y)" disabled={!canRedo} onClick={redo}>
          <RedoIcon />
        </IconButton>
        <div className="mx-1 h-5 w-px bg-white/10" />
        <IconButton title="Limpar tudo" onClick={() => setModal('clear')}>
          <TrashIcon />
        </IconButton>
        <div className="flex-1" />
        {dims.w > 0 && (
          <span className="px-2 font-mono text-[11px] text-white/35">
            {dims.w} × {dims.h}
          </span>
        )}
        <button
          type="button"
          title="Baixar como PNG"
          onClick={download}
          className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/90 transition-colors hover:bg-white/15"
        >
          <DownloadIcon className="h-3.5 w-3.5" />
          PNG
        </button>
        <button
          type="button"
          title="Salvar no sistema de arquivos (Ctrl+S)"
          onClick={openSaveModal}
          className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90"
        >
          <SaveIcon className="h-3.5 w-3.5" />
          Salvar
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ferramentas */}
        <div className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-white/10 py-2">
          {TOOL_DEFS.map(def => {
            const Icon = def.icon
            const active = tool === def.id
            return (
              <button
                key={def.id}
                type="button"
                title={`${def.label} (${def.shortcut})`}
                onClick={() => selectTool(def.id)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  active
                    ? 'bg-[var(--accent)] text-white shadow-lg'
                    : 'text-white/60 hover:bg-white/10 hover:text-white/90'
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
              </button>
            )
          })}
        </div>

        {/* área de desenho */}
        <div className="relative min-w-0 flex-1 overflow-hidden bg-black/25 p-4">
          <div ref={areaRef} className="relative h-full w-full">
            <canvas
              ref={canvasRef}
              className="absolute left-0 top-0 rounded-sm bg-white shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
            />
            <canvas
              ref={overlayRef}
              className="absolute left-0 top-0 cursor-crosshair touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={e => finishStroke(e, true)}
              onPointerCancel={e => finishStroke(e, false)}
              onPointerLeave={handlePointerLeave}
            />
          </div>
          {toast && (
            <div
              className={`pointer-events-none absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-lg border px-3 py-1.5 text-xs backdrop-blur ${
                toast.error
                  ? 'border-red-400/40 bg-black/70 text-red-200'
                  : 'border-white/10 bg-black/70 text-white/90'
              }`}
            >
              {toast.text}
            </div>
          )}
        </div>
      </div>

      {/* barra inferior: cores e espessura */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <div
            className="h-8 w-8 rounded-lg border border-white/20"
            style={{ backgroundColor: color }}
            title="Cor atual"
          />
          <span className="w-14 font-mono text-[10px] uppercase text-white/50">{color}</span>
        </div>
        <div className="grid grid-cols-8 gap-1">
          {PALETTE.map(c => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => setColor(c)}
              className={`h-4 w-4 rounded-[4px] border transition-transform hover:scale-110 ${
                color.toLowerCase() === c ? 'border-white ring-1 ring-[var(--accent)]' : 'border-white/20'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <input
          type="color"
          value={color}
          onChange={e => setColor(e.target.value)}
          title="Cor personalizada"
          className="h-7 w-7 cursor-pointer rounded-md border border-white/20 bg-transparent p-0"
        />
        <div className="h-6 w-px bg-white/10" />
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/50">Espessura</span>
          <input
            type="range"
            min={1}
            max={40}
            value={size}
            onChange={e => setSize(Number(e.target.value))}
            title="Espessura do traço ( [ e ] )"
            className="w-28 accent-[var(--accent)]"
          />
          <span className="w-6 text-right font-mono text-[11px] text-white/60">{size}</span>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5">
            <div
              className="rounded-full"
              style={{
                width: size,
                height: size,
                backgroundColor: tool === 'eraser' ? '#ffffff' : color,
              }}
            />
          </div>
        </div>
      </div>

      {/* modais */}
      {modal !== 'none' && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          onPointerDown={e => {
            if (e.target === e.currentTarget) setModal('none')
          }}
        >
          {modal === 'save' ? (
            <div className="w-80 max-w-full rounded-xl border border-white/10 bg-[#16171d] p-4 shadow-2xl">
              <h2 className="text-sm font-medium text-white/90">Salvar no sistema de arquivos</h2>
              <p className="mt-1 text-xs text-white/50">
                O desenho será salvo em <span className="font-mono">{SAVE_DIR}/</span>
              </p>
              <div className="mt-3 flex items-center gap-1.5">
                <input
                  autoFocus
                  value={saveName}
                  onChange={e => {
                    setSaveName(e.target.value)
                    setSaveError(null)
                  }}
                  onKeyDown={(e: ReactKeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') doSave()
                  }}
                  placeholder="nome-do-desenho"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-[var(--accent)]"
                />
                <span className="text-xs text-white/40">.png</span>
              </div>
              {saveError && <p className="mt-2 text-xs text-red-300">{saveError}</p>}
              {!saveError && willOverwrite && (
                <p className="mt-2 text-xs text-amber-300/90">
                  Já existe um arquivo com esse nome — ele será sobrescrito.
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModal('none')}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/15"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={doSave}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90"
                >
                  Salvar
                </button>
              </div>
            </div>
          ) : (
            <div className="w-72 max-w-full rounded-xl border border-white/10 bg-[#16171d] p-4 shadow-2xl">
              <h2 className="text-sm font-medium text-white/90">Limpar o desenho?</h2>
              <p className="mt-1 text-xs text-white/50">
                Todo o conteúdo da tela será apagado. Você pode desfazer com Ctrl+Z.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModal('none')}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/15"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={doClear}
                  className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs text-white transition-colors hover:bg-red-500"
                >
                  Limpar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
