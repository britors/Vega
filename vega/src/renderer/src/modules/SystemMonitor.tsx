import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface Metrics {
  cpuPercent: number
  memUsed: number
  memTotal: number
  swapUsed: number
  swapTotal: number
  diskReadBytes: number
  diskWriteBytes: number
  netRxBytes: number
  netTxBytes: number
}

interface ProcessRow {
  pid: number
  name: string
  user: string
  cpuPercent: number
  memory: number
  state: string
  protected?: boolean
}

function fmtBytes(value: number): string {
  if (!Number.isFinite(value)) return '-'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let next = value
  let unit = 0
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024
    unit++
  }
  return `${next.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

function meter(label: string, value: number, detail: string): JSX.Element {
  return (
    <div className="card" style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <strong>{label}</strong>
        <span>{Math.max(0, Math.min(100, value)).toFixed(0)}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--lyra-surface-raised)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: 'var(--lyra-gradient)' }} />
      </div>
      <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>{detail}</div>
    </div>
  )
}

export default function SystemMonitor(): JSX.Element {
  const dialogs = useDialogs()
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [prevMetrics, setPrevMetrics] = useState<Metrics | null>(null)
  const [processes, setProcesses] = useState<ProcessRow[]>([])
  const [sort, setSort] = useState<'cpu' | 'mem' | 'pid'>('cpu')
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    try {
      const [nextMetrics, nextProcesses] = await Promise.all([window.vega.systemMetrics(), window.vega.listProcesses()])
      setPrevMetrics(metrics)
      setMetrics(nextMetrics)
      setProcesses(nextProcesses)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  useEffect(() => {
    refresh()
    const id = window.setInterval(() => refresh(), 2500)
    return () => window.clearInterval(id)
  }, [metrics])

  const sorted = useMemo(() => {
    return [...processes].sort((a, b) => {
      if (sort === 'mem') return b.memory - a.memory
      if (sort === 'pid') return a.pid - b.pid
      return b.cpuPercent - a.cpuPercent
    })
  }, [processes, sort])

  async function killProcess(row: ProcessRow): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Encerrar processo',
      message: `Encerrar ${row.name} (PID ${row.pid})? Dados não salvos nesse processo podem ser perdidos.`,
      variant: 'danger',
      confirmLabel: 'Encerrar'
    })
    if (!ok) return
    try {
      await window.vega.killProcess(row.pid)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const memPercent = metrics && metrics.memTotal > 0 ? (metrics.memUsed / metrics.memTotal) * 100 : 0
  const swapPercent = metrics && metrics.swapTotal > 0 ? (metrics.swapUsed / metrics.swapTotal) * 100 : 0
  const diskRate = metrics && prevMetrics ? metrics.diskReadBytes + metrics.diskWriteBytes - prevMetrics.diskReadBytes - prevMetrics.diskWriteBytes : 0
  const netRate = metrics && prevMetrics ? metrics.netRxBytes + metrics.netTxBytes - prevMetrics.netRxBytes - prevMetrics.netTxBytes : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Monitor de Sistema</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Métricas ao vivo e processos em execução
        </p>
      </div>
      {error && <div className="card" style={{ color: 'var(--lyra-danger)' }}>Falha: {error}</div>}
      {!metrics ? (
        <EmptyState title="Carregando métricas..." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          {meter('CPU', metrics.cpuPercent, 'Uso geral')}
          {meter('RAM', memPercent, `${fmtBytes(metrics.memUsed)} de ${fmtBytes(metrics.memTotal)}`)}
          {meter('Swap', swapPercent, `${fmtBytes(metrics.swapUsed)} de ${fmtBytes(metrics.swapTotal)}`)}
          {meter('Disco', Math.min(100, diskRate / 1024 / 1024), `${fmtBytes(diskRate)} desde a última amostra`)}
          {meter('Rede', Math.min(100, netRate / 1024 / 1024), `${fmtBytes(netRate)} desde a última amostra`)}
        </div>
      )}
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Processos</h2>
          <div style={{ flex: 1 }} />
          <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} style={{ padding: '6px 10px', borderRadius: 'var(--lyra-radius-sm)', border: '1px solid var(--lyra-border)', background: 'var(--lyra-surface-raised)', color: 'var(--lyra-text)' }}>
            <option value="cpu">CPU</option>
            <option value="mem">Memória</option>
            <option value="pid">PID</option>
          </select>
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {sorted.slice(0, 80).map((row) => (
            <div key={row.pid} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 120px 90px 110px auto', gap: 10, alignItems: 'center', fontSize: '0.88rem' }}>
              <span>{row.pid}</span>
              <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</strong>
              <span>{row.user}</span>
              <span>{row.cpuPercent.toFixed(1)}%</span>
              <span>{fmtBytes(row.memory)}</span>
              <button disabled={row.protected} title={row.protected ? 'Processo crítico protegido pelo Vega' : 'Encerrar processo'} onClick={() => killProcess(row)} style={{ padding: '5px 10px', borderRadius: 'var(--lyra-radius-sm)', border: '1px solid var(--lyra-border)', background: 'transparent', color: row.protected ? 'var(--lyra-text-muted)' : 'var(--lyra-danger)' }}>{row.protected ? 'Protegido' : 'Encerrar'}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
