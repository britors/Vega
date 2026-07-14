import type { MessageBus, ClientInterface } from 'dbus-next'
import { EventEmitter } from 'node:events'
import { release } from 'node:os'
import type { SystemClient } from './system/systemClient'
import type {
  BackupAlertEvent, BackupConfig, BackupSnapshotInfo, BackupTransactionFinished, BackupTransactionProgress,
  BluetoothDeviceInfo, BluetoothStatus, BootStatus, DateTimeStatus, FirewallServiceInfo, HardwareInventory,
  ManagedServiceInfo, NetworkInterfaceInfo, PackageDetails, PackageRef, ProcessInfo, ProxyConfig, SnapshotInfo,
  StorageVolumeInfo, SystemCapabilities, SystemMetrics, SystemModule, TransactionFinished, TransactionProgress,
  UpdatesAvailableEvent, UserInfo, VegaSystemInfo, WifiNetworkInfo
} from './system/types'

const SERVICE_NAME = 'org.lyraos.Vega1'
const OBJECT_PATH = '/org/lyraos/Vega1'

/**
 * Thin wrapper around the system D-Bus connection to vegad.
 * Every privileged action goes through this client — the renderer never
 * talks to D-Bus directly (see src/preload for the exposed surface).
 *
 * Emits `transaction-progress` / `transaction-finished` forwarding the
 * Software interface's D-Bus signals, so the main process can relay them to
 * the renderer instead of polling.
 */
export class LinuxSystemClient extends EventEmitter implements SystemClient {
  private bus: MessageBus | null = null
  private softwareIface: ClientInterface | null = null
  private backupIface: ClientInterface | null = null

  async connect(): Promise<void> {
    const { systemBus } = await import('dbus-next')
    const bus = systemBus()
    this.bus = bus

    // systemBus() returns before the handshake completes — calling methods
    // immediately after used to race the connection and always report
    // "disconnected" on the first ping. Wait for the real signal (bounded,
    // so a genuinely absent bus doesn't hang startup).
    await new Promise<void>((resolve) => {
      const finish = (): void => resolve()
      const timeout = setTimeout(finish, 3000)
      bus.once('connect', () => {
        clearTimeout(timeout)
        finish()
      })
      bus.once('error', (err: Error) => {
        clearTimeout(timeout)
        console.warn('vegad bus connection error:', err.message)
        finish()
      })
    })

    try {
      this.softwareIface = await this.getInterface('Software')
      this.softwareIface.on('TransactionProgress', (transactionId: number, percent: number, message: string) => {
        this.emit('transaction-progress', { transactionId, percent, message } satisfies TransactionProgress)
      })
      this.softwareIface.on(
        'TransactionFinished',
        (transactionId: number, success: boolean, message: string) => {
          this.emit('transaction-finished', { transactionId, success, message } satisfies TransactionFinished)
        }
      )
      this.softwareIface.on('UpdatesAvailable', (count: number) => {
        this.emit('updates-available', { count } satisfies UpdatesAvailableEvent)
      })
    } catch (err) {
      console.warn('vegad Software interface unavailable:', (err as Error).message)
    }

    try {
      this.backupIface = await this.getInterface('Backup')
      this.backupIface.on('BackupProgress', (transactionId: number, percent: number, message: string) => {
        this.emit('backup-transaction-progress', {
          transactionId,
          percent,
          message
        } satisfies BackupTransactionProgress)
      })
      this.backupIface.on('BackupFinished', (transactionId: number, success: boolean, message: string) => {
        this.emit('backup-transaction-finished', {
          transactionId,
          success,
          message
        } satisfies BackupTransactionFinished)
      })
      this.backupIface.on('RestoreProgress', (transactionId: number, percent: number, message: string) => {
        this.emit('backup-transaction-progress', {
          transactionId,
          percent,
          message
        } satisfies BackupTransactionProgress)
      })
      this.backupIface.on('RestoreFinished', (transactionId: number, success: boolean, message: string) => {
        this.emit('backup-transaction-finished', {
          transactionId,
          success,
          message
        } satisfies BackupTransactionFinished)
      })
      this.backupIface.on('BackupAlert', (configId: string, consecutiveFailures: number, message: string) => {
        this.emit('backup-alert', {
          configId,
          consecutiveFailures,
          message
        } satisfies BackupAlertEvent)
      })
    } catch (err) {
      console.warn('vegad Backup interface unavailable:', (err as Error).message)
    }
  }

