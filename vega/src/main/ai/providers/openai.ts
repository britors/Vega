import OpenAI from 'openai'
import type { AIConversationEntry, AIProvider, AIResponse, AITool, AIToolCall } from '../types'

export class OpenAIProvider implements AIProvider {
  readonly id = 'openai' as const
  private client: OpenAI
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey })
    this.model = model
  }

  async sendMessage(params: {
    system: string
    history: AIConversationEntry[]
    tools: AITool[]
  }): Promise<AIResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: 'system', content: params.system }]

    for (const entry of params.history) {
      if (entry.role === 'user') {
        messages.push({ role: 'user', content: entry.content })
      } else if (entry.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: entry.content || null,
          tool_calls: entry.toolCalls?.length
            ? entry.toolCalls.map((call) => ({
                id: call.id,
                type: 'function',
                function: { name: call.name, arguments: JSON.stringify(call.input) }
              }))
            : undefined
        })
      } else {
        messages.push({ role: 'tool', tool_call_id: entry.toolCallId, content: entry.content })
      }
    }

    const tools: OpenAI.Chat.ChatCompletionTool[] = params.tools.map((tool) => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.inputSchema }
    }))

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools
    })

    const message = response.choices[0]?.message
    const toolCalls: AIToolCall[] = []
    for (const call of message?.tool_calls ?? []) {
      if (call.type !== 'function') continue
      toolCalls.push({
        id: call.id,
        name: call.function.name,
        input: JSON.parse(call.function.arguments || '{}') as Record<string, unknown>
      })
    }
    return {
      text: message?.content ?? '',
      toolCalls,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0
      }
    }
  }

  async listModels(): Promise<string[]> {
    const page = await this.client.models.list()
    // The raw catalog also includes non-chat models — realtime/speech,
    // transcription, TTS, image generation, embeddings — that share the
    // "gpt-" prefix but don't work with Chat Completions + tools.
    return page.data
      .map((model) => model.id)
      .filter((id) => /^(gpt-|chatgpt|o[1-9])/i.test(id))
      .filter((id) => !/(realtime|transcribe|whisper|translate|tts|image|embedding|moderation)/i.test(id))
      .sort()
  }
}
