import type { AIAuditEntry } from './types'

const REDACT_PATTERNS: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email redigido]'],
  [/\b(sk-[A-Za-z0-9_-]{10,}|AIza[A-Za-z0-9_-]{10,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g, '[chave de API redigida]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP redigido]'],
  [/[A-Za-z]:\\(?:[^\s"\\]+\\)*[^\s"]*/g, '[path redigido]'],
  [/\/(?:home|Users)\/[^\s"/]+(?:\/[^\s"]*)?/g, '[path redigido]']
]

function redactSensitive(text: string): string {
  return REDACT_PATTERNS.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text)
}

const SENSITIVE_FIELD = /^(password|passphrase|secret|token|nonce|api[_-]?key|authorization)$/i

function redactValue(value: unknown, key = ''): unknown {
  if (SENSITIVE_FIELD.test(key)) return '[segredo redigido]'
  if (typeof value === 'string') return redactSensitive(value)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, key))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, item]) => [childKey, redactValue(item, childKey)]))
  return value
}

export function redactAuditEntry(entry: Omit<AIAuditEntry, 'timestamp'>): Omit<AIAuditEntry, 'timestamp'> {
  return { ...entry, input: redactValue(entry.input) as Record<string, unknown>, detail: redactSensitive(entry.detail) }
}
