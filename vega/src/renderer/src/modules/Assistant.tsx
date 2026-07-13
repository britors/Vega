import { useEffect, useRef, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'
import { settingsFailure, type SettingsFeedback } from './assistantSettingsFeedback'

type AIProviderId = 'anthropic' | 'openai' | 'gemini'

interface AISettings {
  activeProvider: AIProviderId
  models: Record<AIProviderId, string>
  maxRoundsPerMessage: number
  maxMessagesPerDay: number
}

interface AIDailyUsage {
  date: string
  messageCount: number
}

interface AIToolProposal {
  proposalId: string
  toolCallId: string
  name: string
  input: Record<string, unknown>
  description: string
}

interface AIToolOutcome {
  success: boolean
  message: string
}

interface AITokenUsage {
  inputTokens: number
  outputTokens: number
}

interface AISendMessageResult {
  text: string
  usage: AITokenUsage
  estimatedCostUsd: number | null
}

interface AIAuditEntry {
  timestamp: string
  kind: 'user_message' | 'read' | 'mutation_proposed' | 'mutation'
  toolName: string
  input: Record<string, unknown>
  decision?: 'approved' | 'rejected'
  outcome?: 'success' | 'error'
  detail: string
}

type MessageVariant = 'proposed' | 'rejected' | 'error' | 'success'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  variant?: MessageVariant
}

interface TransactionFinishedEvent {
  transactionId: number
  success: boolean
  message: string
}

const providerLabel: Record<AIProviderId, string> = {
  anthropic: 'Claude (Anthropic)',
  openai: 'ChatGPT (OpenAI)',
  gemini: 'Gemini (Google)'
}

const providerPrivacyUrl: Record<AIProviderId, string> = {
  anthropic: 'https://www.anthropic.com/legal/privacy',
  openai: 'https://openai.com/policies/privacy-policy/',
  gemini: 'https://policies.google.com/privacy'
}

const auditKindLabel: Record<AIAuditEntry['kind'], string> = {
  user_message: 'Mensagem do usuário',
  read: 'Consulta de leitura',
  mutation_proposed: 'Ação proposta',
  mutation: 'Ação resolvida'
}

function nextId(): string {
  return Math.random().toString(36).slice(2)
}

function pickSuggestions(source: string[], count: number): string[] {
  const pool = [...source]
  const picked: string[] = []
  while (picked.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length)
    picked.push(pool.splice(i, 1)[0])
  }
  return picked
}

function waitForTransaction(txId: number, timeoutMs = 30 * 60_000): Promise<AIToolOutcome> {
  return new Promise((resolve) => {
    let off: () => void = () => {}
    const timer = setTimeout(() => {
      off()
      resolve({ success: false, message: 'Tempo esgotado aguardando o resultado da transação.' })
    }, timeoutMs)
    off = window.vega.onTransactionFinished((evt: TransactionFinishedEvent) => {
      if (evt.transactionId !== txId) return
      clearTimeout(timer)
      off()
      resolve({ success: evt.success, message: evt.message })
    })
  })
}

// Software-domain ações são fire-and-forget: retornam um txId na hora e o
// resultado real chega depois via TransactionFinished — precisam esperar
// esse evento antes de reportar sucesso/erro pro agente.
const TRANSACTION_TOOLS = new Set(['install_package', 'remove_package', 'clear_package_cache', 'update_all_packages', 'optimize_mirrors'])

