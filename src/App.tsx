import { useEffect, useRef, useState } from 'react'
import { BootScreen } from './components/BootScreen'
import { Desktop } from './components/Desktop'
import { useWindows } from './system/windowStore'

export default function App() {
  const [booted, setBooted] = useState(false)
  const welcomed = useRef(false)

  useEffect(() => {
    if (!booted || welcomed.current) return
    welcomed.current = true
    if (!localStorage.getItem('fableos-welcomed')) {
      localStorage.setItem('fableos-welcomed', '1')
      useWindows.getState().openApp('about')
    }
  }, [booted])

  return booted ? <Desktop /> : <BootScreen onDone={() => setBooted(true)} />
}
