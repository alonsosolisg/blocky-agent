/**
 * Procedural high-fidelity Lego brick geometry.
 *
 * Scale: 1 stud = 1.0 unit
 * Plate height ≈ 0.4
 * Brick height (3 plates) ≈ 1.2 (excluding stud)
 *
 * References used for proportions:
 * - https://www.bartneck.de/2019/04/21/lego-brick-dimensions-and-measurements/
 * - https://grabcad.com/tutorials/lego-01-basic-dimensions-bricks-explained
 * - LDraw / BrickLink conventions for stud layout
 */

import * as THREE from 'three'

const STUD_RADIUS = 0.28
const STUD_HEIGHT = 0.18
const PLATE_HEIGHT = 0.4
const WALL_THICKNESS = 0.12

let geometryCache = new Map<string, THREE.BufferGeometry>()

export interface BrickParams {
  w: number
  l: number
  hPlates: number
  hasStuds?: boolean
}

/**
 * Creates or returns cached geometry for a rectangular brick/plate/tile.
 * For slopes a separate implementation will be added (see L3D tasks).
 */
export function createBrickGeometry(params: BrickParams): THREE.BufferGeometry {
  const { w, l, hPlates, hasStuds = true } = params
  const key = `brick-${w}x${l}-h${hPlates}-${hasStuds ? 'studs' : 'tile'}`
  if (geometryCache.has(key)) return geometryCache.get(key)!

  const height = hPlates * PLATE_HEIGHT

  // Main body (slightly inset walls for realism)
  const bodyGeo = new THREE.BoxGeometry(w - WALL_THICKNESS * 0.6, height, l - WALL_THICKNESS * 0.6)

  // Top plate (slightly raised)
  const topH = 0.08
  const topGeo = new THREE.BoxGeometry(w, topH, l)
  topGeo.translate(0, height / 2 + topH / 2 - 0.01, 0)

  const geometries: THREE.BufferGeometry[] = [bodyGeo, topGeo]

  if (hasStuds) {
    // Studs on top
    const studGeo = new THREE.CylinderGeometry(STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 24)
    const studYOffset = height / 2 + STUD_HEIGHT / 2

    for (let x = 0; x < w; x++) {
      for (let z = 0; z < l; z++) {
        const sx = (x - (w - 1) / 2) * 1.0
        const sz = (z - (l - 1) / 2) * 1.0
        const cloned = studGeo.clone()
        cloned.translate(sx, studYOffset, sz)
        geometries.push(cloned)
      }
    }

    // Bottom clutch tubes (makes pieces look more Lego-like from below/sides, no "empty shell" feel)
    const tubeRadius = 0.16
    const tubeHeight = Math.min(0.28, height * 0.7)
    const tubeGeo = new THREE.CylinderGeometry(tubeRadius, tubeRadius, tubeHeight, 12)
    const tubeYOffset = -height / 2 - tubeHeight / 2 + 0.02

    for (let x = 0; x < w; x++) {
      for (let z = 0; z < l; z++) {
        const sx = (x - (w - 1) / 2) * 1.0
        const sz = (z - (l - 1) / 2) * 1.0
        const cloned = tubeGeo.clone()
        cloned.translate(sx, tubeYOffset, sz)
        geometries.push(cloned)
      }
    }
  }

  // Merge all
  const merged = mergeGeometries(geometries)
  geometryCache.set(key, merged)
  return merged
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Simple merge using BufferGeometryUtils if available, fallback to manual
  // For production we can import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
  // Here we use a lightweight manual approach for skeleton.
  const merged = new THREE.BufferGeometry()
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []

  let vertexOffset = 0

  geos.forEach((geo) => {
    const pos = geo.attributes.position as THREE.BufferAttribute
    const nor = geo.attributes.normal as THREE.BufferAttribute
    const uv = geo.attributes.uv as THREE.BufferAttribute

    for (let i = 0; i < pos.count; i++) {
      positions.push(
        pos.getX(i),
        pos.getY(i),
        pos.getZ(i)
      )
      normals.push(
        nor ? nor.getX(i) : 0,
        nor ? nor.getY(i) : 1,
        nor ? nor.getZ(i) : 0
      )
      if (uv) {
        uvs.push(uv.getX(i), uv.getY(i))
      } else {
        uvs.push(0, 0)
      }
    }
    vertexOffset += pos.count
    geo.dispose()
  })

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  merged.computeBoundingBox()
  merged.computeBoundingSphere()
  return merged
}

/** Convenience for current catalog entries */
export function getGeometryForPart(partId: string): THREE.BufferGeometry {
  // Map part ids to params (expand as catalog grows)
  const map: Record<string, BrickParams> = {
    'brick-1x1': { w: 1, l: 1, hPlates: 3 },
    'brick-1x2': { w: 1, l: 2, hPlates: 3 },
    'brick-2x2': { w: 2, l: 2, hPlates: 3 },
    'brick-2x4': { w: 2, l: 4, hPlates: 3 },
    'plate-1x1': { w: 1, l: 1, hPlates: 1 },
    'plate-1x2': { w: 1, l: 2, hPlates: 1 },
    'plate-2x2': { w: 2, l: 2, hPlates: 1 },
    'plate-2x4': { w: 2, l: 4, hPlates: 1 },
    'tile-1x2': { w: 1, l: 2, hPlates: 1, hasStuds: false },
    'slope-45-1x2': { w: 1, l: 2, hPlates: 2, hasStuds: true }, // simplified for MVP
  }
  const p = map[partId] || { w: 2, l: 4, hPlates: 3 }
  return createBrickGeometry(p)
}

export function clearGeometryCache() {
  geometryCache.clear()
}
