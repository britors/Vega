import type { VegaApi } from '../../preload'

const noop = (): (() => void) => () => {}

export function installDemoVegaApi(): void {
  if (window.vega) return

  const api: VegaApi = {
    ping: async () => ({ version: 'demo', connected: false, distro: 'Lyra OS (demo)' }),
    distroLogo: async () => '',
    packageManagerName: async () => 'Pacman (demo)',
    communityLayerName: async () => 'AUR (demo)',
    diskUsage: async () => ({ used: '126G', total: '476G', percent: 27 }),
    search: async (query: string) => [
      {
        origin: 'official',
        id: 'firefox',
        name: 'Firefox',
        description: `Exemplo de busca para "${query}"`,
        installed: false,
        icon: ''
      }
    ],
    listUpdates: async () => [],
    listInstalled: async () => [
      {
        origin: 'official',
        id: 'firefox',
        name: 'Firefox',
        description: 'Navegador web instalado',
        installed: true,
        icon: ''
      },
      {
        origin: 'flathub',
        id: 'org.gimp.GIMP',
        name: 'GIMP',
        description: '',
        installed: true,
        icon: ''
      }
    ],
    getPackageDetails: async (origin: string, id: string) => ({
      origin,
      id,
      name: id === 'firefox' ? 'Firefox' : id,
      description: 'Descrição completa de exemplo, como apareceria no painel de detalhe.',
      installed: false,
      installedVersion: '',
      availableVersion: '152.0.5-1',
      downloadSize: '81,81 MiB',
      installedSize: '286,44 MiB',
      dependencies: ['glibc', 'gtk3', 'dbus'],
      licenses: ['MPL-2.0'],
      url: 'https://www.mozilla.org/firefox/',
      maintainer: ''
    }),
    install: async () => 1,
    getAurPkgbuild: async () => '# demo\npkgname=exemplo\npkgver=1.0.0',
    remove: async () => 2,
    updateAll: async () => 3,
    clearCache: async () => 4,
    optimizeMirrors: async () => 6,
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
    listManagedServices: async () => [
      { name: 'sshd.service', label: 'Acesso remoto', description: 'Servidor SSH', enabled: false, active: false, available: true },
      { name: 'bluetooth.service', label: 'Bluetooth', description: 'Gerenciador do Bluetooth', enabled: true, active: true, available: true }
    ],
    listAllManagedServices: async () => [
      { name: 'NetworkManager.service', label: 'NetworkManager', description: 'Network Manager', enabled: true, active: true, available: true },
      { name: 'bluetooth.service', label: 'bluetooth', description: 'Bluetooth service', enabled: true, active: true, available: true },
      { name: 'sshd.service', label: 'sshd', description: 'OpenSSH server daemon', enabled: false, active: false, available: true }
    ],
    setServiceEnabled: async () => {},
    setServiceRunning: async () => {},
    restartService: async () => {},
    queryLogs: async (unit: string) => [
      '2026-07-10T10:00:00-03:00 demo systemd[1]: Exemplo de linha de log.',
      `2026-07-10T10:00:01-03:00 demo ${unit || 'vegad'}[1234]: Outra linha de exemplo.`
    ],
    listLogUnits: async () => ['vegad.service', 'NetworkManager.service', 'sshd.service'],
    createBackupConfig: async () => 'home',
    runBackupNow: async () => 1,
    listBackupSnapshots: async () => [
      { id: 'a1b2c3', timestamp: Math.floor(Date.now() / 1000) - 7200, fileCount: 124, sizeBytes: 15_728_640 }
    ],
    listBackupSnapshotPaths: async () => ['~/Documentos', '~/Imagens', '~/Vídeos'],
    restoreBackupSnapshot: async () => 1,
    restoreBackupItems: async () => 2,
    deleteBackupConfig: async () => {},
    hardwareInventory: async () => ({ cpu: 'CPU de demonstração', gpu: 'GPU de demonstração', ramText: '16 GiB' }),
    hardwareFirmwareStatus: async () => 'Nenhuma atualização de firmware disponível (demo).',
    switchNvidiaDriver: async () => {},
    kernelListInstalled: async () => ['linux', 'linux-lts'],
    kernelAvailablePackages: async () => ['linux', 'linux-lts', 'linux-zen'],
    kernelInstall: async () => 5,
    kernelRemove: async () => {},
    bootStatus: async () => ({ loader: 'grub', defaultEntry: '0', timeout: 5, cmdline: 'quiet splash' }),
    listBootEntries: async () => ['0', 'Lyra OS', 'Lyra OS fallback'],
    applyBootConfig: async () => {},
    firewallStatus: async () => ({ enabled: false, activeZone: 'demo' }),
    firewallListServices: async () => [{ name: 'ssh', label: 'SSH', enabled: false }],
    firewallSetServiceEnabled: async () => {},
    dateTimeStatus: async () => ({ timezone: 'America/Sao_Paulo', ntp: true, locale: 'pt_BR.UTF-8', keymap: 'br' }),
    listTimezones: async () => ['America/Sao_Paulo', 'UTC', 'Europe/Lisbon'],
    listLocales: async () => ['pt_BR.UTF-8', 'en_US.UTF-8'],
    listKeymaps: async () => ['br', 'us', 'pt'],
    applyDateTimeLocale: async () => {},
    listNetworkInterfaces: async () => [
      {
        name: 'Conexão cabeada',
        type: 'ethernet',
        state: 'connected',
        ipv4: '192.168.1.20/24',
        ipv6: '',
        gateway: '192.168.1.1',
        dns: '1.1.1.1',
        mac: '00:11:22:33:44:55',
        speed: '1000 Mb/s',
        ssid: '',
        signal: 0,
        device: 'enp3s0',
        autoconf: true
      }
    ],
    listWifi: async () => [{ ssid: 'Lyra', security: 'WPA2', signal: 88, active: false, device: 'wlan0' }],
    connectWifi: async () => {},
    disconnectNetwork: async () => {},
    setStaticIPv4: async () => {},
    importVPN: async () => {},
    getProxy: async () => ({ http: '', https: '', socks: '', no: 'localhost,127.0.0.1' }),
    setProxy: async () => {},
    bluetoothStatus: async () => ({
      available: true,
      powered: true,
      discoverable: false,
      pairable: true,
      scanning: false,
      controller: '00:11:22:33:44:55',
      controllerName: 'Adaptador Bluetooth demo',
      transferAvailable: true,
      receiverActive: false,
      receivePath: ''
    }),
    listBluetoothDevices: async () => [
      {
        address: 'AA:BB:CC:DD:EE:FF',
        name: 'Fone demo',
        alias: 'Fone demo',
        icon: 'audio-headset',
        paired: true,
        trusted: true,
        connected: false,
        blocked: false,
        rssi: -52
      }
    ],
    setBluetoothPowered: async () => {},
    setBluetoothDiscoverable: async () => {},
    setBluetoothPairable: async () => {},
    setBluetoothScanning: async () => {},
    pairBluetoothDevice: async () => {},
    trustBluetoothDevice: async () => {},
    connectBluetoothDevice: async () => {},
    disconnectBluetoothDevice: async () => {},
    removeBluetoothDevice: async () => {},
    sendBluetoothFile: async () => {},
    startBluetoothFileReceiver: async () => {},
    chooseBluetoothFile: async () => '',
    chooseBluetoothReceiveDirectory: async () => '',
    listDisplays: async () => [
      {
        name: 'eDP-1',
        connected: true,
        primary: true,
        enabled: true,
        width: 1920,
        height: 1080,
        x: 0,
        y: 0,
        currentMode: '1920x1080@60',
        modes: [
          { id: '1920x1080@60', width: 1920, height: 1080, refreshRate: 60, current: true, preferred: true },
          { id: '1280x720@60', width: 1280, height: 720, refreshRate: 60, current: false, preferred: false }
        ]
      }
    ],
    applyDisplayConfig: async () => {},
    listWallpapers: async () => [
      {
        id: 'demo-wallpaper',
        name: 'Wallpaper demo',
        path: '/usr/share/backgrounds/demo.jpg',
        uri: '',
        source: 'Demo'
      }
    ],
    applyWallpaper: async () => 'Demo',
    listStorageVolumes: async () => [
      {
        name: 'nvme0n1p2',
        path: '/dev/nvme0n1p2',
        type: 'part',
        fsType: 'btrfs',
        size: '476G',
        used: '126G',
        avail: '350G',
        usePercent: 27,
        mountpoint: '/',
        model: 'NVMe demo',
        removable: false,
        canMount: false,
        canUnmount: false
      }
    ],
    mountVolume: async () => {},
    unmountVolume: async () => {},
    systemMetrics: async () => ({
      cpuPercent: 18,
      memUsed: 6_442_450_944,
      memTotal: 17_179_869_184,
      swapUsed: 536_870_912,
      swapTotal: 8_589_934_592,
      diskReadBytes: 12_000_000,
      diskWriteBytes: 18_000_000,
      netRxBytes: 80_000_000,
      netTxBytes: 12_000_000
    }),
    listProcesses: async () => [
      { pid: 1200, name: 'vega', user: 'demo', cpuPercent: 2.1, memory: 180_000_000, state: 'S (sleeping)' },
      { pid: 1, name: 'systemd', user: 'root', cpuPercent: 0.1, memory: 24_000_000, state: 'S (sleeping)' }
    ],
    killProcess: async () => {},
    listUsers: async () => [{ username: 'demo', isAdmin: true }],
    createUser: async () => {},
    removeUser: async () => {},
    setAdmin: async () => {},
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
