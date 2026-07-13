import { describe, expect, it } from 'vitest'
import type { SystemClient } from '../system/systemClient'
import type { SystemCapabilities } from '../system/types'
import { buildSystemPrompt, redactToolResultForModel, starterPromptsForCapabilities } from './platformContext'
import { describeMutation, toolsForCapabilities } from './tools'

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

  it('remove conceitos Linux e adapta WinGet no Windows', () => {
    const windows = capabilities({
      platform: 'windows', modules: ['assistant', 'software', 'hardware', 'monitor', 'storage'],
      readOperations: ['search', 'listInstalled', 'listUpdates', 'hardwareInventory', 'hardwareFirmwareStatus', 'listStorageVolumes', 'systemMetrics', 'listProcesses'],
      mutations: ['install', 'remove', 'updateAll']
    })
    const tools = toolsForCapabilities(windows)
    const names = tools.map((tool) => tool.name)
    expect(names).not.toContain('list_installed_kernels')
    expect(names).not.toContain('list_snapshots')
    expect(names).not.toContain('set_service_running')
    expect(tools.map((tool) => tool.description).join(' ')).not.toMatch(/AUR|Flatpak|systemd|fwupd/)
    expect(tools.find((tool) => tool.name === 'install_package')?.description).toContain('WinGet')

    const changed = toolsForCapabilities({ ...windows, mutations: [] }).map((tool) => tool.name)
    expect(changed).not.toContain('install_package')
    expect(changed).not.toContain('update_all_packages')
  })
})

describe('contexto e privacidade Windows', () => {
  const windows = capabilities({
    platform: 'windows', platformVersion: 'windows/amd64', modules: ['assistant', 'software', 'monitor'],
    readOperations: ['search', 'listProcesses'], mutations: ['install']
  })

  it('gera prompt sem identificação fixa de outra plataforma', () => {
    const prompt = buildSystemPrompt(windows, { version: '1', connected: true, distro: 'Microsoft Windows 11 Pro', build: '26100' })
    expect(prompt).toContain('Microsoft Windows 11 Pro')
    expect(prompt).toContain('UAC')
    expect(prompt).not.toMatch(/openSUSE|AUR|systemd|Snapper/)
  })

  it('redige usuários, IPs e paths antes do provedor', () => {
    const raw = JSON.stringify([{ user: 'DOMÍNIO\\josé', path: 'C:\\Users\\josé\\segredo.txt', address: '192.168.1.20' }])
    const redacted = redactToolResultForModel('list_processes', raw)
    expect(redacted).not.toContain('josé')
    expect(redacted).not.toContain('192.168.1.20')
    expect(redacted).not.toContain('segredo.txt')
  })

  it('gera starters apenas para módulos disponíveis', () => {
    const prompts = starterPromptsForCapabilities(windows).join(' ')
    expect(prompts).toContain('WinGet')
    expect(prompts).not.toMatch(/kernel|snapshot|espelhos|cache/)
  })

  it('detalha a proposta WinGet antes da confirmação', async () => {
    const client = {
      getPackageDetails: async () => ({
        origin: 'winget', id: 'Vendor.App', name: 'Aplicação', description: '', installed: false,
        installedVersion: '', availableVersion: '2.0', downloadSize: '', installedSize: '', dependencies: [],
        licenses: ['MIT'], agreements: ['https://example.test/terms'], scopes: ['user', 'machine'],
        url: '', maintainer: 'Fornecedor Ltda.'
      })
    } as unknown as SystemClient
    const description = await describeMutation('install_package', { origin: 'winget', id: 'Vendor.App', scope: 'machine' }, client)
    expect(description).toContain('Vendor.App')
    expect(description).toContain('Fornecedor Ltda.')
    expect(description).toContain('2.0')
    expect(description).toContain('winget')
    expect(description).toContain('machine')
  })
})