async function executeMutation(proposal: AIToolProposal): Promise<AIToolOutcome> {
  const input = proposal.input as Record<string, unknown>
  try {
    if (TRANSACTION_TOOLS.has(proposal.name)) {
      let txId: number
      switch (proposal.name) {
        case 'install_package':
          txId = await window.vega.install(String(input.origin), String(input.id), {
            scope: input.scope === 'user' || input.scope === 'machine' ? input.scope : undefined,
            acceptAgreements: true
          })
          break
        case 'remove_package':
          txId = await window.vega.remove(String(input.origin), String(input.id))
          break
        case 'clear_package_cache':
          txId = await window.vega.clearCache()
          break
        case 'update_all_packages':
          txId = await window.vega.updateAll()
          break
        case 'optimize_mirrors':
          txId = await window.vega.optimizeMirrors()
          break
        default:
          return { success: false, message: `Ação desconhecida: ${proposal.name}` }
      }
      return await waitForTransaction(txId)
    }

    switch (proposal.name) {
      case 'create_snapshot': {
        const snapshotId = await window.vega.createSnapshot(String(input.description))
        return { success: true, message: `Snapshot #${snapshotId} criado.` }
      }
      case 'rollback_snapshot':
        await window.vega.rollbackSnapshot(Number(input.snapshotId))
        return { success: true, message: `Sistema revertido para o snapshot #${input.snapshotId}.` }
      case 'delete_snapshot':
        await window.vega.deleteSnapshot(Number(input.snapshotId))
        return { success: true, message: `Snapshot #${input.snapshotId} apagado.` }
      case 'set_retention_policy':
        await window.vega.setRetentionPolicy(Number(input.keepCount))
        return { success: true, message: `Política de retenção definida para ${input.keepCount} snapshots.` }
      case 'set_service_enabled':
        await window.vega.setServiceEnabled(String(input.name), Boolean(input.enabled))
        return {
          success: true,
          message: `Serviço "${input.name}" ${input.enabled ? 'habilitado' : 'desabilitado'} no boot.`
        }
      case 'set_service_running':
        await window.vega.setServiceRunning(String(input.name), Boolean(input.running))
        return { success: true, message: `Serviço "${input.name}" ${input.running ? 'iniciado' : 'parado'}.` }
      case 'restart_service':
        await window.vega.restartService(String(input.name))
        return { success: true, message: `Serviço "${input.name}" reiniciado.` }
      case 'mount_volume':
        await window.vega.mountVolume(String(input.path))
        return { success: true, message: `Volume "${input.path}" montado.` }
      case 'unmount_volume':
        await window.vega.unmountVolume(String(input.path))
        return { success: true, message: `Volume "${input.path}" desmontado.` }
      default:
        return { success: false, message: `Ação desconhecida: ${proposal.name}` }
    }
  } catch (err) {
    return { success: false, message: (err as Error).message }
  }
}

