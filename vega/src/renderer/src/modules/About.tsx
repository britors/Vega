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
      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem' }}>Estado</h2>
            <div style={{ color: 'var(--lyra-text-muted)', fontSize: '0.85rem' }}>
              {status ? 'Conexão com o daemon e versão reportada pelo sistema' : 'Consultando o daemon...'}
            </div>
          </div>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              background: status?.connected ? 'rgba(46, 194, 126, 0.14)' : 'rgba(255, 184, 77, 0.14)',
              color: status?.connected ? 'var(--lyra-success)' : 'var(--lyra-warning)',
              fontSize: '0.8rem'
            }}
          >
            {status ? (status.connected ? 'vegad conectado' : 'vegad indisponível') : 'carregando'}
          </span>
        </div>

        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', margin: 0 }}>
          <dt style={{ color: 'var(--lyra-text-muted)' }}>vega</dt>
          <dd style={{ margin: 0 }}>{status?.version ?? 'carregando...'}</dd>
          <dt style={{ color: 'var(--lyra-text-muted)' }}>vegad</dt>
          <dd style={{ margin: 0 }}>{status ? (status.connected ? 'conectado no bus do sistema' : 'não conectado') : 'carregando...'}</dd>
          <dt style={{ color: 'var(--lyra-text-muted)' }}>D-Bus</dt>
          <dd style={{ margin: 0 }}>org.lyraos.Vega1</dd>
          <dt style={{ color: 'var(--lyra-text-muted)' }}>Canal</dt>
          <dd style={{ margin: 0 }}>AUR</dd>
        </dl>
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 0, fontSize: '1rem' }}>Componentes</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--lyra-text-muted)' }}>UI</span>
            <strong>Electron + React + TypeScript</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--lyra-text-muted)' }}>Daemon</span>
            <strong>Go + D-Bus + polkit</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ color: 'var(--lyra-text-muted)' }}>Distribuição</span>
            <strong>Pacotes AUR</strong>
          </div>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a href="https://github.com/britors/Vega" target="_blank" rel="noreferrer" style={{ color: 'var(--lyra-text)', textDecoration: 'none' }}>
          Repositório
        </a>
        <a href="https://github.com/britors/Vega/issues" target="_blank" rel="noreferrer" style={{ color: 'var(--lyra-text)', textDecoration: 'none' }}>
          Issues
        </a>
        <a href="https://github.com/britors/Vega/tree/main/docs" target="_blank" rel="noreferrer" style={{ color: 'var(--lyra-text)', textDecoration: 'none' }}>
          Documentação
        </a>
      </div>
    </div>
  )
}
