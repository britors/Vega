import { useState } from 'react'
import EmptyState from '../components/EmptyState'

interface WallpaperOption {
  id: string
  name: string
  source: string
  background: string
  accent: string
}

const wallpapers: WallpaperOption[] = [
  {
    id: 'lyra-dawn',
    name: 'Lyra Dawn',
    source: 'Coleção Lyra',
    background:
      'linear-gradient(135deg, #162238 0%, #3d5c7c 42%, #d89166 100%)',
    accent: '#d89166'
  },
  {
    id: 'deep-field',
    name: 'Deep Field',
    source: 'Coleção Lyra',
    background:
      'linear-gradient(135deg, #10131f 0%, #2f3f5f 48%, #6a8fbf 100%)',
    accent: '#6a8fbf'
  },
  {
    id: 'greenline',
    name: 'Greenline',
    source: 'Coleção Lyra',
    background:
      'linear-gradient(135deg, #10231d 0%, #2d6f5d 46%, #9fcf9a 100%)',
    accent: '#9fcf9a'
  },
  {
    id: 'graphite',
    name: 'Graphite',
    source: 'Sistema',
    background:
      'linear-gradient(135deg, #17191f 0%, #3a4048 52%, #a8adb4 100%)',
    accent: '#a8adb4'
  }
]

export default function Wallpapers(): JSX.Element {
  const [selectedId, setSelectedId] = useState(wallpapers[0]?.id ?? '')
  const selected = wallpapers.find((wallpaper) => wallpaper.id === selectedId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Wallpapers</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Plano de fundo da área de trabalho
        </p>
      </div>

      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Prévia</h2>
        {selected ? (
          <div
            style={{
              minHeight: 220,
              borderRadius: 'var(--lyra-radius-sm)',
              border: '1px solid var(--lyra-border)',
              background: selected.background,
              display: 'flex',
              alignItems: 'flex-end',
              padding: 16,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: 180,
                height: 96,
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.28)',
                background: 'rgba(11, 11, 16, 0.62)',
                boxShadow: '0 18px 40px rgba(0, 0, 0, 0.28)'
              }}
            />
          </div>
        ) : (
          <EmptyState title="Nenhum wallpaper selecionado" />
        )}
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Coleção</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {wallpapers.map((wallpaper) => {
            const selectedWallpaper = wallpaper.id === selectedId
            return (
              <button
                key={wallpaper.id}
                onClick={() => setSelectedId(wallpaper.id)}
                style={{
                  padding: 0,
                  borderRadius: 'var(--lyra-radius-sm)',
                  border: selectedWallpaper ? `2px solid ${wallpaper.accent}` : '1px solid var(--lyra-border)',
                  background: 'var(--lyra-surface-raised)',
                  color: 'var(--lyra-text)',
                  textAlign: 'left',
                  overflow: 'hidden',
                  cursor: 'pointer'
                }}
              >
                <div style={{ height: 104, background: wallpaper.background }} />
                <div style={{ padding: 12 }}>
                  <div style={{ fontWeight: 600 }}>{wallpaper.name}</div>
                  <div style={{ marginTop: 4, color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>
                    {wallpaper.source}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="card" style={{ color: 'var(--lyra-text-muted)' }}>
        Aplicação no sistema aguardando integração com o gerenciador de sessão.
      </div>
    </div>
  )
}