export default function Assistant(): JSX.Element {
  const dialogs = useDialogs()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const [settings, setSettings] = useState<AISettings | null>(null)
  const [configuredProviders, setConfiguredProviders] = useState<AIProviderId[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<AIProviderId | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [agentOptions, setAgentOptions] = useState<string[]>([])
  const [loadingAgents, setLoadingAgents] = useState(false)
  const [apiKeyDrafts, setApiKeyDrafts] = useState<Record<AIProviderId, string>>({
    anthropic: '',
    openai: '',
    gemini: ''
  })
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsFeedback, setSettingsFeedback] = useState<SettingsFeedback | null>(null)
  const [maxRoundsDraft, setMaxRoundsDraft] = useState('8')
  const [maxMessagesDraft, setMaxMessagesDraft] = useState('200')
  const [dailyUsage, setDailyUsage] = useState<AIDailyUsage | null>(null)

  const [sessionUsage, setSessionUsage] = useState<AITokenUsage>({ inputTokens: 0, outputTokens: 0 })
  const [sessionCostUsd, setSessionCostUsd] = useState<number | null>(0)

  const [showAuditLog, setShowAuditLog] = useState(false)
  const [auditEntries, setAuditEntries] = useState<AIAuditEntry[]>([])
  const [loadingAudit, setLoadingAudit] = useState(false)

  const [promptSuggestions, setPromptSuggestions] = useState<string[]>([])

  const listEndRef = useRef<HTMLDivElement>(null)

  async function refreshSettings(): Promise<void> {
    const result = await window.vega.aiGetSettings()
    setSettings(result.settings)
    setConfiguredProviders(result.configuredProviders)
    setMaxRoundsDraft(String(result.settings.maxRoundsPerMessage))
    setMaxMessagesDraft(String(result.settings.maxMessagesPerDay))
    setDailyUsage(result.dailyUsage)
  }

  async function loadAuditLog(): Promise<void> {
    setLoadingAudit(true)
    try {
      setAuditEntries(await window.vega.aiGetAuditLog(200))
    } finally {
      setLoadingAudit(false)
    }
  }

  async function toggleAuditLog(): Promise<void> {
    const next = !showAuditLog
    setShowAuditLog(next)
    if (next) await loadAuditLog()
  }

  async function saveMaxRounds(): Promise<void> {
    const parsed = Number(maxRoundsDraft)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 20) {
      setSettingsFeedback({ kind: 'error', message: 'Informe um limite de rodadas entre 1 e 20.' })
      return
    }
    setSettingsBusy(true)
    setSettingsFeedback(null)
    try {
      await window.vega.aiSetMaxRoundsPerMessage(parsed)
      await refreshSettings()
      setSettingsFeedback({ kind: 'success', message: 'Configurações salvas: limite de rodadas atualizado.' })
    } catch (err) {
      setSettingsFeedback(settingsFailure('Não foi possível salvar o limite de rodadas.', err))
    } finally {
      setSettingsBusy(false)
    }
  }

  async function saveMaxMessages(): Promise<void> {
    const parsed = Number(maxMessagesDraft)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5000) {
      setSettingsFeedback({ kind: 'error', message: 'Informe um limite diário entre 1 e 5000 mensagens.' })
      return
    }
    setSettingsBusy(true)
    setSettingsFeedback(null)
    try {
      await window.vega.aiSetMaxMessagesPerDay(parsed)
      await refreshSettings()
      setSettingsFeedback({ kind: 'success', message: 'Configurações salvas: limite diário atualizado.' })
    } catch (err) {
      setSettingsFeedback(settingsFailure('Não foi possível salvar o limite diário.', err))
    } finally {
      setSettingsBusy(false)
    }
  }

  useEffect(() => {
    refreshSettings().catch((err) => {
      setSettingsFeedback(settingsFailure('Não foi possível carregar as configurações.', err))
    })
    window.vega.aiGetStarterPrompts()
      .then((prompts) => setPromptSuggestions(pickSuggestions(prompts, 6)))
      .catch(() => setPromptSuggestions([]))

    const offProposal = window.vega.onAiToolProposal((proposal: AIToolProposal) => {
      handleProposal(proposal)
    })
    const offStatus = window.vega.onAiStatus((s: string) => setStatus(s))

    return () => {
      offProposal()
      offStatus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleProposal(proposal: AIToolProposal): Promise<void> {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'system', content: `Ação proposta: ${proposal.description}`, variant: 'proposed' }
    ])

    const approved = await dialogs.confirm({
      title: 'Confirmar ação sugerida pela IA',
      message: proposal.description,
      code: JSON.stringify(proposal.input, null, 2),
      variant: 'warning',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Rejeitar'
    })

    if (!approved) {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: 'system', content: 'Ação recusada pelo usuário.', variant: 'rejected' }
      ])
      await window.vega.aiResolveToolProposal(proposal.proposalId, false)
      return
    }

    setStatus('Executando ação confirmada...')
    const outcome = await executeMutation(proposal)
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: 'system',
        content: outcome.success
          ? `Ação confirmada — executada com sucesso: ${outcome.message}`
          : `Ação confirmada, mas falhou na execução: ${outcome.message}`,
        variant: outcome.success ? 'success' : 'error'
      }
    ])
    await window.vega.aiResolveToolProposal(proposal.proposalId, true, outcome)
    if (showAuditLog) loadAuditLog()
  }

  async function handleSend(overrideText?: string): Promise<void> {
    const text = (overrideText ?? input).trim()
    if (!text || sending) return
    setInput('')
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', content: text }])
    setSending(true)
    setStatus('Pensando...')
    try {
      const result = await window.vega.aiSendMessage(text)
      setMessages((prev) => [...prev, { id: nextId(), role: 'assistant', content: result.text }])
      setSessionUsage((prev) => ({
        inputTokens: prev.inputTokens + result.usage.inputTokens,
        outputTokens: prev.outputTokens + result.usage.outputTokens
      }))
      setSessionCostUsd((prev) => (prev === null || result.estimatedCostUsd === null ? null : prev + result.estimatedCostUsd))
      setDailyUsage((prev) => (prev ? { ...prev, messageCount: prev.messageCount + 1 } : prev))
      if (showAuditLog) loadAuditLog()
    } catch (err) {
      setMessages((prev) => [...prev, { id: nextId(), role: 'system', content: `Erro: ${(err as Error).message}`, variant: 'error' }])
    } finally {
      setSending(false)
      setStatus(null)
    }
  }

  async function saveApiKey(provider: AIProviderId): Promise<void> {
    const apiKey = apiKeyDrafts[provider].trim()
    if (!apiKey) return
    setSettingsBusy(true)
    setSettingsFeedback(null)
    try {
      await window.vega.aiSaveApiKey(provider, apiKey)
      setApiKeyDrafts((prev) => ({ ...prev, [provider]: '' }))
      await refreshSettings()
      // A key now exists — fetch the real model catalog instead of the
      // single-entry placeholder shown before the key was saved.
      if (selectedProvider === provider) await loadAgentOptions(provider)
      setSettingsFeedback({
        kind: 'success',
        message: settings?.activeProvider === provider
          ? `Configurações salvas. Assistente ativado com ${providerLabel[provider]}.`
          : `Configurações salvas: chave de ${providerLabel[provider]} protegida no dispositivo.`
      })
    } catch (err) {
      setSettingsFeedback(settingsFailure(`Não foi possível salvar a chave de ${providerLabel[provider]}.`, err))
    } finally {
      setSettingsBusy(false)
    }
  }

  async function setActiveProvider(provider: AIProviderId): Promise<void> {
    setSettingsBusy(true)
    setSettingsFeedback(null)
    try {
      await window.vega.aiSetActiveProvider(provider)
      await refreshSettings()
      setSettingsFeedback({ kind: 'success', message: `Assistente ativado com ${providerLabel[provider]}.` })
    } catch (err) {
      setSettingsFeedback(settingsFailure('Não foi possível ativar o assistente.', err))
    } finally {
      setSettingsBusy(false)
    }
  }

  async function loadAgentOptions(provider: AIProviderId): Promise<void> {
    setLoadingAgents(true)
    setSettingsFeedback(null)
    try {
      const models = await window.vega.aiListModels(provider)
      setAgentOptions(models)
    } catch (err) {
      setSettingsFeedback(settingsFailure('Não foi possível carregar os modelos disponíveis.', err))
      setAgentOptions(settings ? [settings.models[provider]] : [])
    } finally {
      setLoadingAgents(false)
    }
  }

  function selectProvider(provider: AIProviderId): void {
    setSelectedProvider(provider)
    setSelectedAgent(settings?.models[provider] ?? null)
    setAgentOptions(settings ? [settings.models[provider]] : [])
    if (configuredProviders.includes(provider)) loadAgentOptions(provider)
  }

  function backToProviders(): void {
    setSelectedProvider(null)
    setSelectedAgent(null)
    setAgentOptions([])
  }

  async function chooseAgent(provider: AIProviderId, model: string): Promise<void> {
    setSelectedAgent(model)
    setSettingsBusy(true)
    setSettingsFeedback(null)
    try {
      await window.vega.aiSetModel(provider, model)
      await refreshSettings()
      setSettingsFeedback({ kind: 'success', message: `Configurações salvas: modelo alterado para ${model}.` })
    } catch (err) {
      setSettingsFeedback(settingsFailure('Não foi possível alterar o modelo.', err))
    } finally {
      setSettingsBusy(false)
    }
  }

  async function deactivateProvider(provider: AIProviderId): Promise<void> {
    const isActive = settings?.activeProvider === provider
    const confirmed = await dialogs.confirm({
      title: isActive ? 'Desativar assistente' : 'Remover chave de API',
      message: `Remover do dispositivo a chave de ${providerLabel[provider]}? Para usar esse provedor novamente, será necessário informar uma nova chave.`,
      variant: 'warning',
      confirmLabel: 'Remover chave',
      cancelLabel: 'Cancelar'
    })
    if (!confirmed) return

    setSettingsBusy(true)
    setSettingsFeedback(null)
    try {
      await window.vega.aiClearApiKey(provider)
      await refreshSettings()
      setAgentOptions(settings ? [settings.models[provider]] : [])
      setSettingsFeedback({
        kind: 'info',
        message: isActive
          ? `Assistente desativado. A chave de ${providerLabel[provider]} foi removida.`
          : `Chave de ${providerLabel[provider]} removida.`
      })
    } catch (err) {
      setSettingsFeedback(settingsFailure('Não foi possível remover a chave de API.', err))
    } finally {
      setSettingsBusy(false)
    }
  }

  const hasActiveKey = settings ? configuredProviders.includes(settings.activeProvider) : false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, height: '100%' }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Assistente</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
            {settings
              ? hasActiveKey
                ? `Provedor ativo: ${providerLabel[settings.activeProvider]}`
                : 'Assistente desativado · configure uma chave de API'
              : 'Carregando...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={toggleAuditLog}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--lyra-radius-sm)',
              border: '1px solid var(--lyra-border)',
              background: 'transparent',
              color: 'var(--lyra-text)',
              cursor: 'pointer'
            }}
          >
            {showAuditLog ? 'Fechar auditoria' : 'Auditoria'}
          </button>
          <button
            onClick={() => {
              setShowSettings((prev) => !prev)
              backToProviders()
            }}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--lyra-radius-sm)',
              border: '1px solid var(--lyra-border)',
              background: 'transparent',
              color: 'var(--lyra-text)',
              cursor: 'pointer'
            }}
          >
            {showSettings ? 'Fechar configurações' : 'Configurações'}
          </button>
        </div>
      </div>

      {showAuditLog && (
        <div className="card" style={{ display: 'grid', gap: 10, maxHeight: 260, overflowY: 'auto' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Log de auditoria</h2>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--lyra-text-muted)' }}>
            Registro local em <code>ai-audit.jsonl</code> — mensagens, tool calls, propostas e resultados. Mantém os
            últimos ~2000 eventos.
          </p>
          {loadingAudit && <EmptyState title="Carregando log..." />}
          {!loadingAudit && auditEntries.length === 0 && <EmptyState title="Nenhum evento registrado ainda" />}
          {auditEntries.map((entry, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gap: 2,
                padding: '8px 10px',
                borderRadius: 'var(--lyra-radius-sm)',
                background: 'var(--lyra-surface-raised)',
                fontSize: '0.8rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--lyra-text-muted)' }}>
                <span>
                  {auditKindLabel[entry.kind]}
                  {entry.toolName ? ` · ${entry.toolName}` : ''}
                  {entry.decision ? ` · ${entry.decision === 'approved' ? 'aprovada' : 'recusada'}` : ''}
                  {entry.outcome ? ` · ${entry.outcome === 'success' ? 'sucesso' : 'erro'}` : ''}
                </span>
                <span>{new Date(entry.timestamp).toLocaleString('pt-BR')}</span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{entry.detail.slice(0, 500)}</div>
            </div>
          ))}
        </div>
      )}

      {showSettings && (
        <div className="card" style={{ display: 'grid', gap: 14 }}>
          {settingsFeedback && (
            <div
              role={settingsFeedback.kind === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                padding: '9px 12px',
                borderRadius: 'var(--lyra-radius-sm)',
                border: `1px solid ${settingsFeedback.kind === 'error' ? 'var(--lyra-danger)' : settingsFeedback.kind === 'success' ? 'var(--lyra-success)' : 'var(--lyra-blue)'}`,
                color: settingsFeedback.kind === 'error' ? 'var(--lyra-danger)' : settingsFeedback.kind === 'success' ? 'var(--lyra-success)' : 'var(--lyra-text)'
              }}
            >
              <span>{settingsFeedback.message}</span>
              <button
                type="button"
                aria-label="Fechar mensagem"
                onClick={() => setSettingsFeedback(null)}
                style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
          )}

          {!selectedProvider ? (
            <>
              <div style={{ display: 'grid', gap: 8, borderBottom: '1px solid var(--lyra-border)', paddingBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: '1rem' }}>Limite de segurança</h2>
                <label style={{ fontSize: '0.82rem', color: 'var(--lyra-text-muted)' }}>
                  Máximo de rodadas de tool-call por mensagem (evita loops descontrolados do agente)
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="sidebar__search"
                    style={{ marginBottom: 0, width: 80 }}
                    type="number"
                    min={1}
                    max={20}
                    value={maxRoundsDraft}
                    onChange={(e) => setMaxRoundsDraft(e.target.value)}
                  />
                  <button
                    onClick={saveMaxRounds}
                    disabled={settingsBusy || String(settings?.maxRoundsPerMessage) === maxRoundsDraft}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--lyra-radius-sm)',
                      border: '1px solid var(--lyra-border)',
                      background: 'transparent',
                      color: 'var(--lyra-text)',
                      cursor: 'pointer'
                    }}
                  >
                    Salvar
                  </button>
                </div>

                <label style={{ fontSize: '0.82rem', color: 'var(--lyra-text-muted)', marginTop: 8 }}>
                  Máximo de mensagens por dia
                  {dailyUsage ? ` · hoje: ${dailyUsage.messageCount}` : ''}
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="sidebar__search"
                    style={{ marginBottom: 0, width: 80 }}
                    type="number"
                    min={1}
                    max={5000}
                    value={maxMessagesDraft}
                    onChange={(e) => setMaxMessagesDraft(e.target.value)}
                  />
                  <button
                    onClick={saveMaxMessages}
                    disabled={settingsBusy || String(settings?.maxMessagesPerDay) === maxMessagesDraft}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--lyra-radius-sm)',
                      border: '1px solid var(--lyra-border)',
                      background: 'transparent',
                      color: 'var(--lyra-text)',
                      cursor: 'pointer'
                    }}
                  >
                    Salvar
                  </button>
                </div>
              </div>

              <h2 style={{ margin: 0, fontSize: '1rem' }}>Provedores de IA</h2>
              <div style={{ display: 'grid', gap: 8 }}>
                {(Object.keys(providerLabel) as AIProviderId[]).map((provider) => (
                  <button
                    key={provider}
                    onClick={() => selectProvider(provider)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      borderRadius: 'var(--lyra-radius-sm)',
                      border: '1px solid var(--lyra-border)',
                      background: settings?.activeProvider === provider ? 'var(--lyra-surface-raised)' : 'transparent',
                      color: 'var(--lyra-text)',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{providerLabel[provider]}</div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--lyra-text-muted)' }}>
                        {configuredProviders.includes(provider) ? 'Chave configurada' : 'Sem chave configurada'}
                        {settings?.activeProvider === provider ? ' · ativo' : ''}
                        {settings ? ` · agente: ${settings.models[provider]}` : ''}
                      </div>
                    </div>
                    <span style={{ color: 'var(--lyra-text-muted)' }}>›</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={backToProviders}
                  style={{ border: 'none', background: 'transparent', color: 'var(--lyra-text-muted)', cursor: 'pointer' }}
                >
                  ‹ Provedores
                </button>
                <h2 style={{ margin: 0, fontSize: '1rem' }}>{providerLabel[selectedProvider]}</h2>
                <a
                  href={providerPrivacyUrl[selectedProvider]}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '0.78rem', color: 'var(--lyra-blue)', marginLeft: 'auto' }}
                >
                  Política de privacidade ↗
                </a>
              </div>
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--lyra-text-muted)' }}>
                Ao usar este provedor, sua mensagem, o histórico da conversa e os resultados das ferramentas de
                leitura (ex. lista de pacotes, hardware) são enviados para a API de {providerLabel[selectedProvider]}.
                Veja <a href="https://github.com/britors/Vega/blob/main/docs/ai-privacidade.md" target="_blank" rel="noreferrer" style={{ color: 'var(--lyra-blue)' }}>o que é enviado em detalhe</a>.
              </p>

              <div style={{ fontSize: '0.82rem', color: 'var(--lyra-text-muted)' }}>
                Agente (modelo){loadingAgents ? ' · carregando lista...' : ''}
                {!configuredProviders.includes(selectedProvider) && !loadingAgents
                  ? ' · configure a chave abaixo para ver o catálogo completo'
                  : ''}
              </div>
              <select
                value={selectedAgent ?? ''}
                disabled={loadingAgents || settingsBusy || agentOptions.length === 0}
                onChange={(e) => chooseAgent(selectedProvider, e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 'var(--lyra-radius-sm)',
                  border: '1px solid var(--lyra-border)',
                  background: 'var(--lyra-surface-raised)',
                  color: 'var(--lyra-text)'
                }}
              >
                {agentOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>

              <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--lyra-border)', paddingTop: 14 }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--lyra-text-muted)' }}>
                  Token de API para {providerLabel[selectedProvider]}
                </div>
                <input
                  className="sidebar__search"
                  style={{ marginBottom: 0 }}
                  type="password"
                  placeholder="Chave de API"
                  value={apiKeyDrafts[selectedProvider]}
                  onChange={(e) => setApiKeyDrafts((prev) => ({ ...prev, [selectedProvider]: e.target.value }))}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => saveApiKey(selectedProvider)}
                    disabled={settingsBusy || !apiKeyDrafts[selectedProvider].trim()}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--lyra-radius-sm)',
                      border: '1px solid var(--lyra-border)',
                      background: 'transparent',
                      color: 'var(--lyra-text)',
                      cursor: 'pointer'
                    }}
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => setActiveProvider(selectedProvider)}
                    disabled={
                      settingsBusy ||
                      settings?.activeProvider === selectedProvider ||
                      !configuredProviders.includes(selectedProvider)
                    }
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--lyra-radius-sm)',
                      border: 'none',
                      background: 'var(--lyra-gradient)',
                      color: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    Usar como ativo
                  </button>
                  {configuredProviders.includes(selectedProvider) && (
                    <button
                      onClick={() => deactivateProvider(selectedProvider)}
                      disabled={settingsBusy}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 'var(--lyra-radius-sm)',
                        border: '1px solid var(--lyra-danger)',
                        background: 'transparent',
                        color: 'var(--lyra-danger)',
                        cursor: settingsBusy ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {settings?.activeProvider === selectedProvider ? 'Desativar assistente' : 'Remover chave'}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 2px' }}>
          {messages.length === 0 && (
            <>
              <EmptyState
                title="Converse com o assistente"
                message="Pergunte sobre pacotes, hardware ou uso de disco, ou peça para instalar/remover algo."
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', padding: '0 8px' }}>
                {promptSuggestions.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    disabled={!hasActiveKey || sending}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 999,
                      border: '1px solid var(--lyra-border)',
                      background: 'var(--lyra-surface-raised)',
                      color: 'var(--lyra-text)',
                      fontSize: '0.82rem',
                      cursor: hasActiveKey && !sending ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </>
          )}
          {messages.map((msg) => {
            const variantBorderColor: Record<MessageVariant, string> = {
              proposed: 'var(--lyra-border)',
              rejected: 'var(--lyra-text-muted)',
              error: 'var(--lyra-danger)',
              success: 'var(--lyra-success)'
            }
            const borderColor = msg.variant ? variantBorderColor[msg.variant] : 'var(--lyra-border)'
            return (
              <div
                key={msg.id}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  padding: '8px 12px',
                  borderRadius: 'var(--lyra-radius-sm)',
                  background:
                    msg.role === 'user'
                      ? 'var(--lyra-gradient)'
                      : msg.role === 'system'
                        ? 'transparent'
                        : 'var(--lyra-surface-raised)',
                  border: msg.role === 'system' ? `1px dashed ${borderColor}` : 'none',
                  color:
                    msg.role === 'user'
                      ? '#fff'
                      : msg.variant === 'error'
                        ? 'var(--lyra-danger)'
                        : msg.variant === 'success'
                          ? 'var(--lyra-success)'
                          : 'var(--lyra-text)',
                  fontStyle: msg.role === 'system' ? 'italic' : 'normal',
                  fontSize: msg.role === 'system' ? '0.85rem' : '0.95rem',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {msg.content}
              </div>
            )
          })}
          {status && (
            <div style={{ alignSelf: 'flex-start', color: 'var(--lyra-text-muted)', fontSize: '0.85rem' }}>{status}</div>
          )}
          <div ref={listEndRef} />
        </div>

        {(sessionUsage.inputTokens > 0 || sessionUsage.outputTokens > 0) && (
          <div style={{ fontSize: '0.78rem', color: 'var(--lyra-text-muted)', marginTop: 8 }}>
            {sessionUsage.inputTokens + sessionUsage.outputTokens} tokens usados nesta sessão
            {sessionCostUsd !== null ? ` · custo estimado: $${sessionCostUsd.toFixed(4)}` : ' · custo estimado indisponível para este provedor'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <input
            className="sidebar__search"
            style={{ marginBottom: 0, flex: 1 }}
            placeholder={hasActiveKey ? 'Digite sua mensagem...' : 'Configure uma chave de API para começar'}
            value={input}
            disabled={!hasActiveKey || sending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!hasActiveKey || sending || !input.trim()}
            style={{
              padding: '6px 18px',
              borderRadius: 'var(--lyra-radius-sm)',
              border: 'none',
              background: 'var(--lyra-gradient)',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}
