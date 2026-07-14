export function extractToolCalls(text: string): any[] {
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

  // 2. Find individual { "name": "..." ... } objects
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
export function getThinkingPhrases(turns: number): string {
  const thinkingPhrases = [
    'Architecting the blueprint...',
    'Planning structural geometry...',
    'Sorting structural blocks...',
    'Aligning building alignments...',
    'Rendering the building steps...',
    'Layering structural dimensions...',
    'Polishing layout aesthetics...'
  ]
  return thinkingPhrases[turns % thinkingPhrases.length]
}
export function checkClaimsDone(rawContent: string): boolean {
  const contentLower = (rawContent || '').toLowerCase()
  return /done|complete|finished|ready|built|house is/.test(contentLower)
}
export function cleanReasoningLines(streamAssistantReasoning: string, setLines: (lines: string[]) => void) {
  const cleanedReasoning = streamAssistantReasoning
    .replace(/[\r\n]+/g, ' ')
    .trim()

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

  const visibleLines = lines.slice(-3)
  setLines(visibleLines)
}
