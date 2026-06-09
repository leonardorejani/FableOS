import type { CSSProperties, ReactNode } from 'react'
import type { AppProps } from '../../system/types'
import { APP_META, type AppMeta } from '../../system/apps'
import { useWindows } from '../../system/windowStore'

// ---------------------------------------------------------------------------
// Conteúdo estático
// ---------------------------------------------------------------------------

const HERO_BADGES: string[] = ['React 19', 'TypeScript', 'WebGL + Web Audio']

interface TechCardData {
  title: string
  text: string
}

const TECH_CARDS: TechCardData[] = [
  {
    title: 'Window manager próprio',
    text: 'Janelas com arrastar, redimensionamento em 8 direções e ordenação de foco (z-order).',
  },
  {
    title: 'Sistema de arquivos virtual',
    text: 'VFS persistente em localStorage, compartilhado por todos os aplicativos do sistema.',
  },
  {
    title: 'Fluidos Navier-Stokes em GPU',
    text: 'Simulação de fluidos em tempo real resolvida inteiramente por shaders WebGL.',
  },
  {
    title: 'Síntese de áudio em tempo real',
    text: 'Sintetizador e sequenciador construídos diretamente sobre a Web Audio API.',
  },
  {
    title: 'Fractais renderizados em shader',
    text: 'Conjuntos de Mandelbrot e Julia explorados com zoom profundo na GPU.',
  },
  {
    title: 'Zero dependências de UI',
    text: 'Toda a interface é feita apenas com React e Tailwind — nada além disso.',
  },
]

interface ShortcutData {
  action: string
  how: string
}

const SHORTCUTS: ShortcutData[] = [
  { action: 'Maximizar ou restaurar janela', how: 'Duplo clique na barra de título' },
  { action: 'Mover janela', how: 'Arrastar a barra de título' },
  { action: 'Redimensionar janela', how: 'Arrastar bordas ou cantos (8 direções)' },
  { action: 'Menu de contexto do desktop', how: 'Clique direito no desktop' },
  { action: 'Abrir aplicativo', how: 'Duplo clique no ícone do desktop' },
  { action: 'Minimizar ou trazer de volta', how: 'Clique no app na barra de tarefas' },
  { action: 'Abrir um app desta tela', how: 'Tab para focar · Enter para abrir' },
]

// ---------------------------------------------------------------------------
// Blocos de apoio
// ---------------------------------------------------------------------------

interface SectionProps {
  delay: number
  children: ReactNode
}

function Section({ delay, children }: SectionProps) {
  const style: CSSProperties = {
    animationDelay: `${delay}ms`,
    animationDuration: '0.5s',
    animationFillMode: 'backwards',
  }
  return (
    <section className="slide-up" style={style}>
      {children}
    </section>
  )
}

interface SectionTitleProps {
  title: string
  subtitle?: string
}

function SectionTitle({ title, subtitle }: SectionTitleProps) {
  return (
    <div className="mb-4 flex items-baseline gap-2.5">
      <span aria-hidden className="h-4 w-1 self-center rounded-full bg-[var(--accent)]" />
      <h2 className="text-sm font-semibold tracking-wide text-white/90">{title}</h2>
      {subtitle ? <span className="text-xs text-white/35">{subtitle}</span> : null}
    </div>
  )
}

function Divider() {
  return <div aria-hidden className="fade-in h-px w-full bg-white/10" />
}

interface AppCardProps {
  meta: AppMeta
}

