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

const bluetoothUnit = 'bluetooth.service'

export default function Bluetooth(): JSX.Element {
  const dialogs = useDialogs()
  const [service, setService] = useState<ManagedServiceInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const services = await window.vega.listManagedServices()
      setService(services.find((item) => item.name === bluetoothUnit) ?? null)
    } catch (err) {
      setError((err as Error).message)
      setService(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function runServiceAction(action: () => Promise<void>): Promise<void> {
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
    if (ok) await runServiceAction(() => window.vega.setServiceRunning(bluetoothUnit, !service.active))
  }

  async function setEnabled(): Promise<void> {
    if (!service) return
    const ok = await dialogs.confirm({
      title: service.enabled ? 'Desabilitar Bluetooth' : 'Habilitar Bluetooth',
      message: `${service.enabled ? 'Desabilitar' : 'Habilitar'} o Bluetooth na inicialização?`,
      variant: 'warning',
      confirmLabel: service.enabled ? 'Desabilitar' : 'Habilitar'
    })
    if (ok) await runServiceAction(() => window.vega.setServiceEnabled(bluetoothUnit, !service.enabled))
  }

  async function restart(): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Reiniciar Bluetooth',
      message: `Reiniciar ${bluetoothUnit} agora?`,
      variant: 'warning',
      confirmLabel: 'Reiniciar'
    })
    if (ok) await runServiceAction(() => window.vega.restartService(bluetoothUnit))
  }

  const available = service?.available ?? false
  const active = service?.active ?? false
  const enabled = service?.enabled ?? false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Bluetooth</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Estado do serviço Bluetooth e controle de inicialização
        </p>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {loading && <EmptyState title="Carregando Bluetooth..." />}

      <div className="card" style={{ display: 'grid', gap: 16 }}>
        {service ? (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span className={`status-pill ${active ? 'status-pill--ok' : 'status-pill--warn'}`}>
                {active ? 'ativo' : 'parado'}
              </span>
              <span className={`status-pill ${enabled ? 'status-pill--ok' : 'status-pill--warn'}`}>
                {enabled ? 'habilitado' : 'desabilitado'}
              </span>
              {!available && <span className="status-pill">indisponível</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10 }}>
              <span style={{ color: 'var(--lyra-text-muted)' }}>Unit</span>
              <strong style={{ fontWeight: 500 }}>{service.name}</strong>
              <span style={{ color: 'var(--lyra-text-muted)' }}>Descrição</span>
              <strong style={{ fontWeight: 500 }}>{service.description}</strong>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={setRunning}
                disabled={busy || !available}
                style={{
                  padding: '7px 14px',
                  borderRadius: 'var(--lyra-radius-sm)',
                  border: '1px solid var(--lyra-border)',
                  background: 'transparent',
                  color: 'var(--lyra-text)',
                  cursor: 'pointer'
                }}
              >
                {busy ? 'Processando...' : active ? 'Parar' : 'Iniciar'}
              </button>
              <button
                onClick={restart}
                disabled={busy || !available || !active}
                style={{
                  padding: '7px 14px',
                  borderRadius: 'var(--lyra-radius-sm)',
                  border: '1px solid var(--lyra-border)',
                  background: 'transparent',
                  color: 'var(--lyra-text)',
                  cursor: 'pointer'
                }}
              >
                {busy ? 'Processando...' : 'Reiniciar'}
              </button>
              <button
                onClick={setEnabled}
                disabled={busy || !available}
                style={{
                  padding: '7px 14px',
                  borderRadius: 'var(--lyra-radius-sm)',
                  border: 'none',
                  background: enabled ? 'transparent' : 'var(--lyra-gradient)',
                  color: enabled ? 'var(--lyra-danger)' : '#fff',
                  cursor: 'pointer'
                }}
              >
                {busy ? 'Processando...' : enabled ? 'Desabilitar' : 'Habilitar'}
              </button>
            </div>
          </>
        ) : (
          <EmptyState
            title="Bluetooth não listado"
            message="O daemon não retornou bluetooth.service na lista curada de serviços."
          />
        )}
      </div>
    </div>
  )
}