  async getCapabilities(): Promise<SystemCapabilities> {
    const status = await this.ping()
    const modules: SystemModule[] = [
      'dashboard', 'assistant', 'software', 'backup', 'hardware', 'kernel', 'network',
      'datetime', 'storage', 'monitor', 'users', 'services', 'logs', 'about'
    ]
    // Snapshots only works against snapper (see vegad/internal/dbusserver/
    // snapshots.go) — hide the module rather than show a menu entry that
    // always errors on distros without it.
    if (await this.snapshotsAvailable()) {
      modules.splice(3, 0, 'snapshots')
    }
    return {
      platform: 'linux',
      platformVersion: release(),
      backendVersion: status.version,
      protocolVersion: 1,
      modules,
      readOperations: [
        'ping', 'distroLogo', 'packageManagerName', 'communityLayerName', 'diskUsage', 'search', 'listUpdates',
        'listInstalled', 'getPackageDetails', 'getAurPkgbuild', 'listSnapshots', 'diffPackages',
        'listBackupConfigs', 'listBackupSnapshots', 'listBackupSnapshotPaths', 'hardwareInventory',
        'hardwareFirmwareStatus', 'kernelListInstalled', 'kernelAvailablePackages', 'bootStatus', 'listBootEntries',
        'firewallStatus', 'firewallListServices', 'dateTimeStatus', 'listTimezones', 'listLocales', 'listKeymaps',
        'listNetworkInterfaces', 'listWifi', 'getProxy', 'bluetoothStatus', 'listBluetoothDevices',
        'listStorageVolumes', 'systemMetrics', 'listProcesses', 'listUsers', 'listManagedServices',
        'listAllManagedServices', 'queryLogs', 'listLogUnits'
      ],
      mutations: [
        'install', 'remove', 'updateAll', 'clearCache', 'optimizeMirrors', 'createSnapshot', 'rollbackSnapshot',
        'deleteSnapshot', 'setRetentionPolicy', 'createBackupConfig', 'runBackupNow', 'restoreBackupSnapshot',
        'restoreBackupItems', 'deleteBackupConfig', 'switchNvidiaDriver', 'kernelInstall', 'kernelRemove',
        'applyBootConfig', 'firewallSetServiceEnabled', 'applyDateTimeLocale', 'connectWifi', 'disconnectNetwork',
        'setStaticIPv4', 'importVPN', 'setProxy', 'setBluetoothPowered', 'setBluetoothDiscoverable',
        'setBluetoothPairable', 'setBluetoothScanning', 'pairBluetoothDevice', 'trustBluetoothDevice',
        'connectBluetoothDevice', 'disconnectBluetoothDevice', 'removeBluetoothDevice', 'sendBluetoothFile',
        'startBluetoothFileReceiver', 'mountVolume', 'unmountVolume', 'killProcess', 'createUser', 'removeUser',
        'setAdmin', 'setServiceEnabled', 'setServiceRunning', 'restartService'
      ],
      elevatedMutations: [
        'install', 'remove', 'updateAll', 'clearCache', 'optimizeMirrors', 'createSnapshot', 'rollbackSnapshot',
        'deleteSnapshot', 'setRetentionPolicy', 'createBackupConfig', 'runBackupNow', 'restoreBackupSnapshot',
        'restoreBackupItems', 'deleteBackupConfig', 'switchNvidiaDriver', 'kernelInstall', 'kernelRemove',
        'applyBootConfig', 'firewallSetServiceEnabled', 'applyDateTimeLocale', 'connectWifi', 'disconnectNetwork',
        'setStaticIPv4', 'importVPN', 'setProxy', 'setBluetoothPowered', 'setBluetoothDiscoverable',
        'setBluetoothPairable', 'setBluetoothScanning', 'pairBluetoothDevice', 'trustBluetoothDevice',
        'connectBluetoothDevice', 'disconnectBluetoothDevice', 'removeBluetoothDevice', 'sendBluetoothFile',
        'startBluetoothFileReceiver', 'mountVolume', 'unmountVolume', 'killProcess', 'createUser', 'removeUser',
        'setAdmin', 'setServiceEnabled', 'setServiceRunning', 'restartService'
      ],
      missingDependencies: []
    }
  }

