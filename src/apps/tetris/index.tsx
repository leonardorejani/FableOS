// Tetris — componente, entrada de teclado (DAS), loop rAF com passo fixo
// e renderização em canvas. A lógica pura do jogo vive em game.ts.

import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import type { AppProps } from '../../system/types'
import {
  COLS,
  HIDDEN_ROWS,
  TOTAL_ROWS,
  VISIBLE_ROWS,
  TetrisGame,
  cellsOf,
} from './game'
import type { Phase, PieceType } from './game'
import { PIECE_COLORS, drawCell, drawGhostCell, drawMiniPiece } from './render'

const HIGHSCORE_KEY = 'fableos-tetris-highscore'
const DAS_MS = 170
const ARR_MS = 50
const FIXED_STEP_MS = 1000 / 120
const MAX_FRAME_MS = 250

function loadHighscore(): number {
  try {
    const raw = localStorage.getItem(HIGHSCORE_KEY)
    if (!raw) return 0
    const value = parseInt(raw, 10)
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

function saveHighscore(value: number): void {
  try {
    localStorage.setItem(HIGHSCORE_KEY, String(value))
  } catch {
    // armazenamento indisponível — o recorde só não persiste
  }
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR')
}

interface UiSnapshot {
  phase: Phase
  score: number
  lines: number
  level: number
  highscore: number
  hold: PieceType | null
  holdUsed: boolean
  next: PieceType[]
  newRecord: boolean
}

interface InputState {
  left: boolean
  right: boolean
  dasDir: -1 | 0 | 1
  dasTime: number
  arrTime: number
}

interface CanvasSize {
  cell: number
  w: number
  h: number
  dpr: number
}

const LOGO_LETTERS: ReadonlyArray<{ ch: string; color: string }> = [
  { ch: 'T', color: PIECE_COLORS.T },
  { ch: 'E', color: PIECE_COLORS.I },
  { ch: 'T', color: PIECE_COLORS.O },
  { ch: 'R', color: PIECE_COLORS.Z },
  { ch: 'I', color: PIECE_COLORS.S },
  { ch: 'S', color: PIECE_COLORS.J },
]

const CONTROLS: ReadonlyArray<readonly [string, string]> = [
  ['← →', 'mover'],
  ['↓', 'descida suave'],
  ['Espaço', 'queda instantânea'],
  ['↑ / X', 'girar horário'],
  ['Z', 'girar anti-horário'],
  ['C', 'reservar peça'],
  ['P / Esc', 'pausar'],
  ['R', 'reiniciar'],
]

function useGame(): TetrisGame {
  const ref = useRef<TetrisGame | null>(null)
  if (ref.current === null) ref.current = new TetrisGame()
  return ref.current
}

interface MiniPieceProps {
  type: PieceType | null
  disabled?: boolean
  className?: string
}

function MiniPiece({ type, disabled = false, className = 'h-10' }: MiniPieceProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) drawMiniPiece(canvas, type, disabled)
  }, [type, disabled])
  return <canvas ref={canvasRef} className={`w-full ${className}`} />
}

function Logo() {
  return (
    <div className="flex gap-1 text-3xl font-black tracking-widest">
      {LOGO_LETTERS.map((letter, index) => (
        <span
          key={`${letter.ch}-${index}`}
          style={{ color: letter.color, textShadow: `0 0 18px ${letter.color}66` }}
        >
          {letter.ch}
        </span>
      ))}
    </div>
  )
}

function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/60 px-4 text-center backdrop-blur-sm">
      {children}
    </div>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-3">
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-white/35">
        {title}
      </h2>
      {children}
    </section>
  )
}

interface StatRowProps {
  label: string
  value: string
  accent?: boolean
}

function StatRow({ label, value, accent = false }: StatRowProps) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-white/35">{label}</span>
      <span
        className={`font-mono text-sm tabular-nums ${accent ? 'text-[var(--accent)]' : 'text-white/90'}`}
      >
        {value}
      </span>
    </div>
  )
}

