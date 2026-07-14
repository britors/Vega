import { LinuxSystemClient } from '../dbusClient'
import type { SystemClient } from './systemClient'
import { SystemClientError } from './types'
import { createMockSystemClient } from './mockSystemClient'

export function createSystemClient(platform: NodeJS.Platform = process.platform): SystemClient {
  if (process.env.VEGA_SYSTEM_BACKEND === 'mock') return createMockSystemClient()
  if (platform === 'linux') return new LinuxSystemClient()
  throw new SystemClientError('UNSUPPORTED', `Plataforma não suportada: ${platform}`)
}
