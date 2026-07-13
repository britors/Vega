import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AIProviderId, AISettings } from './types'

const CREDENTIALS_FILE = 'ai-credentials.json'
const SETTINGS_FILE = 'ai-settings.json'

const DEFAULT_SETTINGS: AISettings = {
  activeProvider: 'anthropic',
  models: {
    // Verificado via WebFetch contra a documentação oficial de cada provedor
    // em 2026-07-13 — reconfirmar se algum provedor passar a rejeitar o
    // modelo default. Estes valores só aparecem antes de uma chave ser salva;
    // depois disso a lista real vem de aiListModels() (chamada ao vivo).
    anthropic: 'claude-haiku-4-5',
    openai: 'gpt-5.6-terra',
    gemini: 'gemini-2.5-flash'
  },
  maxRoundsPerMessage: 8,
  maxMessagesPerDay: 200
}

const MIN_ROUNDS = 1
const MAX_ROUNDS_CAP = 20
const MIN_MESSAGES_PER_DAY = 1
const MAX_MESSAGES_PER_DAY_CAP = 5000

function credentialsPath(): string {
  return join(app.getPath('userData'), CREDENTIALS_FILE)
}

function settingsPath(): string {
  return join(app.getPath('userData'), SETTINGS_FILE)
}

type EncryptedBlobs = Partial<Record<AIProviderId, string>>

async function readBlobs(): Promise<EncryptedBlobs> {
  try {
    const raw = await fs.readFile(credentialsPath(), 'utf-8')
    return JSON.parse(raw) as EncryptedBlobs
  } catch {
    return {}
  }
}

async function writeBlobs(blobs: EncryptedBlobs): Promise<void> {
  await fs.writeFile(credentialsPath(), JSON.stringify(blobs), { mode: 0o600 })
}

export async function saveApiKey(provider: AIProviderId, apiKey: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Armazenamento seguro indisponível neste sistema (nenhum serviço de keyring, ex. gnome-keyring ou kwallet, foi detectado). Não é possível salvar a chave com segurança.'
    )
  }
  const blobs = await readBlobs()
  blobs[provider] = safeStorage.encryptString(apiKey).toString('base64')
  await writeBlobs(blobs)
}

export async function clearApiKey(provider: AIProviderId): Promise<void> {
  const blobs = await readBlobs()
  delete blobs[provider]
  await writeBlobs(blobs)
}

export async function getApiKey(provider: AIProviderId): Promise<string | null> {
  const blobs = await readBlobs()
  const blob = blobs[provider]
  if (!blob || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(blob, 'base64'))
  } catch {
    return null
  }
}

export async function listConfiguredProviders(): Promise<AIProviderId[]> {
  const blobs = await readBlobs()
  return (Object.keys(blobs) as AIProviderId[]).filter((id) => Boolean(blobs[id]))
}

export async function getSettings(): Promise<AISettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AISettings>
    return {
      activeProvider: parsed.activeProvider ?? DEFAULT_SETTINGS.activeProvider,
      models: { ...DEFAULT_SETTINGS.models, ...parsed.models },
      maxRoundsPerMessage: parsed.maxRoundsPerMessage ?? DEFAULT_SETTINGS.maxRoundsPerMessage,
      maxMessagesPerDay: parsed.maxMessagesPerDay ?? DEFAULT_SETTINGS.maxMessagesPerDay
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(settings: AISettings): Promise<void> {
  await fs.writeFile(settingsPath(), JSON.stringify(settings), { mode: 0o600 })
}

export async function setActiveProvider(provider: AIProviderId): Promise<void> {
  const settings = await getSettings()
  settings.activeProvider = provider
  await saveSettings(settings)
}

export async function setModel(provider: AIProviderId, model: string): Promise<void> {
  const settings = await getSettings()
  settings.models[provider] = model
  await saveSettings(settings)
}

export async function setMaxRoundsPerMessage(maxRounds: number): Promise<void> {
  const settings = await getSettings()
  settings.maxRoundsPerMessage = Math.min(MAX_ROUNDS_CAP, Math.max(MIN_ROUNDS, Math.round(maxRounds)))
  await saveSettings(settings)
}

export async function setMaxMessagesPerDay(maxMessages: number): Promise<void> {
  const settings = await getSettings()
  settings.maxMessagesPerDay = Math.min(
    MAX_MESSAGES_PER_DAY_CAP,
    Math.max(MIN_MESSAGES_PER_DAY, Math.round(maxMessages))
  )
  await saveSettings(settings)
}
