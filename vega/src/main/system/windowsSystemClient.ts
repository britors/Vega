import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { AgentTransport } from './agentTransport'
import type { SystemClient } from './systemClient'
import {
  SystemClientError, type BackupConfig, type BackupSnapshotInfo, type BluetoothDeviceInfo, type BluetoothStatus, type FirewallRuleSpec, type FirewallServiceInfo, type HardwareInventory, type ManagedServiceInfo,
  type DateTimeStatus, type NetworkInterfaceInfo, type ProcessInfo, type ProxyConfig, type StorageVolumeInfo,
  type SystemCapabilities, type SystemMetrics, type UserInfo, type VegaSystemInfo, type WifiNetworkInfo
} from './types'
import type { PackageDetails, PackageRef, SoftwareInstallOptions } from './types'
import type { DisplayApplyResult, DisplayConfig, DisplayOutputInfo } from '../sessionSettings'

async function openBluetoothSettings(): Promise<void> {
  const { shell } = await import('electron')
  await shell.openExternal('ms-settings:bluetooth')
}

class WindowsSystemClientBase extends EventEmitter {
  private readonly transport = new AgentTransport()
  private capabilities: SystemCapabilities | null = null
  private transactionId = 0
  private scannedBluetoothDevices: BluetoothDeviceInfo[] | null = null

