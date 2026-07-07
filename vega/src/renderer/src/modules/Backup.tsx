import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface BackupConfig {
  id: string
  paths: string[]
  destination: string
  frequency: string
}

interface BackupSnapshotInfo {
  id: string
  timestamp: number
  fileCount: number
  sizeBytes: number
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return 'sem data'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp * 1000))
}

export default function Backup(): JSX.Element {
  const dialogs = useDialogs()
  const [configs, setConfigs] = useState<BackupConfig[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<BackupSnapshotInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [id, setId] = useState('')
  const [paths, setPaths] = useState('~/Documentos,~/Imagens')
  const [destination, setDestination] = useState('/backup/restic')
  const [frequency, setFrequency] = useState('manual')
  const [restoreTarget, setRestoreTarget] = useState('~/Restaurado')
  const [restoreMode, setRestoreMode] = useState('separate-folder')

  const selectedConfig = useMemo(
    () => configs.find((config) => config.id === selectedId) ?? null,
    [configs, selectedId]
  )

  async function refreshConfigs(nextSelectedId?: string | null): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const rows = await window.vega.listBackupConfigs()
      setConfigs(rows)
      const nextId = nextSelectedId ?? rows[0]?.id ?? null
      setSelectedId(nextId)
      if (nextId) {
        setSnapshots(await window.vega.listBackupSnapshots(nextId))
      } else {
        setSnapshots([])
      }
    } catch (err) {
      setError((err as Error).message)
      setConfigs([])
      setSnapshots([])
      setSelectedId(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshConfigs()
  }, [])

  useEffect(() => {
    if (!selectedId) return
    window.vega.listBackupSnapshots(selectedId).then(setSnapshots).catch((err: Error) => {
      setError(err.message)
      setSnapshots([])
    })
  }, [selectedId])

  async function createConfig(): Promise<void> {
    const config: BackupConfig = {
      id,
      paths: paths.split(',').map((item) => item.trim()).filter(Boolean),
      destination,
      frequency
    }
    setBusy(true)
    setError(null)
    try {
      const newId = await window.vega.createBackupConfig(config)
      setId('')
      await refreshConfigs(newId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function runNow(): Promise<void> {
    if (!selectedId) return
    const ok = await dialogs.confirm({
      title: 'Executar backup',
      message: `Rodar backup agora para ${selectedId}?`,
      variant: 'warning',
      confirmLabel: 'Executar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.runBackupNow(selectedId)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteConfig(): Promise<void> {
    if (!selectedId) return
    const ok = await dialogs.confirm({
      title: 'Excluir backup',
      message: `Excluir a configuração ${selectedId}? Os arquivos do repositório não serão apagados automaticamente.`,
      variant: 'danger',
      confirmLabel: 'Excluir'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.deleteBackupConfig(selectedId)
      await refreshConfigs(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function restoreSnapshot(snapshotId: string): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Restaurar snapshot',
      message: `Restaurar o snapshot ${snapshotId} para ${restoreTarget}?`,
      variant: 'warning',
      confirmLabel: 'Restaurar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.restoreBackupSnapshot(snapshotId, restoreTarget.trim(), restoreMode)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Backup</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          O quê / Para onde / Quando, com `restic` por trás
        </p>
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Criar backup</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <input className="sidebar__search" placeholder="ID da configuração" value={id} onChange={(e) => setId(e.target.value)} />
          <input
            className="sidebar__search"
            placeholder="Destino do repositório"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>
        <input
          className="sidebar__search"
          placeholder="Caminhos separados por vírgula"
          value={paths}
          onChange={(e) => setPaths(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select className="sidebar__search" style={{ marginBottom: 0, flex: 1 }} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="manual">Manual</option>
            <option value="daily">Diário</option>
            <option value="weekly">Semanal</option>
            <option value="on-connect">Ao conectar</option>
          </select>
          <button
            onClick={createConfig}
            disabled={busy || paths.trim() === '' || destination.trim() === ''}
            style={{
              padding: '0 16px',
              borderRadius: 'var(--lyra-radius-sm)',
              border: 'none',
              background: 'var(--lyra-gradient)',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Criar configuração
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {loading && configs.length === 0 && <EmptyState title="Carregando backups..." />}
      {!loading && configs.length === 0 && <EmptyState title="Ainda não há nada protegido aqui" />}

      {configs.length > 0 && (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 0.9fr)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {configs.map((config) => (
              <button
                key={config.id}
                className={`card ${selectedId === config.id ? 'sidebar__item--active' : ''}`}
                onClick={() => setSelectedId(config.id)}
                style={{
                  textAlign: 'left',
                  border: '1px solid var(--lyra-border)',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: '14px 18px'
                }}
              >
                <div style={{ fontWeight: 600 }}>{config.id}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--lyra-text-muted)' }}>
                  {config.destination} · {config.frequency}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--lyra-text-muted)', marginTop: 4 }}>
                  {config.paths.join(', ')}
                </div>
              </button>
            ))}
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {selectedConfig ? (
              <>
                <h2 style={{ margin: 0, fontSize: '1rem' }}>{selectedConfig.id}</h2>
                <div style={{ fontSize: '0.85rem', color: 'var(--lyra-text-muted)' }}>
                  {selectedConfig.destination} · {selectedConfig.frequency}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={runNow}
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
                    Fazer backup agora
                  </button>
                  <button
                    onClick={deleteConfig}
                    disabled={busy}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--lyra-radius-sm)',
                      border: '1px solid var(--lyra-border)',
                      background: 'transparent',
                      color: 'var(--lyra-danger)',
                      cursor: 'pointer'
                    }}
                  >
                    Excluir
                  </button>
                </div>

                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 8 }}>Snapshots</div>
                  {snapshots.length === 0 ? (
                    <EmptyState title="Nenhum snapshot ainda" />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {snapshots.map((snapshot) => (
                        <div
                          key={snapshot.id}
                          style={{
                            border: '1px solid var(--lyra-border)',
                            borderRadius: 'var(--lyra-radius-sm)',
                            padding: '10px 12px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong>{snapshot.id}</strong>
                            <span style={{ color: 'var(--lyra-text-muted)' }}>{formatTimestamp(snapshot.timestamp)}</span>
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--lyra-text-muted)' }}>
                            {snapshot.fileCount} arquivos · {Math.round(snapshot.sizeBytes / 1024)} KiB
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button
                              onClick={() => restoreSnapshot(snapshot.id)}
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
                              Restaurar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <EmptyState title="Selecione uma configuração" />
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Restauração</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <input
            className="sidebar__search"
            placeholder="Destino de restauração"
            value={restoreTarget}
            onChange={(e) => setRestoreTarget(e.target.value)}
          />
          <select className="sidebar__search" style={{ marginBottom: 0 }} value={restoreMode} onChange={(e) => setRestoreMode(e.target.value)}>
            <option value="separate-folder">Pasta separada</option>
            <option value="replace">Substituir</option>
          </select>
        </div>
        <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.85rem' }}>
          A restauração usa o snapshot selecionado na configuração atual.
        </div>
      </div>
    </div>
  )
}
