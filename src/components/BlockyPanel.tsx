import { useState, useEffect, useRef } from 'react'
import { useBuilderStore } from '../store/useBuilderStore'
import { PART_LIST, getPart } from '../lib/pieceCatalog'
import { canPlacePiece } from '../lib/snapUtils'
import type { PlacedPiece } from '../types'
import { playPlaceSound, playDeleteSound, playSelectSound, playAgentCompleteSound } from '../lib/audio'

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'debug'
  content: string
  toolName?: string
}



const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Read key from Vite env (VITE_ prefix is required for client exposure).
// Put VITE_OPENROUTER_API_KEY=sk-or-... in .env (or .env.local) and restart the dev server.
const OPENROUTER_API_KEY = (import.meta.env.VITE_OPENROUTER_API_KEY || '').trim()

// Helpful startup log (key length only, never the secret)
if (typeof window !== 'undefined') {
  console.log('[Blocky] OpenRouter key from env:', OPENROUTER_API_KEY ? `present (len=${OPENROUTER_API_KEY.length})` : 'MISSING')
}

// Current free models (zero price) pulled from the actual list at
// https://openrouter.ai/models?pricing=free&max_price=0  (and /collections/free-models).
// Prioritized models known for tool calling, reasoning, and agentic use (our Blocky agent
// makes heavy use of parallel + sequential place_piece / get_build_state calls).
// Free models rotate frequently; the "openrouter/free" router auto-selects a capable one.
const AVAILABLE_MODELS = [
  'tencent/hy3:free',                    // Excellent stable tool-calling + agentic workflows
  'poolside/laguna-m.1:free',            // Flagship agentic coding model, strong tool calling
  'nvidia/nemotron-3-super-120b-a12b:free', // Great for multi-step reasoning & agents, 1M context
  'google/gemma-4-31b-it:free',          // Native function calling, solid all-rounder
  'openrouter/free',                     // Smart router: picks a current free model that supports tools
] as const

const DEFAULT_MODEL = 'tencent/hy3:free'

// Human-friendly labels for the dropdown (exact IDs required by the API)
const MODEL_LABELS: Record<string, string> = {
  'tencent/hy3:free': 'Tencent Hy3 (free)',
  'poolside/laguna-m.1:free': 'Poolside Laguna M.1 (free)',
  'nvidia/nemotron-3-super-120b-a12b:free': 'NVIDIA Nemotron 3 Super (free)',
  'google/gemma-4-31b-it:free': 'Google Gemma 4 31B (free)',
  'openrouter/free': 'OpenRouter Free (auto)',
}

