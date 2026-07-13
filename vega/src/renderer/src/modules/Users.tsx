import { useEffect, useState } from 'react'
import EmptyState from '../components/EmptyState'
import { useDialogs } from '../components/dialogs/useDialogs'

interface UserInfo {
  username: string
  isAdmin: boolean
  sid?: string
  accountType?: 'local' | 'microsoft' | 'domain'
  readOnly?: boolean
  protected?: boolean
}

export default function Users(): JSX.Element {
  const dialogs = useDialogs()
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [isAdmin, setIsAdmin] = useState(true)
  const [password, setPassword] = useState('')
  const [isWindows, setIsWindows] = useState(false)
  const [removeProfiles, setRemoveProfiles] = useState<Set<string>>(new Set())

  async function refresh(): Promise<void> {
    setLoading(true)
    setError(null)
    try {
      const [nextUsers, capabilities] = await Promise.all([window.vega.listUsers(), window.vega.getCapabilities()])
      setUsers(nextUsers)
      setIsWindows(capabilities.platform === 'windows')
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
    const ok = await dialogs.confirm({
      title: 'Criar usuário',
      message: `Criar ${username.trim()} como ${isAdmin ? 'administrador' : 'usuário comum'}?`,
      variant: 'warning',
      confirmLabel: 'Criar'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.createUser(username.trim(), isAdmin, isWindows ? password : undefined)
      setUsername('')
      setPassword('')
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
      message: `Remover ${user.username}?${isWindows ? removeProfiles.has(user.username) ? ' O perfil e os dados locais também serão excluídos.' : ' O perfil e os dados locais serão preservados.' : ''}`,
      variant: 'danger',
      confirmLabel: 'Remover'
    })
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      await window.vega.removeUser(user.username, isWindows && removeProfiles.has(user.username))
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
        <div style={{ display: 'grid', gridTemplateColumns: isWindows ? '1fr 1fr auto' : '1fr auto', gap: 10 }}>
          <input
            className="sidebar__search"
            style={{ marginBottom: 0 }}
            placeholder="nome de usuário"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          {isWindows && <input className="sidebar__search" style={{ marginBottom: 0 }} type="password" autoComplete="new-password" placeholder="senha inicial (mín. 8 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} />}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--lyra-text-muted)' }}>
            <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
            Administrador
          </label>
        </div>
        <button
          onClick={createUser}
          disabled={busy || username.trim() === '' || (isWindows && password.length < 8)}
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
          <EmptyState title="Nenhum usuário listado" message="Ainda não há contas cadastradas." />
        ) : (
          users.map((user) => (
            <div key={user.username} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{user.username}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--lyra-text-muted)' }}>
                  {user.isAdmin ? 'Administrador' : 'Usuário comum'}
                  {user.accountType && user.accountType !== 'local' ? ` · conta ${user.accountType === 'microsoft' ? 'Microsoft' : 'de domínio'}` : ''}
                  {user.sid ? ` · ${user.sid}` : ''}
                  {user.protected ? ' · protegida' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {isWindows && user.accountType === 'local' && !user.protected && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', color: 'var(--lyra-text-muted)' }}>
                    <input type="checkbox" checked={removeProfiles.has(user.username)} onChange={(event) => setRemoveProfiles((current) => { const next = new Set(current); if (event.target.checked) next.add(user.username); else next.delete(user.username); return next })} />
                    Excluir perfil
                  </label>
                )}
                <button
                  onClick={() => toggleAdmin(user)}
                  disabled={busy || user.username === 'root' || user.readOnly || user.protected}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--lyra-radius-sm)',
                    border: '1px solid var(--lyra-border)',
                    background: 'transparent',
                    color: 'var(--lyra-text)',
                    cursor: 'pointer'
                  }}
                >
                  {busy ? 'Processando...' : user.isAdmin ? 'Remover admin' : 'Tornar admin'}
                </button>
                <button
                  onClick={() => removeUser(user)}
                  disabled={busy || user.username === 'root' || user.readOnly || user.protected}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 'var(--lyra-radius-sm)',
                    border: '1px solid var(--lyra-border)',
                    background: 'transparent',
                    color: 'var(--lyra-danger)',
                    cursor: 'pointer'
                  }}
                >
                  {busy ? 'Processando...' : 'Remover'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
