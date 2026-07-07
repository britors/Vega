import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface UserInfo {
  username: string
  isAdmin: boolean
}

export default function Users(): JSX.Element {
  const dialogs = useDialogs()
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [isAdmin, setIsAdmin] = useState(true)

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      setUsers(await window.vega.listUsers())
    } catch (err) {
      setError((err as Error).message)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  async function createUser(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.vega.createUser(username.trim(), isAdmin)
      setUsername('')
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function removeUser(user: UserInfo): Promise<void> {
    const ok = await dialogs.confirm({
      title: 'Remover usuário',
      message: `Remover ${user.username}?`,
      variant: 'danger',
      confirmLabel: 'Remover'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.removeUser(user.username)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleAdmin(user: UserInfo): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await window.vega.setAdmin(user.username, !user.isAdmin)
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
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Contas e Usuários</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Criação, remoção e controle de administração
        </p>
      </div>

      {error && (
        <div className="card" style={{ color: 'var(--lyra-danger)' }}>
          Falha: {error}
        </div>
      )}

      {loading && <EmptyState title="Carregando usuários..." />}

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Novo usuário</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
          <input
            className="sidebar__search"
            style={{ marginBottom: 0 }}
            placeholder="nome de usuário"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--lyra-text-muted)' }}>
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            Administrador
          </label>
        </div>
        <button
          onClick={createUser}
          disabled={busy || username.trim() === ''}
          style={{
            justifySelf: 'start',
            padding: '6px 14px',
            borderRadius: 'var(--lyra-radius-sm)',
            border: 'none',
            background: 'var(--lyra-gradient)',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          Criar usuário
        </button>
      </div>

      <div className="card" style={{ display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1rem' }}>Usuários</h2>
        {users.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--lyra-text-muted)' }}>Nenhum usuário listado.</p>
        ) : (
          users.map((user) => (
            <div key={user.username} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{user.username}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--lyra-text-muted)' }}>
                  {user.isAdmin ? 'Administrador' : 'Usuário comum'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => toggleAdmin(user)}
                  disabled={busy || user.username === 'root'}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--lyra-radius-sm)',
                    border: '1px solid var(--lyra-border)',
                    background: 'transparent',
                    color: 'var(--lyra-text)',
                    cursor: 'pointer'
                  }}
                >
                  {user.isAdmin ? 'Remover admin' : 'Tornar admin'}
                </button>
                <button
                  onClick={() => removeUser(user)}
                  disabled={busy || user.username === 'root'}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--lyra-radius-sm)',
                    border: '1px solid var(--lyra-border)',
                    background: 'transparent',
                    color: 'var(--lyra-danger)',
                    cursor: 'pointer'
                  }}
                >
                  Remover
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
