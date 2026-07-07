import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface FirewallServiceInfo {
  name: string
  label: string
  enabled: boolean
}

export default function Network(): JSX.Element {
  const dialogs = useDialogs()
  const [enabled, setEnabled] = useState(false)
  const [activeZone, setActiveZone] = useState('')
  const [services, setServices] = useState<FirewallServiceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [status, nextServices] = await Promise.all([
        window.vega.firewallStatus(),
        window.vega.firewallListServices()
      ])
      setEnabled(status.enabled)
      setActiveZone(status.activeZone)
      setServices(nextServices)
    } catch (err) {
      setError((err as Error).message)
      setEnabled(false)
      setActiveZone('')
      setServices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function toggleService(service: FirewallServiceInfo): Promise<void> {
    const ok = await dialogs.confirm({
      title: service.enabled ? 'Desativar serviço' : 'Ativar serviço',
      message: `${service.enabled ? 'Desativar' : 'Ativar'} ${service.label} (${service.name}) no firewall?`,
      variant: 'warning',
      confirmLabel: service.enabled ? 'Desativar' : 'Ativar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.firewallSetServiceEnabled(service.name, !service.enabled)
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
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Rede e Firewall</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Estado do firewalld e serviços amigáveis
        </p>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {loading && <EmptyState title="Carregando firewall..." />}

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Firewall</div>
          <div style={{ fontWeight: 600 }}>{enabled ? 'Ativado' : 'Desativado'}</div>
        </div>
        <div>
          <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Zona ativa</div>
          <div style={{ fontWeight: 600 }}>{activeZone || 'nenhuma'}</div>
        </div>
      </div>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Serviços</h2>
        {services.length === 0 ? (
          <EmptyState title="Nenhum serviço listado" message="O firewalld não retornou serviços disponíveis." />
        ) : (
          services.map((service) => (
            <div key={service.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{service.label}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--lyra-text-muted)' }}>{service.name}</div>
              </div>
              <button
                onClick={() => toggleService(service)}
                disabled={busy}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--lyra-radius-sm)',
                  border: '1px solid var(--lyra-border)',
                  background: service.enabled ? 'transparent' : 'var(--lyra-gradient)',
                  color: service.enabled ? 'var(--lyra-danger)' : '#fff',
                  cursor: 'pointer'
                }}
              >
                {busy ? 'Processando...' : service.enabled ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
