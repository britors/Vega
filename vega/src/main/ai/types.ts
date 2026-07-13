export type AIProviderId = 'anthropic' | 'openai' | 'gemini'

export interface AISettings {
  activeProvider: AIProviderId
  models: Record<AIProviderId, string>
  maxRoundsPerMessage: number
  maxMessagesPerDay: number
}

export interface AIDailyUsage {
  date: string
  messageCount: number
}

export interface AITool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  mutating: boolean
}

export interface AIToolCall {
  id: string
  name: string
  input: Record<string, unknown>
}

export type AIConversationEntry =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AIToolCall[] }
  | { role: 'tool_result'; toolCallId: string; toolName: string; content: string; isError: boolean }

export interface AITokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface AIResponse {
  text: string
  toolCalls: AIToolCall[]
  usage: AITokenUsage
}

export interface AISendMessageResult {
  text: string
  usage: AITokenUsage
  estimatedCostUsd: number | null
}

export interface AIProvider {
  readonly id: AIProviderId
  sendMessage(params: { system: string; history: AIConversationEntry[]; tools: AITool[] }): Promise<AIResponse>
  listModels(): Promise<string[]>
}

export interface AIToolProposal {
  proposalId: string
  toolCallId: string
  name: string
  input: Record<string, unknown>
  description: string
}

export interface AIToolOutcome {
  success: boolean
  message: string
}

export interface AIAuditEntry {
  timestamp: string
  kind: 'user_message' | 'read' | 'mutation_proposed' | 'mutation'
  toolName: string
  input: Record<string, unknown>
  decision?: 'approved' | 'rejected'
  outcome?: 'success' | 'error'
  detail: string
  system?: import('./platformContext').AIAuditSystemContext
}
