import EmptyState from '../components/EmptyState'

export default function DateTimeLocale(): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Data, Hora e Idioma</h1>
        <p style={{ margin: '4px 0 0', color: 'var(--lyra-text-muted)' }}>
          Timezone, NTP, formato de data/hora, idioma do sistema
        </p>
      </div>
      <EmptyState title="Configurações regionais" />
    </div>
  )
}
