import type { AIProvider, AIProviderId } from '../types'
import { AnthropicProvider } from './anthropic'
import { OpenAIProvider } from './openai'
import { GeminiProvider } from './gemini'

export function createProvider(id: AIProviderId, apiKey: string, model: string): AIProvider {
  switch (id) {
    case 'anthropic':
      return new AnthropicProvider(apiKey, model)
    case 'openai':
      return new OpenAIProvider(apiKey, model)
    case 'gemini':
      return new GeminiProvider(apiKey, model)
  }
}
