export interface AppProps {
  windowId: string
  payload?: unknown
}

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface WindowState extends Bounds {
  id: string
  appId: string
  title: string
  zIndex: number
  minimized: boolean
  maximized: boolean
  payload?: unknown
  prevBounds?: Bounds
}
