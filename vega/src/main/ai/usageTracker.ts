import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AIDailyUsage } from './types'

const USAGE_FILE = 'ai-daily-usage.json'

function usagePath(): string {
  return join(app.getPath('userData'), USAGE_FILE)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

async function readUsage(): Promise<AIDailyUsage> {
  try {
    const raw = await fs.readFile(usagePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<AIDailyUsage>
    if (parsed.date === today() && typeof parsed.messageCount === 'number') {
      return { date: parsed.date, messageCount: parsed.messageCount }
    }
  } catch {
    // sem arquivo ainda ou corrompido — começa do zero
  }
  return { date: today(), messageCount: 0 }
}

async function writeUsage(usage: AIDailyUsage): Promise<void> {
  await fs.writeFile(usagePath(), JSON.stringify(usage), { mode: 0o600 })
}

export async function getDailyUsage(): Promise<AIDailyUsage> {
  return readUsage()
}

// Incrementa o contador do dia (resetando automaticamente se a data mudou) e
// retorna a contagem já atualizada — chamado uma vez por mensagem do
// usuário, antes de consultar o provedor.
export async function incrementDailyMessageCount(): Promise<AIDailyUsage> {
  const usage = await readUsage()
  usage.messageCount += 1
  await writeUsage(usage)
  return usage
}
