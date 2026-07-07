import { useEffect, useMemo, useRef, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface BackupConfig {
  id: string
  paths: string[]
  destination: string
  destinationUUID: string
  frequency: string
}

interface BackupSnapshotInfo {
  id: string
  timestamp: number
  fileCount: number
  sizeBytes: number
}

interface BackupTransactionProgressEvent {
  transactionId: number
  percent: number
  message: string
}

interface BackupTransactionFinishedEvent {
  transactionId: number
  success: boolean
  message: string
}

interface BackupTransaction {
  id: number
  label: string
  percent: number
  message: string
  done: boolean
  success?: boolean
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
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null)
  const [snapshotPaths, setSnapshotPaths] = useState<string[]>([])
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [transactions, setTransactions] = useState<Record<number, BackupTransaction>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const txLabels = useRef<Map<number, string>>(new Map())

  const [id, setId] = useState('')
  const [paths, setPaths] = useState('~/Documentos,~/Imagens')
  const [destination, setDestination] = useState('/backup/restic')
  const [destinationUUID, setDestinationUUID] = useState('')
  const [frequency, setFrequency] = useState('manual')
  const [restoreTarget, setRestoreTarget] = useState('~/Restaurado')
  const [restoreMode, setRestoreMode] = useState('separate-folder')

  const selectedConfig = useMemo(
    () => configs.find((config) => config.id === selectedId) ?? null,
    [configs, selectedId]
  )
  const latestSnapshot = snapshots[0] ?? null
  const activeTransactions = Object.values(transactions).filter((transaction) => !transaction.done)
  const completedTransactions = Object.values(transactions).filter((transaction) => transaction.done)

  async function refreshConfigs(nextSelectedId?: string | null): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const rows = await window.vega.listBackupConfigs()
      setConfigs(rows)
      const nextId = nextSelectedId ?? rows[0]?.id ?? null
      setSelectedId(nextId)
      if (nextId) {
        const nextSnapshots = await window.vega.listBackupSnapshots(nextId)
        setSnapshots(nextSnapshots)
        setSelectedSnapshotId(nextSnapshots[0]?.id ?? null)
      } else {
        setSnapshots([])
        setSelectedSnapshotId(null)
      }
    } catch (err) {
      setError((err as Error).message)
      setConfigs([])
      setSnapshots([])
      setSelectedId(null)
      setSelectedSnapshotId(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshConfigs()
  }, [])

  useEffect(() => {
    const offProgress = window.vega.onBackupTransactionProgress((evt: BackupTransactionProgressEvent) => {
      setTransactions((prev) => ({
        ...prev,
        [evt.transactionId]: {
          id: evt.transactionId,
          label: txLabels.current.get(evt.transactionId) ?? `Backup #${evt.transactionId}`,
          percent: evt.percent,
          message: evt.message,
          done: false
        }
      }))
    })

    const offFinished = window.vega.onBackupTransactionFinished((evt: BackupTransactionFinishedEvent) => {
      setTransactions((prev) => ({
        ...prev,
        [evt.transactionId]: {
          id: evt.transactionId,
          label: txLabels.current.get(evt.transactionId) ?? `Backup #${evt.transactionId}`,
          percent: 100,
          message: evt.message,
          done: true,
          success: evt.success
        }
      }))
      if (selectedId) {
        void refreshConfigs(selectedId)
      }
    })

    return () => {
      offProgress()
      offFinished()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return
    window.vega.listBackupSnapshots(selectedId).then((rows: BackupSnapshotInfo[]) => {
      setSnapshots(rows)
      setSelectedSnapshotId(rows[0]?.id ?? null)
    }).catch((err: Error) => {
      setError(err.message)
      setSnapshots([])
      setSelectedSnapshotId(null)
    })
  }, [selectedId])

  useEffect(() => {
    if (!selectedId || !selectedSnapshotId) {
      setSnapshotPaths([])
      setSelectedPaths([])
      return
    }
    window.vega.listBackupSnapshotPaths(selectedId, selectedSnapshotId).then((rows: string[]) => {
      setSnapshotPaths(rows)
      setSelectedPaths(rows.slice(0, 20))
    }).catch((err: Error) => {
      setError(err.message)
      setSnapshotPaths([])
      setSelectedPaths([])
    })
  }, [selectedId, selectedSnapshotId])

  async function createConfig(): Promise<void> {
    const config: BackupConfig = {
      id,
      paths: paths.split(',').map((item) => item.trim()).filter(Boolean),
      destination,
      destinationUUID,
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
      const txId = await window.vega.runBackupNow(selectedId)
      txLabels.current.set(txId, `Backup ${selectedId}`)
      setTransactions((prev) => ({
        ...prev,
        [txId]: { id: txId, label: `Backup ${selectedId}`, percent: 0, message: 'Iniciando...', done: false }
      }))
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
      const txId = await window.vega.restoreBackupSnapshot(snapshotId, restoreTarget.trim(), restoreMode)
      txLabels.current.set(txId, `Restaurando snapshot ${snapshotId}`)
      setTransactions((prev) => ({
        ...prev,
        [txId]: {
          id: txId,
          label: `Restaurando snapshot ${snapshotId}`,
          percent: 0,
          message: 'Iniciando...',
          done: false
        }
      }))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function restoreSelectedItems(): Promise<void> {
    if (!selectedSnapshotId || selectedPaths.length === 0) return
    const ok = await dialogs.confirm({
      title: 'Restaurar itens',
      message: `Restaurar ${selectedPaths.length} itens do snapshot ${selectedSnapshotId} para ${restoreTarget}?`,
      variant: 'warning',
      confirmLabel: 'Restaurar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const txId = await window.vega.restoreBackupItems(selectedSnapshotId, restoreTarget.trim(), restoreMode, selectedPaths)
      txLabels.current.set(txId, `Restaurando itens ${selectedSnapshotId}`)
      setTransactions((prev) => ({
        ...prev,
        [txId]: {
          id: txId,
          label: `Restaurando itens ${selectedSnapshotId}`,
          percent: 0,
          message: 'Iniciando...',
          done: false
        }
      }))
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

      {(selectedConfig || activeTransactions.length > 0) && (
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Status</h2>
          {selectedConfig && (
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--lyra-text-muted)' }}>Último backup</div>
                <strong>{latestSnapshot ? formatTimestamp(latestSnapshot.timestamp) : 'Ainda não executado'}</strong>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--lyra-text-muted)' }}>Próxima execução</div>
                <strong>
                  {selectedConfig.frequency === 'daily'
                    ? 'Diária'
                    : selectedConfig.frequency === 'weekly'
                      ? 'Semanal'
                      : selectedConfig.frequency === 'on-connect'
                        ? 'Ao conectar o destino'
                        : 'Manual'}
                </strong>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--lyra-text-muted)' }}>Destino</div>
                <strong style={{ wordBreak: 'break-word' }}>{selectedConfig.destination}</strong>
              </div>
            </div>
          )}
          {activeTransactions.map((transaction) => (
            <div
              key={transaction.id}
              style={{ border: '1px solid var(--lyra-border)', borderRadius: 'var(--lyra-radius-sm)', padding: '10px 12px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{transaction.label}</strong>
                <span style={{ color: transaction.done && transaction.success === false ? 'var(--lyra-danger)' : 'var(--lyra-text-muted)' }}>
                  {transaction.done ? (transaction.success ? 'Concluído' : 'Falhou') : `${transaction.percent}%`}
                </span>
              </div>
              <div style={{ marginTop: 8, height: 6, borderRadius: 999, background: 'var(--lyra-border)' }}>
                <div
                  style={{
                    width: `${Math.max(2, transaction.percent)}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: 'var(--lyra-gradient)'
                  }}
                />
              </div>
              <div style={{ marginTop: 8, fontSize: '0.84rem', color: 'var(--lyra-text-muted)' }}>{transaction.message}</div>
            </div>
          ))}
          {completedTransactions.length > 0 && (
            <div style={{ fontSize: '0.84rem', color: 'var(--lyra-text-muted)' }}>
              {completedTransactions.length} transação(ões) concluída(s) nesta sessão
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Criar backup</h2>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <input className="sidebar__search" placeholder="ID da configuração" value={id} onChange={(e) => setId(e.target.value)} />
          <input
            className="sidebar__search"
            placeholder={destinationUUID.trim() ? 'Pasta dentro do volume (ex.: VegaBackup)' : 'Destino do repositório'}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>
        <input
          className="sidebar__search"
          placeholder="UUID do dispositivo removível (opcional)"
          value={destinationUUID}
          onChange={(e) => setDestinationUUID(e.target.value)}
        />
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
                  {config.destinationUUID ? ` · UUID ${config.destinationUUID}` : ''}
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
                  {selectedConfig.destinationUUID ? ` · UUID ${selectedConfig.destinationUUID}` : ''}
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
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {snapshots.map((snapshot) => (
                          <button
                            key={snapshot.id}
                            onClick={() => setSelectedSnapshotId(snapshot.id)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 'var(--lyra-radius-sm)',
                              border: snapshot.id === selectedSnapshotId ? 'none' : '1px solid var(--lyra-border)',
                              background: snapshot.id === selectedSnapshotId ? 'var(--lyra-gradient)' : 'transparent',
                              color: snapshot.id === selectedSnapshotId ? '#fff' : 'var(--lyra-text)',
                              cursor: 'pointer'
                            }}
                          >
                            #{snapshot.id}
                          </button>
                        ))}
                      </div>
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
                      {snapshotPaths.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--lyra-border)', paddingTop: 10, display: 'grid', gap: 8 }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Itens do snapshot selecionado</div>
                          <div style={{ maxHeight: 220, overflow: 'auto', display: 'grid', gap: 6 }}>
                            {snapshotPaths.map((path) => {
                              const checked = selectedPaths.includes(path)
                              return (
                                <label
                                  key={path}
                                  style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.86rem' }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      setSelectedPaths((prev) => {
                                        if (e.target.checked) return prev.includes(path) ? prev : [...prev, path]
                                        return prev.filter((item) => item !== path)
                                      })
                                    }}
                                  />
                                  <span style={{ wordBreak: 'break-word' }}>{path}</span>
                                </label>
                              )
                            })}
                          </div>
                          <button
                            onClick={restoreSelectedItems}
                            disabled={busy || selectedPaths.length === 0}
                            style={{
                              justifySelf: 'start',
                              padding: '6px 14px',
                              borderRadius: 'var(--lyra-radius-sm)',
                              border: 'none',
                              background: 'var(--lyra-gradient)',
                              color: '#fff',
                              cursor: 'pointer'
                            }}
                          >
                            Restaurar itens selecionados
                          </button>
                        </div>
                      )}
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
