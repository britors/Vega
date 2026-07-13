import { EventEmitter } from 'node:events'
import type { SystemClient } from './systemClient'
import type { SystemCapabilities } from './types'

const mockCapabilities: SystemCapabilities = {
  platform: 'linux',
  platformVersion: 'mock',
  backendVersion: 'mock',
  protocolVersion: 1,
  modules: ['about'],
  readOperations: ['ping', 'distroLogo', 'communityLayerName'],
  mutations: [],
  elevatedMutations: [],
  missingDependencies: []
}

/** Minimal backend for UI startup and capability tests without D-Bus. */
export function createMockSystemClient(overrides: Partial<SystemCapabilities> = {}): SystemClient {
  const emitter = new EventEmitter()
  const capabilities = { ...mockCapabilities, ...overrides }
  const implemented = {
    connect: async (): Promise<void> => undefined,
    disconnect: (): void => undefined,
    getCapabilities: async (): Promise<SystemCapabilities> => capabilities,
    ping: async () => ({ version: 'mock', connected: true, distro: 'mock' }),
    distroLogo: async (): Promise<string> => '',
    communityLayerName: async (): Promise<string> => 'indisponível'
  }

  return new Proxy(Object.assign(emitter, implemented), {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (value !== undefined || typeof property !== 'string') return value
      return async () => { throw new Error(`Operação não disponível no mock: ${property}`) }
    }
  }) as SystemClient
}
