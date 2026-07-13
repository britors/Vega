import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'
import type { BluetoothDeviceInfo, BluetoothStatus } from '../../../main/system/types'
import type { DisplayConfig, DisplayOutputInfo, WallpaperInfo } from '../../../main/sessionSettings'

const buttonStyle = {
  padding: '6px 14px', borderRadius: 'var(--lyra-radius-sm)', border: '1px solid var(--lyra-border)',
  background: 'transparent', color: 'var(--lyra-text)', cursor: 'pointer'
} as const

export default function Desktop(): JSX.Element {
  const dialogs = useDialogs()
  const [bluetooth, setBluetooth] = useState<BluetoothStatus | null>(null)
  const [devices, setDevices] = useState<BluetoothDeviceInfo[]>([])
  const [wallpapers, setWallpapers] = useState<WallpaperInfo[]>([])
  const [displays, setDisplays] = useState<DisplayOutputInfo[]>([])
  const [drafts, setDrafts] = useState<Record<string, DisplayConfig>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setError(null)
    const [nextBluetooth, nextDevices, nextWallpapers, nextDisplays] = await Promise.all([
      window.vega.bluetoothStatus(),
      window.vega.listBluetoothDevices(),
      window.vega.listWallpapers(),
      window.vega.listDisplays()
    ])
    setBluetooth(nextBluetooth)
    setDevices(nextDevices)
    setWallpapers(nextWallpapers)
    setDisplays(nextDisplays)
    setDrafts(Object.fromEntries(nextDisplays.map((display) => [display.name, {
      name: display.name, enabled: display.enabled, mode: display.currentMode,
      x: display.x, y: display.y, primary: display.primary
    }])))
  }

  useEffect(() => { refresh().catch((err: Error) => setError(err.message)) }, [])

  async function action(operation: () => Promise<void>, success: string): Promise<void> {
    setBusy(true); setError(null); setMessage(null)
    try { await operation(); setMessage(success); await refresh() }
    catch (err) { setError((err as Error).message) }
    finally { setBusy(false) }
  }

  async function scan(): Promise<void> {
    await action(async () => { await window.vega.setBluetoothScanning(true) }, 'Busca Bluetooth concluída.')
  }

  async function applyDisplay(display: DisplayOutputInfo): Promise<void> {
    const config = drafts[display.name]
    if (!config) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const result = await window.vega.applyDisplayConfig(config)
      if (!result?.token) throw new Error('O agente não retornou a confirmação temporária do monitor.')
      const confirmed = await dialogs.confirm({
        title: 'Manter esta configuração?',
        message: `A imagem está correta? Confirme em até ${result.rollbackAfterSeconds} segundos. Sem confirmação, o Windows volta automaticamente à configuração anterior.`,
        variant: 'warning', confirmLabel: 'Manter configuração'
      })
      if (confirmed) {
        await window.vega.confirmDisplayConfig(result.token)
        setMessage('Configuração do monitor confirmada.')
      } else {
        await window.vega.revertDisplayConfig(result.token)
        setMessage('Configuração anterior restaurada.')
      }
      await refresh()
    } catch (err) { setError((err as Error).message); await refresh().catch(() => undefined) }
    finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Bluetooth e Personalização</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>Integrações de sessão do Windows, sem exigir Electron elevado</p>
      </div>

      {error && <div className="card" style={{ color: 'var(--lyra-danger)' }}>Falha: {error}</div>}
      {message && <div className="card" style={{ color: 'var(--lyra-success)' }}>{message}</div>}

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Bluetooth</h2>
            <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.84rem' }}>
              {bluetooth?.available ? `${bluetooth.controllerName || 'Adaptador'} · ${bluetooth.controller}` : 'Nenhum adaptador disponível'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={buttonStyle} disabled={busy || !bluetooth?.available} onClick={scan}>Buscar dispositivos</button>
            <button style={buttonStyle} disabled={busy} onClick={() => action(() => window.vega.setBluetoothPowered(true), 'Configurações Bluetooth abertas.')}>Abrir configurações</button>
          </div>
        </div>
        {!bluetooth?.available ? <EmptyState title="Bluetooth não disponível" message="O restante da personalização continua funcionando normalmente." /> : devices.length === 0 ? <EmptyState title="Nenhum dispositivo encontrado" /> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {devices.map((device) => (
              <div key={device.address} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', borderTop: '1px solid var(--lyra-border)', paddingTop: 10 }}>
                <div><strong>{device.alias || device.name || device.address}</strong><div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>{device.address} · {device.paired ? 'pareado' : 'não pareado'} · {device.connected ? 'conectado' : 'desconectado'}</div></div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {!device.paired && <button style={buttonStyle} disabled={busy} onClick={() => action(() => window.vega.pairBluetoothDevice(device.address), 'Pareamento concluído.')}>Parear</button>}
                  {device.paired && <button style={buttonStyle} disabled={busy} onClick={() => action(() => window.vega.connectBluetoothDevice(device.address), 'Configurações de conexão abertas.')}>Conectar/desconectar</button>}
                  {device.paired && <button style={buttonStyle} disabled={busy} onClick={async () => { const path = await window.vega.chooseBluetoothFile(); if (path) await action(() => window.vega.sendBluetoothFile(device.address, path), 'Assistente nativo de transferência aberto.') }}>Enviar arquivo</button>}
                  {device.paired && <button style={{ ...buttonStyle, color: 'var(--lyra-danger)' }} disabled={busy} onClick={() => action(() => window.vega.removeBluetoothDevice(device.address), 'Dispositivo removido.')}>Remover</button>}
                </div>
              </div>
            ))}
            <button style={{ ...buttonStyle, justifySelf: 'start' }} disabled={busy} onClick={async () => { const directory = await window.vega.chooseBluetoothReceiveDirectory(); if (directory) await action(() => window.vega.startBluetoothFileReceiver(directory), 'Assistente nativo de recebimento aberto.') }}>Receber arquivo</button>
          </div>
        )}
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Wallpaper</h2>
        <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.84rem' }}>Imagens locais do Windows e da pasta Imagens. URIs remotas são recusadas; o fallback atual aplica a mesma imagem em todos os monitores.</div>
        {wallpapers.length === 0 ? <EmptyState title="Nenhum wallpaper local encontrado" /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, maxHeight: 300, overflow: 'auto' }}>
            {wallpapers.map((wallpaper) => <button key={wallpaper.id} style={{ ...buttonStyle, textAlign: 'left' }} disabled={busy} onClick={() => action(async () => { await window.vega.applyWallpaper(wallpaper.path) }, `Wallpaper “${wallpaper.name}” aplicado.`)}><strong>{wallpaper.name}</strong><div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.78rem' }}>{wallpaper.source}</div></button>)}
          </div>
        )}
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Monitores</h2>
        <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.84rem' }}>Resolução, frequência e posição podem ser testadas. HDR, escala, monitor principal e monitores desconectados permanecem somente leitura.</div>
        {displays.length === 0 ? <EmptyState title="Nenhum monitor enumerado" /> : displays.map((display) => {
          const draft = drafts[display.name]
          return <div key={display.name} style={{ borderTop: '1px solid var(--lyra-border)', paddingTop: 10, display: 'grid', gap: 8 }}>
            <div><strong>{display.label || display.name}</strong><span style={{ color: 'var(--lyra-text-muted)' }}> · {display.connected ? 'conectado' : 'desconectado'}{display.primary ? ' · principal' : ''}{display.scale ? ` · escala ${display.scale}%` : ''}</span></div>
            {draft && display.connected && <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 8 }}>
              <select className="sidebar__search" style={{ marginBottom: 0 }} value={draft.mode} onChange={(event) => setDrafts((current) => ({ ...current, [display.name]: { ...draft, mode: event.target.value } }))}>{display.modes.map((mode) => <option key={mode.id} value={mode.id}>{mode.width}×{mode.height} · {mode.refreshRate} Hz</option>)}</select>
              <input className="sidebar__search" style={{ marginBottom: 0 }} type="number" value={draft.x} onChange={(event) => setDrafts((current) => ({ ...current, [display.name]: { ...draft, x: Number(event.target.value) } }))} aria-label="posição X" />
              <input className="sidebar__search" style={{ marginBottom: 0 }} type="number" value={draft.y} onChange={(event) => setDrafts((current) => ({ ...current, [display.name]: { ...draft, y: Number(event.target.value) } }))} aria-label="posição Y" />
              <button style={buttonStyle} disabled={busy || !draft.mode} onClick={() => applyDisplay(display)}>Testar</button>
            </div>}
          </div>
        })}
      </div>
    </div>
  )
}