  async connect(): Promise<void> { this.capabilities = await this.transport.connect() }
  disconnect(): void { this.transport.disconnect(); this.capabilities = null }
  async getCapabilities(): Promise<SystemCapabilities> {
    return this.capabilities || this.transport.connect()
  }
  async ping(): Promise<VegaSystemInfo> {
    const result = await this.transport.request<{
      version: string; connected: boolean; name?: string; osVersion?: string; build?: string; architecture?: string
    }>('system.ping')
    const windows = [result.name || 'Windows', result.osVersion].filter(Boolean).join(' ')
    return { version: result.version, connected: result.connected, distro: windows, build: result.build, architecture: result.architecture }
  }
  async distroLogo(): Promise<string> { return '' }
  async packageManagerName(): Promise<string> {
    const version = await this.transport.request<string>('software.version')
    return `WinGet ${version}`
  }
  async communityLayerName(): Promise<string> { return 'indisponível' }
  async diskUsage(): Promise<{ used: string; total: string; percent: number }> {
    return this.transport.request('system.diskUsage')
  }
  async hardwareInventory(): Promise<HardwareInventory> { return this.transport.request('hardware.inventory') }
  async hardwareFirmwareStatus(): Promise<string> { return this.transport.request('hardware.firmwareStatus') }
  async systemMetrics(): Promise<SystemMetrics> { return this.transport.request('monitor.metrics') }
  async listProcesses(): Promise<ProcessInfo[]> { return this.transport.request('monitor.processes') }
  async killProcess(pid: number): Promise<void> {
    if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 0xffffffff) throw new SystemClientError('EXTERNAL_FAILURE', 'PID inválido.')
    await this.transport.request('process.kill', { pid })
  }
  async listStorageVolumes(): Promise<StorageVolumeInfo[]> { return this.transport.request('storage.volumes') }
  async search(query: string): Promise<PackageRef[]> { return this.transport.request('software.search', { query }) }
  async listInstalled(): Promise<PackageRef[]> { return this.transport.request('software.installed') }
  async listUpdates(): Promise<PackageRef[]> { return this.transport.request('software.updates') }
  async getPackageDetails(origin: string, id: string): Promise<PackageDetails> {
    return this.transport.request('software.details', { origin, id })
  }
  async install(origin: string, id: string, options: SoftwareInstallOptions = {}): Promise<number> {
    return this.startTransaction('software.install', { origin, id, scope: options.scope || '', acceptAgreements: options.acceptAgreements === true })
  }
  async remove(origin: string, id: string): Promise<number> {
    return this.startTransaction('software.remove', { origin, id })
  }
  async updateAll(): Promise<number> { return this.startTransaction('software.updateAll') }
  async listManagedServices(): Promise<ManagedServiceInfo[]> { return this.transport.request('services.list') }
  async listAllManagedServices(): Promise<ManagedServiceInfo[]> { return this.transport.request('services.listAll') }
  async setServiceEnabled(name: string, enabled: boolean): Promise<void> {
    await this.transport.request(enabled ? 'services.enable' : 'services.disable', { name }, undefined, 120_000)
  }
  async setServiceRunning(name: string, running: boolean): Promise<void> {
    await this.transport.request(running ? 'services.start' : 'services.stop', { name }, undefined, 120_000)
  }
  async restartService(name: string): Promise<void> {
    await this.transport.request('services.restart', { name }, undefined, 120_000)
  }
  async listLogUnits(): Promise<string[]> { return this.transport.request('eventlog.channels', {}, undefined, 20_000) }
  async queryLogs(unit: string, priority: string, since: string, search: string, maxLines: number): Promise<string[]> {
    const events = await this.transport.request<Array<{ timestamp: string; provider: string; eventId: number; level: string; message: string }>>(
      'eventlog.query', { channel: unit || 'System', priority, since, search, limit: maxLines }, undefined, 20_000
    )
    return events.map((event) => `${event.timestamp} [${event.level || 'Nível desconhecido'}] ${event.provider} · ID ${event.eventId}\n${event.message || '[mensagem localizada indisponível]'}`)
  }
  async listNetworkInterfaces(): Promise<NetworkInterfaceInfo[]> { return this.transport.request('network.interfaces') }
  async listWifi(): Promise<WifiNetworkInfo[]> { return this.transport.request('network.wifi') }
  async connectWifi(ssid: string, password: string): Promise<void> {
    await this.transport.request('network.wifiConnect', { ssid, password }, undefined, 60_000)
  }
  async disconnectNetwork(device: string): Promise<void> {
    await this.transport.request('network.wifiDisconnect', { device }, undefined, 60_000)
  }
  async getProxy(): Promise<ProxyConfig> { return this.transport.request('network.proxy') }
  async setProxy(config: ProxyConfig): Promise<void> { await this.transport.request('network.proxySet', { ...config }) }
  async setStaticIPv4(connection: string, address: string, gateway: string, dns: string): Promise<void> {
    await this.transport.request('network.staticIPv4', { interface: connection, address, gateway, dns }, undefined, 120_000)
  }
  private async firewall(): Promise<{
    profiles: Array<{ name: string; enabled: boolean; readOnly: boolean }>
    rules: FirewallServiceInfo[]
  }> { return this.transport.request('network.firewall') }
  async firewallStatus(): Promise<{ enabled: boolean; activeZone: string }> {
    const { profiles } = await this.firewall()
    const enabled = profiles.filter((profile) => profile.enabled)
    return { enabled: enabled.length > 0, activeZone: enabled.map((profile) => profile.name).join(', ') || 'nenhum perfil' }
  }
  async firewallListServices(): Promise<FirewallServiceInfo[]> { return (await this.firewall()).rules }
  async firewallSetServiceEnabled(name: string, enabled: boolean): Promise<void> {
    await this.transport.request('network.firewallRuleSet', { name, enabled }, undefined, 120_000)
  }
  async firewallCreateRule(spec: FirewallRuleSpec): Promise<void> {
    await this.transport.request('network.firewallRuleCreate', { ...spec }, undefined, 120_000)
  }
  async listUsers(): Promise<UserInfo[]> { return this.transport.request('accounts.list') }
  async createUser(username: string, isAdmin: boolean, password = ''): Promise<void> {
    await this.transport.request('accounts.create', { username, isAdmin, password }, undefined, 120_000)
  }
  async removeUser(username: string, removeProfile = false): Promise<void> {
    await this.transport.request('accounts.remove', { username, removeProfile }, undefined, 120_000)
  }
  async setAdmin(username: string, isAdmin: boolean): Promise<void> {
    await this.transport.request('accounts.setAdmin', { username, isAdmin }, undefined, 120_000)
  }
  async dateTimeStatus(): Promise<DateTimeStatus> { return this.transport.request('regional.status') }
  async listTimezones(): Promise<string[]> { return this.transport.request('regional.timezones') }
  async listLocales(): Promise<string[]> { return [(await this.dateTimeStatus()).locale] }
  async listKeymaps(): Promise<string[]> { return [(await this.dateTimeStatus()).keymap] }
  async applyDateTimeLocale(timezone: string, ntp: boolean, _locale: string, _keymap: string): Promise<void> {
    await this.transport.request('regional.apply', { timezone, ntp }, undefined, 120_000)
  }
  async bluetoothStatus(): Promise<BluetoothStatus> { return this.transport.request('bluetooth.status') }
  async listBluetoothDevices(): Promise<BluetoothDeviceInfo[]> {
    if (this.scannedBluetoothDevices) {
      const rows = this.scannedBluetoothDevices
      this.scannedBluetoothDevices = null
      return rows
    }
    return this.transport.request('bluetooth.devices', { scan: false }, undefined, 30_000)
  }
  async setBluetoothScanning(scanning: boolean): Promise<void> {
    if (!scanning) return
    this.scannedBluetoothDevices = await this.transport.request('bluetooth.devices', { scan: true }, undefined, 30_000)
  }
  async pairBluetoothDevice(address: string): Promise<void> {
    await this.transport.request('bluetooth.pair', { address }, undefined, 120_000)
  }
  async removeBluetoothDevice(address: string): Promise<void> {
    await this.transport.request('bluetooth.remove', { address }, undefined, 30_000)
  }
  async setBluetoothPowered(_powered: boolean): Promise<void> { await openBluetoothSettings() }
  async setBluetoothDiscoverable(_discoverable: boolean): Promise<void> { await openBluetoothSettings() }
  async setBluetoothPairable(_pairable: boolean): Promise<void> { await openBluetoothSettings() }
  async trustBluetoothDevice(_address: string, _trusted: boolean): Promise<void> { await openBluetoothSettings() }
  async connectBluetoothDevice(_address: string): Promise<void> { await openBluetoothSettings() }
  async disconnectBluetoothDevice(_address: string): Promise<void> { await openBluetoothSettings() }
  async sendBluetoothFile(_address: string, path: string): Promise<void> {
    if (!(await stat(path)).isFile()) throw new SystemClientError('EXTERNAL_FAILURE', 'Selecione um arquivo local válido.')
    spawn('fsquirt.exe', [], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
  }
  async startBluetoothFileReceiver(directory: string): Promise<void> {
    if (!(await stat(directory)).isDirectory()) throw new SystemClientError('EXTERNAL_FAILURE', 'Selecione uma pasta local válida.')
    spawn('fsquirt.exe', [], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
  }
  async listDisplays(): Promise<DisplayOutputInfo[]> { return this.transport.request('display.list') }
  async applyDisplayConfig(config: DisplayConfig): Promise<DisplayApplyResult> {
    return this.transport.request('display.apply', { ...config }, undefined, 30_000)
  }
  async confirmDisplayConfig(token: string): Promise<void> { await this.transport.request('display.confirm', { token }) }
  async revertDisplayConfig(token: string): Promise<void> { await this.transport.request('display.revert', { token }) }
  async listBackupConfigs(): Promise<BackupConfig[]> { return this.transport.request('backup.configs') }
  async createBackupConfig(config: BackupConfig): Promise<string> {
    return this.transport.request('backup.create', { ...config }, undefined, 30 * 60_000)
  }
  async listBackupSnapshots(configId: string): Promise<BackupSnapshotInfo[]> {
    return this.transport.request('backup.snapshots', { configId }, undefined, 5 * 60_000)
  }
  async listBackupSnapshotPaths(configId: string, snapshotId: string): Promise<string[]> {
    return this.transport.request('backup.paths', { configId, snapshotId }, undefined, 5 * 60_000)
  }
  async runBackupNow(configId: string): Promise<number> {
    return this.startBackupTransaction('backup.run', { id: configId })
  }
  async restoreBackupSnapshot(snapshotId: string, targetPath: string, mode: string): Promise<number> {
    return this.startBackupTransaction('backup.restore', { snapshotId, targetPath, mode, paths: [] })
  }
  async restoreBackupItems(snapshotId: string, targetPath: string, mode: string, paths: string[]): Promise<number> {
    return this.startBackupTransaction('backup.restore', { snapshotId, targetPath, mode, paths })
  }
  async deleteBackupConfig(configId: string): Promise<void> {
    await this.transport.request('backup.delete', { id: configId }, undefined, 120_000)
  }

  private async startBackupTransaction(operation: string, params: Record<string, unknown>): Promise<number> {
    const transactionId = ++this.transactionId
    void this.transport.request<{ message?: string }>(
      operation,
      params,
      (progress) => this.emit('backup-transaction-progress', { transactionId, ...progress }),
      12 * 60 * 60_000
    ).then((result) => {
      this.emit('backup-transaction-finished', { transactionId, success: true, message: result.message || 'Operação concluída.' })
    }).catch((error: Error) => {
      this.emit('backup-transaction-finished', { transactionId, success: false, message: error.message })
    })
    return transactionId
  }

  private async startTransaction(operation: string, params: Record<string, unknown> = {}): Promise<number> {
    const transactionId = ++this.transactionId
    void this.transport.request<{ rebootRequired?: boolean; message?: string }>(
      operation,
      params,
      (progress) => this.emit('transaction-progress', { transactionId, ...progress }),
      30 * 60_000
    ).then((result) => {
      this.emit('transaction-finished', { transactionId, success: true, message: result.message || 'Operação concluída.' })
    }).catch((error: Error) => {
      this.emit('transaction-finished', { transactionId, success: false, message: error.message })
    })
    return transactionId
  }
}

export function createWindowsSystemClient(): SystemClient {
  const client = new WindowsSystemClientBase()
  // The proxy supplies a stable UNSUPPORTED implementation for every
  // operation not implemented by the current Windows capability set.
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (typeof value === 'function') return value.bind(target)
      if (value !== undefined || typeof property !== 'string') return value
      return async () => { throw new SystemClientError('UNSUPPORTED', `Operação ainda não disponível no Windows: ${property}`) }
    }
  }) as unknown as SystemClient
}
