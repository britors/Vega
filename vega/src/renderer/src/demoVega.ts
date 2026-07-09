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
