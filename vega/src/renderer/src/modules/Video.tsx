import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface HardwareInventory {
  cpu: string
  gpu: string
  ramText: string
}

interface DisplayModeInfo {
  id: string
  width: number
  height: number
  refreshRate: number
  current: boolean
  preferred: boolean
}

interface DisplayOutputInfo {
  name: string
  connected: boolean
  primary: boolean
  enabled: boolean
  width: number
  height: number
  x: number
  y: number
  currentMode: string
  modes: DisplayModeInfo[]
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 'var(--lyra-radius-sm)',
  border: '1px solid var(--lyra-border)',
  background: 'var(--lyra-surface-raised)',
  color: 'var(--lyra-text)'
}

const buttonStyle = {
  padding: '7px 12px',
  borderRadius: 'var(--lyra-radius-sm)',
  border: '1px solid var(--lyra-border)',
  background: 'transparent',
  color: 'var(--lyra-text)',
  cursor: 'pointer'
}

export default function Video(): JSX.Element {
  const dialogs = useDialogs()
  const [inventory, setInventory] = useState<HardwareInventory | null>(null)
  const [displays, setDisplays] = useState<DisplayOutputInfo[]>([])
  const [forms, setForms] = useState<Record<string, { enabled: boolean; mode: string; x: number; y: number; primary: boolean }>>({})
  const [selectedDriver, setSelectedDriver] = useState('nvidia-open-dkms')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [nextInventory, nextDisplays] = await Promise.all([
        window.vega.hardwareInventory(),
        window.vega.listDisplays()
      ])
      setInventory(nextInventory)
      setDisplays(nextDisplays)
      setForms(
        Object.fromEntries(
          nextDisplays.map((display) => [
            display.name,
            {
              enabled: display.enabled,
              mode: display.currentMode || display.modes[0]?.id || '',
              x: display.x,
              y: display.y,
              primary: display.primary
            }
          ])
        )
      )
    } catch (err) {
      setError((err as Error).message)
      setInventory(null)
      setDisplays([])
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

  async function applyDisplay(display: DisplayOutputInfo): Promise<void> {
    const form = forms[display.name]
    if (!form) return
    const ok = await dialogs.confirm({
      title: 'Aplicar configuração de tela',
      message: `${form.enabled ? 'Configurar' : 'Desativar'} ${display.name}?`,
      variant: 'warning',
      confirmLabel: 'Aplicar'
    })
    if (!ok) return
    await runBusy(() => window.vega.applyDisplayConfig({ name: display.name, ...form }))
  }

  async function applyDriver(): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Trocar driver de vídeo',
      message: `Aplicar ${selectedDriver}? O sistema criará um snapshot antes da troca.`,
      variant: 'warning',
      confirmLabel: 'Aplicar'
    })
    if (ok) await runBusy(() => window.vega.switchNvidiaDriver(selectedDriver))
  }

  function updateForm(name: string, patch: Partial<{ enabled: boolean; mode: string; x: number; y: number; primary: boolean }>): void {
    setForms((current) => {
      const base = current[name] ?? { enabled: true, mode: '', x: 0, y: 0, primary: false }
      return { ...current, [name]: { ...base, ...patch } }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Vídeo</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Telas conectadas, resolução, posição e adaptador gráfico
        </p>
      </div>

      {error && <div className="card" style={{ color: 'var(--lyra-danger)' }}>Falha: {error}</div>}
      {loading && <EmptyState title="Carregando vídeo..." />}

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Telas</h2>
          <button onClick={refresh} disabled={busy} style={buttonStyle}>Atualizar</button>
        </div>
        {displays.length === 0 ? (
          <EmptyState title="Nenhuma tela listada" message="xrandr não está disponível ou a sessão atual não expôs saídas de vídeo." />
        ) : (
          displays.map((display) => {
            const form = forms[display.name]
            return (
              <div key={display.name} style={{ display: 'grid', gap: 12, borderBottom: '1px solid var(--lyra-border)', paddingBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{display.name}</div>
                    <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>
                      {display.connected ? `${display.width || '-'}x${display.height || '-'} em ${display.x},${display.y}` : 'desconectada'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className={`status-pill ${display.connected ? 'status-pill--ok' : 'status-pill--warn'}`}>
                      {display.connected ? 'conectada' : 'desconectada'}
                    </span>
                    {display.primary && <span className="status-pill status-pill--ok">primária</span>}
                  </div>
                </div>
                {display.connected && form && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 90px 90px 120px auto', gap: 10, alignItems: 'center' }}>
                    <select value={form.mode} onChange={(e) => updateForm(display.name, { mode: e.target.value })} style={inputStyle}>
                      {display.modes.map((mode) => (
                        <option key={mode.id} value={mode.id}>
                          {mode.width}x{mode.height} @ {mode.refreshRate}Hz{mode.preferred ? ' preferida' : ''}
                        </option>
                      ))}
                    </select>
                    <input type="number" value={form.x} onChange={(e) => updateForm(display.name, { x: Number(e.target.value) })} style={inputStyle} aria-label="Posição X" />
                    <input type="number" value={form.y} onChange={(e) => updateForm(display.name, { y: Number(e.target.value) })} style={inputStyle} aria-label="Posição Y" />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--lyra-text-muted)' }}>
                      <input type="checkbox" checked={form.primary} onChange={(e) => updateForm(display.name, { primary: e.target.checked })} />
                      Primária
                    </label>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => updateForm(display.name, { enabled: !form.enabled })} disabled={busy} style={buttonStyle}>
                        {form.enabled ? 'Desativar' : 'Ativar'}
                      </button>
                      <button onClick={() => applyDisplay(display)} disabled={busy || (!form.enabled && display.primary)} style={{ ...buttonStyle, border: 'none', background: 'var(--lyra-gradient)', color: '#fff' }}>
                        Aplicar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Adaptador gráfico</h2>
        {inventory ? (
          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10 }}>
            <span style={{ color: 'var(--lyra-text-muted)' }}>GPU</span>
            <strong style={{ fontWeight: 500 }}>{inventory.gpu || 'indisponível'}</strong>
            <span style={{ color: 'var(--lyra-text-muted)' }}>Memória</span>
            <strong style={{ fontWeight: 500 }}>{inventory.ramText}</strong>
          </div>
        ) : (
          <EmptyState title="Nenhuma GPU carregada" message="O daemon não respondeu com dados de hardware." />
        )}
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Driver gráfico</h2>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select style={{ ...inputStyle, flex: '1 1 220px' }} value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)}>
            <option value="nvidia-open-dkms">nvidia-open-dkms</option>
            <option value="nvidia-580xx-dkms">nvidia-580xx-dkms</option>
            <option value="nouveau">nouveau</option>
          </select>
          <button onClick={applyDriver} disabled={busy} style={{ ...buttonStyle, border: 'none', background: 'var(--lyra-gradient)', color: '#fff' }}>
            {busy ? 'Aplicando...' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}
