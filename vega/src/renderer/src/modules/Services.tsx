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

export default function Services(): JSX.Element {
  const dialogs = useDialogs()
  const [services, setServices] = useState<ManagedServiceInfo[]>([])
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setServices(showAll ? await window.vega.listAllManagedServices() : await window.vega.listManagedServices())
    } catch (err) {
      setError((err as Error).message)
      setServices([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll])

  async function setEnabled(service: ManagedServiceInfo): Promise<void> {
    const action = service.enabled ? 'desativar' : 'ativar'
    const ok = await dialogs.confirm({
      title: 'Serviço',
      message: `${action} ${service.label} (${service.name})?`,
      variant: service.enabled ? 'warning' : 'warning',
      confirmLabel: service.enabled ? 'Desativar' : 'Ativar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.setServiceEnabled(service.name, !service.enabled)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function setRunning(service: ManagedServiceInfo): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Executar serviço',
      message: `${service.active ? 'parar' : 'iniciar'} ${service.label} (${service.name}) agora?`,
      variant: 'warning',
      confirmLabel: service.active ? 'Parar' : 'Iniciar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.setServiceRunning(service.name, !service.active)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function restart(service: ManagedServiceInfo): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Reiniciar serviço',
      message: `Reiniciar ${service.label} (${service.name}) agora?`,
      variant: 'warning',
      confirmLabel: 'Reiniciar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.restartService(service.name)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Serviços</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
            {showAll ? 'Todas as units service conhecidas pelo systemctl' : 'Lista curada de units systemd com start/stop e enable/disable'}
          </p>
        </div>
        <button
          onClick={() => setShowAll((value) => !value)}
          disabled={loading || busy}
          style={{
            padding: '8px 14px',
            borderRadius: 'var(--lyra-radius-sm)',
            border: '1px solid var(--lyra-border)',
            background: showAll ? 'var(--lyra-surface-raised)' : 'transparent',
            color: 'var(--lyra-text)',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          {showAll ? 'Mostrar curados' : 'Mostrar tudo'}
        </button>
      </div>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Ativos</div>
          <div style={{ fontWeight: 600 }}>{services.filter((service) => service.active).length}</div>
        </div>
        <div>
          <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Habilitados</div>
          <div style={{ fontWeight: 600 }}>{services.filter((service) => service.enabled).length}</div>
        </div>
        <div>
          <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Disponíveis</div>
          <div style={{ fontWeight: 600 }}>{services.filter((service) => service.available).length}</div>
        </div>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {loading && <EmptyState title="Carregando serviços..." />}

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>{showAll ? 'Todas as units' : 'Units principais'}</h2>
        {services.length === 0 ? (
          <EmptyState
            title="Nenhum serviço disponível"
            message={showAll ? 'O systemctl não retornou services para esta máquina.' : 'O daemon não retornou units curadas para esta máquina.'}
          />
        ) : (
          services.map((service) => (
            <div
              key={service.name}
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
                padding: '12px 0',
                borderBottom: '1px solid var(--lyra-border)'
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong style={{ fontWeight: 600 }}>{service.label}</strong>
                  <span style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>{service.name}</span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: service.active ? 'rgba(46, 194, 126, 0.14)' : 'rgba(255, 184, 77, 0.14)',
                      color: service.active ? 'var(--lyra-success)' : 'var(--lyra-warning)',
                      fontSize: '0.78rem'
                    }}
                  >
                    {service.active ? 'ativo' : 'parado'}
                  </span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: service.enabled ? 'rgba(46, 194, 126, 0.14)' : 'rgba(235, 90, 110, 0.14)',
                      color: service.enabled ? 'var(--lyra-success)' : 'var(--lyra-danger)',
                      fontSize: '0.78rem'
                    }}
                  >
                    {service.enabled ? 'habilitado' : 'desabilitado'}
                  </span>
                  {!service.available && (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: 'rgba(255, 255, 255, 0.06)',
                        color: 'var(--lyra-text-muted)',
                        fontSize: '0.78rem'
                      }}
                    >
                      indisponível
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 4, color: 'var(--lyra-text-muted)', fontSize: '0.86rem' }}>
                  {service.description}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setRunning(service)}
                  disabled={busy || !service.available}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--lyra-radius-sm)',
                    border: '1px solid var(--lyra-border)',
                    background: 'transparent',
                    color: 'var(--lyra-text)',
                    cursor: 'pointer'
                  }}
                >
                  {busy ? 'Processando...' : service.active ? 'Parar' : 'Iniciar'}
                </button>
                <button
                  onClick={() => restart(service)}
                  disabled={busy || !service.available || !service.active}
                  style={{
                    padding: '6px 14px',
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
                  onClick={() => setEnabled(service)}
                  disabled={busy || !service.available}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--lyra-radius-sm)',
                    border: 'none',
                    background: service.enabled ? 'transparent' : 'var(--lyra-gradient)',
                    color: service.enabled ? 'var(--lyra-danger)' : '#fff',
                    cursor: 'pointer'
                  }}
                >
                  {busy ? 'Processando...' : service.enabled ? 'Desabilitar' : 'Habilitar'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
