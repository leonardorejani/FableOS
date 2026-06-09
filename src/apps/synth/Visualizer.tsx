import { useEffect, useRef } from 'react'
import type { SynthEngine } from './engine'

interface VisualizerProps {
  engine: SynthEngine
  accent: string
}

/** Osciloscópio em tempo real alimentado pelo AnalyserNode da engine. */
export function Visualizer({ engine, accent }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const accentRef = useRef(accent)
  accentRef.current = accent

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return

    let rafId = 0
    let data = new Uint8Array(0)

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, Math.floor(rect.width * dpr))
      canvas.height = Math.max(1, Math.floor(rect.height * dpr))
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)

    const draw = (): void => {
      rafId = requestAnimationFrame(draw)
      const width = canvas.width
      const height = canvas.height
      const dpr = window.devicePixelRatio || 1
      ctx2d.clearRect(0, 0, width, height)

      // grade sutil
      ctx2d.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx2d.lineWidth = 1
      ctx2d.beginPath()
      ctx2d.moveTo(0, height / 2)
      ctx2d.lineTo(width, height / 2)
      ctx2d.stroke()

      const analyser = engine.getAnalyser()
      ctx2d.lineWidth = Math.max(1.5, 1.25 * dpr)
      ctx2d.lineJoin = 'round'

      if (!analyser) {
        ctx2d.strokeStyle = 'rgba(255,255,255,0.15)'
        ctx2d.beginPath()
        ctx2d.moveTo(0, height / 2)
        ctx2d.lineTo(width, height / 2)
        ctx2d.stroke()
        return
      }

      if (data.length !== analyser.fftSize) data = new Uint8Array(analyser.fftSize)
      analyser.getByteTimeDomainData(data)

      ctx2d.strokeStyle = accentRef.current
      ctx2d.shadowColor = accentRef.current
      ctx2d.shadowBlur = 6 * dpr
      ctx2d.beginPath()
      const sliceWidth = width / (data.length - 1)
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128 - 1
        const y = height / 2 + v * (height / 2) * 0.9
        if (i === 0) ctx2d.moveTo(0, y)
        else ctx2d.lineTo(i * sliceWidth, y)
      }
      ctx2d.stroke()
      ctx2d.shadowBlur = 0
    }
    rafId = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [engine])

  return <canvas ref={canvasRef} className="h-full w-full" />
}
