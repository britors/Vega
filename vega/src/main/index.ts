import { app, shell, BrowserWindow, ipcMain, Notification, dialog, type OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import {
  type TransactionProgress,
  type TransactionFinished,
  type BackupTransactionProgress,
  type BackupTransactionFinished,
  type BackupAlertEvent,
  type BackupConfig,
  type UpdatesAvailableEvent,
  type ProxyConfig
} from './system/types'
import { createSystemClient } from './system/factory'
import {
  applyDisplayConfig,
  applyWallpaper,
  listDisplays,
  listWallpapers,
  type DisplayConfig
} from './sessionSettings'
import { AgentLoop } from './ai/agentLoop'
import { rejectAllPending, resolveProposal } from './ai/proposalStore'
import {
  getApiKey,
  getSettings,
  listConfiguredProviders,
  saveApiKey,
  setActiveProvider,
  setMaxMessagesPerDay,
  setMaxRoundsPerMessage,
  setModel
} from './ai/credentials'
import { createProvider } from './ai/providers'
import { readAuditLog } from './ai/auditLog'
import { getDailyUsage } from './ai/usageTracker'
import type { AIProviderId, AIToolOutcome, AIToolProposal } from './ai/types'

const vegaClient = createSystemClient()
let mainWindow: BrowserWindow | null = null
const agentLoop = new AgentLoop(
  vegaClient,
  (proposal: AIToolProposal) => mainWindow?.webContents.send('ai:toolProposal', proposal),
  (status: string) => mainWindow?.webContents.send('ai:status', status)
)

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
    rejectAllPending('A janela foi fechada antes da confirmação.')
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
  ipcMain.handle('vega:getCapabilities', () => vegaClient.getCapabilities())
  ipcMain.handle('vega:distroLogo', () => vegaClient.distroLogo())
  ipcMain.handle('vega:packageManagerName', () => vegaClient.packageManagerName())
  ipcMain.handle('vega:communityLayerName', () => vegaClient.communityLayerName())
  ipcMain.handle('vega:diskUsage', () => vegaClient.diskUsage())
  ipcMain.handle('vega:search', (_event, query: string) => vegaClient.search(query))
  ipcMain.handle('vega:listUpdates', () => vegaClient.listUpdates())
  ipcMain.handle('vega:listInstalled', () => vegaClient.listInstalled())
  ipcMain.handle('vega:getPackageDetails', (_event, origin: string, id: string) =>
    vegaClient.getPackageDetails(origin, id)
  )
  ipcMain.handle('vega:install', (_event, origin: string, id: string) => vegaClient.install(origin, id))
  ipcMain.handle('vega:getAurPkgbuild', (_event, id: string) => vegaClient.getAurPkgbuild(id))
  ipcMain.handle('vega:remove', (_event, origin: string, id: string) => vegaClient.remove(origin, id))
  ipcMain.handle('vega:updateAll', () => vegaClient.updateAll())
  ipcMain.handle('vega:clearCache', () => vegaClient.clearCache())
  ipcMain.handle('vega:optimizeMirrors', () => vegaClient.optimizeMirrors())
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
  ipcMain.handle('vega:kernelAvailablePackages', () => vegaClient.kernelAvailablePackages())
  ipcMain.handle('vega:kernelInstall', (_event, kernel: string) => vegaClient.kernelInstall(kernel))
  ipcMain.handle('vega:kernelRemove', (_event, kernel: string) => vegaClient.kernelRemove(kernel))
  ipcMain.handle('vega:bootStatus', () => vegaClient.bootStatus())
  ipcMain.handle('vega:listBootEntries', () => vegaClient.listBootEntries())
  ipcMain.handle('vega:applyBootConfig', (_event, defaultEntry: string, timeout: number, cmdline: string) =>
    vegaClient.applyBootConfig(defaultEntry, timeout, cmdline)
  )
  ipcMain.handle('vega:firewallStatus', () => vegaClient.firewallStatus())
  ipcMain.handle('vega:firewallListServices', () => vegaClient.firewallListServices())
  ipcMain.handle(
    'vega:firewallSetServiceEnabled',
    (_event, name: string, enabled: boolean) => vegaClient.firewallSetServiceEnabled(name, enabled)
  )
  ipcMain.handle('vega:dateTimeStatus', () => vegaClient.dateTimeStatus())
  ipcMain.handle('vega:listTimezones', () => vegaClient.listTimezones())
  ipcMain.handle('vega:listLocales', () => vegaClient.listLocales())
  ipcMain.handle('vega:listKeymaps', () => vegaClient.listKeymaps())
  ipcMain.handle('vega:applyDateTimeLocale', (_event, timezone: string, ntp: boolean, locale: string, keymap: string) =>
    vegaClient.applyDateTimeLocale(timezone, ntp, locale, keymap)
  )
  ipcMain.handle('vega:listNetworkInterfaces', () => vegaClient.listNetworkInterfaces())
  ipcMain.handle('vega:listWifi', () => vegaClient.listWifi())
  ipcMain.handle('vega:connectWifi', (_event, ssid: string, password: string) => vegaClient.connectWifi(ssid, password))
  ipcMain.handle('vega:disconnectNetwork', (_event, device: string) => vegaClient.disconnectNetwork(device))
  ipcMain.handle('vega:setStaticIPv4', (_event, connection: string, address: string, gateway: string, dns: string) =>
    vegaClient.setStaticIPv4(connection, address, gateway, dns)
  )
  ipcMain.handle('vega:importVPN', (_event, path: string) => vegaClient.importVPN(path))
  ipcMain.handle('vega:getProxy', () => vegaClient.getProxy())
  ipcMain.handle('vega:setProxy', (_event, config: ProxyConfig) => vegaClient.setProxy(config))
  ipcMain.handle('vega:bluetoothStatus', () => vegaClient.bluetoothStatus())
  ipcMain.handle('vega:listBluetoothDevices', () => vegaClient.listBluetoothDevices())
  ipcMain.handle('vega:setBluetoothPowered', (_event, powered: boolean) => vegaClient.setBluetoothPowered(powered))
  ipcMain.handle('vega:setBluetoothDiscoverable', (_event, discoverable: boolean) =>
    vegaClient.setBluetoothDiscoverable(discoverable)
  )
  ipcMain.handle('vega:setBluetoothPairable', (_event, pairable: boolean) => vegaClient.setBluetoothPairable(pairable))
  ipcMain.handle('vega:setBluetoothScanning', (_event, scanning: boolean) => vegaClient.setBluetoothScanning(scanning))
  ipcMain.handle('vega:pairBluetoothDevice', (_event, address: string) => vegaClient.pairBluetoothDevice(address))
  ipcMain.handle('vega:trustBluetoothDevice', (_event, address: string, trusted: boolean) =>
    vegaClient.trustBluetoothDevice(address, trusted)
  )
  ipcMain.handle('vega:connectBluetoothDevice', (_event, address: string) =>
    vegaClient.connectBluetoothDevice(address)
  )
  ipcMain.handle('vega:disconnectBluetoothDevice', (_event, address: string) =>
    vegaClient.disconnectBluetoothDevice(address)
  )
  ipcMain.handle('vega:removeBluetoothDevice', (_event, address: string) => vegaClient.removeBluetoothDevice(address))
  ipcMain.handle('vega:sendBluetoothFile', (_event, address: string, path: string) =>
    vegaClient.sendBluetoothFile(address, path)
  )
  ipcMain.handle('vega:startBluetoothFileReceiver', (_event, directory: string) =>
    vegaClient.startBluetoothFileReceiver(directory)
  )
  ipcMain.handle('vega:chooseBluetoothFile', async () => {
    const options: OpenDialogOptions = {
      title: 'Selecionar arquivo para enviar por Bluetooth',
      properties: ['openFile']
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled ? '' : result.filePaths[0] ?? ''
  })
  ipcMain.handle('vega:chooseBluetoothReceiveDirectory', async () => {
    const options: OpenDialogOptions = {
      title: 'Selecionar pasta para receber arquivos Bluetooth',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled ? '' : result.filePaths[0] ?? ''
  })
  ipcMain.handle('vega:listDisplays', () => listDisplays())
  ipcMain.handle('vega:applyDisplayConfig', (_event, config: DisplayConfig) => applyDisplayConfig(config))
  ipcMain.handle('vega:listWallpapers', () => listWallpapers())
  ipcMain.handle('vega:applyWallpaper', (_event, path: string) => applyWallpaper(path))
  ipcMain.handle('vega:listStorageVolumes', () => vegaClient.listStorageVolumes())
  ipcMain.handle('vega:mountVolume', (_event, path: string) => vegaClient.mountVolume(path))
  ipcMain.handle('vega:unmountVolume', (_event, path: string) => vegaClient.unmountVolume(path))
  ipcMain.handle('vega:systemMetrics', () => vegaClient.systemMetrics())
  ipcMain.handle('vega:listProcesses', () => vegaClient.listProcesses())
  ipcMain.handle('vega:killProcess', (_event, pid: number) => vegaClient.killProcess(pid))
  ipcMain.handle('vega:listUsers', () => vegaClient.listUsers())
  ipcMain.handle('vega:createUser', (_event, username: string, isAdmin: boolean) => vegaClient.createUser(username, isAdmin))
  ipcMain.handle('vega:removeUser', (_event, username: string) => vegaClient.removeUser(username))
  ipcMain.handle('vega:setAdmin', (_event, username: string, isAdmin: boolean) => vegaClient.setAdmin(username, isAdmin))
  ipcMain.handle('vega:listManagedServices', () => vegaClient.listManagedServices())
  ipcMain.handle('vega:listAllManagedServices', () => vegaClient.listAllManagedServices())
  ipcMain.handle('vega:setServiceEnabled', (_event, name: string, enabled: boolean) =>
    vegaClient.setServiceEnabled(name, enabled)
  )
  ipcMain.handle('vega:setServiceRunning', (_event, name: string, running: boolean) =>
    vegaClient.setServiceRunning(name, running)
  )
  ipcMain.handle('vega:restartService', (_event, name: string) => vegaClient.restartService(name))
  ipcMain.handle(
    'vega:queryLogs',
    (_event, unit: string, priority: string, since: string, search: string, maxLines: number) =>
      vegaClient.queryLogs(unit, priority, since, search, maxLines)
  )
  ipcMain.handle('vega:listLogUnits', () => vegaClient.listLogUnits())

  ipcMain.handle('ai:sendMessage', (_event, text: string) => agentLoop.sendMessage(text))
  ipcMain.handle('ai:resolveToolProposal', (_event, proposalId: string, approved: boolean, outcome?: AIToolOutcome) =>
    resolveProposal(proposalId, { approved, outcome })
  )
  ipcMain.handle('ai:getSettings', async () => ({
    settings: await getSettings(),
    configuredProviders: await listConfiguredProviders(),
    dailyUsage: await getDailyUsage()
  }))
  ipcMain.handle('ai:saveApiKey', (_event, provider: AIProviderId, apiKey: string) => saveApiKey(provider, apiKey))
  ipcMain.handle('ai:setActiveProvider', (_event, provider: AIProviderId) => setActiveProvider(provider))
  ipcMain.handle('ai:setModel', (_event, provider: AIProviderId, model: string) => setModel(provider, model))
  ipcMain.handle('ai:setMaxRoundsPerMessage', (_event, maxRounds: number) => setMaxRoundsPerMessage(maxRounds))
  ipcMain.handle('ai:setMaxMessagesPerDay', (_event, maxMessages: number) => setMaxMessagesPerDay(maxMessages))
  ipcMain.handle('ai:listModels', async (_event, provider: AIProviderId) => {
    const apiKey = await getApiKey(provider)
    if (!apiKey) throw new Error(`Nenhuma chave de API configurada para o provedor "${provider}".`)
    const settings = await getSettings()
    return createProvider(provider, apiKey, settings.models[provider]).listModels()
  })
  ipcMain.handle('ai:getAuditLog', (_event, limit?: number) => readAuditLog(limit))

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
