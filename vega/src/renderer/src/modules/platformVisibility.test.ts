import { describe, expect, it } from 'vitest'
import type { SystemCapabilities } from '../../../main/system/types'
import { isModuleVisible } from './platformVisibility'

function capabilities(modules: SystemCapabilities['modules']): SystemCapabilities {
  return {
    platform: 'linux', platformVersion: 'test', backendVersion: 'test', protocolVersion: 1,
    modules, readOperations: [], mutations: [], elevatedMutations: [], missingDependencies: []
  }
}

describe('visibilidade de módulos', () => {
  it('mostra apenas os módulos anunciados pelo backend', () => {
    const caps = capabilities(['dashboard', 'snapshots'])
    expect(isModuleVisible('dashboard', caps)).toBe(true)
    expect(isModuleVisible('snapshots', caps)).toBe(true)
    expect(isModuleVisible('kernel', caps)).toBe(false)
  })
})
