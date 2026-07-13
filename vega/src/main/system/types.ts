export type SystemPlatform = 'linux' | 'windows'

export type SystemModule =
  | 'dashboard'
  | 'assistant'
  | 'software'
  | 'snapshots'
  | 'backup'
  | 'hardware'
  | 'kernel'
  | 'network'
  | 'datetime'
  | 'storage'
  | 'monitor'
  | 'users'
  | 'services'
  | 'logs'
  | 'about'

export interface MissingDependency {
  id: string
  modules: SystemModule[]
  detail: string
}

export interface SystemCapabilities {
  platform: SystemPlatform
  platformVersion: string
  backendVersion: string
  protocolVersion: number
  modules: SystemModule[]
  readOperations: string[]
  mutations: string[]
  elevatedMutations: string[]
  missingDependencies: MissingDependency[]
}

export type SystemErrorCode =
  | 'UNAVAILABLE'
  | 'UNSUPPORTED'
  | 'UNAUTHORIZED'
  | 'CANCELED'
  | 'EXTERNAL_FAILURE'

export class SystemClientError extends Error {
  constructor(
    readonly code: SystemErrorCode,
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'SystemClientError'
  }
}

export interface VegaSystemInfo { version: string; connected: boolean; distro: string }
export interface PackageRef { origin: string; id: string; name: string; description: string; installed: boolean; icon: string }
export interface PackageDetails {
  origin: string; id: string; name: string; description: string; installed: boolean
  installedVersion: string; availableVersion: string; downloadSize: string; installedSize: string
  dependencies: string[]; licenses: string[]; url: string; maintainer: string
}
export interface TransactionProgress { transactionId: number; percent: number; message: string }
export interface TransactionFinished { transactionId: number; success: boolean; message: string }
export interface BackupTransactionProgress { transactionId: number; percent: number; message: string }
export interface BackupTransactionFinished { transactionId: number; success: boolean; message: string }
export interface BackupAlertEvent { configId: string; consecutiveFailures: number; message: string }
export interface UpdatesAvailableEvent { count: number }
export interface SnapshotInfo { id: number; timestamp: number; trigger: string; description: string }
export interface HardwareInventory { cpu: string; gpu: string; ramText: string }
export interface FirewallServiceInfo { name: string; label: string; enabled: boolean }
export interface UserInfo { username: string; isAdmin: boolean }
export interface ManagedServiceInfo {
  name: string; label: string; description: string; enabled: boolean; active: boolean; available: boolean
}
export interface DateTimeStatus { timezone: string; ntp: boolean; locale: string; keymap: string }
export interface BootStatus { loader: string; defaultEntry: string; timeout: number; cmdline: string }
export interface NetworkInterfaceInfo {
  name: string; type: string; state: string; ipv4: string; ipv6: string; gateway: string; dns: string
  mac: string; speed: string; ssid: string; signal: number; device: string; autoconf: boolean
}
export interface WifiNetworkInfo { ssid: string; security: string; signal: number; active: boolean; device: string }
export interface BluetoothStatus {
  available: boolean; powered: boolean; discoverable: boolean; pairable: boolean; scanning: boolean
  controller: string; controllerName: string; transferAvailable: boolean; receiverActive: boolean; receivePath: string
}
export interface BluetoothDeviceInfo {
  address: string; name: string; alias: string; icon: string; paired: boolean; trusted: boolean
  connected: boolean; blocked: boolean; rssi: number
}
export interface ProxyConfig { http: string; https: string; socks: string; no: string }
export interface StorageVolumeInfo {
  name: string; path: string; type: string; fsType: string; size: string; used: string; avail: string
  usePercent: number; mountpoint: string; model: string; removable: boolean; canMount: boolean; canUnmount: boolean
}
export interface SystemMetrics {
  cpuPercent: number; memUsed: number; memTotal: number; swapUsed: number; swapTotal: number
  diskReadBytes: number; diskWriteBytes: number; netRxBytes: number; netTxBytes: number
}
export interface ProcessInfo { pid: number; name: string; user: string; cpuPercent: number; memory: number; state: string }
export interface BackupConfig { id: string; paths: string[]; destination: string; destinationUUID: string; frequency: string }
export interface BackupSnapshotInfo { id: string; timestamp: number; fileCount: number; sizeBytes: number }
export interface BackupItem { path: string }
