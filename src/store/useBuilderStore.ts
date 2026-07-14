import { create } from 'zustand'
import type { PlacedPiece, CursorState, HistorySnapshot, BuilderState } from '../types'
import { DEFAULT_PART_ID, getPart } from '../lib/pieceCatalog'
import { snapToGrid } from '../lib/snapUtils'

/**
 * Zustand store for the 3D Lego Builder.
 *
 * This is the single source of truth for:
 * - All placed pieces
 * - Current cursor/ghost state
 * - Selection
 * - Undo/redo history
 *
 * References:
 * - https://docs.pmnd.rs/zustand/getting-started/introduction
 * - https://docs.pmnd.rs/zustand/guides/immer-middleware (for future)
 * - Kanban L3D-008
 */

interface BuilderActions {
  // Cursor
  setCursorPosition: (x: number, y: number, z: number) => void
  setCursorPart: (partId: string) => void
  setCursorColor: (color: string) => void
  setCursorRotation: (rotationY: number) => void
  rotateCursor: (direction?: 1 | -1) => void

  // Pieces
  placePiece: (piece: Omit<PlacedPiece, 'id'>) => void
  removePiece: (id: PlacedPiece['id']) => void
  updatePiece: (id: PlacedPiece['id'], updates: Partial<PlacedPiece>) => void
  clearAllPieces: () => void

  // Agent fast-path (no per-action history/save)
  agentPlacePiece: (piece: Omit<PlacedPiece, 'id'>) => void
  agentClearAllPieces: () => void
  commitAgentChanges: () => void

  // Selection
  selectPiece: (id: PlacedPiece['id'] | null) => void

  // History / Undo
  undo: () => void
  redo: () => void
  pushHistory: () => void

  // Utils
  getPieceById: (id: PlacedPiece['id']) => PlacedPiece | undefined
  getPiecesAtPosition: (x: number, y: number, z: number) => PlacedPiece[]

  // Persistence
  saveToLocalStorage: () => void
  loadFromLocalStorage: () => boolean
  exportToJSON: () => string
  importFromJSON: (jsonString: string) => boolean
}

type BuilderStore = BuilderState & BuilderActions

const initialCursor: CursorState = {
  x: 0,
  y: 0.09,
  z: 0,
  partId: DEFAULT_PART_ID,
  color: '#c91a09',
  rotationY: 0,
}

const initialState: BuilderState = {
  pieces: [],
  cursor: initialCursor,
  selectedId: null,
  history: [],
  historyIndex: -1,
}

