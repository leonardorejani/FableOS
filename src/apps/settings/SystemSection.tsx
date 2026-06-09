import { useEffect, useMemo, useState } from 'react'
import { stats, useVfs, type VfsStats } from '../../system/vfs'
import { formatBytes, parseBrowser } from './helpers'

interface InfoItem {
  label: string
  value: string
}

interface InfoCardProps {
  title: string
  items: InfoItem[]
}

function InfoCard({ title, items }: InfoCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div className="border-b border-white/10 px-4 py-2.5 text-xs font-medium text-white/70">
        {title}
      </div>
      <div className="divide-y divide-white/5">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span className="text-xs text-white/50">{item.label}</span>
            <span className="text-right text-xs font-medium text-white/90">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface WindowSize {
  width: number
  height: number
}

interface SystemSectionProps {
  onRequestReset: () => void
}

export function SystemSection({ onRequestReset }: SystemSectionProps) {
  const vfsVersion = useVfs(s => s.version)
  const [windowSize, setWindowSize] = useState<WindowSize>(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))

  useEffect(() => {
    const onResize = (): void => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const browser = useMemo(() => parseBrowser(navigator.userAgent), [])

  const vfsStats = useMemo<VfsStats | null>(() => {
    try {
      return stats()
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vfsVersion])

  const cores =
    typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency > 0
      ? String(navigator.hardwareConcurrency)
      : '—'

  const systemItems: InfoItem[] = [
    { label: 'Versão', value: 'FableOS 1.0' },
    { label: 'Modelo', value: 'Claude Fable 5' },
    { label: 'Navegador', value: `${browser.name} ${browser.version}`.trim() },
    { label: 'Resolução da tela', value: `${screen.width} × ${screen.height}` },
    { label: 'Janela do navegador', value: `${windowSize.width} × ${windowSize.height}` },
    { label: 'Núcleos lógicos', value: cores },
    { label: 'Idioma', value: navigator.language },
  ]

  const vfsItems: InfoItem[] = vfsStats
    ? [
        { label: 'Arquivos', value: vfsStats.files.toLocaleString('pt-BR') },
        { label: 'Pastas', value: vfsStats.dirs.toLocaleString('pt-BR') },
        { label: 'Espaço usado', value: formatBytes(vfsStats.bytes) },
      ]
    : []

  return (
    <section className="space-y-5">
      <header>
        <h2 className="text-sm font-semibold text-white/90">Sistema</h2>
        <p className="mt-0.5 text-xs text-white/50">
          Informações sobre o FableOS e o ambiente em que ele está rodando.
        </p>
      </header>

      <InfoCard title="Sobre o sistema" items={systemItems} />

      {vfsStats ? (
        <InfoCard title="Sistema de arquivos virtual" items={vfsItems} />
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/50">
          Não foi possível ler as estatísticas do sistema de arquivos.
        </div>
      )}

      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
        <h3 className="text-sm font-semibold text-red-400">Zona de perigo</h3>
        <p className="mt-1 text-xs leading-relaxed text-white/50">
          Restaura o FableOS ao estado original: apaga todos os arquivos do sistema de arquivos
          virtual e todas as preferências de tema e wallpaper.
        </p>
        <button
          type="button"
          onClick={onRequestReset}
          className="mt-3 rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/30 hover:text-red-200"
        >
          Restaurar padrões de fábrica
        </button>
      </div>
    </section>
  )
}