  private async getInterface(name: string): Promise<ClientInterface> {
    if (!this.bus) throw new Error('LinuxSystemClient not connected')
    const obj = await this.bus.getProxyObject(SERVICE_NAME, OBJECT_PATH)
    return obj.getInterface(`${SERVICE_NAME}.${name}`)
  }

  private async software(): Promise<ClientInterface> {
    if (this.softwareIface) return this.softwareIface
    return this.getInterface('Software')
  }

  async ping(): Promise<VegaSystemInfo> {
    try {
      const iface = await this.getInterface('System')
      const version: string = await iface.Version()
      const distro: string = await iface.Distro()
      return { version, connected: true, distro }
    } catch (err) {
      // vegad not installed/running yet in this dev environment — surface
      // a disconnected state instead of crashing the UI.
      console.warn('vegad unreachable:', (err as Error).message)
      return { version: 'unknown', connected: false, distro: 'desconhecida' }
    }
  }

  async packageManagerName(): Promise<string> {
    const iface = await this.getInterface('Software')
    return iface.PackageManagerName()
  }

  async communityLayerName(): Promise<string> {
    const iface = await this.getInterface('Software')
    return iface.CommunityLayerName()
  }

  async distroLogo(): Promise<string> {
    const iface = await this.getInterface('System')
    return iface.Logo()
  }

  async diskUsage(): Promise<{ used: string; total: string; percent: number }> {
    const iface = await this.getInterface('System')
    const [used, total, percent]: [string, string, number] = await iface.DiskUsage()
    return { used, total, percent }
  }

  async search(query: string): Promise<PackageRef[]> {
    const iface = await this.software()
    const rows: [string, string, string, string, boolean, string][] = await iface.Search(query)
    return rows.map(([origin, id, name, description, installed, icon]) => ({
      origin,
      id,
      name,
      description,
      installed,
      icon
    }))
  }

  async listRepos(): Promise<string[]> {
    const iface = await this.software()
    return iface.ListRepos()
  }

  async listUpdates(): Promise<PackageRef[]> {
    const iface = await this.software()
    const rows: [string, string, string, string, boolean, string][] = await iface.ListUpdates()
    return rows.map(([origin, id, name, description, installed, icon]) => ({
      origin,
      id,
      name,
      description,
      installed,
      icon
    }))
  }

  async listInstalled(): Promise<PackageRef[]> {
    const iface = await this.software()
    const rows: [string, string, string, string, boolean, string][] = await iface.ListInstalled()
    return rows.map(([origin, id, name, description, installed, icon]) => ({
      origin,
      id,
      name,
      description,
      installed,
      icon
    }))
  }

  async getPackageDetails(origin: string, id: string): Promise<PackageDetails> {
    const iface = await this.software()
    const [
      detOrigin,
      detId,
      name,
      description,
      installed,
      installedVersion,
      availableVersion,
      downloadSize,
      installedSize,
      dependencies,
      licenses,
      url,
      maintainer
    ]: [string, string, string, string, boolean, string, string, string, string, string[], string[], string, string] =
      await iface.GetPackageDetails(origin, id)
    return {
      origin: detOrigin,
      id: detId,
      name,
      description,
      installed,
      installedVersion,
      availableVersion,
      downloadSize,
      installedSize,
      dependencies,
      licenses,
      url,
      maintainer
    }
  }

  async install(origin: string, id: string): Promise<number> {
    const iface = await this.software()
    return iface.Install(origin, id)
  }

  async getAurPkgbuild(id: string): Promise<string> {
    const iface = await this.software()
    return iface.GetAurPkgbuild(id)
  }

  async remove(origin: string, id: string): Promise<number> {
    const iface = await this.software()
    return iface.Remove(origin, id)
  }

  async updateAll(): Promise<number> {
    const iface = await this.software()
    return iface.UpdateAll()
  }

  async clearCache(): Promise<number> {
    const iface = await this.software()
    return iface.ClearCache()
  }

