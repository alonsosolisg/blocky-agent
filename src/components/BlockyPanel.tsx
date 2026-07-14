import { useState, useEffect, useRef } from 'react'
import { useBuilderStore } from '../store/useBuilderStore'
import { playAgentCompleteSound, playDeleteSound } from '../lib/audio'
import { 
  type ChatMessage, 
  OPENROUTER_URL, 
  OPENROUTER_API_KEY, 
  AVAILABLE_MODELS, 
  DEFAULT_MODEL, 
  MODEL_LABELS 
} from '../lib/agent/types'
import { SYSTEM_PROMPT, AVAILABLE_TOOLS } from '../lib/agent/prompt'
import { 
  extractToolCalls, 
  getThinkingPhrases, 
  cleanReasoningLines 
} from '../lib/agent/utils'
import { executeTool } from '../lib/agent/tools'

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
        const errText = await res.text().catch(() => '')
        console.warn('[Blocky] OpenRouter test non-ok:', res.status, errText.slice(0, 300))
      }
    } catch (e) {
      console.warn('[Blocky] OpenRouter test fetch error:', e)
    }
    setApiStatus('error')
    return false
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

    let workingMessages: ChatMessage[] = [...messages, { role: 'user', content: userMessage }]
    
    let totalEstimatedWords = workingMessages.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0)
    const maxWordBudget = 6000 

    while (totalEstimatedWords > maxWordBudget && workingMessages.length > 2) {
      workingMessages.splice(1, 1)
      totalEstimatedWords = workingMessages.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0)
    }

    setMessages(workingMessages)

    let chatMessages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...workingMessages.map(m => {
        const base: any = {
          role: m.role === 'tool' ? 'tool' : m.role,
          content: m.content
        }
        if (m.role === 'tool' && m.tool_call_id) {
          base.tool_call_id = m.tool_call_id
        }
        return base
      })
    ]

    const filteredChatMessages = chatMessages.filter((msg) => {
      if (msg.role === 'user' && msg.content.includes('nudge')) return false
      if (msg.role === 'user' && msg.content.includes('You have placed 0 pieces')) return false
      if (msg.role === 'user' && msg.content.includes('The current scene only has')) return false
      if (msg.role === 'user' && msg.content.includes('You MUST output a valid list')) return false
      if (msg.role === 'user' && msg.content.includes('You have not placed any new pieces')) return false
      return true
    })

    const isBuildRequest = /\b(build|house|make|create|build a|small house|boat|computer|pc|flower|plant|tree)\b/i.test(userMessage)
    let finalResponse = ''

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
        if (abortControllerRef.current?.signal.aborted) {
          throw new DOMException('Aborted by user', 'AbortError')
        }

        const activePhrase = getThinkingPhrases(turns)
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
            messages: filteredChatMessages, 
            tools: AVAILABLE_TOOLS,
            stream: true, 
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

                  if (delta?.reasoning) {
                    streamAssistantReasoning += delta.reasoning
                    cleanReasoningLines(streamAssistantReasoning, setLiveReasoningLines)
                    setAgentAction(activePhrase)
                  }

                  if (delta?.content) {
                    streamAssistantContent += delta.content
                    setMessages(prev => {
                      const base = prev.filter(m => m.role !== 'assistant' || m.content !== streamAssistantContent.slice(0, -delta.content.length))
                      return [...base, { role: 'assistant', content: streamAssistantContent }]
                    })
                  }

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

        const assistantMsg: any = {
          role: 'assistant',
          content: streamAssistantContent,
        }
        if (streamToolCalls.length > 0) {
          assistantMsg.tool_calls = streamToolCalls.filter(Boolean)
        }

        if (streamAssistantReasoning) {
          runLog.push(`Model Reasoning (CoT):\n${streamAssistantReasoning}`)
        }
        if (streamAssistantContent) {
          runLog.push(`Model Content Response:\n${streamAssistantContent}`)
        }

        let effectiveToolCalls = assistantMsg.tool_calls || []
        const rawContent = streamAssistantContent.trim()
        if (effectiveToolCalls.length === 0 && rawContent) {
          effectiveToolCalls = extractToolCalls(rawContent)
        }

        if (effectiveToolCalls.length > 0) {
          filteredChatMessages.push(assistantMsg)

          runLog.push(`Tool Action Plans (${effectiveToolCalls.length} calls):`)
          setAgentAction('using tools...')

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

            const result = await executeTool(name, args, workingMessages)
            runLog.push(`- Tool Call [${name}] with args: ${JSON.stringify(args)} -> Output: ${result}`)

            let displayContent = result
            try {
              const parsed = JSON.parse(result)
              if (parsed.success) {
                displayContent = `🧱 ${parsed.message}`
              }
            } catch {}

            const toolCallId = toolCall.id || `call_${name}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
            filteredChatMessages.push({
              role: 'tool',
              tool_call_id: toolCallId,
              content: result
            })

            const stepMessage: ChatMessage = {
              role: 'tool',
              content: displayContent,
              toolName: name,
              tool_call_id: toolCallId
            }
            workingMessages = [...workingMessages, stepMessage]
            setMessages(workingMessages)
          }

          setAgentAction('thinking...')
        } else {
          runLog.push(`No further tool calls requested. Evaluating completion criteria.`)
          
          // Let the LLM dynamically decide when it is done, rather than forcing hard piece-count limits
          // and pushing infinite-loop continuation nudges.
          finalResponse = rawContent || 'Done.'
          runLog.push(`Assembly complete. Model declared completion: ${finalResponse}`)
          break
        }
      }

      if (!finalResponse) {
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
      playAgentCompleteSound() 

      useBuilderStore.getState().commitAgentChanges()

      try {
        const savedLogs = JSON.parse(localStorage.getItem('blocky-run-logs') || '[]')
        savedLogs.unshift({
          timestamp: new Date().toLocaleString(),
          prompt: userMessage,
          log: runLog.join('\n')
        })
        localStorage.setItem('blocky-run-logs', JSON.stringify(savedLogs.slice(0, 20))) 
      } catch (logErr) {
        console.warn('Failed to save log to localStorage:', logErr)
      }

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

      console.log(runLog.join('\n'))

    } catch (err: any) {
      if (err.name === 'AbortError') {
        runLog.push(`🛑 Run Aborted by User.`)
        try {
          const savedLogs = JSON.parse(localStorage.getItem('blocky-run-logs') || '[]')
          savedLogs.unshift({
            timestamp: new Date().toLocaleString(),
            prompt: userMessage,
            log: runLog.join('\n')
          })
          localStorage.setItem('blocky-run-logs', JSON.stringify(savedLogs.slice(0, 20)))
        } catch {}

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
        useBuilderStore.getState().commitAgentChanges() 
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

  useEffect(() => {
    if (OPENROUTER_API_KEY) {
      testConnection()
    }
  }, [model]) 

  return (
    <div className="blocky-panel">
      <div className="panel-header flex items-center gap-2 text-[11px]">
        <span className="text-lg leading-none" title="Blocky Agent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 8 Q12 3 20 8" fill="#facc15" stroke="#854d0e" strokeWidth="1.5"/>
            <rect x="3" y="7" width="18" height="3" rx="1" fill="#facc15" stroke="#854d0e" strokeWidth="1"/>
            <rect x="5" y="9" width="14" height="11" rx="2" fill="#fde047" stroke="#854d0e" strokeWidth="1.5"/>
            <circle cx="9" cy="13" r="1.2" fill="#1e2937"/>
            <circle cx="15" cy="13" r="1.2" fill="#1e2937"/>
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

      <div className="px-2 py-1 border-t border-[#c9c2b3] bg-[#f0e9d9]">
        <div className="flex items-center gap-2 text-[10px]">
          <span className="text-[#5f5a50] font-medium shrink-0">Model</span>
          <div className="relative flex-1 min-w-0 border border-[#c9c2b3] hover:border-[#a37b6b] rounded-md bg-white transition-colors">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as any)}
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
