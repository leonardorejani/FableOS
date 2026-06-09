import { lazy } from 'react'
import type React from 'react'
import type { AppProps } from './types'

type LazyApp = React.LazyExoticComponent<React.FC<AppProps>>

export const APP_COMPONENTS: Record<string, LazyApp> = {
  terminal: lazy(() => import('../apps/terminal')),
  files: lazy(() => import('../apps/files')),
  editor: lazy(() => import('../apps/editor')),
  paint: lazy(() => import('../apps/paint')),
  calculator: lazy(() => import('../apps/calculator')),
  synth: lazy(() => import('../apps/synth')),
  fluid: lazy(() => import('../apps/fluid')),
  fractal: lazy(() => import('../apps/fractal')),
  tetris: lazy(() => import('../apps/tetris')),
  monitor: lazy(() => import('../apps/monitor')),
  settings: lazy(() => import('../apps/settings')),
  about: lazy(() => import('../apps/about')),
}
