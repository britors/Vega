import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

export default function Kernel(): JSX.Element {
  const dialogs = useDialogs()
  const [kernels, setKernels] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setKernels(await window.vega.kernelListInstalled())
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
    </div>
  )
}
