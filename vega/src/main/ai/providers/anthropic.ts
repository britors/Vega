import Anthropic from '@anthropic-ai/sdk'
import type { AIConversationEntry, AIProvider, AIResponse, AITool, AIToolCall } from '../types'

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic' as const
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async sendMessage(params: {
    system: string
    history: AIConversationEntry[]
    tools: AITool[]
  }): Promise<AIResponse> {
    const messages: Anthropic.MessageParam[] = params.history.map((entry) => {
      if (entry.role === 'user') {
        return { role: 'user', content: entry.content }
      }
      if (entry.role === 'assistant') {
        const content: Anthropic.ContentBlockParam[] = []
        if (entry.content) content.push({ type: 'text', text: entry.content })
        for (const call of entry.toolCalls ?? []) {
          content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input })
        }
        return { role: 'assistant', content }
      }
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: entry.toolCallId,
            content: entry.content,
            is_error: entry.isError
          }
        ]
      }
    })

    const tools: Anthropic.Tool[] = params.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema
    }))

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: params.system,
      messages,
      tools
    })

    let text = ''
    const toolCalls: AIToolCall[] = []
    for (const block of response.content) {
      if (block.type === 'text') text += block.text
      if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: block.input as Record<string, unknown> })
      }
    }
    return {
      text,
      toolCalls,
      usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
    }
  }

  async listModels(): Promise<string[]> {
    const page = await this.client.models.list()
    return page.data.map((model) => model.id)
  }
}