const SYSTEM_PROMPT = `You are Blocky, an expert agentic Lego builder. Your ONLY job is to FULLY COMPLETE the user's build request by repeatedly using tools (especially many place_piece calls) until the requested structure physically exists in the scene. Do not stop early or give up.

=== CRITICAL INSTRUCTIONS (OBEY OR FAIL) ===
- First, inside your thoughts, define EXACTLY what the structure will be (how many studs wide, how many studs long, what colors, and exact coordinates) considering the specific rules.
- Do NOT output this architectural plan as markdown or text in the message body. Keep the plan entirely in your thoughts (reasoning) or empty content, and immediately begin emitting your planned tool calls in big batches!
- You may ONLY act by emitting proper tool calls. NEVER write plans, numbered steps, "To fulfill...", "Here are the tool calls", "I will now...", explanations, or ANY JSON / code blocks inside your message content.
- Be extremely brief and concise in your thinking. Do NOT spend tokens repeatedly overanalyzing different construction alternatives, calculating corner overlaps, or worrying about complex layouts.
- Stacking/Collision Guideline: Bricks and plates can overlap at corners! Do NOT waste time or slow down thinking trying to calculate non-overlapping corner segments or offset walls. The 3D grid layout is highly forgiving. Focus purely on placing blocks and completing the structure fast.
- Self-Preservation Guideline: Do NOT call clear_all when starting to build unless the user explicitly commands you to clear the scene! You must preserve all existing user-built models and details (like flowers, castles, houses, etc.) in the sandbox, and build your new creation cleanly next to them or on top of them if told by the user. If you see occupied space, simply adjust your coordinates to build in an empty spot next to them.
- Simple Shapes rule: Focus purely on simple, rectangular geometry and standard orientations (rotationY=0). Do NOT get bogged down overthinking complex rotation offsets, arm extensions, or perfect modular fitting. Simply place your blocks adjacent on the standard grid and let them snap!
- You MUST output real tool calls on Turn 1. Never return empty content or claim completion without any pieces.
- The content field of your response should be EMPTY or extremely minimal until the build is 100% finished. Only AFTER all pieces are placed do you output 1 short final sentence (e.g. "Small house is complete!").
- Output DOZENS of place_piece tool calls across rounds. Put as many as possible (8-20) in each response when building big sections.
- Always place pieces so they are adjacent and connected. Keep pieces touching and tightly aligned without leaving gaps.
- When placing consecutive walls (like brick-1x8 or wall-1x16), calculate coordinates carefully so they snap together end-to-end. For example, if a 1x16 wall is placed at x=0, z=0 (extending to z=16), the next continuous segment should start at x=0, z=16. Do NOT leave empty spaces or misalign them.
- Always check the width (w) and length (l) of the parts from the catalog list to do exact modular math on coordinates.
- After you receive tool results (success/collision), IMMEDIATELY continue with the next layer or section in your next set of tool calls. The loop will keep feeding you results.

=== COORDINATES & BUILDING ===
- x,z: integer stud grid. Position is the origin corner of the piece.
- y: Lego-style brick heights. In this system, the exact plate and brick height levels are offset starting at y=0.09 for base floor plates.
- Each brick height layer up MUST strictly increment by y = previous_y + 0.4.
- This means the exact valid vertical layer levels (Y values) are:
  * Layer 0 (Floor base plates): y = 0.09
  * Layer 1 (Bricks): y = 0.49
  * Layer 2 (Bricks): y = 0.89
  * Layer 3 (Bricks): y = 1.29
  * Layer 4 (Bricks): y = 1.69
  * Layer 5 (Bricks): y = 2.09
  * Layer 6 (Bricks): y = 2.49
  * Layer 7 (Bricks): y = 2.89
  * Layer 8 (Bricks): y = 3.29
  * Layer 9 (Bricks): y = 3.69
  * Layer 10 (Bricks): y = 4.09
  * Layer 11 (Bricks): y = 4.49
  * Layer 12 (Bricks): y = 4.49 + 0.4 = 4.89
  * Layer 13 (Bricks): y = 5.29
  * Layer 14 (Bricks): y = 5.69
- NEVER build below the sandbox floor. y = 0.09 is the absolute ground/floor. It is physically impossible to place bricks at negative Y values (like -0.31, -0.71, etc.).
- If a user asks you to "add a body to the head/face" or similar, you must understand that the head is sitting on the ground (y=0.09). To build a body, do NOT build downwards into the floor. Instead, you must build the body horizontally next to the head (e.g., adjacent on the X or Z grid), or build a torso horizontally adjacent first.
- NEVER use arbitrary Y heights like 0.4, 0.8, 1.2, 1.6, or 2.0. You must strictly use the values ending in .09, .49, .89, .29, .69 as listed above. Otherwise, the blocks will not snap and will float, leaving hollow visual spaces or causing collisions.
- For rotationY usually use 0. Pieces must not overlap (you will get collision feedback).

=== AVAILABLE PARTS (use EXACT partId only) ===
${PART_LIST.map(p => `- ${p.id} (${p.name})`).join('\n')}

=== SMALL HOUSE RECIPE (use when user says "build a small house" or similar) ===
A small house needs:
- Solid rectangular base (approx 6 studs wide x 8+ studs long) made of plates (like plate-4x4, plate-2x8) at y=0.09.
- 3 full layers of walls (brick pieces) at y=0.49, 0.89, 1.29. Walls on all four sides.
- Leave a 2-stud gap in ONE wall (the "door") — do not place bricks over the door location.
- Roof on top (y=1.69 or higher) using plates or slopes.

Concrete recommended base (copy/adapt positions, keep pieces touching):
  clear_all
  place plate-4x4, x=-2, y=0.09, z=-2, color="#c91a09"
  place plate-4x4, x=2, y=0.09, z=-2, color="#c91a09"

Then walls (example along perimeter, adjust to match your base size, skip door area):
  // layer 1
  place brick-2x4 ... at y=0.49 on edges
  // layer 2 y=0.89
  // layer 3 y=1.29
Then roof plates at y=1.69 covering the top.

Use many parallel place_piece in one go for a full layer. Repeat for next layers after results.

For any other structure (castle, wall, etc.) follow the same: clear if needed, first architect/plan the compact layout in your mind, then EXECUTE immediately by calling many place_piece right now. To cover big areas and walls fast, use macro blocks: plate-8x8, wall-1x16, wall-1x12, tower-round-4x4, fort-corner-4x4.

=== STRICT RULES ===
- NEVER emit JSON objects or markdown in your .content text.
- Use the official tool call format only.
- - You do NOT need to call set_cursor_color to change colors when building. Instead specify the desired color directly in each place_piece tool call parameter.
- If a placement collides you will be told — shift coordinates slightly and retry that section.
- Keep going until the house (or requested item) is fully built. A finished small house has 25+ pieces minimum.

You have these tools:
- place_piece (use constantly)
- get_build_state (only if truly lost)
- clear_all
- set_cursor_color

Think silently about layout. Then output a big batch of tool calls. Continue across multiple rounds until DONE.`

