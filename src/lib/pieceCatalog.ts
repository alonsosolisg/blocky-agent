/**
 * LEGO-style piece catalog for 3D Builder.
 * Dimensions in studs (1 stud = 1.0 scene units).
 * Heights in "plates" (standard plate ≈ 0.4 units, brick = 3 plates).
 *
 * References:
 * - https://www.bartneck.de/2019/04/21/lego-brick-dimensions-and-measurements/
 * - https://grabcad.com/tutorials/lego-01-basic-dimensions-bricks-explained
 * - BrickLink / LDraw part naming conventions
 */

import type { PartDef } from '../types'
export type { PartDef } from '../types'

export const LEGO_PARTS: Record<string, PartDef> = {
  'brick-1x1': {
    id: 'brick-1x1',
    name: 'Brick 1×1',
    w: 1, l: 1, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'brick-1x2': {
    id: 'brick-1x2',
    name: 'Brick 1×2',
    w: 1, l: 2, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'brick-2x2': {
    id: 'brick-2x2',
    name: 'Brick 2×2',
    w: 2, l: 2, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'brick-2x4': {
    id: 'brick-2x4',
    name: 'Brick 2×4',
    w: 2, l: 4, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'plate-1x1': {
    id: 'plate-1x1',
    name: 'Plate 1×1',
    w: 1, l: 1, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  'plate-1x2': {
    id: 'plate-1x2',
    name: 'Plate 1×2',
    w: 1, l: 2, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  'plate-2x2': {
    id: 'plate-2x2',
    name: 'Plate 2×2',
    w: 2, l: 2, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  'plate-2x4': {
    id: 'plate-2x4',
    name: 'Plate 2×4',
    w: 2, l: 4, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  'tile-1x2': {
    id: 'tile-1x2',
    name: 'Tile 1×2',
    w: 1, l: 2, hPlates: 1,
    hasStuds: false,
    category: 'tile',
    description: 'Smooth top, no studs',
  },
  'slope-45-1x2': {
    id: 'slope-45-1x2',
    name: 'Slope 45° 1×2',
    w: 1, l: 2, hPlates: 2,
    hasStuds: true,
    category: 'slope',
  },
  'brick-1x3': {
    id: 'brick-1x3',
    name: 'Brick 1×3',
    w: 1, l: 3, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'brick-1x4': {
    id: 'brick-1x4',
    name: 'Brick 1×4',
    w: 1, l: 4, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'brick-2x3': {
    id: 'brick-2x3',
    name: 'Brick 2×3',
    w: 2, l: 3, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'brick-2x6': {
    id: 'brick-2x6',
    name: 'Brick 2×6',
    w: 2, l: 6, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'plate-1x3': {
    id: 'plate-1x3',
    name: 'Plate 1×3',
    w: 1, l: 3, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  'plate-1x4': {
    id: 'plate-1x4',
    name: 'Plate 1×4',
    w: 1, l: 4, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  'plate-2x3': {
    id: 'plate-2x3',
    name: 'Plate 2×3',
    w: 2, l: 3, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  'plate-2x6': {
    id: 'plate-2x6',
    name: 'Plate 2×6',
    w: 2, l: 6, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  'tile-1x1': {
    id: 'tile-1x1',
    name: 'Tile 1×1',
    w: 1, l: 1, hPlates: 1,
    hasStuds: false,
    category: 'tile',
  },
  'tile-2x2': {
    id: 'tile-2x2',
    name: 'Tile 2×2',
    w: 2, l: 2, hPlates: 1,
    hasStuds: false,
    category: 'tile',
  },
  'tile-2x4': {
    id: 'tile-2x4',
    name: 'Tile 2×4',
    w: 2, l: 4, hPlates: 1,
    hasStuds: false,
    category: 'tile',
  },
  'slope-45-2x2': {
    id: 'slope-45-2x2',
    name: 'Slope 45° 2×2',
    w: 2, l: 2, hPlates: 2,
    hasStuds: true,
    category: 'slope',
  },
  // Large high-efficiency bricks and plates for agent building and custom foundations
  'brick-2x8': {
    id: 'brick-2x8',
    name: 'Brick 2×8',
    w: 2, l: 8, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'plate-2x8': {
    id: 'plate-2x8',
    name: 'Plate 2×8',
    w: 2, l: 8, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  'plate-4x4': {
    id: 'plate-4x4',
    name: 'Plate 4×4',
    w: 4, l: 4, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  'plate-6x6': {
    id: 'plate-6x6',
    name: 'Plate 6×6',
    w: 6, l: 6, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  'plate-8x8': {
    id: 'plate-8x8',
    name: 'Plate 8×8',
    w: 8, l: 8, hPlates: 1,
    hasStuds: true,
    category: 'plate',
  },
  // High-efficiency long bricks to build wall layers rapidly with fewer pieces
  'brick-1x6': {
    id: 'brick-1x6',
    name: 'Brick 1×6',
    w: 1, l: 6, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'brick-1x8': {
    id: 'brick-1x8',
    name: 'Brick 1×8',
    w: 1, l: 8, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  // Specialty architectural blocks for doors and windows
  'arch-1x4': {
    id: 'arch-1x4',
    name: 'Arch Brick 1×4',
    w: 1, l: 4, hPlates: 3,
    hasStuds: true,
    category: 'special',
    description: 'Perfect for doorways or windows',
  },
  'window-1x2': {
    id: 'window-1x2',
    name: 'Window Element 1×2',
    w: 1, l: 2, hPlates: 3,
    hasStuds: true,
    category: 'special',
  },
  // Large-scale compound macro blocks for ultra-high-efficiency building (castles, foundations, walls)
  'wall-1x12': {
    id: 'wall-1x12',
    name: 'Mega Wall 1×12',
    w: 1, l: 12, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'wall-1x16': {
    id: 'wall-1x16',
    name: 'Mega Wall 1×16',
    w: 1, l: 16, hPlates: 3,
    hasStuds: true,
    category: 'brick',
  },
  'tower-round-4x4': {
    id: 'tower-round-4x4',
    name: 'Round Tower Column 4×4',
    w: 4, l: 4, hPlates: 9, // Full double-height tower block in one placement
    hasStuds: true,
    category: 'special',
  },
  'fort-corner-4x4': {
    id: 'fort-corner-4x4',
    name: 'Fort Corner L-Wall 4×4',
    w: 4, l: 4, hPlates: 3,
    hasStuds: true,
    category: 'special',
  },
}

export const DEFAULT_PART_ID = 'brick-2x4'

export function getPart(id: string): PartDef {
  return LEGO_PARTS[id] || LEGO_PARTS[DEFAULT_PART_ID]
}

export const PART_LIST = Object.values(LEGO_PARTS)
