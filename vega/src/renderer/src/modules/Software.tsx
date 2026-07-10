import { useEffect, useMemo, useRef, useState } from 'react'
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
  icon?: string
}

interface PackageDetails {
  origin: string
  id: string
  name: string
  description: string
  installed: boolean
  installedVersion: string
  availableVersion: string
  downloadSize: string
  installedSize: string
  dependencies: string[]
  licenses: string[]
  url: string
  maintainer: string
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
  flathub: 'Flathub',
  aur: 'Comunidade'
}

type Tab = 'search' | 'installed' | 'updates' | 'recommended'
type ViewMode = 'list' | 'cards'

interface RecommendedApp {
  label: string
  query: string
  matchIds: string[]
}

// Curated one-click picks — matchIds narrows each search to the specific
// package(s) that are actually this app (searching "chrome" also surfaces
// unrelated chrome-* packages, etc.), across whichever origin has it.
const RECOMMENDED_APPS: RecommendedApp[] = [
  { label: 'Firefox', query: 'firefox', matchIds: ['firefox'] },
  { label: 'Google Chrome', query: 'chrome', matchIds: ['com.google.Chrome', 'google-chrome'] },
  { label: 'LibreOffice', query: 'libreoffice', matchIds: ['libreoffice-fresh', 'libreoffice-still'] },
  { label: 'VLC', query: 'vlc', matchIds: ['vlc'] },
  { label: 'Audacity', query: 'audacity', matchIds: ['audacity', 'org.audacityteam.Audacity'] },
  { label: 'GIMP', query: 'gimp', matchIds: ['gimp', 'org.gimp.GIMP'] },
  { label: 'Thunderbird', query: 'thunderbird', matchIds: ['thunderbird'] },
  { label: 'Okular', query: 'okular', matchIds: ['okular', 'org.kde.okular'] },
  { label: 'Kdenlive', query: 'kdenlive', matchIds: ['kdenlive', 'org.kde.kdenlive'] },
  { label: 'Bitwarden', query: 'bitwarden', matchIds: ['bitwarden', 'com.bitwarden.desktop'] },
  { label: 'Steam', query: 'steam', matchIds: ['steam', 'com.valvesoftware.Steam'] },
  { label: 'Proton (GE)', query: 'proton-ge', matchIds: ['proton-ge-custom-bin', 'proton-ge-custom'] },
  { label: 'VirtualBox', query: 'virtualbox', matchIds: ['virtualbox'] }
]

type GroupedPackage = {
  key: string
  title: string
  description: string
  items: PackageRef[]
}

function packageKey(pkg: PackageRef): string {
  return (pkg.name || pkg.id).trim().toLowerCase()
}

function preferredPackage(items: PackageRef[]): PackageRef {
  const order = ['official', 'flathub', 'aur']
  return [...items].sort((a, b) => order.indexOf(a.origin) - order.indexOf(b.origin))[0] ?? items[0]
}

function groupPackages(items: PackageRef[] | null): GroupedPackage[] {
  if (!items) return []
  const groups = new Map<string, PackageRef[]>()
  for (const pkg of items) {
    const key = packageKey(pkg)
    groups.set(key, [...(groups.get(key) ?? []), pkg])
  }

  return [...groups.entries()].map(([key, values]) => {
    const primary = preferredPackage(values)
    return {
      key,
      title: primary.name || primary.id,
      description: primary.description,
      items: values
    }
  })
}

function iconSrc(icon: string | undefined): string {
  if (!icon) return ''
  return `file://${icon.split('/').map(encodeURIComponent).join('/')}`
}

function PackageIcon({ pkg, size = 42 }: { pkg: PackageRef; size?: number }): JSX.Element {
  const src = iconSrc(pkg.icon)
  const label = (pkg.name || pkg.id || '?').trim().slice(0, 1).toUpperCase()
  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    borderRadius: 8,
    border: '1px solid var(--lyra-border)',
    background: 'var(--lyra-surface-raised)',
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden'
  }

  if (src) {
    return (
      <div style={baseStyle}>
        <img src={src} alt="" style={{ width: '72%', height: '72%', objectFit: 'contain' }} />
      </div>
    )
  }

  return (
    <div style={{ ...baseStyle, color: 'var(--lyra-text-muted)', fontWeight: 700 }}>
      {label}
    </div>
  )
}

