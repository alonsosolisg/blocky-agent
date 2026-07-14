import { useState, useEffect } from 'react'

export default function HelpOverlay() {
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isTyping = 
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable ||
        target.closest?.('.blocky-panel')

      if (e.key === 'Escape') {
        setShowHelp(false)
        return
      }

      if (isTyping) {
        return // don't trigger help toggle when typing in inputs or agent panel
      }

      if (e.key.toLowerCase() === 'h' || e.key === '?') {
        setShowHelp((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      className={`help-overlay ${showHelp ? 'visible' : ''}`}
      onClick={() => setShowHelp(false)}
    >
      <div
        className="help-content"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-3">Keyboard-First Controls • God View Builder</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
          <div><kbd>Arrows</kbd> — Move piece (camera-relative, 4 cardinal dirs only)</div>
          <div><kbd>W A S D</kbd> — Smooth camera fly (god view)</div>
          <div><kbd>Q / E</kbd> — Fly up / down</div>
          <div><kbd>Shift</kbd> — Faster (big steps or sprint fly)</div>
          <div><kbd>R</kbd> — Rotate piece • <kbd>C</kbd> — Cycle color</div>
          <div><kbd>Space</kbd> / <kbd>Enter</kbd> — Place piece</div>
          <div><kbd>X</kbd> / <kbd>Delete</kbd> — Remove last piece</div>
          <div><kbd>[</kbd> / <kbd>]</kbd> or PgUp/PgDn — Change layer (Y height)</div>
          <div>Mouse drag — Orbit camera</div>
          <div>Scroll — Zoom</div>
          <div><kbd>H</kbd> / <kbd>?</kbd> — Toggle this help</div>
          <div>Esc — Close overlay</div>
        </div>
        <p className="mt-4 text-xs text-[#5f5a50]">
          Pure keyboard primary building. Cursor movement is always axis-aligned on the grid for precision. WASD+Q/E gives smooth 3D god flying.
        </p>
        <div className="mt-4 text-right text-xs opacity-60">
          Click anywhere or press Esc to close
        </div>
      </div>
    </div>
  )
}
