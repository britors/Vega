import { EventEmitter } from 'node:events'
import type {
  BackupConfig, BackupSnapshotInfo, BluetoothDeviceInfo, BluetoothStatus, BootStatus, DateTimeStatus,
  FirewallServiceInfo, HardwareInventory, ManagedServiceInfo, NetworkInterfaceInfo, PackageDetails, PackageRef,
  ProcessInfo, ProxyConfig, SnapshotInfo, StorageVolumeInfo, SystemCapabilities, SystemMetrics, UserInfo,
  VegaSystemInfo, WifiNetworkInfo
} from './types'

export interface SystemClient extends EventEmitter {
  connect(): Promise<void>
  disconnect(): void
  getCapabilities(): Promise<SystemCapabilities>
  ping(): Promise<VegaSystemInfo>
  packageManagerName(): Promise<string>
  communityLayerName(): Promise<string>
  distroLogo(): Promise<string>
  diskUsage(): Promise<{ used: string; total: string; percent: number }>
  search(query: string): Promise<PackageRef[]>
  listRepos(): Promise<string[]>
  listUpdates(): Promise<PackageRef[]>
  listInstalled(): Promise<PackageRef[]>
  getPackageDetails(origin: string, id: string): Promise<PackageDetails>
  install(origin: string, id: string): Promise<number>
  getAurPkgbuild(id: string): Promise<string>
  remove(origin: string, id: string): Promise<number>
  updateAll(): Promise<number>
  clearCache(): Promise<number>
  optimizeMirrors(): Promise<number>
  listSnapshots(): Promise<SnapshotInfo[]>
  createSnapshot(description: string): Promise<number>
  diffPackages(snapshotId: number): Promise<string[]>
  rollbackSnapshot(snapshotId: number): Promise<void>
  deleteSnapshot(snapshotId: number): Promise<void>
  setRetentionPolicy(keepCount: number): Promise<void>
  listBackupConfigs(): Promise<BackupConfig[]>
  createBackupConfig(config: BackupConfig): Promise<string>
  runBackupNow(configId: string): Promise<number>
  listBackupSnapshots(configId: string): Promise<BackupSnapshotInfo[]>
  listBackupSnapshotPaths(configId: string, snapshotId: string): Promise<string[]>
  restoreBackupSnapshot(snapshotId: string, targetPath: string, mode: string): Promise<number>
  restoreBackupItems(snapshotId: string, targetPath: string, mode: string, paths: string[]): Promise<number>
  deleteBackupConfig(configId: string): Promise<void>
  hardwareInventory(): Promise<HardwareInventory>
  hardwareFirmwareStatus(): Promise<string>
  switchNvidiaDriver(driver: string): Promise<void>
  kernelListInstalled(): Promise<string[]>
  kernelAvailablePackages(): Promise<string[]>
  kernelInstall(kernel: string): Promise<number>
  kernelRemove(kernel: string): Promise<void>
  bootStatus(): Promise<BootStatus>
  listBootEntries(): Promise<string[]>
  applyBootConfig(defaultEntry: string, timeout: number, cmdline: string): Promise<void>
  firewallStatus(): Promise<{ enabled: boolean; activeZone: string }>
  firewallListServices(): Promise<FirewallServiceInfo[]>
  firewallSetServiceEnabled(name: string, enabled: boolean): Promise<void>
  dateTimeStatus(): Promise<DateTimeStatus>
  listTimezones(): Promise<string[]>
  listLocales(): Promise<string[]>
  listKeymaps(): Promise<string[]>
  applyDateTimeLocale(timezone: string, ntp: boolean, locale: string, keymap: string): Promise<void>
  listNetworkInterfaces(): Promise<NetworkInterfaceInfo[]>
  listWifi(): Promise<WifiNetworkInfo[]>
  connectWifi(ssid: string, password: string): Promise<void>
  disconnectNetwork(device: string): Promise<void>
  setStaticIPv4(connection: string, address: string, gateway: string, dns: string): Promise<void>
  importVPN(path: string): Promise<void>
  getProxy(): Promise<ProxyConfig>
  setProxy(config: ProxyConfig): Promise<void>
  bluetoothStatus(): Promise<BluetoothStatus>
  listBluetoothDevices(): Promise<BluetoothDeviceInfo[]>
  setBluetoothPowered(powered: boolean): Promise<void>
  setBluetoothDiscoverable(discoverable: boolean): Promise<void>
  setBluetoothPairable(pairable: boolean): Promise<void>
  setBluetoothScanning(scanning: boolean): Promise<void>
  pairBluetoothDevice(address: string): Promise<void>
  trustBluetoothDevice(address: string, trusted: boolean): Promise<void>
  connectBluetoothDevice(address: string): Promise<void>
  disconnectBluetoothDevice(address: string): Promise<void>
  removeBluetoothDevice(address: string): Promise<void>
  sendBluetoothFile(address: string, path: string): Promise<void>
  startBluetoothFileReceiver(directory: string): Promise<void>
  listStorageVolumes(): Promise<StorageVolumeInfo[]>
  mountVolume(path: string): Promise<void>
  unmountVolume(path: string): Promise<void>
  systemMetrics(): Promise<SystemMetrics>
  listProcesses(): Promise<ProcessInfo[]>
  killProcess(pid: number): Promise<void>
  listUsers(): Promise<UserInfo[]>
  createUser(username: string, isAdmin: boolean): Promise<void>
  removeUser(username: string): Promise<void>
  setAdmin(username: string, isAdmin: boolean): Promise<void>
  listManagedServices(): Promise<ManagedServiceInfo[]>
  listAllManagedServices(): Promise<ManagedServiceInfo[]>
  setServiceEnabled(name: string, enabled: boolean): Promise<void>
  queryLogs(unit: string, priority: string, since: string, search: string, maxLines: number): Promise<string[]>
  listLogUnits(): Promise<string[]>
  setServiceRunning(name: string, running: boolean): Promise<void>
  restartService(name: string): Promise<void>
}
