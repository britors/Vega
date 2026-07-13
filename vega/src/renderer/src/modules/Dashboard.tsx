import { useEffect, useState } from 'react'
import { useNavigation } from '../components/navigation/NavigationContext'
import type { SystemModule } from '../../../main/system/types'

interface CardState {
  title: string
  value: string
  detail: string
  tone: 'ok' | 'warn' | 'danger' | 'neutral'
  moduleId: SystemModule
}

const toneColor: Record<CardState['tone'], string> = {
  ok: 'var(--lyra-success)',
  warn: 'var(--lyra-warning)',
  danger: 'var(--lyra-danger)',
  neutral: 'var(--lyra-text)'
}

function formatAge(timestampSeconds: number): string {
  const days = Math.floor((Date.now() / 1000 - timestampSeconds) / 86400)
  if (days <= 0) return 'hoje'
  if (days === 1) return 'há 1 dia'
  return `há ${days} dias`
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value)) return '-'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let amount = value
  let unit = 0
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit++ }
  return `${amount.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export default function Dashboard(): JSX.Element {
  const { navigate } = useNavigation()
  const [cards, setCards] = useState<CardState[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      setError(null)
      try {
        const capabilities = await window.vega.getCapabilities()
        if (capabilities.platform === 'windows') {
          const [system, metrics, disk] = await Promise.all([
            window.vega.ping(), window.vega.systemMetrics(), window.vega.diskUsage()
          ])
          if (cancelled) return
          const memoryPercent = metrics.memTotal > 0 ? (metrics.memUsed / metrics.memTotal) * 100 : 0
          setCards([
            // Pontos de Restauração/Snapper é deliberadamente ausente no Windows.
            { title: 'Sistema', value: system.distro, detail: `build ${system.build || 'indisponível'} · ${system.architecture || 'arquitetura desconhecida'}`, tone: 'neutral', moduleId: 'about' },
            { title: 'Agente Vega', value: system.connected ? 'Conectado' : 'Desconectado', detail: `versão ${system.version}`, tone: system.connected ? 'ok' : 'danger', moduleId: 'about' },
            { title: 'CPU', value: `${metrics.cpuPercent.toFixed(0)}%`, detail: 'uso geral', tone: metrics.cpuPercent >= 90 ? 'danger' : metrics.cpuPercent >= 75 ? 'warn' : 'ok', moduleId: 'monitor' },
            { title: 'Memória', value: `${memoryPercent.toFixed(0)}%`, detail: `${formatBytes(metrics.memUsed)} de ${formatBytes(metrics.memTotal)}`, tone: memoryPercent >= 90 ? 'danger' : memoryPercent >= 75 ? 'warn' : 'ok', moduleId: 'monitor' },
            { title: 'Volume do sistema', value: `${disk.percent}%`, detail: `${disk.used} de ${disk.total} usados`, tone: disk.percent >= 90 ? 'danger' : disk.percent >= 75 ? 'warn' : 'ok', moduleId: 'storage' }
          ])
          return
        }
        const [updates, snapshots, backupConfigs, services, disk] = await Promise.all([
          window.vega.listUpdates(),
          window.vega.listSnapshots(),
          window.vega.listBackupConfigs(),
          window.vega.listManagedServices(),
          window.vega.diskUsage()
        ])

        let backupCard: CardState
        if (backupConfigs.length === 0) {
          backupCard = {
            title: 'Backup',
            value: 'Não configurado',
            detail: 'Nenhum destino de backup cadastrado',
            tone: 'warn',
            moduleId: 'backup'
          }
        } else {
          const runs = await window.vega.listBackupSnapshots(backupConfigs[0].id)
          const latest = runs.reduce<number | null>(
            (max, run) => (max === null || run.timestamp > max ? run.timestamp : max),
            null
          )
          backupCard = {
            title: 'Backup',
            value: latest === null ? 'Nunca rodou' : formatAge(latest),
            detail: `${backupConfigs.length} destino(s) configurado(s)`,
            tone: latest === null ? 'warn' : 'ok',
            moduleId: 'backup'
          }
        }

        const oldestSnapshot = snapshots.reduce<number | null>(
          (min, snap) => (min === null || snap.timestamp < min ? snap.timestamp : min),
          null
        )
        const strugglingServices = services.filter((s) => s.available && s.enabled && !s.active)

        if (cancelled) return
        setCards([
          {
            title: 'Atualizações',
            value: String(updates.length),
            detail: updates.length === 0 ? 'Tudo em dia' : 'pacote(s) pendente(s)',
            tone: updates.length === 0 ? 'ok' : 'warn',
            moduleId: 'software'
          },
          {
            title: 'Pontos de Restauração',
            value: String(snapshots.length),
            detail: oldestSnapshot === null ? 'Nenhum snapshot ainda' : `mais antigo: ${formatAge(oldestSnapshot)}`,
            tone: snapshots.length === 0 ? 'warn' : 'neutral',
            moduleId: 'snapshots'
          },
          backupCard,
          {
            title: 'Serviços',
            value: strugglingServices.length === 0 ? 'OK' : String(strugglingServices.length),
            detail:
              strugglingServices.length === 0
                ? 'Nenhum serviço com problema'
                : 'habilitado(s) mas parado(s)',
            tone: strugglingServices.length === 0 ? 'ok' : 'danger',
            moduleId: 'services'
          },
          {
            title: 'Disco (/)',
            value: `${disk.percent}%`,
            detail: `${disk.used} de ${disk.total} usados`,
            tone: disk.percent >= 90 ? 'danger' : disk.percent >= 75 ? 'warn' : 'ok',
            moduleId: 'hardware'
          }
        ])
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Painel</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>Visão geral do sistema</p>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {cards === null && !error && (
        <div className="card" style={{ color: 'var(--lyra-text-muted)' }}>
          Carregando...
        </div>
      )}

      {cards && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14
          }}
        >
          {cards.map((card) => (
            <button
              key={card.title}
              onClick={() => navigate(card.moduleId)}
              className="card"
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                border: '1px solid var(--lyra-border)',
                background: 'var(--lyra-surface)',
                color: 'inherit',
                font: 'inherit'
              }}
            >
              <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>{card.title}</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 700, color: toneColor[card.tone] }}>{card.value}</div>
              <div style={{ marginTop: 4, fontSize: '0.82rem', color: 'var(--lyra-text-muted)' }}>{card.detail}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
