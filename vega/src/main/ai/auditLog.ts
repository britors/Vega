import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AIAuditEntry } from './types'

const MAX_ENTRIES = 2000
const TRIM_TO_ENTRIES = 1000

// Padrões de segredo/PII óbvia que não deveriam persistir no log local, caso
// apareçam na mensagem do usuário ou num resultado de tool por acidente.
const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email redigido]'],
  [/\b(sk-[A-Za-z0-9_-]{10,}|AIza[A-Za-z0-9_-]{10,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, '[chave de API redigida]']
]

function redactSensitive(text: string): string {
  return REDACT_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text)
}

function auditLogPath(): string {
  return join(app.getPath('userData'), 'ai-audit.jsonl')
}

export async function logAuditEntry(entry: Omit<AIAuditEntry, 'timestamp'>): Promise<void> {
  const redacted = { ...entry, detail: redactSensitive(entry.detail) }
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...redacted } satisfies AIAuditEntry)
  try {
    await fs.appendFile(auditLogPath(), line + '\n', { mode: 0o600 })
    await trimIfNeeded()
  } catch (err) {
    console.warn('Falha ao gravar log de auditoria da IA:', (err as Error).message)
  }
}

// Retenção simples por contagem de linhas — evita que o arquivo cresça sem
// limite; roda a cada append já que o volume (mensagens de chat de um único
// usuário) é baixo o suficiente pra isso não pesar.
async function trimIfNeeded(): Promise<void> {
  try {
    const raw = await fs.readFile(auditLogPath(), 'utf-8')
    const lines = raw.split('\n').filter(Boolean)
    if (lines.length <= MAX_ENTRIES) return
    await fs.writeFile(auditLogPath(), lines.slice(-TRIM_TO_ENTRIES).join('\n') + '\n', { mode: 0o600 })
  } catch {
    // best-effort — se a trimagem falhar, tenta de novo no próximo append
  }
}

export async function readAuditLog(limit = 200): Promise<AIAuditEntry[]> {
  try {
    const raw = await fs.readFile(auditLogPath(), 'utf-8')
    const lines = raw.split('\n').filter(Boolean)
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as AIAuditEntry
        } catch {
          return null
        }
      })
      .filter((entry): entry is AIAuditEntry => entry !== null)
      .reverse()
  } catch {
    return []
  }
}
