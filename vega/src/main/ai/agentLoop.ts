import { randomUUID } from 'node:crypto'
import type { SystemClient } from '../system/systemClient'
import { getApiKey, getSettings } from './credentials'
import { createProvider } from './providers'
import { estimateCostUsd } from './pricing'
import { createProposal } from './proposalStore'
import { describeMutation, executeReadTool, toolsForCapabilities } from './tools'
import { logAuditEntry } from './auditLog'
import { getDailyUsage, incrementDailyMessageCount } from './usageTracker'
import type { AIConversationEntry, AISendMessageResult, AITool, AIToolCall, AIToolProposal, AITokenUsage } from './types'
import { auditSystemContext, buildSystemPrompt, redactToolResultForModel, type AIAuditSystemContext } from './platformContext'

const REQUEST_TIMEOUT_MS = 90_000

export type ToolProposalCallback = (proposal: AIToolProposal) => void
export type StatusCallback = (status: string) => void

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} não respondeu em ${Math.round(ms / 1000)}s. Tente novamente.`)),
      ms
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

export class AgentLoop {
  private history: AIConversationEntry[] = []
  // Conta falhas consecutivas da mesma tool com os mesmos parâmetros dentro
  // de uma única chamada a sendMessage — usado pra avisar o modelo em vez de
  // deixá-lo insistir indefinidamente na mesma ação que já não funcionou.
  private failureCounts = new Map<string, number>()
  private auditSystem: AIAuditSystemContext | undefined

  constructor(
    private readonly vegaClient: SystemClient,
    private readonly onToolProposal: ToolProposalCallback,
    private readonly onStatus?: StatusCallback
  ) {}

  async sendMessage(userText: string): Promise<AISendMessageResult> {
    const settings = await getSettings()
    const dailyUsage = await getDailyUsage()
    if (dailyUsage.messageCount >= settings.maxMessagesPerDay) {
      throw new Error(
        `Limite diário de ${settings.maxMessagesPerDay} mensagens atingido. Ajuste o limite em Configurações ou tente novamente amanhã.`
      )
    }
    await incrementDailyMessageCount()

    const capabilities = await this.vegaClient.getCapabilities()
    const system = await this.vegaClient.ping().catch(() => undefined)
    this.auditSystem = auditSystemContext(capabilities)
    const systemPrompt = buildSystemPrompt(capabilities, system)

    this.failureCounts.clear()
    this.history.push({ role: 'user', content: userText })
    await logAuditEntry({ kind: 'user_message', toolName: '', input: {}, detail: userText, system: this.auditSystem })

    const apiKey = await getApiKey(settings.activeProvider)
    if (!apiKey) {
      throw new Error(`Nenhuma chave de API configurada para o provedor "${settings.activeProvider}".`)
    }
    const model = settings.models[settings.activeProvider]
    const provider = createProvider(settings.activeProvider, apiKey, model)
    const tools = toolsForCapabilities(capabilities)
    const maxRounds = settings.maxRoundsPerMessage
    const totalUsage: AITokenUsage = { inputTokens: 0, outputTokens: 0 }

    for (let round = 0; round < maxRounds; round++) {
      this.onStatus?.('Pensando...')
      const response = await withTimeout(
        provider.sendMessage({ system: systemPrompt, history: this.history, tools }),
        REQUEST_TIMEOUT_MS,
        'O provedor de IA'
      )
      totalUsage.inputTokens += response.usage.inputTokens
      totalUsage.outputTokens += response.usage.outputTokens
      this.history.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls })

      if (response.toolCalls.length === 0) {
        return {
          text: response.text,
          usage: totalUsage,
          estimatedCostUsd: estimateCostUsd(settings.activeProvider, model, totalUsage)
        }
      }

      // Sequencial de propósito: apenas uma proposta de mutação é
      // processada por vez, nunca em paralelo (requisito de segurança do v1).
      for (const toolCall of response.toolCalls) {
        await this.handleToolCall(toolCall, tools)
      }
    }

    return {
      text: 'Não consegui concluir a solicitação dentro do limite de etapas permitidas. Tente reformular o pedido em partes menores.',
      usage: totalUsage,
      estimatedCostUsd: estimateCostUsd(settings.activeProvider, model, totalUsage)
    }
  }

  clearHistory(): void {
    this.history = []
  }

  private async handleToolCall(toolCall: AIToolCall, tools: AITool[]): Promise<void> {
    const tool = tools.find((candidate) => candidate.name === toolCall.name)
    if (!tool) {
      this.history.push({
        role: 'tool_result',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: `Ferramenta desconhecida: ${toolCall.name}`,
        isError: true
      })
      return
    }

    if (!tool.mutating) {
      await this.handleReadTool(toolCall)
      return
    }

    await this.handleMutatingTool(toolCall)
  }

  private async handleReadTool(toolCall: AIToolCall): Promise<void> {
    this.onStatus?.(`Consultando: ${toolCall.name}...`)
    try {
      const result = await executeReadTool(toolCall.name, toolCall.input, this.vegaClient)
      const redactedResult = redactToolResultForModel(toolCall.name, result)
      await logAuditEntry({ kind: 'read', toolName: toolCall.name, input: toolCall.input, detail: redactedResult, system: this.auditSystem })
      this.history.push({
        role: 'tool_result',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        // Marca o resultado como dado externo não confiável — mitigação
        // estrutural de prompt injection (não depende só da instrução no
        // system prompt): um pacote/log com conteúdo malicioso não pode se
        // passar por uma instrução do usuário.
        content: `<dado_nao_confiavel origem="tool:${toolCall.name}">\n${redactedResult}\n</dado_nao_confiavel>`,
        isError: false
      })
    } catch (err) {
      const message = this.noteFailure(toolCall, (err as Error).message)
      await logAuditEntry({
        kind: 'read',
        toolName: toolCall.name,
        input: toolCall.input,
        outcome: 'error',
        detail: message,
        system: this.auditSystem
      })
      this.history.push({
        role: 'tool_result',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: message,
        isError: true
      })
    }
  }

  // Marca falhas repetidas da mesma tool com os mesmos parâmetros e injeta
  // um aviso explícito a partir da 2ª falha — evita que o agente insista
  // indefinidamente numa ação que já se mostrou quebrada (issue #33).
  private noteFailure(toolCall: AIToolCall, message: string): string {
    const signature = `${toolCall.name}:${JSON.stringify(toolCall.input)}`
    const count = (this.failureCounts.get(signature) ?? 0) + 1
    this.failureCounts.set(signature, count)
    if (count >= 2) {
      return `${message}\n\nAVISO: esta mesma ação (mesma ferramenta, mesmos parâmetros) já falhou ${count} vezes nesta conversa. Não tente de novo — explique o problema ao usuário ou sugira uma alternativa.`
    }
    return message
  }

  private async handleMutatingTool(toolCall: AIToolCall): Promise<void> {
    const proposalId = randomUUID()
    const description = await describeMutation(toolCall.name, toolCall.input, this.vegaClient)
    await logAuditEntry({
      kind: 'mutation_proposed',
      toolName: toolCall.name,
      input: toolCall.input,
      detail: description,
      system: this.auditSystem
    })
    this.onStatus?.('Aguardando confirmação do usuário...')
    this.onToolProposal({
      proposalId,
      toolCallId: toolCall.id,
      name: toolCall.name,
      input: toolCall.input,
      description
    })

    const resolution = await createProposal(proposalId)

    if (!resolution.approved) {
      const message = resolution.outcome?.message ?? 'O usuário rejeitou a ação proposta.'
      await logAuditEntry({
        kind: 'mutation',
        toolName: toolCall.name,
        input: toolCall.input,
        decision: 'rejected',
        detail: message,
        system: this.auditSystem
      })
      this.history.push({
        role: 'tool_result',
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        content: message,
        isError: true
      })
      return
    }

    const outcome = resolution.outcome ?? { success: false, message: 'Resultado da ação desconhecido.' }
    const outcomeMessage = outcome.success ? outcome.message : this.noteFailure(toolCall, outcome.message)
    await logAuditEntry({
      kind: 'mutation',
      toolName: toolCall.name,
      input: toolCall.input,
      decision: 'approved',
      outcome: outcome.success ? 'success' : 'error',
      detail: outcomeMessage,
      system: this.auditSystem
    })
    this.history.push({
      role: 'tool_result',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: outcomeMessage,
      isError: !outcome.success
    })
  }
}
