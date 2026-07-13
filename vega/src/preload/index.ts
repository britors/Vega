import { contextBridge, ipcRenderer } from 'electron'
import type {
  VegaSystemInfo,
  PackageRef,
  PackageDetails,
  SnapshotInfo,
  BackupConfig,
  BackupSnapshotInfo,
  BackupTransactionProgress,
  BackupTransactionFinished,
  TransactionProgress,
  TransactionFinished,
  BluetoothStatus,
  BluetoothDeviceInfo,
  ProxyConfig,
  HardwareInventory,
  ProcessInfo,
  StorageVolumeInfo,
  SystemMetrics
} from '../main/system/types'
import type { SoftwareInstallOptions } from '../main/system/types'
import type { SystemCapabilities } from '../main/system/types'
import type { DisplayConfig, DisplayOutputInfo, WallpaperInfo } from '../main/sessionSettings'
import type {
  AIAuditEntry,
  AIDailyUsage,
  AIProviderId,
  AISendMessageResult,
  AISettings,
  AIToolOutcome,
  AIToolProposal
} from '../main/ai/types'

const api = {
  ping: (): Promise<VegaSystemInfo> => ipcRenderer.invoke('vega:ping'),
  getCapabilities: (): Promise<SystemCapabilities> => ipcRenderer.invoke('vega:getCapabilities'),
  distroLogo: (): Promise<string> => ipcRenderer.invoke('vega:distroLogo'),
  packageManagerName: (): Promise<string> => ipcRenderer.invoke('vega:packageManagerName'),
  communityLayerName: (): Promise<string> => ipcRenderer.invoke('vega:communityLayerName'),
  diskUsage: (): Promise<{ used: string; total: string; percent: number }> => ipcRenderer.invoke('vega:diskUsage'),
  search: (query: string): Promise<PackageRef[]> => ipcRenderer.invoke('vega:search', query),
  listUpdates: (): Promise<PackageRef[]> => ipcRenderer.invoke('vega:listUpdates'),
  listInstalled: (): Promise<PackageRef[]> => ipcRenderer.invoke('vega:listInstalled'),
  getPackageDetails: (origin: string, id: string): Promise<PackageDetails> =>
    ipcRenderer.invoke('vega:getPackageDetails', origin, id),
  install: (origin: string, id: string, options?: SoftwareInstallOptions): Promise<number> =>
    ipcRenderer.invoke('vega:install', origin, id, options),
  getAurPkgbuild: (id: string): Promise<string> => ipcRenderer.invoke('vega:getAurPkgbuild', id),
  remove: (origin: string, id: string): Promise<number> => ipcRenderer.invoke('vega:remove', origin, id),
  updateAll: (): Promise<number> => ipcRenderer.invoke('vega:updateAll'),
  clearCache: (): Promise<number> => ipcRenderer.invoke('vega:clearCache'),
  optimizeMirrors: (): Promise<number> => ipcRenderer.invoke('vega:optimizeMirrors'),
  listSnapshots: (): Promise<SnapshotInfo[]> => ipcRenderer.invoke('vega:listSnapshots'),
  createSnapshot: (description: string): Promise<number> => ipcRenderer.invoke('vega:createSnapshot', description),
  diffPackages: (snapshotId: number): Promise<string[]> => ipcRenderer.invoke('vega:diffPackages', snapshotId),
  rollbackSnapshot: (snapshotId: number): Promise<void> => ipcRenderer.invoke('vega:rollbackSnapshot', snapshotId),
  deleteSnapshot: (snapshotId: number): Promise<void> => ipcRenderer.invoke('vega:deleteSnapshot', snapshotId),
  setRetentionPolicy: (keepCount: number): Promise<void> => ipcRenderer.invoke('vega:setRetentionPolicy', keepCount),
  listBackupConfigs: (): Promise<BackupConfig[]> => ipcRenderer.invoke('vega:listBackupConfigs'),
  createBackupConfig: (config: BackupConfig): Promise<string> => ipcRenderer.invoke('vega:createBackupConfig', config),
  runBackupNow: (configId: string): Promise<number> => ipcRenderer.invoke('vega:runBackupNow', configId),
  listBackupSnapshots: (configId: string): Promise<BackupSnapshotInfo[]> =>
    ipcRenderer.invoke('vega:listBackupSnapshots', configId),
  listBackupSnapshotPaths: (configId: string, snapshotId: string): Promise<string[]> =>
    ipcRenderer.invoke('vega:listBackupSnapshotPaths', configId, snapshotId),
  restoreBackupSnapshot: (snapshotId: string, targetPath: string, mode: string): Promise<number> =>
    ipcRenderer.invoke('vega:restoreBackupSnapshot', snapshotId, targetPath, mode),
  restoreBackupItems: (snapshotId: string, targetPath: string, mode: string, paths: string[]): Promise<number> =>
    ipcRenderer.invoke('vega:restoreBackupItems', snapshotId, targetPath, mode, paths),
  deleteBackupConfig: (configId: string): Promise<void> => ipcRenderer.invoke('vega:deleteBackupConfig', configId),
  hardwareInventory: (): Promise<HardwareInventory> =>
    ipcRenderer.invoke('vega:hardwareInventory'),
  hardwareFirmwareStatus: (): Promise<string> => ipcRenderer.invoke('vega:hardwareFirmwareStatus'),
  switchNvidiaDriver: (driver: string): Promise<void> => ipcRenderer.invoke('vega:switchNvidiaDriver', driver),
  kernelListInstalled: (): Promise<string[]> => ipcRenderer.invoke('vega:kernelListInstalled'),
  kernelAvailablePackages: (): Promise<string[]> => ipcRenderer.invoke('vega:kernelAvailablePackages'),
  kernelInstall: (kernel: string): Promise<number> => ipcRenderer.invoke('vega:kernelInstall', kernel),
  kernelRemove: (kernel: string): Promise<void> => ipcRenderer.invoke('vega:kernelRemove', kernel),
  bootStatus: (): Promise<{ loader: string; defaultEntry: string; timeout: number; cmdline: string }> =>
    ipcRenderer.invoke('vega:bootStatus'),
  listBootEntries: (): Promise<string[]> => ipcRenderer.invoke('vega:listBootEntries'),
  applyBootConfig: (defaultEntry: string, timeout: number, cmdline: string): Promise<void> =>
    ipcRenderer.invoke('vega:applyBootConfig', defaultEntry, timeout, cmdline),
  firewallStatus: (): Promise<{ enabled: boolean; activeZone: string }> => ipcRenderer.invoke('vega:firewallStatus'),
  firewallListServices: (): Promise<{ name: string; label: string; enabled: boolean }[]> =>
    ipcRenderer.invoke('vega:firewallListServices'),
  firewallSetServiceEnabled: (name: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('vega:firewallSetServiceEnabled', name, enabled),
  dateTimeStatus: (): Promise<{ timezone: string; ntp: boolean; locale: string; keymap: string }> =>
    ipcRenderer.invoke('vega:dateTimeStatus'),
  listTimezones: (): Promise<string[]> => ipcRenderer.invoke('vega:listTimezones'),
  listLocales: (): Promise<string[]> => ipcRenderer.invoke('vega:listLocales'),
  listKeymaps: (): Promise<string[]> => ipcRenderer.invoke('vega:listKeymaps'),
  applyDateTimeLocale: (timezone: string, ntp: boolean, locale: string, keymap: string): Promise<void> =>
    ipcRenderer.invoke('vega:applyDateTimeLocale', timezone, ntp, locale, keymap),
  listNetworkInterfaces: (): Promise<
    {
      name: string
      type: string
      state: string
      ipv4: string
      ipv6: string
      gateway: string
      dns: string
      mac: string
      speed: string
      ssid: string
      signal: number
      device: string
      autoconf: boolean
    }[]
  > => ipcRenderer.invoke('vega:listNetworkInterfaces'),
  listWifi: (): Promise<{ ssid: string; security: string; signal: number; active: boolean; device: string }[]> =>
    ipcRenderer.invoke('vega:listWifi'),
  connectWifi: (ssid: string, password: string): Promise<void> => ipcRenderer.invoke('vega:connectWifi', ssid, password),
  disconnectNetwork: (device: string): Promise<void> => ipcRenderer.invoke('vega:disconnectNetwork', device),
  setStaticIPv4: (connection: string, address: string, gateway: string, dns: string): Promise<void> =>
    ipcRenderer.invoke('vega:setStaticIPv4', connection, address, gateway, dns),
  importVPN: (path: string): Promise<void> => ipcRenderer.invoke('vega:importVPN', path),
  getProxy: (): Promise<ProxyConfig> => ipcRenderer.invoke('vega:getProxy'),
  setProxy: (config: ProxyConfig): Promise<void> => ipcRenderer.invoke('vega:setProxy', config),
  bluetoothStatus: (): Promise<BluetoothStatus> => ipcRenderer.invoke('vega:bluetoothStatus'),
  listBluetoothDevices: (): Promise<BluetoothDeviceInfo[]> => ipcRenderer.invoke('vega:listBluetoothDevices'),
  setBluetoothPowered: (powered: boolean): Promise<void> => ipcRenderer.invoke('vega:setBluetoothPowered', powered),
  setBluetoothDiscoverable: (discoverable: boolean): Promise<void> =>
    ipcRenderer.invoke('vega:setBluetoothDiscoverable', discoverable),
  setBluetoothPairable: (pairable: boolean): Promise<void> =>
    ipcRenderer.invoke('vega:setBluetoothPairable', pairable),
  setBluetoothScanning: (scanning: boolean): Promise<void> =>
    ipcRenderer.invoke('vega:setBluetoothScanning', scanning),
  pairBluetoothDevice: (address: string): Promise<void> => ipcRenderer.invoke('vega:pairBluetoothDevice', address),
  trustBluetoothDevice: (address: string, trusted: boolean): Promise<void> =>
    ipcRenderer.invoke('vega:trustBluetoothDevice', address, trusted),
  connectBluetoothDevice: (address: string): Promise<void> =>
    ipcRenderer.invoke('vega:connectBluetoothDevice', address),
  disconnectBluetoothDevice: (address: string): Promise<void> =>
    ipcRenderer.invoke('vega:disconnectBluetoothDevice', address),
  removeBluetoothDevice: (address: string): Promise<void> =>
    ipcRenderer.invoke('vega:removeBluetoothDevice', address),
  sendBluetoothFile: (address: string, path: string): Promise<void> =>
    ipcRenderer.invoke('vega:sendBluetoothFile', address, path),
  startBluetoothFileReceiver: (directory: string): Promise<void> =>
    ipcRenderer.invoke('vega:startBluetoothFileReceiver', directory),
  chooseBluetoothFile: (): Promise<string> => ipcRenderer.invoke('vega:chooseBluetoothFile'),
  chooseBluetoothReceiveDirectory: (): Promise<string> =>
    ipcRenderer.invoke('vega:chooseBluetoothReceiveDirectory'),
  listDisplays: (): Promise<DisplayOutputInfo[]> => ipcRenderer.invoke('vega:listDisplays'),
  applyDisplayConfig: (config: DisplayConfig): Promise<void> => ipcRenderer.invoke('vega:applyDisplayConfig', config),
  listWallpapers: (): Promise<WallpaperInfo[]> => ipcRenderer.invoke('vega:listWallpapers'),
  applyWallpaper: (path: string): Promise<string> => ipcRenderer.invoke('vega:applyWallpaper', path),
  listStorageVolumes: (): Promise<StorageVolumeInfo[]> => ipcRenderer.invoke('vega:listStorageVolumes'),
  mountVolume: (path: string): Promise<void> => ipcRenderer.invoke('vega:mountVolume', path),
  unmountVolume: (path: string): Promise<void> => ipcRenderer.invoke('vega:unmountVolume', path),
  systemMetrics: (): Promise<SystemMetrics> => ipcRenderer.invoke('vega:systemMetrics'),
  listProcesses: (): Promise<ProcessInfo[]> => ipcRenderer.invoke('vega:listProcesses'),
  killProcess: (pid: number): Promise<void> => ipcRenderer.invoke('vega:killProcess', pid),
  listUsers: (): Promise<{ username: string; isAdmin: boolean }[]> => ipcRenderer.invoke('vega:listUsers'),
  createUser: (username: string, isAdmin: boolean): Promise<void> => ipcRenderer.invoke('vega:createUser', username, isAdmin),
  removeUser: (username: string): Promise<void> => ipcRenderer.invoke('vega:removeUser', username),
  setAdmin: (username: string, isAdmin: boolean): Promise<void> => ipcRenderer.invoke('vega:setAdmin', username, isAdmin),
  listManagedServices: (): Promise<
    { name: string; label: string; description: string; enabled: boolean; active: boolean; available: boolean }[]
  > => ipcRenderer.invoke('vega:listManagedServices'),
  listAllManagedServices: (): Promise<
    { name: string; label: string; description: string; enabled: boolean; active: boolean; available: boolean }[]
  > => ipcRenderer.invoke('vega:listAllManagedServices'),
  setServiceEnabled: (name: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('vega:setServiceEnabled', name, enabled),
  setServiceRunning: (name: string, running: boolean): Promise<void> =>
    ipcRenderer.invoke('vega:setServiceRunning', name, running),
  restartService: (name: string): Promise<void> => ipcRenderer.invoke('vega:restartService', name),
  queryLogs: (unit: string, priority: string, since: string, search: string, maxLines: number): Promise<string[]> =>
    ipcRenderer.invoke('vega:queryLogs', unit, priority, since, search, maxLines),
  listLogUnits: (): Promise<string[]> => ipcRenderer.invoke('vega:listLogUnits'),
  windowMinimize: (): Promise<void> => ipcRenderer.invoke('vega:window:minimize'),
  windowToggleMaximize: (): Promise<{ maximized: boolean }> => ipcRenderer.invoke('vega:window:toggleMaximize'),
  windowClose: (): Promise<void> => ipcRenderer.invoke('vega:window:close'),
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke('vega:window:isMaximized'),
  onWindowState: (cb: (state: { maximized: boolean }) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: { maximized: boolean }): void => cb(state)
    ipcRenderer.on('vega:window-state', listener)
    return () => ipcRenderer.removeListener('vega:window-state', listener)
  },

  onTransactionProgress: (cb: (evt: TransactionProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, evt: TransactionProgress): void => cb(evt)
    ipcRenderer.on('vega:transaction-progress', listener)
    return () => ipcRenderer.removeListener('vega:transaction-progress', listener)
  },
  onTransactionFinished: (cb: (evt: TransactionFinished) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, evt: TransactionFinished): void => cb(evt)
    ipcRenderer.on('vega:transaction-finished', listener)
    return () => ipcRenderer.removeListener('vega:transaction-finished', listener)
  },
  onBackupTransactionProgress: (cb: (evt: BackupTransactionProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, evt: BackupTransactionProgress): void => cb(evt)
    ipcRenderer.on('vega:backup-transaction-progress', listener)
    return () => ipcRenderer.removeListener('vega:backup-transaction-progress', listener)
  },
  onBackupTransactionFinished: (cb: (evt: BackupTransactionFinished) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, evt: BackupTransactionFinished): void => cb(evt)
    ipcRenderer.on('vega:backup-transaction-finished', listener)
    return () => ipcRenderer.removeListener('vega:backup-transaction-finished', listener)
  },

  aiSendMessage: (text: string): Promise<AISendMessageResult> => ipcRenderer.invoke('ai:sendMessage', text),
  aiResolveToolProposal: (proposalId: string, approved: boolean, outcome?: AIToolOutcome): Promise<boolean> =>
    ipcRenderer.invoke('ai:resolveToolProposal', proposalId, approved, outcome),
  aiGetSettings: (): Promise<{ settings: AISettings; configuredProviders: AIProviderId[]; dailyUsage: AIDailyUsage }> =>
    ipcRenderer.invoke('ai:getSettings'),
  aiSaveApiKey: (provider: AIProviderId, apiKey: string): Promise<void> =>
    ipcRenderer.invoke('ai:saveApiKey', provider, apiKey),
  aiSetActiveProvider: (provider: AIProviderId): Promise<void> =>
    ipcRenderer.invoke('ai:setActiveProvider', provider),
  aiSetModel: (provider: AIProviderId, model: string): Promise<void> =>
    ipcRenderer.invoke('ai:setModel', provider, model),
  aiListModels: (provider: AIProviderId): Promise<string[]> => ipcRenderer.invoke('ai:listModels', provider),
  aiSetMaxRoundsPerMessage: (maxRounds: number): Promise<void> =>
    ipcRenderer.invoke('ai:setMaxRoundsPerMessage', maxRounds),
  aiSetMaxMessagesPerDay: (maxMessages: number): Promise<void> =>
    ipcRenderer.invoke('ai:setMaxMessagesPerDay', maxMessages),
  aiGetAuditLog: (limit?: number): Promise<AIAuditEntry[]> => ipcRenderer.invoke('ai:getAuditLog', limit),
  onAiToolProposal: (cb: (proposal: AIToolProposal) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, proposal: AIToolProposal): void => cb(proposal)
    ipcRenderer.on('ai:toolProposal', listener)
    return () => ipcRenderer.removeListener('ai:toolProposal', listener)
  },
  onAiStatus: (cb: (status: string) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: string): void => cb(status)
    ipcRenderer.on('ai:status', listener)
    return () => ipcRenderer.removeListener('ai:status', listener)
  }
}

contextBridge.exposeInMainWorld('vega', api)

export type VegaApi = typeof api
