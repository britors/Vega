import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface ManagedServiceInfo {
  name: string
  label: string
  description: string
  enabled: boolean
  active: boolean
  available: boolean
}

interface BluetoothStatus {
  available: boolean
  powered: boolean
  discoverable: boolean
  pairable: boolean
  scanning: boolean
  controller: string
  controllerName: string
  transferAvailable: boolean
  receiverActive: boolean
  receivePath: string
}

interface BluetoothDeviceInfo {
  address: string
  name: string
  alias: string
  icon: string
  paired: boolean
  trusted: boolean
  connected: boolean
  blocked: boolean
  rssi: number
}

const bluetoothUnit = 'bluetooth.service'

const buttonStyle = {
  padding: '7px 12px',
  borderRadius: 'var(--lyra-radius-sm)',
  border: '1px solid var(--lyra-border)',
  background: 'transparent',
  color: 'var(--lyra-text)',
  cursor: 'pointer'
}

const primaryButtonStyle = {
  ...buttonStyle,
  border: 'none',
  background: 'var(--lyra-gradient)',
  color: '#fff'
}

function deviceName(device: BluetoothDeviceInfo): string {
  return device.alias || device.name || device.address
}

export default function Bluetooth(): JSX.Element {
  const dialogs = useDialogs()
  const [service, setService] = useState<ManagedServiceInfo | null>(null)
  const [status, setStatus] = useState<BluetoothStatus | null>(null)
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [services, nextStatus, nextDevices] = await Promise.all([
        window.vega.listManagedServices(),
        window.vega.bluetoothStatus(),
        window.vega.listBluetoothDevices()
      ])
      setService(services.find((item) => item.name === bluetoothUnit) ?? null)
      setStatus(nextStatus)
      setDevices(nextDevices)
    } catch (err) {
      setError((err as Error).message)
      setService(null)
      setStatus(null)
      setDevices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function runBusy(action: () => Promise<void>): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function setRunning(): Promise<void> {
    if (!service) return
    const ok = await dialogs.confirm({
      title: service.active ? 'Parar Bluetooth' : 'Iniciar Bluetooth',
      message: `${service.active ? 'Parar' : 'Iniciar'} ${bluetoothUnit} agora?`,
      variant: 'warning',
      confirmLabel: service.active ? 'Parar' : 'Iniciar'
    })
    if (ok) await runBusy(() => window.vega.setServiceRunning(bluetoothUnit, !service.active))
  }

  async function setEnabled(): Promise<void> {
    if (!service) return
    const ok = await dialogs.confirm({
      title: service.enabled ? 'Desabilitar Bluetooth' : 'Habilitar Bluetooth',
      message: `${service.enabled ? 'Desabilitar' : 'Habilitar'} o Bluetooth na inicialização?`,
      variant: 'warning',
      confirmLabel: service.enabled ? 'Desabilitar' : 'Habilitar'
    })
    if (ok) await runBusy(() => window.vega.setServiceEnabled(bluetoothUnit, !service.enabled))
  }

  async function removeDevice(device: BluetoothDeviceInfo): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Remover dispositivo',
      message: `Remover ${deviceName(device)} da lista de dispositivos Bluetooth conhecidos?`,
      variant: 'danger',
      confirmLabel: 'Remover'
    })
    if (ok) await runBusy(() => window.vega.removeBluetoothDevice(device.address))
  }

  async function sendFile(device: BluetoothDeviceInfo): Promise<void> {
    const file = await window.vega.chooseBluetoothFile()
    if (!file) return
    await runBusy(() => window.vega.sendBluetoothFile(device.address, file))
  }

  async function startReceiver(): Promise<void> {
    const directory = await window.vega.chooseBluetoothReceiveDirectory()
    if (!directory) return
    await runBusy(() => window.vega.startBluetoothFileReceiver(directory))
  }

  const available = service?.available ?? false
  const active = service?.active ?? false
  const enabled = service?.enabled ?? false
  const adapterReady = Boolean(status?.available && active)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Bluetooth</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Adaptador, descoberta, pareamento, conexão e transferência de arquivos
        </p>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {loading && <EmptyState title="Carregando Bluetooth..." />}

      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Serviço e adaptador</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)', fontSize: '0.84rem' }}>
              {status?.controllerName || status?.controller || 'Nenhum controlador listado'}
            </p>
          </div>
          <button onClick={refresh} disabled={busy} style={buttonStyle}>
            Atualizar
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span className={`status-pill ${active ? 'status-pill--ok' : 'status-pill--warn'}`}>
            {active ? 'serviço ativo' : 'serviço parado'}
          </span>
          <span className={`status-pill ${enabled ? 'status-pill--ok' : 'status-pill--warn'}`}>
            {enabled ? 'inicia com o sistema' : 'inicialização desativada'}
          </span>
          <span className={`status-pill ${status?.powered ? 'status-pill--ok' : 'status-pill--warn'}`}>
            {status?.powered ? 'rádio ligado' : 'rádio desligado'}
          </span>
          <span className={`status-pill ${status?.transferAvailable ? 'status-pill--ok' : 'status-pill--warn'}`}>
            {status?.transferAvailable ? 'OBEX disponível' : 'OBEX indisponível'}
          </span>
          {!available && <span className="status-pill">serviço indisponível</span>}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={setRunning} disabled={busy || !available} style={buttonStyle}>
            {busy ? 'Processando...' : active ? 'Parar serviço' : 'Iniciar serviço'}
          </button>
          <button onClick={setEnabled} disabled={busy || !available} style={buttonStyle}>
            {enabled ? 'Desabilitar inicialização' : 'Habilitar inicialização'}
          </button>
          <button
            onClick={() => runBusy(() => window.vega.setBluetoothPowered(!status?.powered))}
            disabled={busy || !adapterReady}
            style={primaryButtonStyle}
          >
            {status?.powered ? 'Desligar rádio' : 'Ligar rádio'}
          </button>
          <button
            onClick={() => runBusy(() => window.vega.setBluetoothScanning(!status?.scanning))}
            disabled={busy || !adapterReady || !status?.powered}
            style={buttonStyle}
          >
            {status?.scanning ? 'Parar busca' : 'Buscar dispositivos'}
          </button>
          <button
            onClick={() => runBusy(() => window.vega.setBluetoothDiscoverable(!status?.discoverable))}
            disabled={busy || !adapterReady || !status?.powered}
            style={buttonStyle}
          >
            {status?.discoverable ? 'Ocultar este PC' : 'Tornar visível'}
          </button>
          <button
            onClick={() => runBusy(() => window.vega.setBluetoothPairable(!status?.pairable))}
            disabled={busy || !adapterReady || !status?.powered}
            style={buttonStyle}
          >
            {status?.pairable ? 'Bloquear pareamento' : 'Permitir pareamento'}
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Arquivos via Bluetooth</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)', fontSize: '0.84rem' }}>
              {status?.receiverActive ? `Recebendo em ${status.receivePath}` : 'Receptor de arquivos parado'}
            </p>
          </div>
          <button
            onClick={startReceiver}
            disabled={busy || !adapterReady || !status?.transferAvailable}
            style={primaryButtonStyle}
          >
            Receber arquivos
          </button>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Dispositivos</h2>
        {devices.length === 0 ? (
          <EmptyState
            title="Nenhum dispositivo Bluetooth listado"
            message="Ligue o rádio e use Buscar dispositivos para sincronizar a lista local."
          />
        ) : (
          devices.map((device) => (
            <div
              key={device.address}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(180px, 1fr) minmax(180px, 1fr) auto',
                gap: 12,
                alignItems: 'center',
                borderBottom: '1px solid var(--lyra-border)',
                paddingBottom: 10
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{deviceName(device)}</div>
                <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>
                  {device.address} · {device.icon || 'dispositivo'} {device.rssi ? `· RSSI ${device.rssi}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className={`status-pill ${device.connected ? 'status-pill--ok' : ''}`}>
                  {device.connected ? 'conectado' : 'desconectado'}
                </span>
                <span className={`status-pill ${device.paired ? 'status-pill--ok' : 'status-pill--warn'}`}>
                  {device.paired ? 'pareado' : 'não pareado'}
                </span>
                <span className={`status-pill ${device.trusted ? 'status-pill--ok' : ''}`}>
                  {device.trusted ? 'confiável' : 'não confiável'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {!device.paired && (
                  <button onClick={() => runBusy(() => window.vega.pairBluetoothDevice(device.address))} disabled={busy} style={buttonStyle}>
                    Parear
                  </button>
                )}
                <button
                  onClick={() =>
                    runBusy(() =>
                      device.connected
                        ? window.vega.disconnectBluetoothDevice(device.address)
                        : window.vega.connectBluetoothDevice(device.address)
                    )
                  }
                  disabled={busy}
                  style={device.connected ? buttonStyle : primaryButtonStyle}
                >
                  {device.connected ? 'Desconectar' : 'Conectar'}
                </button>
                <button
                  onClick={() => runBusy(() => window.vega.trustBluetoothDevice(device.address, !device.trusted))}
                  disabled={busy}
                  style={buttonStyle}
                >
                  {device.trusted ? 'Desconfiar' : 'Confiar'}
                </button>
                <button
                  onClick={() => sendFile(device)}
                  disabled={busy || !device.paired || !status?.transferAvailable}
                  style={buttonStyle}
                >
                  Enviar arquivo
                </button>
                <button onClick={() => removeDevice(device)} disabled={busy} style={{ ...buttonStyle, color: 'var(--lyra-danger)' }}>
                  Remover
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
