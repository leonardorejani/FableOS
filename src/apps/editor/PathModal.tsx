import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react'

interface PathModalProps {
  title: string
  confirmLabel: string
  initialValue: string
  note?: string
  /** Retorna mensagem de erro para manter o modal aberto, ou null em caso de sucesso. */
  onConfirm: (value: string) => string | null
  onCancel: () => void
}

export default function PathModal({
  title,
  confirmLabel,
  initialValue,
  note,
  onConfirm,
  onCancel,
}: PathModalProps) {
  const [value, setValue] = useState<string>(initialValue)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.focus()
      const len = input.value.length
      input.setSelectionRange(len, len)
    }
  }, [])

  const confirm = (): void => {
    const err = onConfirm(value)
    if (err !== null) setError(err)
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    e.stopPropagation()
    if (e.key === 'Enter') {
      e.preventDefault()
      confirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  const stopMouse = (e: ReactMouseEvent<HTMLDivElement>): void => {
    e.stopPropagation()
  }

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      onMouseDown={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-[440px] rounded-xl border border-white/10 bg-[#15171f]/95 p-4 shadow-2xl"
        onMouseDown={stopMouse}
      >
        <h2 className="mb-3 text-sm font-medium text-white/90">{title}</h2>
        <label className="block">
          <span className="mb-1 block text-[11px] text-white/50">Caminho do arquivo</span>
          <input
            ref={inputRef}
            value={value}
            onChange={e => {
              setValue(e.target.value)
              setError(null)
            }}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white/90 outline-none placeholder:text-white/25 focus:border-[var(--accent)]"
            placeholder="/home/user/documentos/arquivo.txt"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        {note !== undefined && <p className="mt-2 text-[11px] text-amber-300/80">{note}</p>}
        {error !== null && <p className="mt-2 text-[11px] text-red-300">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/15"
          >
            Cancelar
          </button>
          <button
            onClick={confirm}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs text-white transition-opacity hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
