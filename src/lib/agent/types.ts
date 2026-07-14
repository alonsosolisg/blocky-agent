export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'debug'
  content: string
  toolName?: string
  tool_call_id?: string
}

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

export const OPENROUTER_API_KEY = (import.meta.env.VITE_OPENROUTER_API_KEY || '').trim()

export const AVAILABLE_MODELS = [
  'tencent/hy3:free',                    // Excellent stable tool-calling + agentic workflows
  'poolside/laguna-m.1:free',            // Flagship agentic coding model, strong tool calling
  'nvidia/nemotron-3-super-120b-a12b:free', // Great for multi-step reasoning & agents, 1M context
  'google/gemma-4-31b-it:free',          // Native function calling, solid all-rounder
  'openrouter/free',                     // Smart router: picks a current free model that supports tools
] as const

export type ModelType = typeof AVAILABLE_MODELS[number]

export const DEFAULT_MODEL: ModelType = 'tencent/hy3:free'

export const MODEL_LABELS: Record<ModelType, string> = {
  'tencent/hy3:free': 'Tencent Hy3 (free)',
  'poolside/laguna-m.1:free': 'Poolside Laguna M.1 (free)',
  'nvidia/nemotron-3-super-120b-a12b:free': 'NVIDIA Nemotron 3 Super (free)',
  'google/gemma-4-31b-it:free': 'Google Gemma 4 31B (free)',
  'openrouter/free': 'OpenRouter Free (auto)',
}
