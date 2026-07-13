import type { AIProviderId, AITokenUsage } from './types'

// USD per 1M tokens. Only providers/models with pricing confirmed against
// official docs are listed — for everything else estimateCostUsd() returns
// null rather than guessing, and the UI shows token counts only.
// Confirmed 2026-07-13.
const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 }
}

export function estimateCostUsd(provider: AIProviderId, model: string, usage: AITokenUsage): number | null {
  if (provider !== 'anthropic') return null
  const rates = ANTHROPIC_PRICING[model]
  if (!rates) return null
  return (usage.inputTokens * rates.input + usage.outputTokens * rates.output) / 1_000_000
}
