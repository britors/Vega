import { describe, expect, it } from 'vitest'
import type { SystemClient } from './systemClient'
import { createMockSystemClient } from './mockSystemClient'
import { createWindowsSystemClient } from './windowsSystemClient'

function verifiesMinimumContract(name: string, create: () => SystemClient): void {
  describe(name, () => {
    it('expõe lifecycle, capacidades, ping e EventEmitter', () => {
      const client = create()
      for (const method of ['connect', 'disconnect', 'getCapabilities', 'ping', 'on', 'once', 'emit', 'removeListener'] as const) {
        expect(typeof client[method], method).toBe('function')
      }

      let received: unknown
      client.once('contract-event', (value) => { received = value })
      client.emit('contract-event', 'ok')
      expect(received).toBe('ok')
    })

    it('oferece uma função estável para operações opcionais ou indisponíveis', () => {
      const client = create()
      for (const method of ['listRepos', 'listSnapshots', 'kernelListInstalled', 'bootStatus'] as const) {
        expect(typeof client[method], method).toBe('function')
      }
    })
  })
}

verifiesMinimumContract('mock SystemClient', createMockSystemClient)
verifiesMinimumContract('Windows SystemClient', createWindowsSystemClient)