export default function TetrisApp(_props: AppProps) {
  const game = useGame()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const boardAreaRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sizeRef = useRef<CanvasSize>({ cell: 0, w: 0, h: 0, dpr: 1 })
  const inputRef = useRef<InputState>({ left: false, right: false, dasDir: 0, dasTime: 0, arrTime: 0 })

  const highscoreRef = useRef(-1)
  if (highscoreRef.current < 0) highscoreRef.current = loadHighscore()
  const lastSavedRef = useRef(highscoreRef.current)
  const startRecordRef = useRef(highscoreRef.current)
  const prevPhaseRef = useRef<Phase>('idle')
  const lastSnapKeyRef = useRef('')

  const [focused, setFocused] = useState(false)
  const [ui, setUi] = useState<UiSnapshot>(() => ({
    phase: 'idle',
    score: 0,
    lines: 0,
    level: 1,
    highscore: highscoreRef.current,
    hold: null,
    holdUsed: false,
    next: [],
    newRecord: false,
  }))

  const resetInput = (): void => {
    const input = inputRef.current
    input.left = false
    input.right = false
    input.dasDir = 0
    input.dasTime = 0
    input.arrTime = 0
    game.setSoftDrop(false)
  }

  const persistHighscore = (): void => {
    if (highscoreRef.current > lastSavedRef.current) {
      lastSavedRef.current = highscoreRef.current
      saveHighscore(highscoreRef.current)
    }
  }

  const startGame = (): void => {
    startRecordRef.current = highscoreRef.current
    game.start()
  }

  useEffect(() => {
    rootRef.current?.focus()
    const focusTimer = window.setTimeout(() => rootRef.current?.focus(), 60)

    const onVisibility = (): void => {
      if (document.hidden) {
        game.pause()
        resetInput()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    const fitCanvas = (): void => {
      const area = boardAreaRef.current
      const canvas = canvasRef.current
      if (!area || !canvas) return
      const availW = area.clientWidth - 8
      const availH = area.clientHeight - 8
      if (availW <= 0 || availH <= 0) return
      const cell = Math.max(10, Math.floor(Math.min(availW / COLS, availH / VISIBLE_ROWS)))
      const dpr = window.devicePixelRatio || 1
      if (sizeRef.current.cell === cell && sizeRef.current.dpr === dpr) return
      const w = cell * COLS
      const h = cell * VISIBLE_ROWS
      sizeRef.current = { cell, w, h, dpr }
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
    }

    let observer: ResizeObserver | null = null
    if (boardAreaRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(fitCanvas)
      observer.observe(boardAreaRef.current)
    }
    fitCanvas()

    const stepInput = (dt: number): void => {
      const input = inputRef.current
      if (game.phase !== 'playing' || input.dasDir === 0) return
      input.dasTime += dt
      if (input.dasTime < DAS_MS) return
      input.arrTime += dt
      while (input.arrTime >= ARR_MS) {
        input.arrTime -= ARR_MS
        const moved = input.dasDir === -1 ? game.moveLeft() : game.moveRight()
        if (!moved) {
          input.arrTime = 0
          break
        }
      }
    }

    const draw = (): void => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const { cell, w, h, dpr } = sizeRef.current
      if (cell <= 0) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const bg = ctx.createLinearGradient(0, 0, 0, h)
      bg.addColorStop(0, 'rgba(13, 16, 32, 0.94)')
      bg.addColorStop(1, 'rgba(6, 8, 18, 0.97)')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, w, h)

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let c = 1; c < COLS; c++) {
        ctx.moveTo(c * cell + 0.5, 0)
        ctx.lineTo(c * cell + 0.5, h)
      }
      for (let r = 1; r < VISIBLE_ROWS; r++) {
        ctx.moveTo(0, r * cell + 0.5)
        ctx.lineTo(w, r * cell + 0.5)
      }
      ctx.stroke()

      for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const type = game.board[r][c]
          if (type) drawCell(ctx, c * cell, (r - HIDDEN_ROWS) * cell, cell, PIECE_COLORS[type])
        }
      }

      if (game.phase === 'clearing' && game.clearingRows.length > 0) {
        const progress = game.clearProgress()
        const alpha = progress < 0.4 ? 0.95 : Math.max(0, 0.95 * (1 - (progress - 0.4) / 0.6))
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`
        for (const row of game.clearingRows) {
          if (row >= HIDDEN_ROWS) ctx.fillRect(0, (row - HIDDEN_ROWS) * cell, w, cell)
        }
      }

      const piece = game.piece
      if (piece && (game.phase === 'playing' || game.phase === 'paused')) {
        const color = PIECE_COLORS[piece.type]
        const ghostY = game.ghostY()
        if (ghostY > piece.y) {
          for (const [x, y] of cellsOf({ ...piece, y: ghostY })) {
            if (y >= HIDDEN_ROWS) drawGhostCell(ctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, color)
          }
        }
        for (const [x, y] of cellsOf(piece)) {
          if (y >= HIDDEN_ROWS) drawCell(ctx, x * cell, (y - HIDDEN_ROWS) * cell, cell, color)
        }
      }
    }

    const syncUi = (): void => {
      if (game.score > highscoreRef.current) highscoreRef.current = game.score
      if (game.phase === 'gameover' && prevPhaseRef.current !== 'gameover') persistHighscore()
      prevPhaseRef.current = game.phase

      const next = game.nextPreview(3)
      const key = [
        game.phase,
        game.score,
        game.lines,
        game.holdType ?? '-',
        game.holdUsed ? 1 : 0,
        next.join(''),
        highscoreRef.current,
      ].join('|')
      if (key === lastSnapKeyRef.current) return
      lastSnapKeyRef.current = key
      setUi({
        phase: game.phase,
        score: game.score,
        lines: game.lines,
        level: game.level,
        highscore: highscoreRef.current,
        hold: game.holdType,
        holdUsed: game.holdUsed,
        next,
        newRecord: game.score > 0 && game.score > startRecordRef.current,
      })
    }

    let rafId = 0
    let last = performance.now()
    let accumulator = 0

    const frame = (now: number): void => {
      rafId = requestAnimationFrame(frame)
      let dt = now - last
      last = now
      if (dt > MAX_FRAME_MS) dt = MAX_FRAME_MS
      if (dt < 0) dt = 0
      accumulator += dt
      while (accumulator >= FIXED_STEP_MS) {
        stepInput(FIXED_STEP_MS)
        game.update(FIXED_STEP_MS)
        accumulator -= FIXED_STEP_MS
      }
      if (window.devicePixelRatio !== sizeRef.current.dpr) fitCanvas()
      draw()
      syncUi()
    }
    rafId = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(rafId)
      window.clearTimeout(focusTimer)
      observer?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      persistHighscore()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const input = inputRef.current
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    let handled = true
    switch (key) {
      case 'ArrowLeft':
        if (!event.repeat) {
          input.left = true
          input.dasDir = -1
          input.dasTime = 0
          input.arrTime = 0
          game.moveLeft()
        }
        break
      case 'ArrowRight':
        if (!event.repeat) {
          input.right = true
          input.dasDir = 1
          input.dasTime = 0
          input.arrTime = 0
          game.moveRight()
        }
        break
      case 'ArrowDown':
        game.setSoftDrop(true)
        break
      case ' ':
        if (!event.repeat) game.hardDrop()
        break
      case 'ArrowUp':
      case 'x':
        if (!event.repeat) game.rotate(1)
        break
      case 'z':
        if (!event.repeat) game.rotate(-1)
        break
      case 'c':
        if (!event.repeat) game.hold()
        break
      case 'p':
      case 'Escape':
        if (!event.repeat) game.togglePause()
        break
      case 'r':
        if (!event.repeat) startGame()
        break
      case 'Enter':
        if (!event.repeat && (game.phase === 'idle' || game.phase === 'gameover')) startGame()
        break
      default:
        handled = false
    }
    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  const handleKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const input = inputRef.current
    switch (event.key) {
      case 'ArrowLeft':
        input.left = false
        if (input.dasDir === -1) {
          input.dasDir = input.right ? 1 : 0
          input.dasTime = 0
          input.arrTime = 0
        }
        break
      case 'ArrowRight':
        input.right = false
        if (input.dasDir === 1) {
          input.dasDir = input.left ? -1 : 0
          input.dasTime = 0
          input.arrTime = 0
        }
        break
      case 'ArrowDown':
        game.setSoftDrop(false)
        break
      default:
        return
    }
    event.preventDefault()
  }

  const handleBlur = (): void => {
    setFocused(false)
    resetInput()
    game.pause()
  }

  const linesToNextLevel = 10 - (ui.lines % 10)

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onFocus={() => setFocused(true)}
      onBlur={handleBlur}
      onMouseDown={() => rootRef.current?.focus()}
      className="flex h-full w-full select-none gap-4 overflow-hidden p-4 outline-none"
    >
      <div
        ref={boardAreaRef}
        className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center"
      >
        <div className="relative overflow-hidden rounded-xl border border-white/10 shadow-[0_12px_48px_rgba(0,0,0,0.5)]">
          <canvas ref={canvasRef} className="block" />

          {ui.phase === 'idle' && (
            <Overlay>
              <Logo />
              <p className="mt-1 text-sm font-medium text-[var(--accent)]">Enter para começar</p>
              <p className="text-[10px] text-white/35">
                Setas movem · Espaço derruba · C reserva
              </p>
            </Overlay>
          )}

          {ui.phase === 'paused' && (
            <Overlay>
              <p className="text-lg font-bold text-white/90">Pausado</p>
              <p className="text-xs text-white/60">P ou Esc para continuar</p>
            </Overlay>
          )}

          {ui.phase === 'gameover' && (
            <Overlay>
              <p className="text-lg font-bold text-white/90">Fim de jogo</p>
              {ui.newRecord && (
                <p className="text-xs font-semibold text-[var(--accent)]">Novo recorde!</p>
              )}
              <p className="font-mono text-2xl tabular-nums text-[var(--accent)]">
                {formatNumber(ui.score)}
              </p>
              <p className="text-xs text-white/60">
                Recorde: <span className="font-mono tabular-nums">{formatNumber(ui.highscore)}</span>
              </p>
              <p className="mt-1 text-xs text-white/60">R para reiniciar</p>
            </Overlay>
          )}

          {!focused && (
            <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center pb-4">
              <span className="rounded-lg border border-white/10 bg-black/70 px-3 py-1.5 text-xs text-white/90 shadow-lg">
                Clique para jogar
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex w-44 shrink-0 flex-col gap-3 overflow-y-auto">
        <Panel title="Reserva">
          {ui.hold ? (
            <MiniPiece type={ui.hold} disabled={ui.holdUsed} className="h-12" />
          ) : (
            <div className="flex h-12 items-center justify-center rounded-lg border border-dashed border-white/10 text-[10px] text-white/35">
              C para reservar
            </div>
          )}
          {ui.hold !== null && ui.holdUsed && (
            <p className="mt-1 text-center text-[9px] text-white/35">já usada nesta peça</p>
          )}
        </Panel>

        <Panel title="Próximas">
          {ui.next.length > 0 ? (
            <div className="flex flex-col gap-1">
              {ui.next.map((type, index) => (
                <MiniPiece
                  key={`${type}-${index}`}
                  type={type}
                  className={index === 0 ? 'h-11' : 'h-9 opacity-80'}
                />
              ))}
            </div>
          ) : (
            <div className="flex h-24 items-center justify-center text-[10px] text-white/35">
              aguardando partida
            </div>
          )}
        </Panel>

        <Panel title="Placar">
          <div className="flex flex-col gap-1.5">
            <StatRow label="Pontos" value={formatNumber(ui.score)} accent />
            <StatRow label="Recorde" value={formatNumber(ui.highscore)} />
            <StatRow label="Nível" value={String(ui.level)} />
            <StatRow label="Linhas" value={String(ui.lines)} />
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--accent)]"
              style={{ width: `${(ui.lines % 10) * 10}%` }}
            />
          </div>
          <p className="mt-1 text-right text-[9px] text-white/35">
            {linesToNextLevel === 1
              ? '1 linha para o próximo nível'
              : `${linesToNextLevel} linhas para o próximo nível`}
          </p>
        </Panel>

        <Panel title="Controles">
          <ul className="flex flex-col gap-1">
            {CONTROLS.map(([keyLabel, description]) => (
              <li key={keyLabel} className="flex items-center justify-between gap-2">
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/60">
                  {keyLabel}
                </span>
                <span className="text-right text-[10px] text-white/35">{description}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
