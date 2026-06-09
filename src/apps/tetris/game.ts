// Lógica pura do Tetris — sem DOM. Tabuleiro, 7-bag, SRS com wall kicks,
// gravidade por nível, lock delay, hold, pontuação e fases do jogo.

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
export type Cell = PieceType | null
export type Phase = 'idle' | 'playing' | 'paused' | 'clearing' | 'gameover'
export type RotationDir = 1 | -1
export type Offset = readonly [number, number]

export interface ActivePiece {
  type: PieceType
  rotation: number
  x: number
  y: number
}

export const COLS = 10
export const VISIBLE_ROWS = 20
export const HIDDEN_ROWS = 2
export const TOTAL_ROWS = VISIBLE_ROWS + HIDDEN_ROWS
export const CLEAR_FLASH_MS = 150

const LOCK_DELAY_MS = 500
const MAX_LOCK_RESETS = 15
const SOFT_DROP_INTERVAL_MS = 45
const BASE_GRAVITY_MS = 1000
const MIN_GRAVITY_MS = 80
const QUEUE_MIN = 5
const LINE_SCORES = [0, 100, 300, 500, 800] as const

export const PIECE_TYPES: readonly PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']

// Estados de rotação SRS (0 = spawn, 1 = horário, 2 = 180°, 3 = anti-horário).
// Cada célula é um offset [x, y] dentro da caixa da peça (y cresce para baixo).
export const PIECE_SHAPES: Record<PieceType, readonly (readonly Offset[])[]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
}

// Tabelas de wall kick SRS já convertidas para coordenadas de tela (y para baixo).
const KICKS_JLSTZ: Record<string, readonly Offset[]> = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
}

const KICKS_I: Record<string, readonly Offset[]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
}

export function cellsOf(piece: ActivePiece): Offset[] {
  return PIECE_SHAPES[piece.type][piece.rotation].map(
    ([dx, dy]) => [piece.x + dx, piece.y + dy] as const,
  )
}

function createEmptyBoard(): Cell[][] {
  return Array.from({ length: TOTAL_ROWS }, () => new Array<Cell>(COLS).fill(null))
}

