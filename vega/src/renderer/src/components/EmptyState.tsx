interface EmptyStateProps {
  title: string
  message?: string
}

export default function EmptyState({ title, message = 'Nada por aqui ainda.' }: EmptyStateProps): JSX.Element {
  return (
    <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div
        style={{
          width: 48,
          height: 48,
          margin: '0 auto 16px',
          borderRadius: '50%',
          background: 'var(--lyra-gradient)'
        }}
      />
      <h2 style={{ margin: '0 0 8px', fontSize: '1.1rem' }}>{title}</h2>
      <p style={{ margin: 0, color: 'var(--lyra-text-muted)' }}>{message}</p>
    </div>
  )
}
