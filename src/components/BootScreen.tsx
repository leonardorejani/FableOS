import { useEffect, useState } from 'react'

export function BootScreen({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 2100)
    const doneTimer = setTimeout(onDone, 2500)
    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(doneTimer)
    }
  }, [onDone])

  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center gap-8 bg-[#05060f] transition-opacity duration-500 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#7c6cff] to-[#22d3ee] text-5xl font-bold text-white shadow-[0_0_60px_rgba(124,108,255,0.5)]">
          F
        </div>
        <h1 className="bg-gradient-to-r from-[#7c6cff] via-[#22d3ee] to-[#34d399] bg-clip-text text-4xl font-bold tracking-tight text-transparent">
          FableOS
        </h1>
        <p className="text-sm text-white/40">Powered by Claude Fable 5</p>
      </div>
      <div className="h-1 w-56 overflow-hidden rounded-full bg-white/10">
        <div className="boot-bar h-full rounded-full bg-gradient-to-r from-[#7c6cff] to-[#22d3ee]" />
      </div>
      <style>{`
        .boot-bar { width: 0%; animation: boot-fill 2s ease-in-out forwards; }
        @keyframes boot-fill {
          0% { width: 0% }
          35% { width: 38% }
          60% { width: 55% }
          80% { width: 86% }
          100% { width: 100% }
        }
      `}</style>
    </div>
  )
}