  async optimizeMirrors(): Promise<number> {
    const iface = await this.software()
    return iface.OptimizeMirrors()
  }

  private async snapshotsAvailable(): Promise<boolean> {
    try {
      const iface = await this.getInterface('Snapshots')
      return await iface.Available()
    } catch (err) {
      console.warn('vegad Snapshots.Available check failed:', (err as Error).message)
      return false
    }
  }

  async listSnapshots(): Promise<SnapshotInfo[]> {
    const iface = await this.getInterface('Snapshots')
    // timestamp is D-Bus type 'x' (int64) — dbus-next hands those back as
    // BigInt, not number, regardless of this array's declared type.
    const rows: [number, bigint, string, string][] = await iface.ListSnapshots()
    return rows.map(([id, timestamp, trigger, description]) => ({
      id,
      timestamp: Number(timestamp),
      trigger,
      description
    }))
  }

  async createSnapshot(description: string): Promise<number> {
    const iface = await this.getInterface('Snapshots')
    return iface.CreateSnapshot(description)
  }

  async diffPackages(snapshotId: number): Promise<string[]> {
    const iface = await this.getInterface('Snapshots')
    return iface.DiffPackages(snapshotId)
  }

  async rollbackSnapshot(snapshotId: number): Promise<void> {
    const iface = await this.getInterface('Snapshots')
    await iface.Rollback(snapshotId)
  }

  async deleteSnapshot(snapshotId: number): Promise<void> {
    const iface = await this.getInterface('Snapshots')
    await iface.DeleteSnapshot(snapshotId)
  }

  async setRetentionPolicy(keepCount: number): Promise<void> {
    const iface = await this.getInterface('Snapshots')
    await iface.SetRetentionPolicy(keepCount)
  }

  async listBackupConfigs(): Promise<BackupConfig[]> {
    const iface = await this.getInterface('Backup')
    const rows: [string, string[], string, string, string][] = await iface.ListConfigs()
    return rows.map(([id, paths, destination, destinationUUID, frequency]) => ({
      id,
      paths,
      destination,
      destinationUUID,
      frequency
    }))
  }

  async createBackupConfig(config: BackupConfig): Promise<string> {
    const iface = await this.getInterface('Backup')
    return iface.CreateConfig([config.id, config.paths, config.destination, config.destinationUUID, config.frequency])
  }

  async runBackupNow(configId: string): Promise<number> {
    const iface = await this.getInterface('Backup')
    return iface.RunBackupNow(configId)
  }

  async listBackupSnapshots(configId: string): Promise<BackupSnapshotInfo[]> {
    const iface = await this.getInterface('Backup')
    // timestamp is D-Bus type 'x' (int64) — dbus-next hands those back as
    // BigInt, not number, regardless of this array's declared type.
    const rows: [string, bigint, bigint, bigint][] = await iface.ListSnapshots(configId)
    return rows.map(([id, timestamp, fileCount, sizeBytes]) => ({
      id,
      timestamp: Number(timestamp),
      fileCount: Number(fileCount),
      sizeBytes: Number(sizeBytes)
    }))
  }

  async listBackupSnapshotPaths(configId: string, snapshotId: string): Promise<string[]> {
    const iface = await this.getInterface('Backup')
    return iface.ListSnapshotPaths(configId, snapshotId)
  }

  async restoreBackupSnapshot(snapshotId: string, targetPath: string, mode: string): Promise<number> {
    const iface = await this.getInterface('Backup')
    return iface.RestoreSnapshot(snapshotId, targetPath, mode)
  }

  async restoreBackupItems(snapshotId: string, targetPath: string, mode: string, paths: string[]): Promise<number> {
    const iface = await this.getInterface('Backup')
    return iface.RestoreItems(snapshotId, targetPath, mode, paths)
  }

  async deleteBackupConfig(configId: string): Promise<void> {
    const iface = await this.getInterface('Backup')
    await iface.DeleteConfig(configId)
  }

  async hardwareInventory(): Promise<HardwareInventory> {
    const iface = await this.getInterface('Hardware')
    const [cpu, gpu, ramText]: [string, string, string] = await iface.Inventory()
    return { cpu, gpu, ramText }
  }

