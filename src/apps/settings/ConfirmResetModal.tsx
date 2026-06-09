import { useEffect, useRef } from 'react'
import { factoryReset } from './helpers'
import { WarningIcon } from './icons'

interface ConfirmResetModalProps {
  onCancel: () => void
}

export function ConfirmResetModal({ onCancel }: ConfirmResetModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-reset-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-label="Fechar confirmação"
        tabIndex={-1}
      />
      <div className="relative w-full max-w-sm rounded-xl border border-white/10 bg-[#181a23]/95 p-5 shadow-2xl backdrop-blur-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/15">
            <WarningIcon className="h-5 w-5 text-red-400" />
          </span>
          <div>
            <h3 id="settings-reset-title" className="text-sm font-semibold text-white/90">
              Restaurar padrões de fábrica?
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-white/55">
              Todos os arquivos do sistema de arquivos virtual e todas as preferências (cor de
              destaque, wallpaper e dados de apps) serão apagados. O FableOS será reiniciado em
              seguida. Esta ação não pode ser desfeita.
            </p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/15"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={factoryReset}
            className="rounded-lg bg-red-500/85 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500"
          >
            Apagar tudo e reiniciar
          </button>
        </div>
      </div>
    </div>
  )
}
