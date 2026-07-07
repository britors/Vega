import { systemBus, type MessageBus, type ClientInterface } from 'dbus-next'
import { EventEmitter } from 'node:events'

const SERVICE_NAME = 'org.lyraos.Vega1'
const OBJECT_PATH = '/org/lyraos/Vega1'

export interface VegaSystemInfo {
  version: string
  connected: boolean
}

export interface PackageRef {
  origin: string
  id: string
  name: string
  description: string
  installed: boolean
}

export interface TransactionProgress {
  transactionId: number
  percent: number
  message: string
}

export interface TransactionFinished {
  transactionId: number
  success: boolean
  message: string
}

export interface SnapshotInfo {
  id: number
  timestamp: number
  trigger: string
  description: string
}

export interface HardwareInventory {
  cpu: string
  gpu: string
  ramText: string
}

export interface FirewallServiceInfo {
  name: string
  label: string
  enabled: boolean
}

export interface UserInfo {
  username: string
  isAdmin: boolean
}

export interface ManagedServiceInfo {
  name: string
  label: string
  description: string
  enabled: boolean
  active: boolean
  available: boolean
}

export interface BackupConfig {
  id: string
  paths: string[]
  destination: string
  frequency: string
}

export interface BackupSnapshotInfo {
  id: string
  timestamp: number
  fileCount: number
  sizeBytes: number
}

/**
 * Thin wrapper around the system D-Bus connection to vegad.
 * Every privileged action goes through this client — the renderer never
 * talks to D-Bus directly (see src/preload for the exposed surface).
 *
 * Emits `transaction-progress` / `transaction-finished` forwarding the
 * Software interface's D-Bus signals, so the main process can relay them to
 * the renderer instead of polling (PROMPT-VEGA.md §2.2).
 */
export class VegaClient extends EventEmitter {
  private bus: MessageBus | null = null
  private softwareIface: ClientInterface | null = null

  async connect(): Promise<void> {
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
    } catch (err) {
      console.warn('vegad Software interface unavailable:', (err as Error).message)
    }
  }

  private async getInterface(name: string): Promise<ClientInterface> {
    if (!this.bus) throw new Error('VegaClient not connected')
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
      return { version, connected: true }
    } catch (err) {
      // vegad not installed/running yet in this dev environment — surface
      // a disconnected state instead of crashing the UI.
      console.warn('vegad unreachable:', (err as Error).message)
      return { version: 'unknown', connected: false }
    }
  }

  async search(query: string): Promise<PackageRef[]> {
    const iface = await this.software()
    const rows: [string, string, string, string, boolean][] = await iface.Search(query)
    return rows.map(([origin, id, name, description, installed]) => ({
      origin,
      id,
      name,
      description,
      installed
    }))
  }

  async listRepos(): Promise<string[]> {
    const iface = await this.software()
    return iface.ListRepos()
  }

  async listUpdates(): Promise<PackageRef[]> {
    const iface = await this.software()
    const rows: [string, string, string, string, boolean][] = await iface.ListUpdates()
    return rows.map(([origin, id, name, description, installed]) => ({
      origin,
      id,
      name,
      description,
      installed
    }))
  }

  async install(origin: string, id: string): Promise<number> {
    const iface = await this.software()
    return iface.Install(origin, id)
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

  async listSnapshots(): Promise<SnapshotInfo[]> {
    const iface = await this.getInterface('Snapshots')
    const rows: [number, number, string, string][] = await iface.ListSnapshots()
    return rows.map(([id, timestamp, trigger, description]) => ({
      id,
      timestamp,
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

  async setRetentionPolicy(keepCount: number): Promise<void> {
    const iface = await this.getInterface('Snapshots')
    await iface.SetRetentionPolicy(keepCount)
  }

  async listBackupConfigs(): Promise<BackupConfig[]> {
    const iface = await this.getInterface('Backup')
    const rows: [string, string[], string, string][] = await iface.ListConfigs()
    return rows.map(([id, paths, destination, frequency]) => ({ id, paths, destination, frequency }))
  }

  async createBackupConfig(config: BackupConfig): Promise<string> {
    const iface = await this.getInterface('Backup')
    return iface.CreateConfig([config.id, config.paths, config.destination, config.frequency])
  }

  async runBackupNow(configId: string): Promise<number> {
    const iface = await this.getInterface('Backup')
    return iface.RunBackupNow(configId)
  }

  async listBackupSnapshots(configId: string): Promise<BackupSnapshotInfo[]> {
    const iface = await this.getInterface('Backup')
    const rows: [string, number, bigint, bigint][] = await iface.ListSnapshots(configId)
    return rows.map(([id, timestamp, fileCount, sizeBytes]) => ({
      id,
      timestamp,
      fileCount: Number(fileCount),
      sizeBytes: Number(sizeBytes)
    }))
  }

  async restoreBackupSnapshot(snapshotId: string, targetPath: string, mode: string): Promise<number> {
    const iface = await this.getInterface('Backup')
    return iface.RestoreSnapshot(snapshotId, targetPath, mode)
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

  async kernelInstall(kernel: string): Promise<number> {
    const iface = await this.getInterface('Kernel')
    return iface.Install(kernel)
  }

  async kernelRemove(kernel: string): Promise<void> {
    const iface = await this.getInterface('Kernel')
    await iface.Remove(kernel)
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

  async setServiceEnabled(name: string, enabled: boolean): Promise<void> {
    const iface = await this.getInterface('Services')
    await iface.SetServiceEnabled(name, enabled)
  }

  async setServiceRunning(name: string, running: boolean): Promise<void> {
    const iface = await this.getInterface('Services')
    await iface.SetServiceRunning(name, running)
  }

  disconnect(): void {
    this.bus?.disconnect()
    this.bus = null
    this.softwareIface = null
  }
}
