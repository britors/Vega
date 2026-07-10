import type { VegaApi } from '../../preload'

const noop = (): (() => void) => () => {}

export function installDemoVegaApi(): void {
  if (window.vega) return

  const api: VegaApi = {
    ping: async () => ({ version: 'demo', connected: false }),
    search: async (query: string) => [
      {
        origin: 'official',
        id: 'firefox',
        name: 'Firefox',
        description: `Exemplo de busca para "${query}"`,
        installed: false
      }
    ],
    listUpdates: async () => [],
    getPackageDetails: async (origin: string, id: string) => ({
      origin,
      id,
      name: id === 'firefox' ? 'Firefox' : id,
      description: 'Descrição completa de exemplo, como apareceria no painel de detalhe.',
      installed: false,
      installedVersion: '',
      availableVersion: '152.0.5-1',
      downloadSize: '81,81 MiB',
      installedSize: '286,44 MiB',
      dependencies: ['glibc', 'gtk3', 'dbus'],
      licenses: ['MPL-2.0'],
      url: 'https://www.mozilla.org/firefox/',
      maintainer: ''
    }),
    install: async () => 1,
    getAurPkgbuild: async () => '# demo\npkgname=exemplo\npkgver=1.0.0',
    remove: async () => 2,
    updateAll: async () => 3,
    clearCache: async () => 4,
    listSnapshots: async () => [
      { id: 42, timestamp: Math.floor(Date.now() / 1000) - 3600, trigger: 'manual', description: 'Antes de atualizar' }
    ],
    createSnapshot: async () => 42,
    diffPackages: async () => ['- pacote antigo', '+ pacote novo'],
    rollbackSnapshot: async () => {},
    deleteSnapshot: async () => {},
    setRetentionPolicy: async () => {},
    listBackupConfigs: async () => [
      {
        id: 'home',
        paths: ['~/Documentos', '~/Imagens'],
        destination: '/backup/restic',
        destinationUUID: '',
        frequency: 'daily'
      }
    ],
    listManagedServices: async () => [
      { name: 'sshd.service', label: 'Acesso remoto', description: 'Servidor SSH', enabled: false, active: false, available: true },
      { name: 'bluetooth.service', label: 'Bluetooth', description: 'Gerenciador do Bluetooth', enabled: true, active: true, available: true }
    ],
    setServiceEnabled: async () => {},
    setServiceRunning: async () => {},
    restartService: async () => {},
    queryLogs: async (unit: string) => [
      '2026-07-10T10:00:00-03:00 demo systemd[1]: Exemplo de linha de log.',
      `2026-07-10T10:00:01-03:00 demo ${unit || 'vegad'}[1234]: Outra linha de exemplo.`
    ],
    listLogUnits: async () => ['vegad.service', 'NetworkManager.service', 'sshd.service'],
    createBackupConfig: async () => 'home',
    runBackupNow: async () => 1,
    listBackupSnapshots: async () => [
      { id: 'a1b2c3', timestamp: Math.floor(Date.now() / 1000) - 7200, fileCount: 124, sizeBytes: 15_728_640 }
    ],
    listBackupSnapshotPaths: async () => ['~/Documentos', '~/Imagens', '~/Vídeos'],
    restoreBackupSnapshot: async () => 1,
    restoreBackupItems: async () => 2,
    deleteBackupConfig: async () => {},
    windowMinimize: async () => {},
    windowToggleMaximize: async () => ({ maximized: false }),
    windowClose: async () => {},
    windowIsMaximized: async () => false,
    onWindowState: noop,
    onTransactionProgress: noop,
    onTransactionFinished: noop,
    onBackupTransactionProgress: noop,
    onBackupTransactionFinished: noop
  }

  window.vega = api
}
