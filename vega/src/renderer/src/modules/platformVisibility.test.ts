import { describe, expect, it } from 'vitest'
import type { SystemCapabilities } from '../../../main/system/types'
import { isModuleVisible } from './platformVisibility'

function capabilities(platform: 'linux' | 'windows'): SystemCapabilities {
  return {
    platform, platformVersion: 'test', backendVersion: 'test', protocolVersion: 1,
    modules: ['dashboard', 'snapshots', 'kernel'], readOperations: [], mutations: [], elevatedMutations: [], missingDependencies: []
  }
}

describe('visibilidade por plataforma', () => {
  it('remove Pontos de Restauração no Windows mesmo se um backend incompatível anunciar o módulo', () => {
    expect(isModuleVisible('snapshots', capabilities('windows'))).toBe(false)
    expect(isModuleVisible('dashboard', capabilities('windows'))).toBe(true)
  })

  it('remove Kernel no Windows mesmo se um backend incompatível anunciar o módulo', () => {
    expect(isModuleVisible('kernel', capabilities('windows'))).toBe(false)
  })

  it('preserva Pontos de Restauração no Linux', () => {
    expect(isModuleVisible('snapshots', capabilities('linux'))).toBe(true)
    expect(isModuleVisible('kernel', capabilities('linux'))).toBe(true)
  })
})
