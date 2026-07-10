import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'

interface WallpaperInfo {
  id: string
  name: string
  path: string
  uri: string
  source: string
}

const buttonStyle = {
  padding: '7px 12px',
  borderRadius: 'var(--lyra-radius-sm)',
  border: '1px solid var(--lyra-border)',
  background: 'transparent',
  color: 'var(--lyra-text)',
  cursor: 'pointer'
}

export default function Wallpapers(): JSX.Element {
  const [wallpapers, setWallpapers] = useState<WallpaperInfo[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const selected = wallpapers.find((wallpaper) => wallpaper.id === selectedId)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const rows = await window.vega.listWallpapers()
      setWallpapers(rows)
      setSelectedId((current) => (current && rows.some((row) => row.id === current) ? current : rows[0]?.id ?? ''))
    } catch (err) {
      setError((err as Error).message)
      setWallpapers([])
      setSelectedId('')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function applySelected(): Promise<void> {
    if (!selected) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const backend = await window.vega.applyWallpaper(selected.path)
      setMessage(`Wallpaper aplicado via ${backend}.`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Wallpapers</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Wallpapers do sistema e plano de fundo da área de trabalho
        </p>
      </div>

      {error && <div className="card" style={{ color: 'var(--lyra-danger)' }}>Falha: {error}</div>}
      {message && <div className="card" style={{ color: 'var(--lyra-success)' }}>{message}</div>}
      {loading && <EmptyState title="Carregando wallpapers..." />}

      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Prévia</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={refresh} disabled={busy} style={buttonStyle}>Atualizar</button>
            <button
              onClick={applySelected}
              disabled={busy || !selected}
              style={{ ...buttonStyle, border: 'none', background: 'var(--lyra-gradient)', color: '#fff' }}
            >
              {busy ? 'Aplicando...' : 'Aplicar'}
            </button>
          </div>
        </div>
        {selected ? (
          <div
            style={{
              minHeight: 280,
              borderRadius: 'var(--lyra-radius-sm)',
              border: '1px solid var(--lyra-border)',
              backgroundImage: `url("${selected.uri}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              display: 'flex',
              alignItems: 'flex-end',
              padding: 16,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                maxWidth: 420,
                padding: 12,
                borderRadius: 8,
                background: 'rgba(11, 11, 16, 0.72)',
                border: '1px solid rgba(255, 255, 255, 0.18)'
              }}
            >
              <div style={{ fontWeight: 600 }}>{selected.name}</div>
              <div style={{ marginTop: 4, color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>{selected.path}</div>
            </div>
          </div>
        ) : (
          <EmptyState title="Nenhum wallpaper encontrado" message="A busca cobre /usr/share/backgrounds, /usr/share/wallpapers e a pasta Wallpapers do usuário." />
        )}
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Coleção</h2>
        {wallpapers.length === 0 ? (
          <EmptyState title="Coleção vazia" message="Instale wallpapers do sistema ou coloque imagens em ~/Pictures/Wallpapers." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {wallpapers.map((wallpaper) => {
              const selectedWallpaper = wallpaper.id === selectedId
              return (
                <button
                  key={wallpaper.id}
                  onClick={() => setSelectedId(wallpaper.id)}
                  style={{
                    padding: 0,
                    borderRadius: 'var(--lyra-radius-sm)',
                    border: selectedWallpaper ? '2px solid var(--lyra-blue)' : '1px solid var(--lyra-border)',
                    background: 'var(--lyra-surface-raised)',
                    color: 'var(--lyra-text)',
                    textAlign: 'left',
                    overflow: 'hidden',
                    cursor: 'pointer'
                  }}
                >
                  <div
                    style={{
                      height: 112,
                      backgroundImage: `url("${wallpaper.uri}")`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center'
                    }}
                  />
                  <div style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {wallpaper.name}
                    </div>
                    <div style={{ marginTop: 4, color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>
                      {wallpaper.source}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
