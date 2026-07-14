import { memo, useMemo } from 'react'
import * as THREE from 'three'
import { getPart } from '../lib/pieceCatalog'
import type { PlacedPiece } from '../types'

interface LegoPieceProps {
  piece: PlacedPiece
  isGhost?: boolean
}

/**
 * Accurate procedural Lego brick.
 * - Solid body (no weird internal holes)
 * - Studs on top (cylinders)
 * - Bottom clutch tubes for authentic Lego look from all angles
 * 
 * References from research:
 * - Standard Lego dimensions: stud spacing=1, stud r≈0.28, plate h=0.4, brick h=1.2
 * - Common Three.js implementations use grouped meshes for studs + body + tubes (avoids merge artifacts)
 * - Plastic material with high specular for "Lego shine"
 */

function createLegoBrick(w: number, l: number, hPlates: number, color: string, isGhost: boolean) {
  const group = new THREE.Group()
  const height = hPlates * 0.4

  const mat = new THREE.MeshPhongMaterial({
    color,
    shininess: 25,
    specular: 0x111111,
  })

  if (isGhost) {
    mat.transparent = true
    mat.opacity = 0.6
  }

  // Main body - simple solid box for clean Lego look.
  // Offset so it's centered over the min-corner studs (dx=0 to w-1)
  // Apply a tiny visual offset (0.998 instead of 1.0) on length/width to prevent z-fighting / flickering 
  // on adjacent brick faces or layered base plates, while keeping standard grid positions.
  const shrinkFactor = 0.998
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w * shrinkFactor, height, l * shrinkFactor),
    mat
  )
  body.position.set( (w-1)*0.5 , height / 2 , (l-1)*0.5 )
  group.add(body)

  // Studs on top only. Position relative to min-corner (dx, dz) so 1x pieces align to integer grid studs.
  const studR = 0.28
  const studH = 0.17
  const studGeo = new THREE.CylinderGeometry(studR, studR, studH, 20)
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < l; z++) {
      const stud = new THREE.Mesh(studGeo, mat)
      stud.position.set(
        x * 1,   // min-corner based
        height + studH / 2,
        z * 1
      )
      group.add(stud)
    }
  }

  // Bottom tubes - small, on the bottom face (not looking like top studs)
  const tubeR = 0.13
  const tubeH = 0.12
  const tubeGeo = new THREE.CylinderGeometry(tubeR, tubeR, tubeH, 12)
  for (let x = 0; x < w; x++) {
    for (let z = 0; z < l; z++) {
      const tube = new THREE.Mesh(tubeGeo, mat)
      tube.position.set(
        x * 1,
        -tubeH / 2,
        z * 1
      )
      group.add(tube)
    }
  }

  return group
}

export const LegoPiece = memo(function LegoPiece({ piece, isGhost = false }: LegoPieceProps) {
  const { partId, position, rotationY, color } = piece
  const part = getPart(partId)

  // Memoize the brick - group is fine for small number, looks clean
  const brick = useMemo(() => {
    return createLegoBrick(part.w, part.l, part.hPlates, color, isGhost)
  }, [part.w, part.l, part.hPlates, color, isGhost])

  // position[1] is the bottom of the brick
  return (
    <group
      position={[position[0], position[1], position[2]]}
      rotation={[0, rotationY, 0]}
    >
      <primitive object={brick} />
    </group>
  )
})

