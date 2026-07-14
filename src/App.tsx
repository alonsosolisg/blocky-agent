import { useEffect } from 'react'
import { useBuilderStore } from './store/useBuilderStore'
import { initAudioOnGesture } from './lib/audio'
import Scene from './three/Scene'
import PiecePalette from './components/PiecePalette'
import BlockyPanel from './components/BlockyPanel'
import HelpOverlay from './components/HelpOverlay'
import './index.css'

export default function App() {
  // Initialize audio on first interaction
  useEffect(() => {
    initAudioOnGesture()
  }, [])

  // Load from local or seed demo (once, robust against HMR)
  useEffect(() => {
    const store = useBuilderStore.getState()
    const loaded = store.loadFromLocalStorage()
    // Only seed if still empty after load attempt (prevents re-seed on HMR)
    if (!loaded && store.pieces.length === 0 && !(window as any).__legoSeeded) {
      (window as any).__legoSeeded = true
      const initial = [
        { partId: 'brick-2x4', position: [-4, 0.09, -3] as [number, number, number], rotationY: 0, color: '#c91a09' },
        { partId: 'brick-2x4', position: [-1, 0.09, -3] as [number, number, number], rotationY: 0, color: '#f2c832' },
        { partId: 'plate-2x4', position: [-1, 1.29, -3] as [number, number, number], rotationY: 0, color: '#0055a4' },
        { partId: 'brick-1x2', position: [3, 0.09, 1] as [number, number, number], rotationY: Math.PI / 2, color: '#237841' },
      ]
      initial.forEach((p) => store.placePiece(p))
    }
  }, [])

  return (
    <div className="h-full w-full overflow-hidden bg-[#f2ede3] text-[#2c2a25]">
      {/* Minimal left card / tray */}
      <PiecePalette />

      {/* 3D Scene takes almost the full viewport */}
      <div className="canvas-container">
        <Scene />
      </div>

      {/* Right agent panel: Blocky */}
      <BlockyPanel />

      <HelpOverlay />
    </div>
  )
}
