import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface Volume {
  name: string
  path: string
  type: string
  fsType: string
  size: string
  used: string
  avail: string
  usePercent: number
  mountpoint: string
  model: string
  removable: boolean
  canMount: boolean
  canUnmount: boolean
  health?: string
  system?: boolean
}

export default function Storage(): JSX.Element {
  const dialogs = useDialogs()
  const [volumes, setVolumes] = useState<Volume[]>([])
  const [loading, setLoading] = useState(true)
  const [busyPath, setBusyPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setVolumes(await window.vega.listStorageVolumes())
    } catch (err) {
      setError((err as Error).message)
      setVolumes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function toggle(volume: Volume): Promise<void> {
    const action = volume.canUnmount ? 'desmontar' : 'montar'
    const ok = await dialogs.confirm({
      title: volume.canUnmount ? 'Desmontar volume' : 'Montar volume',
      message: `${action[0].toUpperCase()}${action.slice(1)} ${volume.path}? O Vega não cria, formata nem redimensiona partições.`,
      variant: 'warning',
      confirmLabel: volume.canUnmount ? 'Desmontar' : 'Montar'
    })
    if (!ok) return
    setBusyPath(volume.path)
    setError(null)
    try {
      if (volume.canUnmount) await window.vega.unmountVolume(volume.path)
      else await window.vega.mountVolume(volume.path)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyPath(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Armazenamento</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Visão leve de discos, partições e volumes. Sem ações destrutivas.
        </p>
      </div>
      {error && <div className="card" style={{ color: 'var(--lyra-danger)' }}>Falha: {error}</div>}
      {loading && <EmptyState title="Carregando volumes..." />}
      <div className="card" style={{ display: 'grid', gap: 10 }}>
        {volumes.length === 0 ? (
          <EmptyState title="Nenhum volume listado" message="O sistema não retornou dispositivos de armazenamento." />
        ) : (
          volumes.map((volume) => (
            <div key={`${volume.path}-${volume.mountpoint}`} style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr 0.8fr auto', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--lyra-border)', paddingBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{volume.path || volume.name}</div>
                <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>
                  {[volume.model, volume.type, volume.fsType, volume.system ? 'sistema' : '', volume.removable ? 'removível' : '', volume.health].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Tamanho</div>
                <div>{volume.size || '-'}</div>
              </div>
              <div>
                <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Uso</div>
                <div>{volume.mountpoint ? `${volume.used || '-'} / ${volume.avail || '-'} livres` : 'não montado'}</div>
              </div>
              <button
                onClick={() => toggle(volume)}
                disabled={busyPath === volume.path || (!volume.canMount && !volume.canUnmount)}
                style={{ padding: '6px 12px', borderRadius: 'var(--lyra-radius-sm)', border: '1px solid var(--lyra-border)', background: volume.canMount ? 'var(--lyra-gradient)' : 'transparent', color: volume.canMount ? '#fff' : 'var(--lyra-text)' }}
              >
                {busyPath === volume.path ? 'Processando...' : volume.canUnmount ? 'Desmontar' : volume.canMount ? 'Montar' : 'Somente leitura'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
