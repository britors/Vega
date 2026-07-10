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
  TransactionFinished
} from '../main/dbusClient'

const api = {
  ping: (): Promise<VegaSystemInfo> => ipcRenderer.invoke('vega:ping'),
  diskUsage: (): Promise<{ used: string; total: string; percent: number }> => ipcRenderer.invoke('vega:diskUsage'),
  search: (query: string): Promise<PackageRef[]> => ipcRenderer.invoke('vega:search', query),
  listUpdates: (): Promise<PackageRef[]> => ipcRenderer.invoke('vega:listUpdates'),
  getPackageDetails: (origin: string, id: string): Promise<PackageDetails> =>
    ipcRenderer.invoke('vega:getPackageDetails', origin, id),
  install: (origin: string, id: string): Promise<number> => ipcRenderer.invoke('vega:install', origin, id),
  getAurPkgbuild: (id: string): Promise<string> => ipcRenderer.invoke('vega:getAurPkgbuild', id),
  remove: (origin: string, id: string): Promise<number> => ipcRenderer.invoke('vega:remove', origin, id),
  updateAll: (): Promise<number> => ipcRenderer.invoke('vega:updateAll'),
  clearCache: (): Promise<number> => ipcRenderer.invoke('vega:clearCache'),
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
  hardwareInventory: (): Promise<{ cpu: string; gpu: string; ramText: string }> =>
    ipcRenderer.invoke('vega:hardwareInventory'),
  hardwareFirmwareStatus: (): Promise<string> => ipcRenderer.invoke('vega:hardwareFirmwareStatus'),
  switchNvidiaDriver: (driver: string): Promise<void> => ipcRenderer.invoke('vega:switchNvidiaDriver', driver),
  kernelListInstalled: (): Promise<string[]> => ipcRenderer.invoke('vega:kernelListInstalled'),
  kernelInstall: (kernel: string): Promise<number> => ipcRenderer.invoke('vega:kernelInstall', kernel),
  kernelRemove: (kernel: string): Promise<void> => ipcRenderer.invoke('vega:kernelRemove', kernel),
  firewallStatus: (): Promise<{ enabled: boolean; activeZone: string }> => ipcRenderer.invoke('vega:firewallStatus'),
  firewallListServices: (): Promise<{ name: string; label: string; enabled: boolean }[]> =>
    ipcRenderer.invoke('vega:firewallListServices'),
  firewallSetServiceEnabled: (name: string, enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('vega:firewallSetServiceEnabled', name, enabled),
  listUsers: (): Promise<{ username: string; isAdmin: boolean }[]> => ipcRenderer.invoke('vega:listUsers'),
  createUser: (username: string, isAdmin: boolean): Promise<void> => ipcRenderer.invoke('vega:createUser', username, isAdmin),
  removeUser: (username: string): Promise<void> => ipcRenderer.invoke('vega:removeUser', username),
  setAdmin: (username: string, isAdmin: boolean): Promise<void> => ipcRenderer.invoke('vega:setAdmin', username, isAdmin),
  listManagedServices: (): Promise<
    { name: string; label: string; description: string; enabled: boolean; active: boolean; available: boolean }[]
  > => ipcRenderer.invoke('vega:listManagedServices'),
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
  }
}

contextBridge.exposeInMainWorld('vega', api)

export type VegaApi = typeof api
