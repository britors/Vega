import { useMemo, useState } from 'react'
import { modules } from '../modules/registry'

interface SidebarProps {
  activeId: string
  onSelect: (id: string) => void
}

const sectionLabels: Record<string, string> = {
  principal: 'Principal',
  sistema: 'Sistema',
  outros: 'Outros'
}

export default function Sidebar({ activeId, onSelect }: SidebarProps): JSX.Element {
  const [query, setQuery] = useState('')

  const grouped = useMemo(() => {
    const filtered = modules.filter((m) => m.label.toLowerCase().includes(query.toLowerCase()))
    const groups: Record<string, typeof modules> = {}
    for (const mod of filtered) {
      groups[mod.section] = groups[mod.section] ?? []
      groups[mod.section].push(mod)
    }
    return groups
  }, [query])

  return (
    <nav className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark" />
        Vega
      </div>
      <input
        className="sidebar__search"
        placeholder="Buscar configuração..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {Object.entries(grouped).map(([section, items]) => (
        <div key={section} style={{ marginBottom: 12 }}>
          <div
            style={{
              fontSize: '0.72rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--lyra-text-muted)',
              padding: '8px 12px 4px'
            }}
          >
            {sectionLabels[section] ?? section}
          </div>
          <ul className="sidebar__nav">
            {items.map((mod) => (
              <li key={mod.id}>
                <button
                  className={`sidebar__item ${activeId === mod.id ? 'sidebar__item--active' : ''}`}
                  onClick={() => onSelect(mod.id)}
                >
                  {mod.star && <span className="sidebar__item--star">★</span>}
                  {mod.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}
