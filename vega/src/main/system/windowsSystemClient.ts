import { EventEmitter } from 'node:events'
import { AgentTransport } from './agentTransport'
import type { SystemClient } from './systemClient'
import { SystemClientError, type SystemCapabilities, type VegaSystemInfo } from './types'

class WindowsSystemClientBase extends EventEmitter {
  private readonly transport = new AgentTransport()
  private capabilities: SystemCapabilities | null = null

  async connect(): Promise<void> { this.capabilities = await this.transport.connect() }
  disconnect(): void { this.transport.disconnect(); this.capabilities = null }
  async getCapabilities(): Promise<SystemCapabilities> {
    return this.capabilities || this.transport.connect()
  }
  async ping(): Promise<VegaSystemInfo> {
    const result = await this.transport.request<{ version: string; connected: boolean }>('system.ping')
    return { version: result.version, connected: result.connected, distro: 'Windows 11' }
  }
  async distroLogo(): Promise<string> { return '' }
  async packageManagerName(): Promise<string> { return 'WinGet' }
  async communityLayerName(): Promise<string> { return 'indisponível' }
}

export function createWindowsSystemClient(): SystemClient {
  const client = new WindowsSystemClientBase()
  // The proxy supplies a stable UNSUPPORTED implementation for every
  // operation not implemented by the current Windows capability set.
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value === 'function') return value.bind(target)
      if (value !== undefined || typeof property !== 'string') return value
      return async () => { throw new SystemClientError('UNSUPPORTED', `Operação ainda não disponível no Windows: ${property}`) }
    }
  }) as unknown as SystemClient
}
