import { useBuilderStore } from '../store/useBuilderStore'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import * as THREE from 'three'

export default function TopBar() {
  const pieces = useBuilderStore((s) => s.pieces)
  const store = useBuilderStore()

  const handleSave = () => {
    store.saveToLocalStorage()
    alert('Saved to local storage!')
  }

  const handleLoad = () => {
    if (store.loadFromLocalStorage()) {
      alert('Loaded from local storage!')
    } else {
      alert('No save found')
    }
  }

  const handleExport = () => {
    const json = store.exportToJSON()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'lego-build.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e: any) => {
      const file = e.target.files[0]
      const reader = new FileReader()
      reader.onload = (ev: any) => {
        if (store.importFromJSON(ev.target.result)) {
          alert('Imported successfully!')
        } else {
          alert('Import failed')
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  const handleExportGLTF = () => {
    const { pieces } = store
    const group = new THREE.Group()
    pieces.forEach((p: any) => {
      const h = p.partId.includes('plate') ? 0.4 : 1.2
      const w = p.partId.includes('2x4') ? 2 : 1
      const l = p.partId.includes('2x4') ? 4 : 1
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, l),
        new THREE.MeshLambertMaterial({ color: p.color })
      )
      box.position.set(p.position[0], p.position[1] + h/2, p.position[2])
      box.rotation.y = p.rotationY
      group.add(box)
    })
    const exporter = new GLTFExporter()
    exporter.parse(
      group,
      (result: any) => {
        const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'lego-build.gltf'
        a.click()
        URL.revokeObjectURL(url)
      },
      (err: any) => {
        console.error('GLTF export error', err)
      }
    )
  }

  return (
    <div className="topbar">
      <div className="title">
        3D BUILDER <span className="text-[#5f5a50] text-xs font-normal tracking-normal">Lego-style Sandbox</span>
      </div>
      <div className="status">
        <span>1×1 GRID • GOD MODE</span>
        <span>BRICKS <b>{pieces.length}</b></span>
        <span style={{ color: '#2e8b3e' }}>READY TO BUILD</span>
      </div>
      <div style={{ display: 'flex', gap: '8px', fontSize: '11px' }}>
        <button onClick={handleSave} style={{ padding: '2px 6px' }}>Save</button>
        <button onClick={handleLoad} style={{ padding: '2px 6px' }}>Load</button>
        <button onClick={handleExport} style={{ padding: '2px 6px' }}>Export JSON</button>
        <button onClick={handleImport} style={{ padding: '2px 6px' }}>Import JSON</button>
        <button onClick={handleExportGLTF} style={{ padding: '2px 6px' }}>Export GLTF</button>
      </div>
      <div className="text-[#5f5a50] text-[11px]">Press <kbd>H</kbd> • R cycles brick • C cycles color</div>
    </div>
  )
}
