import { useBuilderStore } from '../../store/useBuilderStore'
import { getPart } from '../pieceCatalog'
import { canPlacePiece } from '../snapUtils'
import { playPlaceSound, playDeleteSound, playSelectSound } from '../audio'
import type { PlacedPiece } from '../../types'
import type { ChatMessage } from './types'

export async function executeTool(name: string, args: any, messages: ChatMessage[]): Promise<string> {
  const fresh = useBuilderStore.getState()
  const pieces = fresh.pieces
  const cursor = fresh.cursor

  try {
    switch (name) {
      case 'place_piece': {
        const { partId, x, y, z, rotationY = 0, color = cursor.color } = args
        const part = getPart(partId)
        let position: [number, number, number] = [x, y, z]

        const proposed: Omit<PlacedPiece, 'id'> = {
          partId,
          position,
          rotationY,
          color
        }

        // Strictly refuse placements that collide instead of shifting them adjacent (which was causing duplicate/shifted rose petals and visual z-fighting overlapping blocks)
        if (!canPlacePiece(proposed, pieces)) {
          return JSON.stringify({ success: false, error: 'Collision at that location. Please select non-overlapping coordinate offsets.' })
        }

        fresh.agentPlacePiece({ ...proposed, position })
        playPlaceSound() // Play the plastic lego place sound
        return JSON.stringify({ 
          success: true, 
          message: `Placed ${part.name} at [${position[0]}, ${position[1]}, ${position[2]}]` 
        })
      }

      case 'get_build_state': {
        const summary = pieces.slice(0, 20).map(p => ({
          id: p.id,
          part: getPart(p.partId).name,
          pos: p.position,
          rot: p.rotationY,
          color: p.color
        }))
        return JSON.stringify({
          pieceCount: pieces.length,
          pieces: summary,
          cursor: { ...cursor, part: getPart(cursor.partId).name }
        })
      }

      case 'clear_all': {
        // Check if the user has explicitly requested clearing the board, if not, refuse to do so without explicit user text permission
        const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop()?.content || ''
        const userAskedToClear = /\b(clear|reset|wipe|destroy|delete|start fresh|clean|empty)\b/i.test(lastUserMessage)

        if (!userAskedToClear) {
          return JSON.stringify({ 
            success: false, 
            error: 'Clearing the sandbox is blocked. To preserve the user\'s other creations, you are strictly forbidden from clearing the board unless the user explicitly requested a clear, reset, or clean start in their message. Build your new creation cleanly next to the existing elements instead.' 
          })
        }

        fresh.agentClearAllPieces()
        playDeleteSound() // Play the Lego delete sound
        return JSON.stringify({ success: true, message: 'Cleared the build' })
      }

      case 'remove_piece': {
        const { id } = args
        const piece = fresh.getPieceById(id)
        if (!piece) {
          return JSON.stringify({ success: false, error: `Piece with ID ${id} not found.` })
        }
        fresh.removePiece(id)
        playDeleteSound() // Play deletion sound
        return JSON.stringify({ success: true, message: `Successfully removed piece ${id}` })
      }

      case 'set_cursor_color': {
        fresh.setCursorColor(args.color)
        playSelectSound() // Play select sound for color selection
        return JSON.stringify({ success: true, message: `Color set to ${args.color}` })
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err: any) {
    return JSON.stringify({ error: err.message })
  }
}
