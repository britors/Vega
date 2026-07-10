import { app, shell, BrowserWindow, ipcMain, Notification } from 'electron'
import { join } from 'node:path'
import {
  VegaClient,
  type TransactionProgress,
  type TransactionFinished,
  type BackupTransactionProgress,
  type BackupTransactionFinished,
  type BackupAlertEvent,
  type BackupConfig,
  type UpdatesAvailableEvent
} from './dbusClient'

const vegaClient = new VegaClient()
let mainWindow: BrowserWindow | null = null

function sendWindowState(): void {
  if (!mainWindow) return
  mainWindow.webContents.send('vega:window-state', {
    maximized: mainWindow.isMaximized()
  })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: '#14141c', // lyra-night-alt placeholder
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow = win
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  win.on('ready-to-show', () => win.show())
  win.on('maximize', sendWindowState)
  win.on('unmaximize', sendWindowState)

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  await vegaClient.connect()

  vegaClient.on('transaction-progress', (evt: TransactionProgress) => {
    mainWindow?.webContents.send('vega:transaction-progress', evt)
  })
  vegaClient.on('transaction-finished', (evt: TransactionFinished) => {
    mainWindow?.webContents.send('vega:transaction-finished', evt)
  })
  vegaClient.on('backup-transaction-progress', (evt: BackupTransactionProgress) => {
    mainWindow?.webContents.send('vega:backup-transaction-progress', evt)
  })
  vegaClient.on('backup-transaction-finished', (evt: BackupTransactionFinished) => {
    mainWindow?.webContents.send('vega:backup-transaction-finished', evt)
  })
  vegaClient.on('backup-alert', (evt: BackupAlertEvent) => {
    mainWindow?.webContents.send('vega:backup-alert', evt)
    if (Notification.isSupported()) {
      new Notification({
        title: 'Backup com falhas consecutivas',
        body: `${evt.configId}: ${evt.consecutiveFailures} falhas seguidas. ${evt.message}`
      }).show()
    }
  })
  vegaClient.on('updates-available', (evt: UpdatesAvailableEvent) => {
    mainWindow?.webContents.send('vega:updates-available', evt)
    if (Notification.isSupported()) {
      new Notification({
        title: 'Atualizações disponíveis',
        body:
          evt.count === 1
            ? '1 pacote com atualização pendente.'
            : `${evt.count} pacotes com atualização pendente.`
      }).show()
    }
  })

  ipcMain.handle('vega:ping', () => vegaClient.ping())
  ipcMain.handle('vega:search', (_event, query: string) => vegaClient.search(query))
  ipcMain.handle('vega:listUpdates', () => vegaClient.listUpdates())
  ipcMain.handle('vega:getPackageDetails', (_event, origin: string, id: string) =>
    vegaClient.getPackageDetails(origin, id)
  )
  ipcMain.handle('vega:install', (_event, origin: string, id: string) => vegaClient.install(origin, id))
  ipcMain.handle('vega:getAurPkgbuild', (_event, id: string) => vegaClient.getAurPkgbuild(id))
  ipcMain.handle('vega:remove', (_event, origin: string, id: string) => vegaClient.remove(origin, id))
  ipcMain.handle('vega:updateAll', () => vegaClient.updateAll())
  ipcMain.handle('vega:clearCache', () => vegaClient.clearCache())
  ipcMain.handle('vega:listSnapshots', () => vegaClient.listSnapshots())
  ipcMain.handle('vega:createSnapshot', (_event, description: string) => vegaClient.createSnapshot(description))
  ipcMain.handle('vega:diffPackages', (_event, snapshotId: number) => vegaClient.diffPackages(snapshotId))
  ipcMain.handle('vega:rollbackSnapshot', (_event, snapshotId: number) => vegaClient.rollbackSnapshot(snapshotId))
  ipcMain.handle('vega:deleteSnapshot', (_event, snapshotId: number) => vegaClient.deleteSnapshot(snapshotId))
  ipcMain.handle('vega:setRetentionPolicy', (_event, keepCount: number) => vegaClient.setRetentionPolicy(keepCount))
  ipcMain.handle('vega:listBackupConfigs', () => vegaClient.listBackupConfigs())
  ipcMain.handle('vega:createBackupConfig', (_event, config: BackupConfig) => vegaClient.createBackupConfig(config))
  ipcMain.handle('vega:runBackupNow', (_event, configId: string) => vegaClient.runBackupNow(configId))
  ipcMain.handle('vega:listBackupSnapshots', (_event, configId: string) => vegaClient.listBackupSnapshots(configId))
  ipcMain.handle('vega:listBackupSnapshotPaths', (_event, configId: string, snapshotId: string) =>
    vegaClient.listBackupSnapshotPaths(configId, snapshotId)
  )
  ipcMain.handle(
    'vega:restoreBackupSnapshot',
    (_event, snapshotId: string, targetPath: string, mode: string) =>
      vegaClient.restoreBackupSnapshot(snapshotId, targetPath, mode)
  )
  ipcMain.handle(
    'vega:restoreBackupItems',
    (_event, snapshotId: string, targetPath: string, mode: string, paths: string[]) =>
      vegaClient.restoreBackupItems(snapshotId, targetPath, mode, paths)
  )
  ipcMain.handle('vega:deleteBackupConfig', (_event, configId: string) => vegaClient.deleteBackupConfig(configId))
  ipcMain.handle('vega:hardwareInventory', () => vegaClient.hardwareInventory())
  ipcMain.handle('vega:hardwareFirmwareStatus', () => vegaClient.hardwareFirmwareStatus())
  ipcMain.handle('vega:switchNvidiaDriver', (_event, driver: string) => vegaClient.switchNvidiaDriver(driver))
  ipcMain.handle('vega:kernelListInstalled', () => vegaClient.kernelListInstalled())
  ipcMain.handle('vega:kernelInstall', (_event, kernel: string) => vegaClient.kernelInstall(kernel))
  ipcMain.handle('vega:kernelRemove', (_event, kernel: string) => vegaClient.kernelRemove(kernel))
  ipcMain.handle('vega:firewallStatus', () => vegaClient.firewallStatus())
  ipcMain.handle('vega:firewallListServices', () => vegaClient.firewallListServices())
  ipcMain.handle(
    'vega:firewallSetServiceEnabled',
    (_event, name: string, enabled: boolean) => vegaClient.firewallSetServiceEnabled(name, enabled)
  )
  ipcMain.handle('vega:listUsers', () => vegaClient.listUsers())
  ipcMain.handle('vega:createUser', (_event, username: string, isAdmin: boolean) => vegaClient.createUser(username, isAdmin))
  ipcMain.handle('vega:removeUser', (_event, username: string) => vegaClient.removeUser(username))
  ipcMain.handle('vega:setAdmin', (_event, username: string, isAdmin: boolean) => vegaClient.setAdmin(username, isAdmin))
  ipcMain.handle('vega:listManagedServices', () => vegaClient.listManagedServices())
  ipcMain.handle('vega:setServiceEnabled', (_event, name: string, enabled: boolean) =>
    vegaClient.setServiceEnabled(name, enabled)
  )
  ipcMain.handle('vega:setServiceRunning', (_event, name: string, running: boolean) =>
    vegaClient.setServiceRunning(name, running)
  )
  ipcMain.handle('vega:restartService', (_event, name: string) => vegaClient.restartService(name))
  ipcMain.handle('vega:window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('vega:window:toggleMaximize', () => {
    if (!mainWindow) return { maximized: false }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
    sendWindowState()
    return { maximized: mainWindow.isMaximized() }
  })
  ipcMain.handle('vega:window:close', () => mainWindow?.close())
  ipcMain.handle('vega:window:isMaximized', () => Boolean(mainWindow?.isMaximized()))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  vegaClient.disconnect()
  if (process.platform !== 'darwin') app.quit()
})
