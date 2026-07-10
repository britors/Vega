import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

export default function Kernel(): JSX.Element {
  const dialogs = useDialogs()
  const [kernels, setKernels] = useState<string[]>([])
  const [boot, setBoot] = useState({ loader: '', defaultEntry: '', timeout: 5, cmdline: '' })
  const [bootEntries, setBootEntries] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [nextKernels, nextBoot, nextEntries] = await Promise.all([
        window.vega.kernelListInstalled(),
        window.vega.bootStatus(),
        window.vega.listBootEntries()
      ])
      setKernels(nextKernels)
      setBoot(nextBoot)
      setBootEntries(nextEntries)
    } catch (err) {
      setError((err as Error).message)
      setKernels([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function install(kernel: string): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Instalar kernel',
      message: `Instalar ${kernel}? O sistema criará snapshot e regenerará os artefatos de boot.`,
      variant: 'warning',
      confirmLabel: 'Instalar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.kernelInstall(kernel)
      setTimeout(() => {
        refresh().catch(() => {})
      }, 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(kernel: string): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Remover kernel',
      message: `Remover ${kernel}? Essa ação será bloqueada se ele estiver em execução ou for o último kernel.`,
      variant: 'danger',
      confirmLabel: 'Remover'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.kernelRemove(kernel)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function applyBoot(): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Alterar bootloader',
      message: `Aplicar entrada padrão "${boot.defaultEntry || 'padrão atual'}", timeout ${boot.timeout}s e novos parâmetros de kernel? Um snapshot será criado antes da mudança quando possível.`,
      variant: 'danger',
      confirmLabel: 'Aplicar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.applyBootConfig(boot.defaultEntry, boot.timeout, boot.cmdline)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Kernel</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Instalação e remoção com proteção contra kernel em execução
        </p>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {loading && <EmptyState title="Carregando kernels..." />}

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Kernels instalados</h2>
        {kernels.length === 0 ? (
          <EmptyState title="Nenhum kernel listado" message="O sistema ainda não reportou kernels instalados." />
        ) : (
          kernels.map((kernel) => {
            const isBusy = busy
            return (
              <div key={kernel} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span>{kernel}</span>
                <button
                  onClick={() => remove(kernel)}
                  disabled={isBusy}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--lyra-radius-sm)',
                    border: '1px solid var(--lyra-border)',
                    background: 'transparent',
                    color: 'var(--lyra-danger)',
                    cursor: 'pointer'
                  }}
                >
                  {isBusy ? 'Processando...' : 'Remover'}
                </button>
              </div>
            )
          })
        )}
      </div>

      <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ color: 'var(--lyra-text-muted)' }}>Disponíveis</span>
        <div style={{ flex: 1 }} />
        {['linux-zen', 'linux-lts'].map((kernel) => {
          const isInstalled = kernels.includes(kernel)
          return (
            <button
              key={kernel}
              onClick={() => install(kernel)}
              disabled={busy || isInstalled}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--lyra-radius-sm)',
                border: 'none',
                background: isInstalled ? 'var(--lyra-surface-raised)' : 'var(--lyra-gradient)',
                color: isInstalled ? 'var(--lyra-text-muted)' : '#fff',
                cursor: isInstalled ? 'default' : 'pointer'
              }}
            >
              {isInstalled ? `${kernel} instalado` : busy ? 'Processando...' : `Instalar ${kernel}`}
            </button>
          )
        })}
      </div>

      <div className="card" style={{ display: 'grid', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>Bootloader</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
            Detectado: {boot.loader || 'não detectado'}
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label>
            <div style={{ marginBottom: 6, color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Entrada padrão</div>
            <select
              value={boot.defaultEntry}
              onChange={(event) => setBoot({ ...boot, defaultEntry: event.target.value })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--lyra-radius-sm)', border: '1px solid var(--lyra-border)', background: 'var(--lyra-surface-raised)', color: 'var(--lyra-text)' }}
            >
              {[boot.defaultEntry, ...bootEntries.filter((entry) => entry !== boot.defaultEntry)].filter(Boolean).map((entry) => (
                <option key={entry} value={entry}>{entry}</option>
              ))}
            </select>
          </label>
          <label>
            <div style={{ marginBottom: 6, color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Timeout</div>
            <input
              type="number"
              min={0}
              value={boot.timeout}
              onChange={(event) => setBoot({ ...boot, timeout: Number(event.target.value) })}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--lyra-radius-sm)', border: '1px solid var(--lyra-border)', background: 'var(--lyra-surface-raised)', color: 'var(--lyra-text)' }}
            />
          </label>
        </div>
        <label>
          <div style={{ marginBottom: 6, color: 'var(--lyra-text-muted)', fontSize: '0.82rem' }}>Parâmetros de kernel</div>
          <input
            value={boot.cmdline}
            onChange={(event) => setBoot({ ...boot, cmdline: event.target.value })}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--lyra-radius-sm)', border: '1px solid var(--lyra-border)', background: 'var(--lyra-surface-raised)', color: 'var(--lyra-text)' }}
          />
        </label>
        <button
          onClick={applyBoot}
          disabled={busy || !boot.loader || boot.loader === 'não detectado'}
          style={{ justifySelf: 'end', padding: '8px 16px', border: 'none', borderRadius: 'var(--lyra-radius-sm)', background: 'var(--lyra-gradient)', color: '#fff' }}
        >
          {busy ? 'Aplicando...' : 'Aplicar bootloader'}
        </button>
      </div>
    </div>
  )
}
