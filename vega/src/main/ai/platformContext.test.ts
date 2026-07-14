import { describe, expect, it } from 'vitest'
import type { SystemCapabilities } from '../system/types'
import { buildSystemPrompt, redactToolResultForModel, starterPromptsForCapabilities } from './platformContext'
import { toolsForCapabilities } from './tools'

function capabilities(overrides: Partial<SystemCapabilities> = {}): SystemCapabilities {
  return {
    platform: 'linux', platformVersion: 'test', backendVersion: '1.0', protocolVersion: 1,
    modules: ['assistant', 'software', 'hardware', 'kernel', 'snapshots', 'services', 'logs'],
    readOperations: ['search', 'listInstalled', 'listUpdates', 'hardwareInventory', 'kernelListInstalled', 'listSnapshots', 'listManagedServices', 'queryLogs'],
    mutations: ['install', 'remove', 'updateAll', 'createSnapshot', 'setServiceRunning'],
    elevatedMutations: [], missingDependencies: [], ...overrides
  }
}

describe('catálogo orientado por capabilities', () => {
  it('mantém ferramentas Linux suportadas', () => {
    const names = toolsForCapabilities(capabilities()).map((tool) => tool.name)
    expect(names).toContain('list_installed_kernels')
    expect(names).toContain('create_snapshot')
    expect(names).toContain('set_service_running')
  })

  it('remove ferramentas cujas operações não estão nas capabilities', () => {
    const limited = capabilities({
      modules: ['assistant', 'software', 'hardware', 'monitor', 'storage'],
      readOperations: ['search', 'listInstalled', 'listUpdates', 'hardwareInventory', 'hardwareFirmwareStatus', 'listStorageVolumes', 'systemMetrics', 'listProcesses'],
      mutations: ['install', 'remove', 'updateAll']
    })
    const names = toolsForCapabilities(limited).map((tool) => tool.name)
    expect(names).not.toContain('list_installed_kernels')
    expect(names).not.toContain('list_snapshots')
    expect(names).not.toContain('set_service_running')

    const changed = toolsForCapabilities({ ...limited, mutations: [] }).map((tool) => tool.name)
    expect(changed).not.toContain('install_package')
    expect(changed).not.toContain('update_all_packages')
  })
})

describe('contexto e privacidade', () => {
  const linux = capabilities({
    modules: ['assistant', 'software', 'monitor'],
    readOperations: ['search', 'listProcesses'], mutations: ['install']
  })

  it('gera prompt com identificação da distro', () => {
    const prompt = buildSystemPrompt(linux, { version: '1', connected: true, distro: 'openSUSE Leap 16.0' })
    expect(prompt).toContain('openSUSE Leap 16.0')
    expect(prompt).toContain('Linux')
  })

  it('redige usuários, IPs e paths antes do provedor', () => {
    const raw = JSON.stringify([{ user: 'josé', path: '/home/josé/segredo.txt', address: '192.168.1.20' }])
    const redacted = redactToolResultForModel('list_processes', raw)
    expect(redacted).not.toContain('josé')
    expect(redacted).not.toContain('192.168.1.20')
    expect(redacted).not.toContain('segredo.txt')
  })

  it('gera starters apenas para módulos disponíveis', () => {
    const prompts = starterPromptsForCapabilities(linux).join(' ')
    expect(prompts).not.toMatch(/snapshot|serviços|firewall/)
  })
})
