import { useEffect, useRef, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface Status {
  version: string
  connected: boolean
}

interface PackageRef {
  origin: string
  id: string
  name: string
  description: string
  installed: boolean
}

interface Transaction {
  id: number
  label: string
  percent: number
  message: string
  done: boolean
  success?: boolean
}

interface TransactionProgressEvent {
  transactionId: number
  percent: number
  message: string
}

interface TransactionFinishedEvent {
  transactionId: number
  success: boolean
  message: string
}

const originLabel: Record<string, string> = {
  official: 'Oficial',
  flathub: 'Flathub'
}

type Tab = 'search' | 'updates'

export default function Software(): JSX.Element {
  const dialogs = useDialogs()
  const [status, setStatus] = useState<Status | null>(null)
  const [tab, setTab] = useState<Tab>('search')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PackageRef[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [updates, setUpdates] = useState<PackageRef[] | null>(null)
  const [loadingUpdates, setLoadingUpdates] = useState(false)

  const [transactions, setTransactions] = useState<Record<number, Transaction>>({})
  const labelForTx = useRef<Map<number, string>>(new Map())

  useEffect(() => {
    window.vega.ping().then(setStatus)

    const offProgress = window.vega.onTransactionProgress((evt: TransactionProgressEvent) => {
      setTransactions((prev) => ({
        ...prev,
        [evt.transactionId]: {
          id: evt.transactionId,
          label: labelForTx.current.get(evt.transactionId) ?? `Transação #${evt.transactionId}`,
          percent: evt.percent,
          message: evt.message,
          done: false
        }
      }))
    })

    const offFinished = window.vega.onTransactionFinished((evt: TransactionFinishedEvent) => {
      setTransactions((prev) => ({
        ...prev,
        [evt.transactionId]: {
          id: evt.transactionId,
          label: labelForTx.current.get(evt.transactionId) ?? `Transação #${evt.transactionId}`,
          percent: 100,
          message: evt.message,
          done: true,
          success: evt.success
        }
      }))
      // Refresh whichever list is showing once a transaction settles.
      if (tab === 'search' && query.trim()) runSearchQuery(query.trim())
      if (tab === 'updates') loadUpdates()
    })

    return () => {
      offProgress()
      offFinished()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runSearchQuery(q: string): Promise<void> {
    setSearching(true)
    setError(null)
    try {
      const rows = await window.vega.search(q)
      setResults(rows)
    } catch (err) {
      setError((err as Error).message)
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  async function onSearchSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!query.trim()) return
    await runSearchQuery(query.trim())
  }

  async function loadUpdates(): Promise<void> {
    setLoadingUpdates(true)
    setError(null)
    try {
      const rows = await window.vega.listUpdates()
      setUpdates(rows)
    } catch (err) {
      setError((err as Error).message)
      setUpdates(null)
    } finally {
      setLoadingUpdates(false)
    }
  }

  useEffect(() => {
    if (tab === 'updates' && updates === null && !loadingUpdates) {
      loadUpdates()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function handleInstall(pkg: PackageRef): Promise<void> {
    const txId = await window.vega.install(pkg.origin, pkg.id)
    labelForTx.current.set(txId, `Instalando ${pkg.name || pkg.id}`)
    setTransactions((prev) => ({
      ...prev,
      [txId]: { id: txId, label: `Instalando ${pkg.name || pkg.id}`, percent: 0, message: 'Iniciando...', done: false }
    }))
  }

  async function handleRemove(pkg: PackageRef): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Remover pacote',
      message: `Remover ${pkg.name || pkg.id}? Essa ação pode desfazer alterações locais.`,
      variant: 'danger',
      confirmLabel: 'Remover'
    })
    if (!ok) return
    const txId = await window.vega.remove(pkg.origin, pkg.id)
    labelForTx.current.set(txId, `Removendo ${pkg.name || pkg.id}`)
    setTransactions((prev) => ({
      ...prev,
      [txId]: { id: txId, label: `Removendo ${pkg.name || pkg.id}`, percent: 0, message: 'Iniciando...', done: false }
    }))
  }

  async function handleUpdateAll(): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Atualizar tudo',
      message: 'Executar atualização completa do sistema e dos Flatpaks agora?',
      variant: 'warning',
      confirmLabel: 'Atualizar'
    })
    if (!ok) return
    const txId = await window.vega.updateAll()
    labelForTx.current.set(txId, 'Atualizando tudo')
    setTransactions((prev) => ({
      ...prev,
      [txId]: { id: txId, label: 'Atualizando tudo', percent: 0, message: 'Iniciando...', done: false }
    }))
  }

  async function handleClearCache(): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Limpar cache',
      message: 'Remover cache de pacotes e runtimes órfãos agora?',
      variant: 'warning',
      confirmLabel: 'Limpar'
    })
    if (!ok) return
    const txId = await window.vega.clearCache()
    labelForTx.current.set(txId, 'Limpando cache')
    setTransactions((prev) => ({
      ...prev,
      [txId]: { id: txId, label: 'Limpando cache', percent: 0, message: 'Iniciando...', done: false }
    }))
  }

  const activeList = tab === 'search' ? results : updates
  const listLoading = tab === 'search' ? searching : loadingUpdates

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Software</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
            Oficial (Pacman) e Flathub em um só lugar
          </p>
        </div>
        {status && (
          <span className={`status-pill ${status.connected ? 'status-pill--ok' : 'status-pill--warn'}`}>
            {status.connected ? `vegad ${status.version}` : 'vegad indisponível'}
          </span>
        )}
      </div>

      {Object.values(transactions).length > 0 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.values(transactions)
            .sort((a, b) => b.id - a.id)
            .map((tx) => (
              <div key={tx.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                  <span>{tx.label}</span>
                  <span
                    style={{
                      color: tx.done
                        ? tx.success
                          ? 'var(--lyra-success)'
                          : 'var(--lyra-danger)'
                        : 'var(--lyra-text-muted)'
                    }}
                  >
                    {tx.message}
                  </span>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    height: 6,
                    borderRadius: 999,
                    background: 'var(--lyra-surface-raised)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: `${tx.percent}%`,
                      height: '100%',
                      background: tx.done && !tx.success ? 'var(--lyra-danger)' : 'var(--lyra-gradient)',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
              </div>
            ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => setTab('search')}
          className={`sidebar__item ${tab === 'search' ? 'sidebar__item--active' : ''}`}
          style={{ width: 'auto' }}
        >
          Buscar
        </button>
        <button
          onClick={() => setTab('updates')}
          className={`sidebar__item ${tab === 'updates' ? 'sidebar__item--active' : ''}`}
          style={{ width: 'auto' }}
        >
          Atualizações{updates && updates.length > 0 ? ` (${updates.length})` : ''}
        </button>
        <div style={{ flex: 1 }} />
        {tab === 'updates' && (
          <button
            onClick={handleUpdateAll}
            disabled={!updates || updates.length === 0}
            style={{
              padding: '0 16px',
              borderRadius: 'var(--lyra-radius-sm)',
              border: 'none',
              background: 'var(--lyra-gradient)',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            Atualizar tudo
          </button>
        )}
        {tab === 'search' && (
          <button
            onClick={handleClearCache}
            style={{
              padding: '0 16px',
              borderRadius: 'var(--lyra-radius-sm)',
              border: '1px solid var(--lyra-border)',
              background: 'transparent',
              color: 'var(--lyra-text-muted)',
              cursor: 'pointer'
            }}
          >
            Limpar cache
          </button>
        )}
      </div>

      {tab === 'search' && (
        <form onSubmit={onSearchSubmit} style={{ display: 'flex', gap: 8 }}>
          <input
            className="sidebar__search"
            style={{ marginBottom: 0, flex: 1 }}
            placeholder="Buscar pacotes (ex: firefox)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            disabled={searching}
            style={{
              padding: '0 18px',
              borderRadius: 'var(--lyra-radius-sm)',
              border: 'none',
              background: 'var(--lyra-gradient)',
              color: '#fff',
              cursor: 'pointer'
            }}
          >
            {searching ? 'Buscando...' : 'Buscar'}
          </button>
        </form>
      )}

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {tab === 'search' && activeList === null && !error && (
        <EmptyState title="Busca de pacotes" message="Digite um termo e busque nas origens Oficial e Flathub." />
      )}

      {tab === 'updates' && listLoading && activeList === null && (
        <EmptyState title="Verificando atualizações..." message="" />
      )}

      {activeList !== null && activeList.length === 0 && !listLoading && (
        <EmptyState
          title={tab === 'search' ? 'Nenhum resultado' : 'Tudo em dia'}
          message={tab === 'search' ? `Nada encontrado para "${query}".` : 'Nenhuma atualização pendente.'}
        />
      )}

      {activeList !== null && activeList.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activeList.map((pkg) => (
            <div
              key={`${pkg.origin}:${pkg.id}`}
              className="card"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px' }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{pkg.name || pkg.id}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--lyra-text-muted)' }}>{pkg.description}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="status-pill">{originLabel[pkg.origin] ?? pkg.origin}</span>
                {tab === 'search' &&
                  (pkg.installed ? (
                    <button
                      onClick={() => handleRemove(pkg)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 'var(--lyra-radius-sm)',
                        border: '1px solid var(--lyra-border)',
                        background: 'transparent',
                        color: 'var(--lyra-danger)',
                        cursor: 'pointer'
                      }}
                    >
                      Remover
                    </button>
                  ) : (
                    <button
                      onClick={() => handleInstall(pkg)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 'var(--lyra-radius-sm)',
                        border: 'none',
                        background: 'var(--lyra-gradient)',
                        color: '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      Instalar
                    </button>
                  ))}
                {tab === 'updates' && (
                  <button
                    onClick={() => handleInstall(pkg)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--lyra-radius-sm)',
                      border: 'none',
                      background: 'var(--lyra-gradient)',
                      color: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    Atualizar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