  async hardwareFirmwareStatus(): Promise<string> {
    const iface = await this.getInterface('Hardware')
    return iface.FirmwareStatus()
  }

  async switchNvidiaDriver(driver: string): Promise<void> {
    const iface = await this.getInterface('Hardware')
    await iface.SwitchNvidiaDriver(driver)
  }

  async kernelListInstalled(): Promise<string[]> {
    const iface = await this.getInterface('Kernel')
    return iface.ListInstalled()
  }

  async kernelAvailablePackages(): Promise<string[]> {
    const iface = await this.getInterface('Kernel')
    return iface.AvailablePackages()
  }

  async kernelInstall(kernel: string): Promise<number> {
    const iface = await this.getInterface('Kernel')
    return iface.Install(kernel)
  }

  async kernelRemove(kernel: string): Promise<void> {
    const iface = await this.getInterface('Kernel')
    await iface.Remove(kernel)
  }

  async bootStatus(): Promise<BootStatus> {
    const iface = await this.getInterface('Kernel')
    const [loader, defaultEntry, timeout, cmdline]: [string, string, number, string] = await iface.BootStatus()
    return { loader, defaultEntry, timeout, cmdline }
  }

  async listBootEntries(): Promise<string[]> {
    const iface = await this.getInterface('Kernel')
    return iface.ListBootEntries()
  }

  async applyBootConfig(defaultEntry: string, timeout: number, cmdline: string): Promise<void> {
    const iface = await this.getInterface('Kernel')
    await iface.ApplyBootConfig(defaultEntry, timeout, cmdline)
  }

  async firewallStatus(): Promise<{ enabled: boolean; activeZone: string }> {
    const iface = await this.getInterface('Firewall')
    const [enabled, activeZone]: [boolean, string] = await iface.Status()
    return { enabled, activeZone }
  }

  async firewallListServices(): Promise<FirewallServiceInfo[]> {
    const iface = await this.getInterface('Firewall')
    const rows: [string, string, boolean][] = await iface.ListServices()
    return rows.map(([name, label, enabled]) => ({ name, label, enabled }))
  }

  async firewallSetServiceEnabled(name: string, enabled: boolean): Promise<void> {
    const iface = await this.getInterface('Firewall')
    await iface.SetServiceEnabled(name, enabled)
  }

  async dateTimeStatus(): Promise<DateTimeStatus> {
    const iface = await this.getInterface('DateTime')
    const [timezone, ntp, locale, keymap]: [string, boolean, string, string] = await iface.Status()
    return { timezone, ntp, locale, keymap }
  }

  async listTimezones(): Promise<string[]> {
    const iface = await this.getInterface('DateTime')
    return iface.ListTimezones()
  }

  async listLocales(): Promise<string[]> {
    const iface = await this.getInterface('DateTime')
    return iface.ListLocales()
  }

  async listKeymaps(): Promise<string[]> {
    const iface = await this.getInterface('DateTime')
    return iface.ListKeymaps()
  }

  async applyDateTimeLocale(timezone: string, ntp: boolean, locale: string, keymap: string): Promise<void> {
    const iface = await this.getInterface('DateTime')
    await iface.Apply(timezone, ntp, locale, keymap)
  }

  async listNetworkInterfaces(): Promise<NetworkInterfaceInfo[]> {
    const iface = await this.getInterface('Network')
    const rows: [string, string, string, string, string, string, string, string, string, string, number, string, boolean][] =
      await iface.ListInterfaces()
    return rows.map(([name, type, state, ipv4, ipv6, gateway, dns, mac, speed, ssid, signal, device, autoconf]) => ({
      name,
      type,
      state,
      ipv4,
      ipv6,
      gateway,
      dns,
      mac,
      speed,
      ssid,
      signal,
      device,
      autoconf
    }))
  }

  async listWifi(): Promise<WifiNetworkInfo[]> {
    const iface = await this.getInterface('Network')
    const rows: [string, string, number, boolean, string][] = await iface.ListWifi()
    return rows.map(([ssid, security, signal, active, device]) => ({ ssid, security, signal, active, device }))
  }

  async connectWifi(ssid: string, password: string): Promise<void> {
    const iface = await this.getInterface('Network')
    await iface.ConnectWifi(ssid, password)
  }

