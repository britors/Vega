import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'

const PRIORITIES = [
  { value: '', label: 'Todas as prioridades' },
  { value: 'err', label: 'Erro ou mais grave' },
  { value: 'warning', label: 'Aviso ou mais grave' },
  { value: 'info', label: 'Informação ou mais grave' },
  { value: 'debug', label: 'Tudo, incluindo debug' }
]

const SINCE_OPTIONS = [
  { value: '-15min', label: 'Últimos 15 min' },
  { value: '-1hour', label: 'Última hora' },
  { value: '-24hour', label: 'Últimas 24h' },
  { value: '-7day', label: 'Últimos 7 dias' },
  { value: '', label: 'Sem limite' }
]

const selectStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 'var(--lyra-radius-sm)',
  border: '1px solid var(--lyra-border)',
  background: 'var(--lyra-surface)',
  color: 'var(--lyra-text)'
}

export default function Logs(): JSX.Element {
  const [units, setUnits] = useState<string[]>([])
  const [unit, setUnit] = useState('')
  const [priority, setPriority] = useState('')
  const [since, setSince] = useState('-1hour')
  const [search, setSearch] = useState('')

  const [lines, setLines] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isWindows, setIsWindows] = useState(false)

  useEffect(() => {
    window.vega.getCapabilities().then((value) => {
      const windows = value.platform === 'windows'
      setIsWindows(windows)
      if (windows) setUnit('System')
    })
    window.vega
      .listLogUnits()
      .then(setUnits)
      .catch(() => setUnits([]))
  }, [])

  async function runQuery(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const rows = await window.vega.queryLogs(unit, priority, since, search.trim(), 500)
      setLines(rows)
    } catch (err) {
      setError((err as Error).message)
      setLines(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runQuery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    await runQuery()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Log do Sistema</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          {isWindows ? 'Consulta somente leitura no Windows Event Log, usando as permissões da sua conta' : 'Consulta somente leitura do journal (journalctl)'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={unit} onChange={(e) => setUnit(e.target.value)} style={selectStyle}>
          <option value="">{isWindows ? 'System (padrão)' : 'Todas as unidades'}</option>
          {units.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} style={selectStyle}>
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <select value={since} onChange={(e) => setSince(e.target.value)} style={selectStyle}>
          {SINCE_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          className="sidebar__search"
          style={{ margin: 0, flex: 1, minWidth: 160 }}
          placeholder="Buscar texto no log..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '8px 18px',
            borderRadius: 'var(--lyra-radius-sm)',
            border: 'none',
            background: 'var(--lyra-gradient)',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {isWindows && (
        <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>
          Canais sem permissão retornam erro; o Vega não eleva nem amplia a leitura silenciosamente.
        </div>
      )}

      {loading && lines === null && <EmptyState title="Carregando log..." message="" />}

      {lines !== null && lines.length === 0 && !loading && (
        <EmptyState title="Nenhuma entrada" message="Nada encontrado para os filtros selecionados." />
      )}

      {lines !== null && lines.length > 0 && (
        <div className="card">
          <pre className="dialog__code" style={{ margin: 0, maxHeight: '60vh' }}>
            {lines.join('\n')}
          </pre>
        </div>
      )}
    </div>
  )
}
