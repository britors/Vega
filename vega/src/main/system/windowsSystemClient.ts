import { EventEmitter } from 'node:events'
import { AgentTransport } from './agentTransport'
import type { SystemClient } from './systemClient'
import {
  SystemClientError, type HardwareInventory, type ProcessInfo, type StorageVolumeInfo,
  type SystemCapabilities, type SystemMetrics, type VegaSystemInfo
} from './types'

class WindowsSystemClientBase extends EventEmitter {
  private readonly transport = new AgentTransport()
  private capabilities: SystemCapabilities | null = null

  async connect(): Promise<void> { this.capabilities = await this.transport.connect() }
  disconnect(): void { this.transport.disconnect(); this.capabilities = null }
  async getCapabilities(): Promise<SystemCapabilities> {
    return this.capabilities || this.transport.connect()
  }
  async ping(): Promise<VegaSystemInfo> {
    const result = await this.transport.request<{
      version: string; connected: boolean; name?: string; osVersion?: string; build?: string; architecture?: string
    }>('system.ping')
    const windows = [result.name || 'Windows', result.osVersion].filter(Boolean).join(' ')
    return { version: result.version, connected: result.connected, distro: windows, build: result.build, architecture: result.architecture }
  }
  async distroLogo(): Promise<string> { return '' }
  async packageManagerName(): Promise<string> { return 'WinGet' }
  async communityLayerName(): Promise<string> { return 'indisponível' }
  async diskUsage(): Promise<{ used: string; total: string; percent: number }> {
    return this.transport.request('system.diskUsage')
  }
  async hardwareInventory(): Promise<HardwareInventory> { return this.transport.request('hardware.inventory') }
  async hardwareFirmwareStatus(): Promise<string> { return this.transport.request('hardware.firmwareStatus') }
  async systemMetrics(): Promise<SystemMetrics> { return this.transport.request('monitor.metrics') }
  async listProcesses(): Promise<ProcessInfo[]> { return this.transport.request('monitor.processes') }
  async killProcess(pid: number): Promise<void> {
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 0xffffffff) throw new SystemClientError('EXTERNAL_FAILURE', 'PID inválido.')
    await this.transport.request('process.kill', { pid })
  }
  async listStorageVolumes(): Promise<StorageVolumeInfo[]> { return this.transport.request('storage.volumes') }
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
