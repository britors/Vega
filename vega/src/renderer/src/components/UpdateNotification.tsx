import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../../../main/updater'

export default function UpdateNotification(): JSX.Element | null {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let active = true
    window.vega.updaterGetStatus().then((value) => { if (active) setStatus(value) }).catch(() => undefined)
    const off = window.vega.onUpdaterStatus((value) => { setDismissed(false); setStatus(value) })
    return () => { active = false; off() }
  }, [])

  if (dismissed || status.state === 'disabled' || status.state === 'idle' || status.state === 'up-to-date') return null

  const buttonStyle: React.CSSProperties = {
    padding: '7px 12px', borderRadius: 'var(--lyra-radius-sm)', border: '1px solid var(--lyra-border)',
    background: 'transparent', color: 'var(--lyra-text)', cursor: 'pointer'
  }

  return (
    <aside className="card" role="status" aria-live="polite" style={{
      position: 'fixed', right: 20, bottom: 20, zIndex: 1000, width: 'min(420px, calc(100vw - 40px))',
      boxShadow: '0 16px 48px rgba(0,0,0,.45)', display: 'grid', gap: 10
    }}>
      {status.state === 'checking' && <strong>Verificando atualizações do Vega...</strong>}
      {status.state === 'available' && (
        <>
          <strong>Vega {status.version} disponível</strong>
          {status.releaseNotes && <div style={{ whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto', color: 'var(--lyra-text-muted)', fontSize: '.84rem' }}>{status.releaseNotes}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={buttonStyle} onClick={() => setDismissed(true)}>Depois</button>
            <button style={{ ...buttonStyle, background: 'var(--lyra-gradient)', color: '#fff', border: 'none' }} onClick={() => { void window.vega.updaterDownload().catch(() => undefined) }}>Baixar agora</button>
          </div>
        </>
      )}
      {status.state === 'downloading' && (
        <>
          <strong>Baixando atualização... {Math.round(status.percent)}%</strong>
          <progress value={Math.max(0, Math.min(100, status.percent))} max={100} style={{ width: '100%' }} />
        </>
      )}
      {status.state === 'downloaded' && (
        <>
          <strong>Vega {status.version} pronto para instalar</strong>
          <div style={{ color: 'var(--lyra-text-muted)', fontSize: '.84rem' }}>O aplicativo será fechado e aberto novamente.</div>
          <button style={{ ...buttonStyle, justifySelf: 'end', background: 'var(--lyra-gradient)', color: '#fff', border: 'none' }} onClick={() => { void window.vega.updaterInstall().catch(() => undefined) }}>Reiniciar e instalar</button>
        </>
      )}
      {status.state === 'error' && (
        <>
          <strong style={{ color: 'var(--lyra-danger)' }}>Não foi possível atualizar</strong>
          <div style={{ color: 'var(--lyra-text-muted)', fontSize: '.84rem' }}>{status.message}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button style={buttonStyle} onClick={() => setDismissed(true)}>Fechar</button>
            <button style={buttonStyle} onClick={() => { void window.vega.updaterCheck().catch(() => undefined) }}>Tentar novamente</button>
          </div>
        </>
      )}
    </aside>
  )
}
