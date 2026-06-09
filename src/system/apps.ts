export interface AppMeta {
  id: string
  name: string
  description: string
  icon: string
  tint: string
  defaultSize: { width: number; height: number }
  minSize: { width: number; height: number }
  desktop: boolean
}

export const APP_META: AppMeta[] = [
  {
    id: 'terminal',
    name: 'Terminal',
    description: 'Linha de comando com acesso ao sistema de arquivos',
    icon: '💻',
    tint: '#34d399',
    defaultSize: { width: 740, height: 470 },
    minSize: { width: 420, height: 280 },
    desktop: true,
  },
  {
    id: 'files',
    name: 'Arquivos',
    description: 'Explorador do sistema de arquivos virtual',
    icon: '📁',
    tint: '#f59e0b',
    defaultSize: { width: 840, height: 530 },
    minSize: { width: 520, height: 340 },
    desktop: true,
  },
  {
    id: 'editor',
    name: 'Código',
    description: 'Editor de texto e código com highlight',
    icon: '📝',
    tint: '#60a5fa',
    defaultSize: { width: 880, height: 580 },
    minSize: { width: 480, height: 320 },
    desktop: true,
  },
  {
    id: 'paint',
    name: 'Paint',
    description: 'Desenho livre com formas, balde e undo',
    icon: '🎨',
    tint: '#f472b6',
    defaultSize: { width: 920, height: 620 },
    minSize: { width: 560, height: 400 },
    desktop: true,
  },
  {
    id: 'calculator',
    name: 'Calculadora',
    description: 'Calculadora científica com parser de expressões',
    icon: '🧮',
    tint: '#a78bfa',
    defaultSize: { width: 380, height: 560 },
    minSize: { width: 320, height: 480 },
    desktop: true,
  },
  {
    id: 'synth',
    name: 'Synth Studio',
    description: 'Sintetizador e sequenciador com Web Audio',
    icon: '🎹',
    tint: '#22d3ee',
    defaultSize: { width: 940, height: 640 },
    minSize: { width: 700, height: 480 },
    desktop: true,
  },
  {
    id: 'fluid',
    name: 'Fluidos',
    description: 'Simulação de fluidos em GPU (Navier-Stokes)',
    icon: '🌊',
    tint: '#38bdf8',
    defaultSize: { width: 900, height: 600 },
    minSize: { width: 480, height: 360 },
    desktop: true,
  },
  {
    id: 'fractal',
    name: 'Fractais',
    description: 'Explorador de Mandelbrot e Julia em WebGL',
    icon: '🌀',
    tint: '#c084fc',
    defaultSize: { width: 900, height: 600 },
    minSize: { width: 480, height: 360 },
    desktop: true,
  },
  {
    id: 'tetris',
    name: 'Tetris',
    description: 'Tetris completo com hold, ghost e ranking',
    icon: '🎮',
    tint: '#ef4444',
    defaultSize: { width: 780, height: 650 },
    minSize: { width: 560, height: 520 },
    desktop: true,
  },
  {
    id: 'monitor',
    name: 'Monitor',
    description: 'Painel de desempenho do sistema em tempo real',
    icon: '📊',
    tint: '#4ade80',
    defaultSize: { width: 900, height: 570 },
    minSize: { width: 600, height: 400 },
    desktop: true,
  },
  {
    id: 'settings',
    name: 'Ajustes',
    description: 'Personalização de tema, cores e wallpaper',
    icon: '⚙️',
    tint: '#94a3b8',
    defaultSize: { width: 780, height: 540 },
    minSize: { width: 520, height: 380 },
    desktop: true,
  },
  {
    id: 'about',
    name: 'Sobre',
    description: 'Sobre o FableOS',
    icon: '✨',
    tint: '#7c6cff',
    defaultSize: { width: 740, height: 580 },
    minSize: { width: 480, height: 380 },
    desktop: true,
  },
]

export function getAppMeta(id: string): AppMeta | undefined {
  return APP_META.find(app => app.id === id)
}
