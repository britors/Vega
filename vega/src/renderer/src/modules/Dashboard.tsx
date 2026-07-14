import { useEffect, useState } from 'react'
import { useNavigation } from '../components/navigation/NavigationContext'
import type { SystemModule } from '../../../main/system/types'

type CardTone = 'ok' | 'warn' | 'danger' | 'neutral'

interface CardSlot {
  title: string
  moduleId: SystemModule
  loading: boolean
  error?: string
  value?: string
  detail?: string
  tone?: CardTone
}

const toneColor: Record<CardTone, string> = {
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

  const [snapshotsSupported, setSnapshotsSupported] = useState<boolean | null>(null)
  const [capError, setCapError] = useState<string | null>(null)

  const [updatesCard, setUpdatesCard] = useState<CardSlot>({
    title: 'Atualizações',
    moduleId: 'software',
    loading: true
  })
  const [snapshotsCard, setSnapshotsCard] = useState<CardSlot>({
    title: 'Pontos de Restauração',
    moduleId: 'snapshots',
    loading: true
  })
  const [backupCard, setBackupCard] = useState<CardSlot>({
    title: 'Backup',
    moduleId: 'backup',
    loading: true
  })
  const [servicesCard, setServicesCard] = useState<CardSlot>({
    title: 'Serviços',
    moduleId: 'services',
    loading: true
  })
  const [diskCard, setDiskCard] = useState<CardSlot>({
    title: 'Disco (/)',
    moduleId: 'hardware',
    loading: true
  })

  // Each card fetches and renders its own data independently, so a slow
  // request only keeps its own card in "Carregando..." instead of blocking
  // the whole panel.

  useEffect(() => {
    let cancelled = false
    window.vega
      .getCapabilities()
      .then((capabilities) => {
        if (!cancelled) setSnapshotsSupported(capabilities.modules.includes('snapshots'))
      })
      .catch((err) => {
        if (!cancelled) setCapError((err as Error).message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    window.vega
      .listUpdates()
      .then((updates) => {
        if (cancelled) return
        setUpdatesCard((prev) => ({
          ...prev,
          loading: false,
          value: String(updates.length),
          detail: updates.length === 0 ? 'Tudo em dia' : 'pacote(s) pendente(s)',
          tone: updates.length === 0 ? 'ok' : 'warn'
        }))
      })
      .catch((err) => {
        if (!cancelled) setUpdatesCard((prev) => ({ ...prev, loading: false, error: (err as Error).message }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (snapshotsSupported !== true) return
    let cancelled = false
    window.vega
      .listSnapshots()
      .then((snapshots) => {
        if (cancelled) return
        const oldestSnapshot = snapshots.reduce<number | null>(
          (min, snap) => (min === null || snap.timestamp < min ? snap.timestamp : min),
          null
        )
        setSnapshotsCard((prev) => ({
          ...prev,
          loading: false,
          value: String(snapshots.length),
          detail: oldestSnapshot === null ? 'Nenhum snapshot ainda' : `mais antigo: ${formatAge(oldestSnapshot)}`,
          tone: snapshots.length === 0 ? 'warn' : 'neutral'
        }))
      })
      .catch((err) => {
        if (!cancelled) setSnapshotsCard((prev) => ({ ...prev, loading: false, error: (err as Error).message }))
      })
    return () => {
      cancelled = true
    }
  }, [snapshotsSupported])

  useEffect(() => {
    let cancelled = false
    window.vega
      .listBackupConfigs()
      .then(async (backupConfigs) => {
        if (backupConfigs.length === 0) {
          if (!cancelled) {
            setBackupCard((prev) => ({
              ...prev,
              loading: false,
              value: 'Não configurado',
              detail: 'Nenhum destino de backup cadastrado',
              tone: 'warn'
            }))
          }
          return
        }
        const runs = await window.vega.listBackupSnapshots(backupConfigs[0].id)
        if (cancelled) return
        const latest = runs.reduce<number | null>(
          (max, run) => (max === null || run.timestamp > max ? run.timestamp : max),
          null
        )
        setBackupCard((prev) => ({
          ...prev,
          loading: false,
          value: latest === null ? 'Nunca rodou' : formatAge(latest),
          detail: `${backupConfigs.length} destino(s) configurado(s)`,
          tone: latest === null ? 'warn' : 'ok'
        }))
      })
      .catch((err) => {
        if (!cancelled) setBackupCard((prev) => ({ ...prev, loading: false, error: (err as Error).message }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    window.vega
      .listManagedServices()
      .then((services) => {
        if (cancelled) return
        const strugglingServices = services.filter((s) => s.available && s.enabled && !s.active)
        setServicesCard((prev) => ({
          ...prev,
          loading: false,
          value: strugglingServices.length === 0 ? 'OK' : String(strugglingServices.length),
          detail:
            strugglingServices.length === 0 ? 'Nenhum serviço com problema' : 'habilitado(s) mas parado(s)',
          tone: strugglingServices.length === 0 ? 'ok' : 'danger'
        }))
      })
      .catch((err) => {
        if (!cancelled) setServicesCard((prev) => ({ ...prev, loading: false, error: (err as Error).message }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    window.vega
      .diskUsage()
      .then((disk) => {
        if (cancelled) return
        setDiskCard((prev) => ({
          ...prev,
          loading: false,
          value: `${disk.percent}%`,
          detail: `${disk.used} de ${disk.total} usados`,
          tone: disk.percent >= 90 ? 'danger' : disk.percent >= 75 ? 'warn' : 'ok'
        }))
      })
      .catch((err) => {
        if (!cancelled) setDiskCard((prev) => ({ ...prev, loading: false, error: (err as Error).message }))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const visibleCards = [
    updatesCard,
    ...(snapshotsSupported === false ? [] : [snapshotsCard]),
    backupCard,
    servicesCard,
    diskCard
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Painel</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>Visão geral do sistema</p>
      </div>

      {capError && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {capError}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 14
        }}
      >
        {visibleCards.map((card) => (
          <button
            key={card.title}
            onClick={() => !card.loading && !card.error && navigate(card.moduleId)}
            className="card"
            disabled={card.loading}
            style={{
              textAlign: 'left',
              cursor: card.loading ? 'default' : 'pointer',
              border: '1px solid var(--lyra-border)',
              background: 'var(--lyra-surface)',
              color: 'inherit',
              font: 'inherit'
            }}
          >
            <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>{card.title}</div>
            {card.loading ? (
              <div style={{ marginTop: 4, color: 'var(--lyra-text-muted)' }}>Carregando...</div>
            ) : card.error ? (
              <div style={{ marginTop: 4, color: 'var(--lyra-danger)', fontSize: '0.82rem' }}>
                Falha: {card.error}
              </div>
            ) : (
              <>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: toneColor[card.tone ?? 'neutral'] }}>
                  {card.value}
                </div>
                <div style={{ marginTop: 4, fontSize: '0.82rem', color: 'var(--lyra-text-muted)' }}>
                  {card.detail}
                </div>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