const AVAILABLE_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'place_piece',
      description: 'Place a single Lego piece in the world. Returns success or failure.',
      parameters: {
        type: 'object',
        properties: {
          partId: { type: 'string', description: 'Exact part id from the catalog, e.g. "brick-2x4"' },
          x: { type: 'number' },
          y: { type: 'number' },
          z: { type: 'number' },
          rotationY: { type: 'number', description: 'Rotation in radians, usually 0 or 1.57' },
          color: { type: 'string', description: 'Hex color, e.g. "#c91a09"' }
        },
        required: ['partId', 'x', 'y', 'z']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'remove_piece',
      description: 'Remove/delete a single Lego piece from the world using its unique ID (obtainable from get_build_state).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The unique ID of the piece to remove (obtained from get_build_state pieces).' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_build_state',
      description: 'Get a summary of currently placed pieces and the cursor.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'clear_all',
      description: 'Remove all placed pieces.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'set_cursor_color',
      description: 'Change the color used for new pieces.',
      parameters: {
        type: 'object',
        properties: {
          color: { type: 'string' }
        },
        required: ['color']
      }
    }
  }
]

// Robust extraction of tool calls when the model puts JSON in the text content instead of using tool_calls
function extractToolCalls(text: string): any[] {
  if (!text) return []
  let t = text.replace(/```[a-z]*\s*/gi, '').replace(/```/g, '').trim()

  const calls: any[] = []

  // 1. Try if the whole thing (after stripping fences) is a JSON array of calls
  try {
    const parsed = JSON.parse(t)
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (item && typeof item === 'object' && item.name) {
          calls.push({
            function: {
              name: item.name,
              arguments: JSON.stringify(item.parameters || item.args || item)
            }
          })
        }
      }
      if (calls.length > 0) return calls
    }
  } catch {}

  // 2. Find individual { "name": "..." ... } objects (handles the exact style the user showed)
  // Use a tolerant multi-line match and attempt to parse
  const regex = /\{[\s\S]*?"name"\s*:\s*"[^"]+"[\s\S]*?\}/g
  let match
  while ((match = regex.exec(t)) !== null) {
    let candidate = match[0]
    // Balance braces crudely in case truncated
    let opens = (candidate.match(/\{/g) || []).length
    let closes = (candidate.match(/\}/g) || []).length
    for (let i = 0; i < opens - closes; i++) candidate += '}'
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && parsed.name) {
        calls.push({
          function: {
            name: parsed.name,
            arguments: JSON.stringify(parsed.parameters || parsed.args || parsed)
          }
        })
      }
    } catch {}
  }

  // Deduplicate
  const seen = new Set<string>()
  return calls.filter((c) => {
    const key = `${c.function.name}|${c.function.arguments}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export default function BlockyPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hi! I'm Blocky. Tell me what you want to build (e.g. 'build a red castle wall of length 8' or 'add a 2x4 blue brick') and I'll assemble it!"
    }
  ])
  const [input, setInput] = useState('')
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [isThinking, setIsThinking] = useState(false)
  const [apiStatus, setApiStatus] = useState<'unknown' | 'ok' | 'error'>('unknown')
  const [agentAction, setAgentAction] = useState<string>('')
  const [liveReasoningLines, setLiveReasoningLines] = useState<string[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)

  async function testConnection() {
    if (!OPENROUTER_API_KEY) {
      setApiStatus('error')
      return false
    }
    try {
      // Simple test call to OpenRouter (include referer/title as recommended/required for many keys)
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': '3D Builder - Blocky Agent',
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5,
        })
      })
      if (res.ok) {
        setApiStatus('ok')
        return true
      } else {
        // Log for debugging (user can open console)
        const errText = await res.text().catch(() => '')
        console.warn('[Blocky] OpenRouter test non-ok:', res.status, errText.slice(0, 300))
      }
    } catch (e) {
      console.warn('[Blocky] OpenRouter test fetch error:', e)
    }
    setApiStatus('error')
    return false
  }



  async function executeTool(name: string, args: any): Promise<string> {
    // Always read fresh state to avoid stale closures in the async agent loop
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

          // If a collision is detected, automatically scan nearby empty coordinates to place the piece cleanly (L3D-030)
          if (!canPlacePiece(proposed, pieces)) {
            let foundAlternative = false
            // Scan outwards spirally on X/Z integer grids up to 4 studs away to find empty space
            for (let offset = 1; offset <= 4; offset++) {
              const alternatives: [number, number][] = [
                [x + offset, z],
                [x - offset, z],
                [x, z + offset],
                [x, z - offset],
                [x + offset, z + offset],
                [x - offset, z - offset],
              ]
              for (const [altX, altZ] of alternatives) {
                const altProposed = { ...proposed, position: [altX, y, altZ] as [number, number, number] }
                if (canPlacePiece(altProposed, pieces)) {
                  position = [altX, y, altZ]
                  foundAlternative = true
                  break
                }
              }
              if (foundAlternative) break
            }

            if (!foundAlternative) {
              return JSON.stringify({ success: false, error: 'Collision at that location' })
            }
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
              error: 'Clearing the sandbox is blocked. To preserve the user\'s other creations, you are strictly forbidden from clearing the board unless the user explicitly requested a clear, reset, or clean start in their message. Build your new structure next to the existing elements instead.' 
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

  async function runAgentLoop(userMessage: string) {
    if (!OPENROUTER_API_KEY) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'No API key available. Set VITE_OPENROUTER_API_KEY in .env and restart.' 
      }])
      setIsThinking(false)
      return
    }

    setIsThinking(true)
    setAgentAction('thinking...')
    abortControllerRef.current = new AbortController()

    // Local array — we only call setMessages a few times per turn instead of inside every loop iteration.
    // Keep context window compact and highly efficient by keeping only the last 6 messages (L3D-034)
    // This prevents context-window bloat, avoids model confusion over ancient steps, and saves massive response latency.
    const maxContextMessages = 6
    let workingMessages: ChatMessage[] = [...messages, { role: 'user', content: userMessage }]
    if (workingMessages.length > maxContextMessages) {
      // Always preserve the very first assistant welcome message
      workingMessages = [
        messages[0],
        ...workingMessages.slice(-maxContextMessages + 1)
      ]
    }
    setMessages(workingMessages)

    let chatMessages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...workingMessages.map(m => {
        const base: any = {
          role: m.role === 'tool' ? 'tool' : m.role,
          content: m.content
        }
        // carry over tool_call_id when present for proper multi-turn
        if (m.role === 'tool' && (m as any).tool_call_id) {
          base.tool_call_id = (m as any).tool_call_id
        }
        return base
      })
    ]

    const isBuildRequest = /\b(build|house|make|create|build a|small house|boat)\b/i.test(userMessage)
    let finalResponse = ''

    // List of creative phrased status messages (similar to Claude's interactive phrases)
    const thinkingPhrases = [
      'Architecting the blueprint...',
      'Planning structural geometry...',
      'Sorting structural blocks...',
      'Aligning building alignments...',
      'Rendering the building steps...',
      'Layering structural dimensions...',
      'Polishing layout aesthetics...'
    ]

    // Create a live timing log for the session (L3D-025)
    const runLog: string[] = [
      `# BLOCKY ASSEMBLY RUN LOG`,
      `Date/Time: ${new Date().toLocaleString()}`,
      `User Prompt: "${userMessage}"`,
      `Model: ${model}`,
      `------------------------------------------`
    ]

    setLiveReasoningLines([])

    try {
      for (let turns = 0; turns < 15; turns++) {
        // Check if building was stopped/aborted
        if (abortControllerRef.current?.signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError')
        }

        // Display a beautiful, random, live-action structural phrasing message
        const activePhrase = thinkingPhrases[turns % thinkingPhrases.length]
        setAgentAction(activePhrase)

        runLog.push(`\n## Turn ${turns + 1} - Calling OpenRouter...`)
        const turnStartTime = performance.now()

        const res = await fetch(OPENROUTER_URL, {
          method: 'POST',
          signal: abortControllerRef.current?.signal,
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': '3D Builder - Blocky Agent',
          },
          body: JSON.stringify({
            model,
            messages: chatMessages,
            tools: AVAILABLE_TOOLS,
            stream: true, // Enable streaming to capture live content/reasoning tokens
            temperature: 0.1,
            max_tokens: 1500,
          })
        })

        const turnLatency = ((performance.now() - turnStartTime) / 1000).toFixed(2)
        runLog.push(`Latency: ${turnLatency}s`)

        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          runLog.push(`Response Error Status: ${res.status}\nDetails: ${errText}`)
          throw new Error(`OpenRouter error: ${res.status} ${errText}`)
        }

        // Process SSE stream to render assistant reasoning text live
        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')
        const decoder = new TextDecoder()
        let buffer = ''
        let streamAssistantContent = ''
        let streamAssistantReasoning = ''
        let streamToolCalls: any[] = []

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            while (true) {
              const lineEnd = buffer.indexOf('\n')
              if (lineEnd === -1) break

              const line = buffer.slice(0, lineEnd).trim()
              buffer = buffer.slice(lineEnd + 1)

              if (line.startsWith(':')) continue
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6)
                if (dataStr === '[DONE]') break

                try {
                  const parsed = JSON.parse(dataStr)
                  const choice = parsed.choices?.[0]
                  const delta = choice?.delta

                  // Extract reasoning tokens
                  if (delta?.reasoning) {
                    streamAssistantReasoning += delta.reasoning
                    
                    // Break the reasoning into clean 3-4 line scrolling chunks
                    const cleanedReasoning = streamAssistantReasoning
                      .replace(/[\r\n]+/g, ' ')
                      .trim()
                    
                    // Group reasoning into chunks of roughly 55 characters per line
                    const words = cleanedReasoning.split(' ')
                    const lines: string[] = []
                    let currentLine = ''
                    for (const word of words) {
                      if ((currentLine + ' ' + word).length > 55) {
                        lines.push(currentLine.trim())
                        currentLine = word
                      } else {
                        currentLine += (currentLine ? ' ' : '') + word
                      }
                    }
                    if (currentLine) {
                      lines.push(currentLine.trim())
                    }
                    
                    // Display only the last 3 lines to roll older lines off cleanly
                    const visibleLines = lines.slice(-3)
                    setLiveReasoningLines(visibleLines)
                    setAgentAction(activePhrase)
                  }

                  // Extract standard text content chunks
                  if (delta?.content) {
                    streamAssistantContent += delta.content
                    // Display text content live to the user
                    setMessages(prev => {
                      const base = prev.filter(m => m.role !== 'assistant' || m.content !== streamAssistantContent.slice(0, -delta.content.length))
                      return [...base, { role: 'assistant', content: streamAssistantContent }]
                    })
                  }

                  // Accumulate tool calls (if streamed)
                  if (delta?.tool_calls) {
                    delta.tool_calls.forEach((tc: any) => {
                      const idx = tc.index ?? 0
                      if (!streamToolCalls[idx]) {
                        streamToolCalls[idx] = { id: tc.id, function: { name: '', arguments: '' } }
                      }
                      if (tc.id) streamToolCalls[idx].id = tc.id
                      if (tc.function?.name) streamToolCalls[idx].function.name += tc.function.name
                      if (tc.function?.arguments) streamToolCalls[idx].function.arguments += tc.function.arguments
                    })
                  }
                } catch {}
              }
            }
          }
        } finally {
          reader.cancel()
        }

        // Standardize the aggregated message structure
        const assistantMsg: any = {
          role: 'assistant',
          content: streamAssistantContent,
        }
        if (streamToolCalls.length > 0) {
          assistantMsg.tool_calls = streamToolCalls.filter(Boolean)
        }

        // Log the model reasoning and content metadata for auditing bottlenecks
        if (streamAssistantReasoning) {
          runLog.push(`Model Reasoning (CoT):\n${streamAssistantReasoning}`)
        }
        if (streamAssistantContent) {
          runLog.push(`Model Content Response:\n${streamAssistantContent}`)
        }

        // Tool calls (OpenAI format used by OpenRouter)
        let effectiveToolCalls = assistantMsg.tool_calls || []
        const rawContent = streamAssistantContent.trim()
        if (effectiveToolCalls.length === 0 && rawContent) {
          effectiveToolCalls = extractToolCalls(rawContent)
        }

        if (effectiveToolCalls.length > 0) {
          chatMessages.push(assistantMsg)

          runLog.push(`Tool Action Plans (${effectiveToolCalls.length} calls):`)
          setAgentAction('using tools...')

          // Execute tools (store updates are now very cheap because of agent* + single commit at end)
          for (const toolCall of effectiveToolCalls) {
            if (abortControllerRef.current?.signal.aborted) {
              throw new DOMException('Aborted by user', 'AbortError')
            }
            const name = toolCall.function.name
            let args: Record<string, any> = {}
            try {
              const argStr = toolCall.function.arguments
              args = typeof argStr === 'string' 
                ? JSON.parse(argStr || '{}') 
                : (argStr || {})
            } catch {}

            setAgentAction(`executing ${name}...`)

            const result = await executeTool(name, args)
            runLog.push(`- Tool Call [${name}] with args: ${JSON.stringify(args)} -> Output: ${result}`)

            // Render each tool creation immediately to the user rather than waiting until the end
            let displayContent = result
            try {
              const parsed = JSON.parse(result)
              if (parsed.success) {
                displayContent = `🧱 ${parsed.message}`
              }
            } catch {}

            const toolCallId = (toolCall as any).id || `call_${name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
            // Important: feed proper tool results back so the model knows what succeeded and can continue layering
            chatMessages.push({
              role: 'tool',
              tool_call_id: toolCallId,
              content: result
            })

            const stepMessage: ChatMessage = {
              role: 'tool',
              content: displayContent,
              toolName: name
            }
            workingMessages = [...workingMessages, stepMessage]
            setMessages(workingMessages)
          }

          setAgentAction('thinking...')
          // loop → next model call with fresh state + tool feedback now present in chatMessages
        } else {
          // No more tool calls from model.
          runLog.push(`No further tool calls requested. Evaluating completion criteria.`)
          // For build requests, only accept "done" if we actually have a decent number of pieces.
          const currentCount = useBuilderStore.getState().pieces.length
          const contentLower = (rawContent || '').toLowerCase()
          const claimsDone = /done|complete|finished|ready|built|house is/.test(contentLower)

          if (!isBuildRequest || currentCount >= 10 || claimsDone || turns >= 13) {
            // Safety: if we have zero pieces placed, do NOT break or declare done. Keep going! (L3D-032)
            if (isBuildRequest && currentCount === 0 && turns < 13) {
              chatMessages.push(assistantMsg || { role: 'assistant', content: '' })
              const nudge = `You have placed 0 pieces! You MUST output a valid list of place_piece tool calls to build the requested item.`
              chatMessages.push({ role: 'user', content: nudge })
              runLog.push(`Model attempted to stop with 0 pieces. Continuing loop.`)
              setAgentAction('continuing build...')
              continue
            }
            // Safety 2: if this is a follow-up or continuous build request (e.g. "now add...", "continue...", "build more..."), 
            // the count of pieces might already be > 10. We must check if the agent actually placed NEW pieces this session. (L3D-033)
            const newPiecesPlacedThisSession = workingMessages.filter(m => m.role === 'tool' && m.content.includes('🧱')).length
            if (isBuildRequest && newPiecesPlacedThisSession === 0 && turns < 13) {
              chatMessages.push(assistantMsg || { role: 'assistant', content: '' })
              const nudge = `You have not placed any new pieces in this conversation turn! You must output a valid list of place_piece tool calls to add/modify the current structure.`
              chatMessages.push({ role: 'user', content: nudge })
              runLog.push(`Model attempted to stop early on follow-up build with 0 new pieces. Continuing loop.`)
              setAgentAction('continuing build...')
              continue
            }
            finalResponse = rawContent || 'Done.'
            runLog.push(`Assembly complete. Standard final content: ${finalResponse}`)
            break
          } else {
            // Force the model to keep building — push a continuation nudge into the conversation
            chatMessages.push(assistantMsg || { role: 'assistant', content: '' })
            const nudge = `The current scene only has ${currentCount} pieces. The user asked: "${userMessage}". A complete build needs a solid base + walls on all sides + roof/crenellations. Do NOT stop. Immediately output more place_piece tool calls to finish it.`
            chatMessages.push({ role: 'user', content: nudge })
            runLog.push(`Model claimed completion too early (${currentCount} pieces). Pushed continuation nudge: "${nudge}"`)
            // continue loop for another round
            setAgentAction('continuing build...')
          }
        }
      }

      if (!finalResponse) {
        // Final safety net
        const finalCount = useBuilderStore.getState().pieces.length
        if (isBuildRequest && finalCount < 8) {
          finalResponse = `I placed ${finalCount} pieces but the model stopped early. Try again or pick a different model (the house may need one more prompt).`
        } else {
          finalResponse = "Done."
        }
        workingMessages = [...workingMessages, { role: 'assistant', content: finalResponse }]
        setMessages(workingMessages)
      }

      setAgentAction('')
      playAgentCompleteSound() // Play the rewarding agent task completion chime

      // One single expensive commit at the very end of the user's request.
      useBuilderStore.getState().commitAgentChanges()

      // Save a copy of the run log inside the local client storage first
      try {
        const savedLogs = JSON.parse(localStorage.getItem('blocky-run-logs') || '[]')
        savedLogs.unshift({
          timestamp: new Date().toLocaleString(),
          prompt: userMessage,
          log: runLog.join('\n')
        })
        localStorage.setItem('blocky-run-logs', JSON.stringify(savedLogs.slice(0, 20))) // limit history to 20 logs
      } catch (logErr) {
        console.warn('Failed to save log to localStorage:', logErr)
      }

      // Automatically trigger a file download of the markdown log on completion (L3D-026)
      try {
        const blob = new Blob([runLog.join('\n')], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const safeName = userMessage.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)
        a.href = url
        a.download = `blocky-log-${safeName || 'run'}.md`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch (dlErr) {
        console.warn('Failed to auto-download markdown log file:', dlErr)
      }

      // Save the complete runLog as a local audit log on client storage or log it cleanly
      console.log(runLog.join('\n'))

    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Build aborted
        runLog.push(`🛑 Run Aborted by User.`)
        // Save the complete runLog as a local audit log on client storage even when aborted
        try {
          const savedLogs = JSON.parse(localStorage.getItem('blocky-run-logs') || '[]')
          savedLogs.unshift({
            timestamp: new Date().toLocaleString(),
            prompt: userMessage,
            log: runLog.join('\n')
          })
          localStorage.setItem('blocky-run-logs', JSON.stringify(savedLogs.slice(0, 20)))
        } catch {}

        // Automatically trigger a file download of the markdown log on abort (L3D-026)
        try {
          const blob = new Blob([runLog.join('\n')], { type: 'text/markdown' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          const safeName = userMessage.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)
          a.href = url
          a.download = `blocky-log-${safeName || 'run'}-aborted.md`
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        } catch {}

        console.log(runLog.join('\n'))
        workingMessages = [...workingMessages, { role: 'assistant', content: '🛑 Building stopped by user.' }]
        setMessages(workingMessages)
        setAgentAction('')
        useBuilderStore.getState().commitAgentChanges() // Still commit whatever has been placed up to this point
        return
      }
      let errorMsg = `Error talking to OpenRouter: ${err.message}`

      if (!OPENROUTER_API_KEY) {
        errorMsg = 'Missing VITE_OPENROUTER_API_KEY. Add it to .env (VITE_ prefix required) and restart the dev server.'
      } else if (err.message.includes('401') || /invalid|unauthorized|key/i.test(err.message)) {
        errorMsg = 'Invalid OpenRouter API key (401). Double-check the key value and restart the dev server.'
      } else if (err.message.includes('404')) {
        errorMsg = `Model "${model}" not found or not available on OpenRouter.\n\nFree models change often. Pick another from the selector below. Current free list: https://openrouter.ai/models?pricing=free`
      } else if (err.message.includes('Failed to fetch') || err.message.includes('ECONNREFUSED') || err.message.includes('network')) {
        errorMsg = 'Cannot reach OpenRouter. Check your internet connection or key.\n(Free models can be flaky — try again or switch model.)'
      }

      runLog.push(`❌ Error encountered: ${errorMsg}`)
      try {
        const savedLogs = JSON.parse(localStorage.getItem('blocky-run-logs') || '[]')
        savedLogs.unshift({
          timestamp: new Date().toLocaleString(),
          prompt: userMessage,
          log: runLog.join('\n')
        })
        localStorage.setItem('blocky-run-logs', JSON.stringify(savedLogs.slice(0, 20)))
      } catch {}

      // Automatically trigger a file download of the markdown log on error (L3D-026)
      try {
        const blob = new Blob([runLog.join('\n')], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        const safeName = userMessage.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)
        a.href = url
        a.download = `blocky-log-${safeName || 'run'}-error.md`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch {}

      console.log(runLog.join('\n'))

      setMessages([...workingMessages, { role: 'assistant', content: errorMsg }])
      setApiStatus('error')
      setAgentAction('')
    } finally {
      setIsThinking(false)
      abortControllerRef.current = null
    }
  }

  async function sendMessage() {
    if (!input.trim() || isThinking) return
    const text = input.trim()
    setInput('')

    if (!OPENROUTER_API_KEY) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Missing OpenRouter API key.\n\nCreate a .env file (or .env.local) with:\nVITE_OPENROUTER_API_KEY=sk-or-...\n\nThen restart the dev server (npm run dev). The key must use the VITE_ prefix.' 
      }])
      setApiStatus('error')
      return
    }

    // Do not hard-block on testConnection result. The lightweight test can flake
    // (esp. on free models) while real requests succeed. Let runAgentLoop handle errors.
    // The status dot (●/○) can still be clicked to manually test.
    await runAgentLoop(text)
  }

  function handleStop() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      playDeleteSound()
    }
  }

  function clearChat() {
    setMessages([{ 
      role: 'assistant', 
      content: 'Chat cleared. What would you like me to build?' 
    }])
  }

  // Auto-test on mount when a key is configured (populates the status dot)
  useEffect(() => {
    if (OPENROUTER_API_KEY) {
      testConnection()
    }
  }, [model]) // re-test if user switches model

  return (
    <div className="blocky-panel">
      <div className="panel-header flex items-center gap-2 text-[11px]">
        {/* Custom Lego minifig head with hardhat icon */}
        <span className="text-lg leading-none" title="Blocky Agent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Hard hat */}
            <path d="M4 8 Q12 3 20 8" fill="#facc15" stroke="#854d0e" strokeWidth="1.5"/>
            <rect x="3" y="7" width="18" height="3" rx="1" fill="#facc15" stroke="#854d0e" strokeWidth="1"/>
            {/* Head */}
            <rect x="5" y="9" width="14" height="11" rx="2" fill="#fde047" stroke="#854d0e" strokeWidth="1.5"/>
            {/* Eyes */}
            <circle cx="9" cy="13" r="1.2" fill="#1e2937"/>
            <circle cx="15" cy="13" r="1.2" fill="#1e2937"/>
            {/* Mouth */}
            <path d="M8.5 16 Q12 17.5 15.5 16" stroke="#1e2937" strokeWidth="1" fill="none" strokeLinecap="round"/>
          </svg>
        </span>
        <span className="font-semibold tracking-tight whitespace-nowrap">Blocky Agent</span>

        <div className="flex-1" />

        <button 
          onClick={testConnection} 
          className="text-[10px] px-1.5 border border-[#c9c2b3] rounded hover:bg-white/50" 
          title={
            !OPENROUTER_API_KEY 
              ? "No VITE_OPENROUTER_API_KEY set (click to recheck after fixing .env)"
              : "Test OpenRouter connection (click to retry)"
          }
        >
          { !OPENROUTER_API_KEY ? '⚠' : (apiStatus === 'ok' ? '●' : '○') }
        </button>

        <button 
          onClick={clearChat} 
          className="flex items-center gap-1 text-[10px] px-2 py-0.5 border border-[#c9c2b3] rounded bg-white hover:bg-red-50 active:bg-red-100 text-[#5f5a50] hover:text-red-600 transition-colors"
          title="Clear chat"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>
          </svg>
          <span className="font-medium">Clear</span>
        </button>
      </div>

      <div className="blocky-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`msg ${msg.role}`}>
            {msg.role === 'tool' && msg.toolName && (
              <div className="tool-label">✓ {msg.toolName}</div>
            )}
            <div className="content whitespace-pre-wrap">{msg.content}</div>
          </div>
        ))}
        {isThinking && (
          <div className="msg assistant thinking border-l-3 border-[#f59e0b] bg-amber-50/50 p-2.5 rounded-md border border-amber-200/60 max-w-full">
            <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <span className="animate-spin text-xs">⚙</span> 
              <span>Blocky's Chain of Thought</span>
            </div>
            {liveReasoningLines.length > 0 ? (
              <div className="flex flex-col gap-0.5 font-mono text-[9.5px] leading-normal text-amber-900 opacity-90">
                {liveReasoningLines.map((line, idx) => (
                  <div key={idx} className="animate-fade-in truncate">
                    {idx === liveReasoningLines.length - 1 ? '👉 ' : '   '}
                    {line}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10.5px] italic text-[#5f5a50] animate-pulse">
                {agentAction || 'Thinking...'}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="blocky-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Build a castle wall, a small house..."
          disabled={isThinking}
        />
        {isThinking ? (
          <button 
            onClick={handleStop}
            className="stop-btn flex items-center justify-center bg-red-100 hover:bg-red-200 text-red-600 rounded border border-red-300 transition-colors"
            title="Stop agent assembly"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          </button>
        ) : (
          <button 
            onClick={sendMessage} 
            disabled={!input.trim()}
            className="flex items-center justify-center"
            title="Send prompt to Blocky"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>

      {/* Super nice custom model select at bottom */}
      <div className="px-2 py-1 border-t border-[#c9c2b3] bg-[#f0e9d9]">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-[#5f5a50] font-medium shrink-0">Model</span>
          <div className="relative flex-1 min-w-0 border border-[#c9c2b3] hover:border-[#a37b6b] rounded-md bg-white transition-colors">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full appearance-none bg-transparent pl-2 pr-5 py-0.5 text-[10px] text-[#2c2a25] font-medium focus:outline-none cursor-pointer"
            >
              {AVAILABLE_MODELS.map((m) => (
                <option key={m} value={m}>
                  {MODEL_LABELS[m] || m}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-[#5f5a50]">
              <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
