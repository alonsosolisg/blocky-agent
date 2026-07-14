import { useBuilderStore } from '../store/useBuilderStore'
import { getPart } from '../lib/pieceCatalog'

export default function Inspector() {
  const cursor = useBuilderStore((s) => s.cursor)
  const selectedId = useBuilderStore((s) => s.selectedId)
  const pieces = useBuilderStore((s) => s.pieces)
  const selected = selectedId ? pieces.find(p => p.id === selectedId) : null
  const displayPart = selected ? getPart(selected.partId) : getPart(cursor.partId)
  const displayColor = selected ? selected.color : cursor.color

  return (
    <div className="panel right">
      <div className="panel-header">Properties {selected ? '(selected)' : '(cursor)'}</div>
      <div className="panel-body text-xs space-y-2">
        <div>
          Current: <span className="font-mono text-[#2c2a25]">{displayPart.name}</span>
        </div>
        <div className="flex items-center gap-2">
          Color:{' '}
          <div
            className="w-4 h-4 rounded border border-black/20"
            style={{ background: displayColor }}
          />
        </div>
        {selected && (
          <div className="text-[10px]">ID: {selected.id}</div>
        )}
        <div className="pt-2 text-[10px] text-[#5f5a50]">
          Click piece to select. Full live edit in tasks.
        </div>
      </div>
    </div>
  )
}
