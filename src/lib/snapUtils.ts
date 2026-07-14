import { getPart } from './pieceCatalog'
import type { PlacedPiece } from '../types'

/**
 * Snapping and collision utilities for the Lego builder.
 *
 * Grid is 1 stud in X/Z.
 * Y is in plate steps (0.4 units).
 *
 * References:
 * - https://threejs.org/docs/#api/en/math/Vector3
 * - Kanban L3D-012, L3D-014
 */

export function snapToGrid(value: number, step = 1): number {
  return Math.round(value / step) * step
}

export function snapYToPlate(value: number, plateHeight = 0.4): number {
  const base = 0.09;
  return base + Math.round((value - base) / plateHeight) * plateHeight;
}

/**
 * Get the list of stud positions occupied by a piece at its position.
 * For simplicity, we use the base layer studs (for collision at that height).
 */
export function getOccupiedStuds(piece: PlacedPiece): string[] {
  const part = getPart(piece.partId)
  const [baseX, baseY, baseZ] = piece.position
  // Normalize to exact 90-degree multiples to avoid any floating point drift
  // in cos/sin for 1x pieces and edge placements.
  const k = Math.round(((piece.rotationY || 0) / (Math.PI / 2)) % 4)
  const rot = ((k + 4) % 4) * (Math.PI / 2)
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const keys: string[] = []

  // Enumerate exact local studs (0..w-1, 0..l-1) then rotate around the pivot (base position).
  // This must exactly match the stud positions generated inside LegoPiece + its rotation group.
  for (let dx = 0; dx < part.w; dx++) {
    for (let dz = 0; dz < part.l; dz++) {
      const wx = baseX + (dx * cos - dz * sin)
      const wz = baseZ + (dx * sin + dz * cos)
      // Standardize heights to fixed 2-decimal strings to prevent tiny float rounding errors 
      // (e.g. 1.289999999 vs 1.29) from bypassing the collision system and allowing overlapping duplicate blocks.
      keys.push(`${Math.round(wx)},${baseY.toFixed(2)},${Math.round(wz)}`)
    }
  }
  return keys
}

/**
 * Check if a proposed piece would overlap existing pieces.
 * Simple stud occupancy check at the target Y level.
 */
export function canPlacePiece(
  proposed: Omit<PlacedPiece, 'id'>,
  existing: PlacedPiece[]
): boolean {
  const proposedStuds = getOccupiedStuds({ ...proposed, id: 'temp' } as PlacedPiece)
  const occupied = new Set<string>()

  existing.forEach((p) => {
    getOccupiedStuds(p).forEach((k) => occupied.add(k))
  })

  return proposedStuds.every((stud) => !occupied.has(stud))
}
