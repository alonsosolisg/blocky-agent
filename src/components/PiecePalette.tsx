import { useState, useMemo, useEffect } from 'react'
import { useBuilderStore } from '../store/useBuilderStore'
import { PART_LIST } from '../lib/pieceCatalog'
import type { PartDef } from '../lib/pieceCatalog'
import { playSelectSound } from '../lib/audio'

export default function PiecePalette() {
  const cursor = useBuilderStore((s) => s.cursor)
  const setCursorPart = useBuilderStore((s) => s.setCursorPart)
  const clearAllPieces = useBuilderStore((s) => s.clearAllPieces)
  const currentColor = cursor.color

  const [search, setSearch] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim()
    if (!term) return PART_LIST
    return PART_LIST.filter((p) =>
      p.name.toLowerCase().includes(term) ||
      p.id.toLowerCase().includes(term) ||
      p.category.toLowerCase().includes(term)
    )
  }, [search])

  // Keep highlight in bounds when filter changes
  // Use functional update to avoid dependency on highlightedIndex (prevents loops)
  useEffect(() => {
    setHighlightedIndex((current) => {
      if (current >= filtered.length) {
        return Math.max(0, filtered.length - 1)
      }
      return current
    })
  }, [filtered])

  // Highlight the current cursor part if visible
  useEffect(() => {
    const idx = filtered.findIndex((p) => p.id === cursor.partId)
    if (idx >= 0) {
      // Use functional to safely update only if needed
      setHighlightedIndex((current) => (current !== idx ? idx : current))
    }
  }, [cursor.partId, filtered])

  const handleSelect = (part: PartDef) => {
    setCursorPart(part.id)
    playSelectSound()
  }

  // Keyboard navigation inside the palette (arrows + enter)
  // Global arrows are already blocked when focus is inside .panel.left
  const handlePaletteKey = (e: React.KeyboardEvent) => {
    if (filtered.length === 0) return

    // Ensure we have a valid index (defensive against race with filter state)
    if (highlightedIndex < 0 || highlightedIndex >= filtered.length) {
      setHighlightedIndex(0)
      return
    }

    // Don't steal arrows from the search input itself
    if (e.target instanceof HTMLInputElement) return

    let newIndex = highlightedIndex

    switch (e.key) {
      case 'ArrowRight':
        newIndex = Math.min(filtered.length - 1, highlightedIndex + 1)
        e.preventDefault()
        break
      case 'ArrowLeft':
        newIndex = Math.max(0, highlightedIndex - 1)
        e.preventDefault()
        break
      case 'ArrowDown':
        newIndex = Math.min(filtered.length - 1, highlightedIndex + 4) // 4-col grid
        e.preventDefault()
        break
      case 'ArrowUp':
        newIndex = Math.max(0, highlightedIndex - 4)
        e.preventDefault()
        break
      case 'Enter':
      case ' ':
        handleSelect(filtered[highlightedIndex])
        e.preventDefault()
        return
      case 'Escape':
        setSearch('')
        ;(e.target as HTMLElement).blur()
        return
    }

    if (newIndex !== highlightedIndex) {
      setHighlightedIndex(newIndex)
    }
  }

  return (
    <div className="panel left">
      <div className="panel-header mini">
        <span>Pieces ({filtered.length})</span>
        <span className="help-hint">H for controls</span>
      </div>
      <div className="panel-body compact" onKeyDown={handlePaletteKey}>
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setHighlightedIndex(0)
          }}
          placeholder="Search parts..."
          className="w-full mb-2 text-xs px-2 py-1 rounded border border-[#c9c2b3] bg-[#f8f4eb] focus:outline-none focus:border-[#a37b6b]"
          onFocus={() => setHighlightedIndex(0)}
        />

        <div className="piece-grid">
          {filtered.map((p, index) => {
            // Bound sizes of very large macro pieces to fit beautifully within the button grid boundaries
            const maxDimension = Math.max(p.w, p.l)
            const isMacro = maxDimension > 4
            const unit = isMacro ? Math.max(4, 28 / maxDimension) : 8 // scale down larger bricks so they don't overflow the buttons
            const previewW = p.w * unit
            const previewH = p.l * unit
            const studCount = p.w * p.l
            const isActive = p.id === cursor.partId
            const isHighlighted = index === highlightedIndex

            return (
              <button
                key={p.id}
                className={`piece-btn relative ${isActive ? 'active' : ''} ${isHighlighted ? 'highlighted' : ''}`}
                onClick={() => handleSelect(p)}
                title={`${p.name} (${p.w}x${p.l})`}
                tabIndex={isHighlighted ? 0 : -1}
              >
                {/* Micro top-right overlay displaying size with a clean backdrop */}
                <div className="absolute top-0 right-0 z-10 text-[6.5px] px-1 py-0.5 rounded-bl bg-[#dfd8ca] border-l border-b border-[#c9c2b3] opacity-95 font-mono font-semibold leading-none shadow-sm text-[#5f5a50]">
                  {p.w}×{p.l}
                </div>

                <div className="flex flex-col items-center justify-center w-full h-full">
                  {/* Brick-shaped preview using live cursor color */}
                  <div
                    className={`lego-mini ${!p.hasStuds ? 'tile' : ''} relative`}
                    style={{
                      width: `${previewW}px`,
                      height: `${previewH}px`,
                      background: currentColor,
                      borderRadius: p.id === 'tower-round-4x4' ? '50%' : (p.category === 'slope' ? '2px 0 0 2px' : '1px'),
                    }}
                  >
                    {/* Specialty indicators: Round Tower hollow core illustration */}
                    {p.id === 'tower-round-4x4' && (
                      <div 
                        className="absolute inset-2 bg-[#e8e1d2] border border-[#c9c2b3]"
                        style={{ borderRadius: '50%' }}
                      />
                    )}

                    {/* Specialty indicators: L-Wall inner cutout illustration */}
                    {p.id === 'fort-corner-4x4' && (
                      <div 
                        className="absolute bottom-0 right-0 bg-[#e8e1d2]"
                        style={{
                          width: '16px',
                          height: '16px',
                          borderTopLeftRadius: '3px',
                        }}
                      />
                    )}

                    {/* Specialty indicators: Arch design cutout */}
                    {p.id === 'arch-1x4' && (
                      <div 
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-[#e8e1d2] group-hover:bg-[#f0e9d9]"
                        style={{
                          width: '16px',
                          height: '4px',
                          borderTopLeftRadius: '3px',
                          borderTopRightRadius: '3px',
                        }}
                      />
                    )}

                    {/* Specialty indicators: Window transparent inner pane */}
                    {p.id === 'window-1x2' && (
                      <div 
                        className="absolute inset-0.5 bg-cyan-100/70 border border-cyan-300"
                        style={{ borderRadius: '1px' }}
                      />
                    )}

                    {p.hasStuds && !isMacro &&
                      Array.from({ length: studCount }).map((_, i) => {
                        const col = i % p.w
                        const r = Math.floor(i / p.w)
                        return (
                          <div
                            key={i}
                            className="stud"
                            style={{
                              left: `${col * unit + 1.5}px`,
                              top: `${r * unit + 1.5}px`,
                              width: '4px',
                              height: '4px',
                            }}
                          />
                        )
                      })}

                    {/* For high-efficiency macro pieces, draw a simplified grid of studs to keep the card readable */}
                    {p.hasStuds && isMacro && (
                      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 p-0.5 gap-1 justify-items-center items-center opacity-40">
                        <div className="w-1 h-1 rounded-full bg-black/20" />
                        <div className="w-1 h-1 rounded-full bg-black/20" />
                        <div className="w-1 h-1 rounded-full bg-black/20" />
                        <div className="w-1 h-1 rounded-full bg-black/20" />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-1.5 text-[7px] text-[#5f5a50] leading-none opacity-70">
          Type to filter • Arrows navigate • Enter select
        </div>

        <button
          onClick={() => {
            if (confirm('Clear the entire sandbox? This cannot be undone.')) {
              clearAllPieces();
            }
          }}
          className="mt-2 w-full text-[8px] py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded border border-red-300 transition-colors"
          title="Clear all placed pieces (with confirmation)"
        >
          Clear Sandbox
        </button>
      </div>
    </div>
  )
}
