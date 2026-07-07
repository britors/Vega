import EmptyState from '../components/EmptyState'

export default function Services(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Serviços</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Lista curada de serviços systemd + modo avançado (units completas)
        </p>
      </div>
      <EmptyState title="Nenhum serviço listado" />
    </div>
  )
}
