import { useEffect, useState } from 'react'

interface Status {
  version: string
  connected: boolean
}

export default function About(): JSX.Element {
  const [status, setStatus] = useState<Status | null>(null)

  useEffect(() => {
    window.vega.ping().then(setStatus)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
        <div
          style={{
            width: 56,
            height: 56,
            margin: '0 auto 16px',
            borderRadius: '16px',
            background: 'var(--lyra-gradient)'
          }}
        />
        <h1 style={{ margin: '0 0 4px', fontSize: '1.4rem' }}>Lyra OS</h1>
        <p style={{ margin: 0, color: 'var(--lyra-text-muted)' }}>Harmonia. Performance. Liberdade.</p>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Componentes</h2>
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', margin: 0 }}>
          <dt style={{ color: 'var(--lyra-text-muted)' }}>vega</dt>
          <dd style={{ margin: 0 }}>{status?.version ?? 'carregando...'}</dd>
          <dt style={{ color: 'var(--lyra-text-muted)' }}>vegad</dt>
          <dd style={{ margin: 0 }}>{status ? (status.connected ? 'conectado' : 'não conectado') : 'carregando...'}</dd>
        </dl>
      </div>
    </div>
  )
}
