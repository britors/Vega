import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface HardwareInventory {
  cpu: string
  gpu: string
  ramText: string
  manufacturer?: string
  model?: string
}

export default function Hardware(): JSX.Element {
  const dialogs = useDialogs()
  const [inventory, setInventory] = useState<HardwareInventory | null>(null)
  const [firmwareStatus, setFirmwareStatus] = useState('carregando...')
  const [selectedDriver, setSelectedDriver] = useState('nvidia-open-dkms')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isWindows, setIsWindows] = useState(false)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [capabilities, nextInventory, nextFirmware] = await Promise.all([
        window.vega.getCapabilities(),
        window.vega.hardwareInventory(),
        window.vega.hardwareFirmwareStatus()
      ])
      setIsWindows(capabilities.platform === 'windows')
      setInventory(nextInventory)
      setFirmwareStatus(nextFirmware)
    } catch (err) {
      setError((err as Error).message)
      setInventory(null)
      setFirmwareStatus('indisponível')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function applyDriver(): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Trocar driver',
      message: `Aplicar ${selectedDriver}? O sistema criará um snapshot antes da troca.`,
      variant: 'warning',
      confirmLabel: 'Aplicar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.switchNvidiaDriver(selectedDriver)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Hardware e Drivers</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Inventário, troca de driver NVIDIA e firmware
        </p>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {loading && <EmptyState title="Carregando hardware..." />}

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Inventário</h2>
        {inventory ? (
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10 }}>
            <span style={{ color: 'var(--lyra-text-muted)' }}>CPU</span>
            <strong style={{ fontWeight: 500 }}>{inventory.cpu}</strong>
            <span style={{ color: 'var(--lyra-text-muted)' }}>GPU</span>
            <strong style={{ fontWeight: 500 }}>{inventory.gpu}</strong>
            <span style={{ color: 'var(--lyra-text-muted)' }}>RAM</span>
            <strong style={{ fontWeight: 500 }}>{inventory.ramText}</strong>
            {(inventory.manufacturer || inventory.model) && <>
              <span style={{ color: 'var(--lyra-text-muted)' }}>Fabricante/modelo</span>
              <strong style={{ fontWeight: 500 }}>{[inventory.manufacturer, inventory.model].filter(Boolean).join(' · ')}</strong>
            </>}
            <span style={{ color: 'var(--lyra-text-muted)' }}>Firmware</span>
            <strong style={{ fontWeight: 500 }}>{firmwareStatus}</strong>
          </div>
        ) : (
          <EmptyState title="Nenhum inventário carregado" message="O daemon não respondeu com dados de hardware." />
        )}
      </div>

      {!isWindows && <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Troca de driver NVIDIA</h2>
        <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.85rem' }}>
          {selectedDriver} será aplicado após confirmação.
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select
            className="sidebar__search"
            style={{ marginBottom: 0, flex: 1 }}
            value={selectedDriver}
            onChange={(e) => setSelectedDriver(e.target.value)}
          >
            <option value="nvidia-open-dkms">nvidia-open-dkms</option>
            <option value="nvidia-580xx-dkms">nvidia-580xx-dkms</option>
            <option value="nouveau">nouveau</option>
          </select>
          <button
            onClick={applyDriver}
            disabled={busy}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--lyra-radius-sm)',
              border: 'none',
              background: 'var(--lyra-gradient)',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            {busy ? 'Aplicando...' : 'Aplicar'}
          </button>
        </div>
      </div>}
    </div>
  )
}
