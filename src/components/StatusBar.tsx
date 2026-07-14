export default function StatusBar() {
  return (
    <div className="statusbar">
      <div>
        Arrows / WASD — Move (relative to view) • [ ] PgUp/PgDn — Layer • R — Rotate piece • Space — Place • X — Delete last • Ctrl+Z — Undo
      </div>
      <div className="ml-auto key-hint">Mouse drag: Orbit • Scroll: Zoom • Shift+Arrow: Fast</div>
    </div>
  )
}
