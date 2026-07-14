/**
 * Core TypeScript types for the 3D Builder.
 *
 * References:
 * - TypeScript handbook: https://www.typescriptlang.org/docs/handbook/interfaces.html
 * - Project kanban L3D-007
 */

/**
 * Definition of a single Lego-style part in the catalog.
 * Dimensions are in "studs" (1 stud = 1.0 world unit).
 * Height is expressed in "plates" (1 plate ≈ 0.4 units, standard brick = 3 plates).
 */
export interface PartDef {
  id: string
  name: string
  w: number          // width in studs (X)
  l: number          // length in studs (Z)
  hPlates: number    // height in plates (Y)
  hasStuds: boolean
  category: 'brick' | 'plate' | 'tile' | 'slope' | 'special'
  description?: string
}

/**
 * A placed piece in the world.
 * This is the core data model for the build.
 */
export interface PlacedPiece {
  id: number | string
  partId: string
  position: [number, number, number]   // [x, y, z] snapped to grid (studs + plate steps)
  rotationY: number                    // 0, Math.PI/2, Math.PI, 3*Math.PI/2
  color: string                        // hex color
}

/**
 * State of the build cursor / ghost piece.
 */
export interface CursorState {
  x: number
  y: number
  z: number
  partId: string
  color: string
  rotationY: number
}

/**
 * Snapshot for undo/redo history.
 */
export interface HistorySnapshot {
  pieces: PlacedPiece[]
  cursor: CursorState
}

/**
 * Main builder state shape (used by zustand store).
 */
export interface BuilderState {
  pieces: PlacedPiece[]
  cursor: CursorState
  selectedId: string | number | null
  history: HistorySnapshot[]
  historyIndex: number
}