export default function Software(): JSX.Element {
  const dialogs = useDialogs()
  const [status, setStatus] = useState<Status | null>(null)
  const [tab, setTab] = useState<Tab>('search')
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PackageRef[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [updates, setUpdates] = useState<PackageRef[] | null>(null)
  const [loadingUpdates, setLoadingUpdates] = useState(false)
  const [installed, setInstalled] = useState<PackageRef[] | null>(null)
  const [loadingInstalled, setLoadingInstalled] = useState(false)

  const [recommended, setRecommended] = useState<(PackageRef | null)[] | null>(null)
  const [loadingRecommended, setLoadingRecommended] = useState(false)

  const [transactions, setTransactions] = useState<Record<number, Transaction>>({})
  const labelForTx = useRef<Map<number, string>>(new Map())
  const dismissTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const [selectedOrigins, setSelectedOrigins] = useState<Record<string, string>>({})

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<PackageDetails | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const tabRef = useRef(tab)
  useEffect(() => {
    tabRef.current = tab
  }, [tab])
  const queryRef = useRef(query)
  useEffect(() => {
    queryRef.current = query
  }, [query])

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
      // Refresh whichever list is showing once a transaction settles. Reads
      // via refs, not the closed-over tab/query state, since this handler
      // is registered once on mount and would otherwise see stale values.
      if (tabRef.current === 'search' && queryRef.current.trim()) runSearchQuery(queryRef.current.trim())
      if (tabRef.current === 'installed') loadInstalled()
      if (tabRef.current === 'updates') loadUpdates()
      if (tabRef.current === 'recommended') loadRecommended()

      // Auto-dismiss the progress bar a few seconds after completion —
      // long enough to read the outcome, short enough not to linger.
      const timer = setTimeout(() => {
        setTransactions((prev) => {
          const next = { ...prev }
          delete next[evt.transactionId]
          return next
        })
        dismissTimers.current.delete(evt.transactionId)
      }, 4000)
      dismissTimers.current.set(evt.transactionId, timer)
    })

    return () => {
      offProgress()
      offFinished()
      dismissTimers.current.forEach((timer) => clearTimeout(timer))
      dismissTimers.current.clear()
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

  async function loadInstalled(): Promise<void> {
    setLoadingInstalled(true)
    setError(null)
    try {
      const rows = await window.vega.listInstalled()
      setInstalled(rows)
    } catch (err) {
      setError((err as Error).message)
      setInstalled(null)
    } finally {
      setLoadingInstalled(false)
    }
  }

  useEffect(() => {
    if (tab === 'installed' && installed === null && !loadingInstalled) {
      loadInstalled()
    }
    if (tab === 'updates' && updates === null && !loadingUpdates) {
      loadUpdates()
    }
    if (tab === 'recommended' && recommended === null && !loadingRecommended) {
      loadRecommended()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function loadRecommended(): Promise<void> {
    setLoadingRecommended(true)
    setError(null)
    try {
      const matches = await Promise.all(
        RECOMMENDED_APPS.map(async (app) => {
          const rows: PackageRef[] = await window.vega.search(app.query)
          const candidates = rows.filter((row: PackageRef) => app.matchIds.includes(row.id))
          if (candidates.length === 0) return null
          return preferredPackage(candidates)
        })
      )
      setRecommended(matches)
    } catch (err) {
      setError((err as Error).message)
      setRecommended(null)
    } finally {
      setLoadingRecommended(false)
    }
  }

  async function openDetails(pkg: PackageRef): Promise<void> {
    setDetailOpen(true)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const rows = await window.vega.getPackageDetails(pkg.origin, pkg.id)
      setDetail(rows)
    } catch (err) {
      setDetailError((err as Error).message)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetails(): void {
    setDetailOpen(false)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(false)
  }

  async function handleInstall(pkg: PackageRef): Promise<void> {
    if (pkg.origin === 'aur') {
      let pkgbuild = ''
      try {
        pkgbuild = await window.vega.getAurPkgbuild(pkg.id)
      } catch (err) {
        setError((err as Error).message)
        return
      }
      const ok = await dialogs.confirm({
        title: `Instalar ${pkg.name || pkg.id} (Comunidade)`,
        message:
          'Pacotes da Comunidade (AUR) não são verificados pelo Lyra OS. Revise o script de build (PKGBUILD) abaixo antes de continuar.',
        code: pkgbuild,
        variant: 'warning',
        confirmLabel: 'Instalar'
      })
      if (!ok) return
    }

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

  async function handleOptimizeMirrors(): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Otimizar mirrors',
      message: 'Testar a velocidade dos mirrors do Pacman e atualizar a lista agora? Pode levar um tempo.',
      variant: 'warning',
      confirmLabel: 'Otimizar'
    })
    if (!ok) return
    const txId = await window.vega.optimizeMirrors()
    labelForTx.current.set(txId, 'Otimizando mirrors')
    setTransactions((prev) => ({
      ...prev,
      [txId]: { id: txId, label: 'Otimizando mirrors', percent: 0, message: 'Iniciando...', done: false }
    }))
  }

  const activeList = tab === 'search' ? results : tab === 'installed' ? installed : tab === 'updates' ? updates : null
  const listLoading = tab === 'search' ? searching : tab === 'installed' ? loadingInstalled : loadingUpdates
  const groupedList = useMemo(() => groupPackages(activeList), [activeList])

  function selectedPackageForGroup(group: GroupedPackage): PackageRef {
    const desired = selectedOrigins[group.key]
    return group.items.find((item) => item.origin === desired) ?? preferredPackage(group.items)
  }

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
          onClick={() => setTab('installed')}
          className={`sidebar__item ${tab === 'installed' ? 'sidebar__item--active' : ''}`}
          style={{ width: 'auto' }}
        >
          Instalados{installed && installed.length > 0 ? ` (${installed.length})` : ''}
        </button>
        <button
          onClick={() => setTab('updates')}
          className={`sidebar__item ${tab === 'updates' ? 'sidebar__item--active' : ''}`}
          style={{ width: 'auto' }}
        >
          Atualizações{updates && updates.length > 0 ? ` (${updates.length})` : ''}
        </button>
        <button
          onClick={() => setTab('recommended')}
          className={`sidebar__item ${tab === 'recommended' ? 'sidebar__item--active' : ''}`}
          style={{ width: 'auto' }}
        >
          Recomendados
        </button>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            padding: 3,
            borderRadius: 'var(--lyra-radius-sm)',
            border: '1px solid var(--lyra-border)',
            background: 'var(--lyra-surface)'
          }}
        >
          {(['list', 'cards'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: 'none',
                background: viewMode === mode ? 'var(--lyra-surface-raised)' : 'transparent',
                color: viewMode === mode ? 'var(--lyra-text)' : 'var(--lyra-text-muted)',
                cursor: 'pointer'
              }}
            >
              {mode === 'list' ? 'Lista' : 'Cards'}
            </button>
          ))}
        </div>
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
          <>
            <button
              onClick={handleOptimizeMirrors}
              style={{
                padding: '0 16px',
                borderRadius: 'var(--lyra-radius-sm)',
                border: '1px solid var(--lyra-border)',
                background: 'transparent',
                color: 'var(--lyra-text-muted)',
                cursor: 'pointer'
              }}
            >
              Otimizar mirrors
            </button>
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
          </>
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
        <EmptyState title="Busca de pacotes" message="Digite um termo e busque nas origens Oficial, Flathub e Comunidade." />
      )}

      {tab === 'updates' && listLoading && activeList === null && (
        <EmptyState title="Verificando atualizações..." message="" />
      )}

      {tab === 'installed' && listLoading && activeList === null && (
        <EmptyState title="Carregando pacotes instalados..." message="" />
      )}

      {activeList !== null && activeList.length === 0 && !listLoading && (
        <EmptyState
          title={tab === 'search' ? 'Nenhum resultado' : tab === 'installed' ? 'Nenhum pacote listado' : 'Tudo em dia'}
          message={
            tab === 'search'
              ? `Nada encontrado para "${query}".`
              : tab === 'installed'
                ? 'O sistema ainda não reportou pacotes instalados.'
                : 'Nenhuma atualização pendente.'
          }
        />
      )}

      {groupedList.length > 0 && (
        <div
          style={{
            display: viewMode === 'cards' ? 'grid' : 'flex',
            gridTemplateColumns: viewMode === 'cards' ? 'repeat(auto-fill, minmax(220px, 1fr))' : undefined,
            flexDirection: viewMode === 'cards' ? undefined : 'column',
            gap: 10
          }}
        >
          {groupedList.map((group) => {
            const pkg = selectedPackageForGroup(group)
            const isCards = viewMode === 'cards'
            return (
              <div
                key={group.key}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: isCards ? 'column' : 'row',
                  justifyContent: 'space-between',
                  alignItems: isCards ? 'stretch' : 'center',
                  gap: isCards ? 14 : 12,
                  padding: isCards ? 16 : '14px 18px',
                  minHeight: isCards ? 210 : undefined
                }}
              >
                <div
                  style={{
                    minWidth: 0,
                    flex: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: isCards ? 'column' : 'row',
                    gap: isCards ? 12 : 14,
                    alignItems: isCards ? 'flex-start' : 'center'
                  }}
                  onClick={() => openDetails(pkg)}
                >
                  {isCards && <PackageIcon pkg={pkg} size={54} />}
                  {!isCards && <PackageIcon pkg={pkg} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{group.title}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--lyra-text-muted)', marginTop: 3 }}>
                      {group.description || pkg.id}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                      {group.items.map((item) => (
                        <button
                          key={`${group.key}:${item.origin}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedOrigins((prev) => ({
                              ...prev,
                              [group.key]: item.origin
                            }))
                          }}
                          style={{
                            padding: '3px 8px',
                            borderRadius: 999,
                            border: item.origin === pkg.origin ? 'none' : '1px solid var(--lyra-border)',
                            background: item.origin === pkg.origin ? 'var(--lyra-gradient)' : 'transparent',
                            color: item.origin === pkg.origin ? '#fff' : 'var(--lyra-text-muted)',
                            cursor: 'pointer',
                            fontSize: '0.78rem'
                          }}
                        >
                          {originLabel[item.origin] ?? item.origin}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCards ? 'space-between' : 'flex-end',
                    gap: 10
                  }}
                >
                  <span className="status-pill">{originLabel[pkg.origin] ?? pkg.origin}</span>
                  {(tab === 'search' || tab === 'installed') &&
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
            )
          })}
        </div>
      )}

      {tab === 'recommended' && loadingRecommended && recommended === null && (
        <EmptyState title="Carregando recomendações..." message="" />
      )}

      {tab === 'recommended' && recommended && (
        <div
          style={{
            display: viewMode === 'cards' ? 'grid' : 'flex',
            gridTemplateColumns: viewMode === 'cards' ? 'repeat(auto-fill, minmax(220px, 1fr))' : undefined,
            flexDirection: viewMode === 'cards' ? undefined : 'column',
            gap: 10
          }}
        >
          {RECOMMENDED_APPS.map((app, index) => {
            const pkg = recommended[index]
            const isCards = viewMode === 'cards'
            return (
              <div
                key={app.label}
                className="card"
                style={{
                  display: 'flex',
                  flexDirection: isCards ? 'column' : 'row',
                  justifyContent: 'space-between',
                  alignItems: isCards ? 'stretch' : 'center',
                  gap: isCards ? 14 : 12,
                  padding: isCards ? 16 : '14px 18px',
                  minHeight: isCards ? 190 : undefined
                }}
              >
                <div
                  style={{
                    minWidth: 0,
                    flex: 1,
                    cursor: pkg ? 'pointer' : 'default',
                    display: 'flex',
                    flexDirection: isCards ? 'column' : 'row',
                    gap: isCards ? 12 : 14,
                    alignItems: isCards ? 'flex-start' : 'center'
                  }}
                  onClick={() => pkg && openDetails(pkg)}
                >
                  {pkg && <PackageIcon pkg={pkg} size={isCards ? 54 : 42} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{app.label}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--lyra-text-muted)', marginTop: 3 }}>
                      {pkg ? pkg.description || pkg.id : 'Indisponível neste sistema'}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isCards ? 'space-between' : 'flex-end',
                    gap: 10
                  }}
                >
                  {pkg && <span className="status-pill">{originLabel[pkg.origin] ?? pkg.origin}</span>}
                  {pkg &&
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
                </div>
              </div>
            )
          })}
        </div>
      )}

      {detailOpen && (
        <div className="dialog-backdrop" role="presentation" onClick={closeDetails}>
          <div
            className="dialog"
            style={{ width: 'min(560px, calc(100vw - 32px))' }}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading && <p className="dialog__message">Carregando detalhes...</p>}

            {!detailLoading && detailError && (
              <>
                <h2 className="dialog__title">Falha ao carregar detalhes</h2>
                <p className="dialog__message" style={{ color: 'var(--lyra-danger)' }}>
                  {detailError}
                </p>
              </>
            )}

            {!detailLoading && !detailError && detail && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <h2 className="dialog__title">{detail.name || detail.id}</h2>
                  <span className="status-pill">{originLabel[detail.origin] ?? detail.origin}</span>
                </div>
                <p className="dialog__message">{detail.description || 'Sem descrição disponível.'}</p>

                <div
                  style={{
                    marginTop: 14,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 10,
                    fontSize: '0.85rem'
                  }}
                >
                  {detail.installed && detail.installedVersion && (
                    <div>
                      <div style={{ color: 'var(--lyra-text-muted)' }}>Versão instalada</div>
                      <div>{detail.installedVersion}</div>
                    </div>
                  )}
                  {detail.availableVersion && (
                    <div>
                      <div style={{ color: 'var(--lyra-text-muted)' }}>Versão disponível</div>
                      <div>{detail.availableVersion}</div>
                    </div>
                  )}
                  {detail.downloadSize && (
                    <div>
                      <div style={{ color: 'var(--lyra-text-muted)' }}>Tamanho de download</div>
                      <div>{detail.downloadSize}</div>
                    </div>
                  )}
                  {detail.installedSize && (
                    <div>
                      <div style={{ color: 'var(--lyra-text-muted)' }}>Tamanho instalado</div>
                      <div>{detail.installedSize}</div>
                    </div>
                  )}
                  {detail.licenses.length > 0 && (
                    <div>
                      <div style={{ color: 'var(--lyra-text-muted)' }}>Licenças</div>
                      <div>{detail.licenses.join(' ')}</div>
                    </div>
                  )}
                  {detail.maintainer && (
                    <div>
                      <div style={{ color: 'var(--lyra-text-muted)' }}>Mantenedor</div>
                      <div>{detail.maintainer}</div>
                    </div>
                  )}
                </div>

                {detail.dependencies.length > 0 && (
                  <div style={{ marginTop: 14, fontSize: '0.85rem' }}>
                    <div style={{ color: 'var(--lyra-text-muted)', marginBottom: 6 }}>Dependências</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {detail.dependencies.map((dep) => (
                        <span
                          key={dep}
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            border: '1px solid var(--lyra-border)',
                            color: 'var(--lyra-text-muted)',
                            fontSize: '0.78rem'
                          }}
                        >
                          {dep}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {detail.url && (
                  <p className="dialog__message" style={{ marginTop: 14 }}>
                    <a href={detail.url} target="_blank" rel="noreferrer" style={{ color: 'var(--lyra-text)' }}>
                      {detail.url}
                    </a>
                  </p>
                )}
              </>
            )}

            <div className="dialog__actions">
              <button className="dialog__button" onClick={closeDetails}>
                Fechar
              </button>
              {!detailLoading && !detailError && detail && (
                <>
                  {detail.installed ? (
                    <button
                      className="dialog__button"
                      style={{ color: 'var(--lyra-danger)' }}
                      onClick={() => {
                        closeDetails()
                        handleRemove(detail)
                      }}
                    >
                      Remover
                    </button>
                  ) : (
                    <button
                      className="dialog__button dialog__button--primary"
                      onClick={() => {
                        closeDetails()
                        handleInstall(detail)
                      }}
                    >
                      Instalar
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
