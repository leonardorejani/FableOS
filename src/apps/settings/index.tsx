import { useEffect, useState, type ComponentType, type KeyboardEvent } from 'react'
import type { AppProps } from '../../system/types'
import { useWindows } from '../../system/windowStore'
import { AppearanceSection } from './AppearanceSection'
import { WallpaperSection } from './WallpaperSection'
import { SystemSection } from './SystemSection'
import { ConfirmResetModal } from './ConfirmResetModal'
import { ChipIcon, DropletIcon, ImageIcon, type IconProps } from './icons'

type SectionId = 'appearance' | 'wallpaper' | 'system'

interface SectionDef {
  id: SectionId
  label: string
  Icon: ComponentType<IconProps>
}

const SECTIONS: SectionDef[] = [
  { id: 'appearance', label: 'Aparência', Icon: DropletIcon },
  { id: 'wallpaper', label: 'Wallpaper', Icon: ImageIcon },
  { id: 'system', label: 'Sistema', Icon: ChipIcon },
]

const SECTION_BY_KEY: Record<string, SectionId> = {
  '1': 'appearance',
  '2': 'wallpaper',
  '3': 'system',
}

export default function SettingsApp({ windowId }: AppProps) {
  const [section, setSection] = useState<SectionId>('appearance')
  const [resetOpen, setResetOpen] = useState(false)

  useEffect(() => {
    const def = SECTIONS.find(s => s.id === section)
    if (def) useWindows.getState().setTitle(windowId, `Ajustes — ${def.label}`)
  }, [windowId, section])

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (resetOpen) return
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
    const next = SECTION_BY_KEY[e.key]
    if (next) {
      e.preventDefault()
      setSection(next)
    }
  }

  return (
    <div
      className="relative flex h-full w-full overflow-hidden text-white/90 outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <aside className="flex w-44 shrink-0 flex-col gap-1 border-r border-white/10 p-2">
        {SECTIONS.map(({ id, label, Icon }) => {
          const active = id === section
          return (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              aria-current={active ? 'page' : undefined}
              className={`group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition-colors ${
                active
                  ? 'bg-white/10 text-white/90'
                  : 'text-white/60 hover:bg-white/5 hover:text-white/85'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-[var(--accent)]" />
              )}
              <Icon
                className={`h-4 w-4 shrink-0 transition-colors ${
                  active ? 'text-[var(--accent)]' : 'text-white/40 group-hover:text-white/65'
                }`}
              />
              <span>{label}</span>
            </button>
          )
        })}
        <div className="mt-auto px-3 pb-1 text-[10px] leading-relaxed text-white/25">
          Teclas 1–3 alternam as seções
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-5">
        {section === 'appearance' && <AppearanceSection />}
        {section === 'wallpaper' && <WallpaperSection />}
        {section === 'system' && <SystemSection onRequestReset={() => setResetOpen(true)} />}
      </main>

      {resetOpen && <ConfirmResetModal onCancel={() => setResetOpen(false)} />}
    </div>
  )
}