function AppCard({ meta }: AppCardProps) {
  const handleOpen = (): void => {
    try {
      useWindows.getState().openApp(meta.id)
    } catch {
      // App indisponível no momento — nada a fazer aqui.
    }
  }

  return (
    <button
      type="button"
      onClick={handleOpen}
      title={`Abrir ${meta.name}`}
      className="group flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/5 p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--accent)]/70 hover:bg-white/[0.08] hover:shadow-[0_12px_32px_rgba(0,0,0,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
    >
      <span
        aria-hidden
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl transition-transform duration-200 group-hover:scale-105"
        style={{
          background: `color-mix(in srgb, ${meta.tint} 22%, transparent)`,
          border: `1px solid color-mix(in srgb, ${meta.tint} 38%, transparent)`,
        }}
      >
        {meta.icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-white/90 transition-colors group-hover:text-white">
          {meta.name}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-white/50">{meta.description}</span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <div className="flex flex-col items-center gap-5 pt-2 text-center">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-2xl text-4xl font-bold text-white"
        style={{
          background: 'linear-gradient(135deg, var(--accent), #22d3ee)',
          boxShadow:
            '0 0 42px color-mix(in srgb, var(--accent) 45%, transparent), 0 0 96px color-mix(in srgb, #22d3ee 18%, transparent)',
        }}
      >
        F
      </div>

      <div className="flex items-end justify-center gap-2.5">
        <h1
          className="bg-clip-text text-5xl font-bold tracking-tight text-transparent"
          style={{ backgroundImage: 'linear-gradient(90deg, var(--accent), #22d3ee)' }}
        >
          FableOS
        </h1>
        <span className="mb-2 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/60">
          versão 1.0
        </span>
      </div>

      <p className="max-w-md text-sm leading-relaxed text-white/60">
        Um sistema operacional completo no seu navegador — projetado e construído pelo Claude
        Fable 5
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {HERO_BADGES.map(badge => (
          <span
            key={badge}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur-sm transition-colors hover:border-white/20 hover:text-white/90"
          >
            {badge}
          </span>
        ))}
      </div>
    </div>
  )
}

interface AppsGridProps {
  apps: AppMeta[]
}

function AppsGrid({ apps }: AppsGridProps) {
  return (
    <div>
      <SectionTitle title="Aplicativos" subtitle="clique para abrir" />
      {apps.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-white/40">
          Nenhum aplicativo registrado no sistema.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
          {apps.map(meta => (
            <AppCard key={meta.id} meta={meta} />
          ))}
        </div>
      )}
    </div>
  )
}

function SystemSection() {
  return (
    <div>
      <SectionTitle title="Por dentro do sistema" />
      <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
        {TECH_CARDS.map(card => (
          <div
            key={card.title}
            className="rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:border-white/20 hover:bg-white/[0.07]"
          >
            <h3 className="text-[13px] font-semibold text-white/85">{card.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-white/50">{card.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShortcutsSection() {
  return (
    <div>
      <SectionTitle title="Atalhos e gestos" />
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-white/60">
              <th className="px-4 py-2.5 font-medium">Ação</th>
              <th className="px-4 py-2.5 font-medium">Como fazer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {SHORTCUTS.map(shortcut => (
              <tr key={shortcut.action} className="transition-colors hover:bg-white/[0.04]">
                <td className="px-4 py-2.5 text-white/80">{shortcut.action}</td>
                <td className="px-4 py-2.5">
                  <kbd className="rounded-md border border-white/15 bg-white/10 px-2 py-1 font-mono text-[11px] text-white/70">
                    {shortcut.how}
                  </kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function AboutApp(_props: AppProps) {
  const apps = APP_META.filter(meta => meta.id !== 'about')

  return (
    <div className="@container h-full w-full overflow-y-auto overflow-x-hidden">
      <div className="relative mx-auto flex max-w-3xl flex-col gap-10 px-6 pb-6 pt-10 @3xl:max-w-4xl">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-12 left-1/2 h-72 w-[36rem] max-w-full -translate-x-1/2"
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in srgb, var(--accent) 16%, transparent), transparent)',
          }}
        />

        <Section delay={0}>
          <Hero />
        </Section>

        <Divider />

        <Section delay={120}>
          <AppsGrid apps={apps} />
        </Section>

        <Divider />

        <Section delay={220}>
          <SystemSection />
        </Section>

        <Divider />

        <Section delay={320}>
          <ShortcutsSection />
        </Section>

        <footer className="fade-in pb-1 pt-2 text-center text-[11px] text-white/35">
          Feito com computação e <span className="text-[var(--accent)]">❤</span> pelo Claude
          Fable 5 · 2026
        </footer>
      </div>
    </div>
  )
}