export const useBuilderStore = create<BuilderStore>((set, get) => ({
  ...initialState,

  // === Cursor actions ===
  setCursorPosition: (x, y, z) => {
    set((state) => ({
      cursor: { ...state.cursor, x, y, z },
    }))
  },

  setCursorPart: (partId) => {
    set((state) => ({
      cursor: { ...state.cursor, partId },
    }))
  },

  setCursorColor: (color) => {
    set((state) => ({
      cursor: { ...state.cursor, color },
    }))
  },

  setCursorRotation: (rotationY) => {
    set((state) => ({
      cursor: { ...state.cursor, rotationY },
    }))
  },

  rotateCursor: (direction = 1) => {
    set((state) => {
      const part = getPart(state.cursor.partId)
      const oldRot = state.cursor.rotationY
      const newRot = ((oldRot / (Math.PI / 2) + direction + 4) % 4) * (Math.PI / 2)

      // Rotate "in place" by preserving the geometric center of the piece.
      // This is especially important for 1x pieces so they don't swing around a corner
      // and make side-by-side placement difficult.
      const cx = (part.w - 1) * 0.5
      const cz = (part.l - 1) * 0.5

      const cos = Math.cos(oldRot)
      const sin = Math.sin(oldRot)
      const cX = state.cursor.x + cx * cos - cz * sin
      const cZ = state.cursor.z + cx * sin + cz * cos

      const ncos = Math.cos(newRot)
      const nsin = Math.sin(newRot)
      let newX = cX - (cx * ncos - cz * nsin)
      let newZ = cZ - (cx * nsin + cz * ncos)

      // Snap to grid (same as movement) - keeps the cursor on the integer stud grid
      const snappedX = snapToGrid(newX)
      const snappedZ = snapToGrid(newZ)

      return {
        cursor: {
          ...state.cursor,
          x: snappedX,
          z: snappedZ,
          rotationY: newRot,
        },
      }
    })
  },

  // === Pieces ===
  placePiece: (pieceData) => {
    const id = Date.now() + Math.random() // simple unique id
    const newPiece: PlacedPiece = { ...pieceData, id }

    set((state) => {
      const newPieces = [...state.pieces, newPiece]
      return {
        pieces: newPieces,
        selectedId: id,
      }
    })

    // Auto push to history after place (can be optimized later)
    get().pushHistory()
    get().saveToLocalStorage()
  },

  removePiece: (id) => {
    set((state) => {
      const newPieces = state.pieces.filter((p) => p.id !== id)
      return {
        pieces: newPieces,
        selectedId: state.selectedId === id ? null : state.selectedId,
      }
    })
    get().pushHistory()
    get().saveToLocalStorage()
  },

  updatePiece: (id, updates) => {
    set((state) => ({
      pieces: state.pieces.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    }))
    get().pushHistory()
  },

  clearAllPieces: () => {
    set({ pieces: [], selectedId: null })
    get().pushHistory()
    get().saveToLocalStorage()
  },

  // Agent-optimized versions that mutate without immediate history/save for speed
  // Call commitAgentChanges() after a batch of agent actions
  agentPlacePiece: (pieceData: Omit<PlacedPiece, 'id'>) => {
    const id = Date.now() + Math.random()
    const newPiece: PlacedPiece = { ...pieceData, id }
    set((state) => ({
      pieces: [...state.pieces, newPiece],
      selectedId: id,
    }))
  },

  agentClearAllPieces: () => {
    set({ pieces: [], selectedId: null })
  },

  commitAgentChanges: () => {
    get().pushHistory()
    get().saveToLocalStorage()
  },

  // === Selection ===
  selectPiece: (id) => {
    set({ selectedId: id })
  },

  // === History ===
  pushHistory: () => {
    set((state) => {
      const snapshot: HistorySnapshot = {
        pieces: JSON.parse(JSON.stringify(state.pieces)), // deep clone
        cursor: { ...state.cursor },
      }

      // Cut future history if we are in the middle
      const newHistory = state.history.slice(0, state.historyIndex + 1)
      newHistory.push(snapshot)

      // Limit history size
      const limitedHistory = newHistory.slice(-50)

      return {
        history: limitedHistory,
        historyIndex: limitedHistory.length - 1,
      }
    })
  },

  undo: () => {
    const state = get()
    if (state.historyIndex <= 0) return

    const newIndex = state.historyIndex - 1
    const snapshot = state.history[newIndex]

    set({
      pieces: JSON.parse(JSON.stringify(snapshot.pieces)),
      cursor: { ...snapshot.cursor },
      historyIndex: newIndex,
      selectedId: null,
    })
  },

  redo: () => {
    const state = get()
    if (state.historyIndex >= state.history.length - 1) return

    const newIndex = state.historyIndex + 1
    const snapshot = state.history[newIndex]

    set({
      pieces: JSON.parse(JSON.stringify(snapshot.pieces)),
      cursor: { ...snapshot.cursor },
      historyIndex: newIndex,
      selectedId: null,
    })
  },

  // === Utils ===
  getPieceById: (id) => {
    return get().pieces.find((p) => p.id === id)
  },

  getPiecesAtPosition: (x, y, z) => {
    return get().pieces.filter(
      (p) => p.position[0] === x && p.position[1] === y && p.position[2] === z
    )
  },

  // === Persistence (L3D-021) ===
  saveToLocalStorage: () => {
    const state = get()
    const data = {
      pieces: state.pieces,
      cursor: state.cursor,
    }
    localStorage.setItem('lego-builder-save', JSON.stringify(data))
  },

  loadFromLocalStorage: () => {
    const saved = localStorage.getItem('lego-builder-save')
    if (!saved) return false
    try {
      const data = JSON.parse(saved)
      set({
        pieces: data.pieces || [],
        cursor: data.cursor || initialCursor,
        selectedId: null,
      })
      // reset history
      get().pushHistory()
      return true
    } catch (e) {
      console.error('Failed to load save', e)
      return false
    }
  },

  exportToJSON: () => {
    const state = get()
    const data = {
      pieces: state.pieces,
      cursor: state.cursor,
      version: '1.0'
    }
    return JSON.stringify(data, null, 2)
  },

  importFromJSON: (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString)
      if (data.pieces && Array.isArray(data.pieces)) {
        set({
          pieces: data.pieces,
          cursor: data.cursor || initialCursor,
          selectedId: null,
        })
        get().pushHistory()
        return true
      }
    } catch (e) {
      console.error('Invalid JSON', e)
    }
    return false
  },
}))

// Optional: Initialize with some history
// Can be called after mount if needed
export function initializeHistory() {
  const store = useBuilderStore.getState()
  if (store.history.length === 0) {
    store.pushHistory()
  }
}
