import { GoogleGenAI, createPartFromFunctionResponse, type Content, type FunctionDeclaration, type Part } from '@google/genai'
import type { AIConversationEntry, AIProvider, AIResponse, AITool, AIToolCall } from '../types'

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini' as const
  private client: GoogleGenAI
  private model: string

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey })
    this.model = model
  }

  async sendMessage(params: {
    system: string
    history: AIConversationEntry[]
    tools: AITool[]
  }): Promise<AIResponse> {
    const contents: Content[] = []

    for (const entry of params.history) {
      if (entry.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: entry.content }] })
      } else if (entry.role === 'assistant') {
        const parts: Part[] = []
        if (entry.content) parts.push({ text: entry.content })
        for (const call of entry.toolCalls ?? []) {
          parts.push({ functionCall: { name: call.name, args: call.input } })
        }
        contents.push({ role: 'model', parts })
      } else {
        contents.push({
          role: 'user',
          parts: [
            createPartFromFunctionResponse(entry.toolCallId, entry.toolName, {
              result: entry.content,
              ...(entry.isError ? { error: true } : {})
            })
          ]
        })
      }
    }

    const functionDeclarations: FunctionDeclaration[] = params.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.inputSchema
    }))

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: params.system,
        tools: [{ functionDeclarations }]
      }
    })

    const toolCalls: AIToolCall[] = (response.functionCalls ?? []).map((call, index) => ({
      id: call.id ?? `${call.name ?? 'tool'}-${index}-${Date.now()}`,
      name: call.name ?? '',
      input: (call.args ?? {}) as Record<string, unknown>
    }))

    return {
      text: response.text ?? '',
      toolCalls,
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0
      }
    }
  }

  async listModels(): Promise<string[]> {
    // queryBase: true is required to list the base model catalog — without
    // it the SDK's default only surfaces the caller's own tuned models,
    // which is empty/near-empty for most API keys.
    const pager = await this.client.models.list({ config: { queryBase: true, pageSize: 100 } })
    const names: string[] = []
    for await (const model of pager) {
      // The catalog also includes embedding/imagen/veo models that don't
      // work with generateContent + function calling.
      if (model.name?.includes('gemini')) names.push(model.name.replace(/^models\//, ''))
    }
    return names.sort()
  }
}