function shuffledBag(): PieceType[] {
  const bag = [...PIECE_TYPES]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

export class TetrisGame {
  board: Cell[][] = createEmptyBoard()
  piece: ActivePiece | null = null
  holdType: PieceType | null = null
  holdUsed = false
  score = 0
  lines = 0
  phase: Phase = 'idle'
  clearingRows: number[] = []

  private queue: PieceType[] = []
  private bag: PieceType[] = []
  private gravityAcc = 0
  private lockTimer = 0
  private lockResets = 0
  private lowestY = 0
  private clearTimer = 0
  private softDropping = false

  get level(): number {
    return Math.floor(this.lines / 10) + 1
  }

  gravityInterval(): number {
    return Math.max(MIN_GRAVITY_MS, BASE_GRAVITY_MS * Math.pow(0.85, this.level - 1))
  }

  nextPreview(count: number): PieceType[] {
    return this.queue.slice(0, count)
  }

  clearProgress(): number {
    return Math.min(1, this.clearTimer / CLEAR_FLASH_MS)
  }

  start(): void {
    this.board = createEmptyBoard()
    this.piece = null
    this.holdType = null
    this.holdUsed = false
    this.score = 0
    this.lines = 0
    this.clearingRows = []
    this.queue = []
    this.bag = []
    this.gravityAcc = 0
    this.lockTimer = 0
    this.lockResets = 0
    this.lowestY = 0
    this.clearTimer = 0
    this.softDropping = false
    this.refillQueue()
    this.phase = 'playing'
    this.spawnFromQueue()
  }

  pause(): void {
    if (this.phase === 'playing') this.phase = 'paused'
  }

  togglePause(): void {
    if (this.phase === 'playing') this.phase = 'paused'
    else if (this.phase === 'paused') this.phase = 'playing'
  }

  setSoftDrop(on: boolean): void {
    this.softDropping = on
  }

  update(dt: number): void {
    if (this.phase === 'clearing') {
      this.clearTimer += dt
      if (this.clearTimer >= CLEAR_FLASH_MS) this.finishClear()
      return
    }
    if (this.phase !== 'playing' || !this.piece) return
    if (this.isGrounded()) {
      this.gravityAcc = 0
      this.lockTimer += dt
      if (this.lockTimer >= LOCK_DELAY_MS) this.lockPiece()
      return
    }
    const interval = this.softDropping
      ? Math.min(SOFT_DROP_INTERVAL_MS, this.gravityInterval())
      : this.gravityInterval()
    this.gravityAcc += dt
    while (this.gravityAcc >= interval && this.piece) {
      this.gravityAcc -= interval
      if (!this.stepDown()) break
    }
  }

  moveLeft(): boolean {
    return this.shift(-1)
  }

  moveRight(): boolean {
    return this.shift(1)
  }

  rotate(dir: RotationDir): boolean {
    const piece = this.piece
    if (this.phase !== 'playing' || !piece) return false
    if (piece.type === 'O') return false
    const from = piece.rotation
    const to = (from + (dir === 1 ? 1 : 3)) % 4
    const table = piece.type === 'I' ? KICKS_I : KICKS_JLSTZ
    const kicks = table[`${from}>${to}`] ?? [[0, 0] as const]
    for (const [dx, dy] of kicks) {
      const candidate: ActivePiece = { ...piece, rotation: to, x: piece.x + dx, y: piece.y + dy }
      if (!this.collides(candidate)) {
        this.piece = candidate
        this.onMoveSuccess()
        return true
      }
    }
    return false
  }

  hardDrop(): void {
    const piece = this.piece
    if (this.phase !== 'playing' || !piece) return
    const target = this.ghostY()
    const dist = target - piece.y
    if (dist > 0) {
      this.piece = { ...piece, y: target }
      this.score += dist * 2
    }
    this.lockPiece()
  }

  hold(): void {
    const piece = this.piece
    if (this.phase !== 'playing' || !piece || this.holdUsed) return
    const current = piece.type
    if (this.holdType === null) {
      this.holdType = current
      this.spawnFromQueue()
    } else {
      const swapped = this.holdType
      this.holdType = current
      this.spawnPiece(swapped)
    }
    this.holdUsed = true
  }

  ghostY(): number {
    const piece = this.piece
    if (!piece) return 0
    let y = piece.y
    while (!this.collides({ ...piece, y: y + 1 })) y++
    return y
  }

  isGrounded(): boolean {
    const piece = this.piece
    if (!piece) return false
    return this.collides({ ...piece, y: piece.y + 1 })
  }

  private shift(dx: number): boolean {
    const piece = this.piece
    if (this.phase !== 'playing' || !piece) return false
    const candidate: ActivePiece = { ...piece, x: piece.x + dx }
    if (this.collides(candidate)) return false
    this.piece = candidate
    this.onMoveSuccess()
    return true
  }

  private onMoveSuccess(): void {
    if (this.isGrounded()) {
      if (this.lockResets < MAX_LOCK_RESETS) {
        this.lockTimer = 0
        this.lockResets++
      }
    } else {
      this.lockTimer = 0
    }
  }

  private stepDown(): boolean {
    const piece = this.piece
    if (!piece) return false
    const candidate: ActivePiece = { ...piece, y: piece.y + 1 }
    if (this.collides(candidate)) return false
    this.piece = candidate
    this.lockTimer = 0
    if (candidate.y > this.lowestY) {
      this.lowestY = candidate.y
      this.lockResets = 0
    }
    if (this.softDropping) this.score += 1
    return true
  }

  private collides(piece: ActivePiece): boolean {
    for (const [x, y] of cellsOf(piece)) {
      if (x < 0 || x >= COLS || y < 0 || y >= TOTAL_ROWS) return true
      if (this.board[y][x] !== null) return true
    }
    return false
  }

  private lockPiece(): void {
    const piece = this.piece
    if (!piece) return
    const cells = cellsOf(piece)
    for (const [x, y] of cells) this.board[y][x] = piece.type
    this.piece = null
    if (cells.every(([, y]) => y < HIDDEN_ROWS)) {
      this.phase = 'gameover'
      return
    }
    const full: number[] = []
    for (let r = 0; r < TOTAL_ROWS; r++) {
      if (this.board[r].every(cell => cell !== null)) full.push(r)
    }
    if (full.length > 0) {
      this.score += LINE_SCORES[Math.min(full.length, 4)] * this.level
      this.clearingRows = full
      this.clearTimer = 0
      this.phase = 'clearing'
      return
    }
    this.spawnFromQueue()
  }

  private finishClear(): void {
    const remaining = this.board.filter((_, r) => !this.clearingRows.includes(r))
    while (remaining.length < TOTAL_ROWS) {
      remaining.unshift(new Array<Cell>(COLS).fill(null))
    }
    this.board = remaining
    this.lines += this.clearingRows.length
    this.clearingRows = []
    this.phase = 'playing'
    this.spawnFromQueue()
  }

  private spawnFromQueue(): void {
    const type = this.queue.shift()
    this.refillQueue()
    if (!type) {
      this.phase = 'gameover'
      return
    }
    this.holdUsed = false
    this.spawnPiece(type)
  }

  private spawnPiece(type: PieceType): void {
    const piece: ActivePiece = { type, rotation: 0, x: 3, y: 0 }
    this.gravityAcc = 0
    this.lockTimer = 0
    this.lockResets = 0
    this.lowestY = 0
    this.piece = piece
    if (this.collides(piece)) this.phase = 'gameover'
  }

  private refillQueue(): void {
    while (this.queue.length < QUEUE_MIN) {
      if (this.bag.length === 0) this.bag = shuffledBag()
      const next = this.bag.pop()
      if (next) this.queue.push(next)
    }
  }
}