  async disconnectNetwork(device: string): Promise<void> {
    const iface = await this.getInterface('Network')
    await iface.Disconnect(device)
  }

  async setStaticIPv4(connection: string, address: string, gateway: string, dns: string): Promise<void> {
    const iface = await this.getInterface('Network')
    await iface.SetStaticIPv4(connection, address, gateway, dns)
  }

  async importVPN(path: string): Promise<void> {
    const iface = await this.getInterface('Network')
    await iface.ImportVPN(path)
  }

  async getProxy(): Promise<ProxyConfig> {
    const iface = await this.getInterface('Network')
    const [http, https, socks, no]: [string, string, string, string] = await iface.GetProxy()
    return { http, https, socks, no }
  }

  async setProxy(config: ProxyConfig): Promise<void> {
    const iface = await this.getInterface('Network')
    await iface.SetProxy(config.http, config.https, config.socks, config.no)
  }

  async bluetoothStatus(): Promise<BluetoothStatus> {
    const iface = await this.getInterface('Bluetooth')
    const [
      available,
      powered,
      discoverable,
      pairable,
      scanning,
      controller,
      controllerName,
      transferAvailable,
      receiverActive,
      receivePath
    ]: [boolean, boolean, boolean, boolean, boolean, string, string, boolean, boolean, string] = await iface.Status()
    return {
      available,
      powered,
      discoverable,
      pairable,
      scanning,
      controller,
      controllerName,
      transferAvailable,
      receiverActive,
      receivePath
    }
  }

  async listBluetoothDevices(): Promise<BluetoothDeviceInfo[]> {
    const iface = await this.getInterface('Bluetooth')
    const rows: [string, string, string, string, boolean, boolean, boolean, boolean, number][] =
      await iface.ListDevices()
    return rows.map(([address, name, alias, icon, paired, trusted, connected, blocked, rssi]) => ({
      address,
      name,
      alias,
      icon,
      paired,
      trusted,
      connected,
      blocked,
      rssi
    }))
  }

  async setBluetoothPowered(powered: boolean): Promise<void> {
    const iface = await this.getInterface('Bluetooth')
    await iface.SetPowered(powered)
  }

  async setBluetoothDiscoverable(discoverable: boolean): Promise<void> {
    const iface = await this.getInterface('Bluetooth')
    await iface.SetDiscoverable(discoverable)
  }

  async setBluetoothPairable(pairable: boolean): Promise<void> {
    const iface = await this.getInterface('Bluetooth')
    await iface.SetPairable(pairable)
  }

  async setBluetoothScanning(scanning: boolean): Promise<void> {
    const iface = await this.getInterface('Bluetooth')
    await iface.SetScanning(scanning)
  }

  async pairBluetoothDevice(address: string): Promise<void> {
    const iface = await this.getInterface('Bluetooth')
    await iface.Pair(address)
  }

  async trustBluetoothDevice(address: string, trusted: boolean): Promise<void> {
    const iface = await this.getInterface('Bluetooth')
    await iface.Trust(address, trusted)
  }

  async connectBluetoothDevice(address: string): Promise<void> {
    const iface = await this.getInterface('Bluetooth')
    await iface.Connect(address)
  }

  async disconnectBluetoothDevice(address: string): Promise<void> {
    const iface = await this.getInterface('Bluetooth')
    await iface.Disconnect(address)
  }

  async removeBluetoothDevice(address: string): Promise<void> {
    const iface = await this.getInterface('Bluetooth')
    await iface.Remove(address)
  }

  async sendBluetoothFile(address: string, path: string): Promise<void> {
    const iface = await this.getInterface('Bluetooth')
    await iface.SendFile(address, path)
  }

  async startBluetoothFileReceiver(directory: string): Promise<void> {
    const iface = await this.getInterface('Bluetooth')
    await iface.StartFileReceiver(directory)
  }

  async listStorageVolumes(): Promise<StorageVolumeInfo[]> {
    const iface = await this.getInterface('Storage')
    const rows: [string, string, string, string, string, string, string, number, string, string, boolean, boolean, boolean][] =
      await iface.ListVolumes()
    return rows.map(([name, path, type, fsType, size, used, avail, usePercent, mountpoint, model, removable, canMount, canUnmount]) => ({
      name,
      path,
      type,
      fsType,
      size,
      used,
      avail,
      usePercent,
      mountpoint,
      model,
      removable,
      canMount,
      canUnmount
    }))
  }

