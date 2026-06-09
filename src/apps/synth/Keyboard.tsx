import { useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

const SEMITONE_IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false]
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export const FIRST_MIDI = 60 // C4
export const LAST_MIDI = 83 // B5

interface KeyInfo {
  midi: number
  black: boolean
  /** posição esquerda em % */
  left: number
  /** largura em % */
  width: number
  name: string
}

function buildKeys(): KeyInfo[] {
  const keys: KeyInfo[] = []
  const whiteCount = 14
  const whiteWidth = 100 / whiteCount
  let whiteIndex = 0
  for (let midi = FIRST_MIDI; midi <= LAST_MIDI; midi++) {
    const semitone = midi % 12
    const octave = Math.floor(midi / 12) - 1
    const name = `${NOTE_NAMES[semitone]}${octave}`
    if (SEMITONE_IS_BLACK[semitone]) {
      const blackWidth = whiteWidth * 0.62
      keys.push({ midi, black: true, left: whiteIndex * whiteWidth - blackWidth / 2, width: blackWidth, name })
    } else {
      keys.push({ midi, black: false, left: whiteIndex * whiteWidth, width: whiteWidth, name })
      whiteIndex++
    }
  }
  return keys
}

interface KeyboardProps {
  pressed: ReadonlySet<number>
  hints: ReadonlyMap<number, string>
  onNoteOn: (midi: number) => void
  onNoteOff: (midi: number) => void
}

/** Teclado visual de 2 oitavas (C4–B5) com suporte a glissando por arrasto. */
export function Keyboard({ pressed, hints, onNoteOn, onNoteOff }: KeyboardProps) {
  const keys = useMemo(buildKeys, [])
  const pointerNotes = useRef(new Set<number>())

  const press = (midi: number): void => {
    if (pointerNotes.current.has(midi)) return
    pointerNotes.current.add(midi)
    onNoteOn(midi)
  }

  const releaseByPointer = (midi: number): void => {
    if (!pointerNotes.current.has(midi)) return
    pointerNotes.current.delete(midi)
    onNoteOff(midi)
  }

  const handleDown = (midi: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    press(midi)
  }

  const handleEnter = (midi: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.buttons & 1) === 1) press(midi)
  }

  return (
    <div className="relative h-full w-full select-none overflow-hidden rounded-xl border border-white/10 bg-black/40 p-1">
      <div className="relative h-full w-full">
        {keys
          .filter(k => !k.black)
          .map(key => {
            const isPressed = pressed.has(key.midi)
            return (
              <div
                key={key.midi}
                role="button"
                aria-label={`Tecla ${key.name}`}
                onPointerDown={handleDown(key.midi)}
                onPointerUp={() => releaseByPointer(key.midi)}
                onPointerLeave={() => releaseByPointer(key.midi)}
                onPointerEnter={handleEnter(key.midi)}
                style={{ left: `${key.left}%`, width: `${key.width}%` }}
                className={`absolute bottom-0 top-0 touch-none rounded-b-md border border-black/40 transition-colors duration-75 ${
                  isPressed
                    ? 'bg-[var(--accent)]'
                    : 'bg-gradient-to-b from-white/90 to-white/65 hover:from-white hover:to-white/75'
                }`}
              >
                <div className="absolute inset-x-0 bottom-1 flex flex-col items-center gap-0.5">
                  {hints.has(key.midi) && (
                    <span className={`font-mono text-[9px] ${isPressed ? 'text-white/80' : 'text-black/40'}`}>
                      {hints.get(key.midi)}
                    </span>
                  )}
                  {key.midi % 12 === 0 && (
                    <span className={`text-[8px] ${isPressed ? 'text-white/70' : 'text-black/30'}`}>{key.name}</span>
                  )}
                </div>
              </div>
            )
          })}
        {keys
          .filter(k => k.black)
          .map(key => {
            const isPressed = pressed.has(key.midi)
            return (
              <div
                key={key.midi}
                role="button"
                aria-label={`Tecla ${key.name}`}
                onPointerDown={handleDown(key.midi)}
                onPointerUp={() => releaseByPointer(key.midi)}
                onPointerLeave={() => releaseByPointer(key.midi)}
                onPointerEnter={handleEnter(key.midi)}
                style={{ left: `${key.left}%`, width: `${key.width}%` }}
                className={`absolute top-0 z-10 h-[58%] touch-none rounded-b-md border border-white/10 transition-colors duration-75 ${
                  isPressed ? 'bg-[var(--accent)]' : 'bg-[#15151c] hover:bg-[#23232d]'
                }`}
              >
                {hints.has(key.midi) && (
                  <span
                    className={`absolute inset-x-0 bottom-1 text-center font-mono text-[9px] ${
                      isPressed ? 'text-white/80' : 'text-white/35'
                    }`}
                  >
                    {hints.get(key.midi)}
                  </span>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}
