import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface SnapshotInfo {
  id: number
  timestamp: number
  trigger: string
  description: string
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) return 'sem data'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(timestamp * 1000))
}

export default function Snapshots(): JSX.Element {
  const dialogs = useDialogs()
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [retention, setRetention] = useState('10')
  const [working, setWorking] = useState(false)

  async function loadSnapshots(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const rows = await window.vega.listSnapshots()
      setSnapshots(rows)
    } catch (err) {
      setSnapshots(null)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSnapshots()
  }, [])

  async function createSnapshot(): Promise<void> {
    const text = description.trim()
    if (!text) return
    setWorking(true)
    setError(null)
    try {
      await window.vega.createSnapshot(text)
      setDescription('')
      await loadSnapshots()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function deleteSnapshot(snapshotId: number): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Excluir ponto de restauração',
      message: `Excluir o snapshot #${snapshotId}? Essa ação não pode ser desfeita.`,
      variant: 'danger',
      confirmLabel: 'Excluir'
    })
    if (!ok) return
    setWorking(true)
    setError(null)
    try {
      await window.vega.deleteSnapshot(snapshotId)
      await loadSnapshots()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function rollback(snapshotId: number): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Rollback',
      message: `Restaurar o sistema a partir do snapshot #${snapshotId}? Um ponto de restauração será usado antes da operação.`,
      variant: 'warning',
      confirmLabel: 'Restaurar'
    })
    if (!ok) return
    setWorking(true)
    setError(null)
    try {
      await window.vega.rollbackSnapshot(snapshotId)
      await loadSnapshots()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  async function saveRetention(): Promise<void> {
    const keepCount = Number.parseInt(retention, 10)
    if (!Number.isFinite(keepCount) || keepCount < 1) return
    setWorking(true)
    setError(null)
    try {
      await window.vega.setRetentionPolicy(keepCount)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setWorking(false)
    }
  }

  const empty = useMemo(
    () => snapshots !== null && snapshots.length === 0 && !loading,
    [loading, snapshots]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Atualizações e Pontos de Restauração</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Timeline de snapshots Snapper, rollback e política de retenção
        </p>
      </div>

      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          className="sidebar__search"
          style={{ marginBottom: 0, flex: 1 }}
          placeholder="Descrição do snapshot manual"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          onClick={createSnapshot}
          disabled={working || description.trim() === ''}
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--lyra-radius-sm)',
            border: 'none',
            background: 'var(--lyra-gradient)',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          Criar snapshot
        </button>
      </div>

      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          className="sidebar__search"
          style={{ marginBottom: 0, width: 120 }}
          type="number"
          min={1}
          value={retention}
          onChange={(e) => setRetention(e.target.value)}
        />
        <span style={{ color: 'var(--lyra-text-muted)' }}>snapshots mantidos por política de retenção</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={saveRetention}
          disabled={working}
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--lyra-radius-sm)',
            border: '1px solid var(--lyra-border)',
            background: 'transparent',
            color: 'var(--lyra-text-muted)',
            cursor: 'pointer'
          }}
        >
          Salvar política
        </button>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {loading && snapshots === null && <EmptyState title="Carregando snapshots..." />}
      {empty && <EmptyState title="Nenhum ponto de restauração ainda" />}

      {snapshots && snapshots.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {snapshots.map((snapshot) => (
            <div
              key={snapshot.id}
              className="card"
              style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '14px 18px' }}
            >
              <div style={{ minWidth: 88 }}>
                <div style={{ fontWeight: 600 }}>#{snapshot.id}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--lyra-text-muted)' }}>{snapshot.trigger}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.92rem' }}>{snapshot.description || 'Sem descrição'}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--lyra-text-muted)' }}>
                  {formatTimestamp(snapshot.timestamp)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => deleteSnapshot(snapshot.id)}
                  disabled={working}
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
                <button
                  onClick={() => rollback(snapshot.id)}
                  disabled={working}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--lyra-radius-sm)',
                    border: 'none',
                    background: 'var(--lyra-gradient)',
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  Rollback
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