  async mountVolume(path: string): Promise<void> {
    const iface = await this.getInterface('Storage')
    await iface.Mount(path)
  }

  async unmountVolume(path: string): Promise<void> {
    const iface = await this.getInterface('Storage')
    await iface.Unmount(path)
  }

  async systemMetrics(): Promise<SystemMetrics> {
    const iface = await this.getInterface('Monitor')
    const row: [number, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] = await iface.Metrics()
    const [cpuPercent, memUsed, memTotal, swapUsed, swapTotal, diskReadBytes, diskWriteBytes, netRxBytes, netTxBytes] = row
    return {
      cpuPercent,
      memUsed: Number(memUsed),
      memTotal: Number(memTotal),
      swapUsed: Number(swapUsed),
      swapTotal: Number(swapTotal),
      diskReadBytes: Number(diskReadBytes),
      diskWriteBytes: Number(diskWriteBytes),
      netRxBytes: Number(netRxBytes),
      netTxBytes: Number(netTxBytes)
    }
  }

  async listProcesses(): Promise<ProcessInfo[]> {
    const iface = await this.getInterface('Monitor')
    const rows: [number, string, string, number, bigint, string][] = await iface.ListProcesses()
    return rows.map(([pid, name, user, cpuPercent, memory, state]) => ({
      pid,
      name,
      user,
      cpuPercent,
      memory: Number(memory),
      state
    }))
  }

  async killProcess(pid: number): Promise<void> {
    const iface = await this.getInterface('Monitor')
    await iface.KillProcess(pid)
  }

  async listUsers(): Promise<UserInfo[]> {
    const iface = await this.getInterface('Users')
    const rows: [string, boolean][] = await iface.ListUsers()
    return rows.map(([username, isAdmin]) => ({ username, isAdmin }))
  }

  async createUser(username: string, isAdmin: boolean): Promise<void> {
    const iface = await this.getInterface('Users')
    await iface.CreateUser(username, isAdmin)
  }

  async removeUser(username: string): Promise<void> {
    const iface = await this.getInterface('Users')
    await iface.RemoveUser(username)
  }

  async setAdmin(username: string, isAdmin: boolean): Promise<void> {
    const iface = await this.getInterface('Users')
    await iface.SetAdmin(username, isAdmin)
  }

  async listManagedServices(): Promise<ManagedServiceInfo[]> {
    const iface = await this.getInterface('Services')
    const rows: [string, string, string, boolean, boolean, boolean][] = await iface.ListServices()
    return rows.map(([name, label, description, enabled, active, available]) => ({
      name,
      label,
      description,
      enabled,
      active,
      available
    }))
  }

  async listAllManagedServices(): Promise<ManagedServiceInfo[]> {
    const iface = await this.getInterface('Services')
    const rows: [string, string, string, boolean, boolean, boolean][] = await iface.ListAllServices()
    return rows.map(([name, label, description, enabled, active, available]) => ({
      name,
      label,
      description,
      enabled,
      active,
      available
    }))
  }

  async setServiceEnabled(name: string, enabled: boolean): Promise<void> {
    const iface = await this.getInterface('Services')
    await iface.SetServiceEnabled(name, enabled)
  }

  async queryLogs(unit: string, priority: string, since: string, search: string, maxLines: number): Promise<string[]> {
    const iface = await this.getInterface('Logs')
    return iface.Query(unit, priority, since, search, maxLines)
  }

  async listLogUnits(): Promise<string[]> {
    const iface = await this.getInterface('Logs')
    return iface.ListUnits()
  }

  async setServiceRunning(name: string, running: boolean): Promise<void> {
    const iface = await this.getInterface('Services')
    await iface.SetServiceRunning(name, running)
  }

  async restartService(name: string): Promise<void> {
    const iface = await this.getInterface('Services')
    await iface.RestartService(name)
  }

  disconnect(): void {
    this.bus?.disconnect()
    this.bus = null
    this.softwareIface = null
    this.backupIface = null
  }
}
