import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface DateTimeStatus {
  timezone: string
  ntp: boolean
  locale: string
  keymap: string
}

export default function DateTimeLocale(): JSX.Element {
  const dialogs = useDialogs()
  const [status, setStatus] = useState<DateTimeStatus>({ timezone: '', ntp: false, locale: '', keymap: '' })
  const [timezones, setTimezones] = useState<string[]>([])
  const [locales, setLocales] = useState<string[]>([])
  const [keymaps, setKeymaps] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [nextStatus, nextTimezones, nextLocales, nextKeymaps] = await Promise.all([
        window.vega.dateTimeStatus(),
        window.vega.listTimezones(),
        window.vega.listLocales(),
        window.vega.listKeymaps()
      ])
      setStatus(nextStatus)
      setTimezones(nextTimezones)
      setLocales(nextLocales)
      setKeymaps(nextKeymaps)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function apply(): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Aplicar configurações regionais',
      message: `Alterar timezone para ${status.timezone}, locale para ${status.locale} e teclado para ${status.keymap}? Isso afeta todo o sistema.`,
      variant: 'warning',
      confirmLabel: 'Aplicar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.applyDateTimeLocale(status.timezone, status.ntp, status.locale, status.keymap)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const selectStyle = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 'var(--lyra-radius-sm)',
    border: '1px solid var(--lyra-border)',
    background: 'var(--lyra-surface-raised)',
    color: 'var(--lyra-text)'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Data, Hora e Idioma</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Timezone, NTP, locale do sistema e layout XKB persistente
        </p>
      </div>

      {error && <div className="card" style={{ color: 'var(--lyra-danger)' }}>Falha: {error}</div>}
      {loading && <EmptyState title="Carregando configurações regionais..." />}

      <div className="card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <label>
            <div style={{ marginBottom: 6, color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Fuso horário</div>
            <select
              value={status.timezone}
              onChange={(event) => setStatus({ ...status, timezone: event.target.value })}
              style={selectStyle}
            >
              {[status.timezone, ...timezones.filter((item) => item !== status.timezone)].filter(Boolean).map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>

          <label>
            <div style={{ marginBottom: 6, color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Locale</div>
            <select
              value={status.locale}
              onChange={(event) => setStatus({ ...status, locale: event.target.value })}
              style={selectStyle}
            >
              {[status.locale, ...locales.filter((item) => item !== status.locale)].filter(Boolean).map((locale) => (
                <option key={locale} value={locale}>{locale}</option>
              ))}
            </select>
          </label>

          <label>
            <div style={{ marginBottom: 6, color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Layout de teclado</div>
            <select
              value={status.keymap}
              onChange={(event) => setStatus({ ...status, keymap: event.target.value })}
              style={selectStyle}
            >
              {[status.keymap, ...keymaps.filter((item) => item !== status.keymap)].filter(Boolean).map((keymap) => (
                <option key={keymap} value={keymap}>{keymap}</option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={status.ntp}
            onChange={(event) => setStatus({ ...status, ntp: event.target.checked })}
          />
          Sincronização automática de hora por NTP
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={apply}
            disabled={busy || loading}
            style={{ padding: '8px 16px', border: 'none', borderRadius: 'var(--lyra-radius-sm)', background: 'var(--lyra-gradient)', color: '#fff' }}
          >
            {busy ? 'Aplicando...' : 'Aplicar mudanças'}
          </button>
        </div>
      </div>
    </div>
  )
}
