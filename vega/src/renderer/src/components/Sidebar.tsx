import { useEffect, useMemo, useState } from 'react'
import type { VegaModule } from '../modules/registry'
import type { SystemModule } from '../../../main/system/types'

interface SidebarProps {
  activeId: SystemModule
  onSelect: (id: SystemModule) => void
  modules: VegaModule[]
}

const sectionLabels: Record<string, string> = {
  principal: 'Principal',
  sistema: 'Sistema',
  outros: 'Outros'
}

export default function Sidebar({ activeId, onSelect, modules }: SidebarProps): JSX.Element {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    principal: true,
    sistema: true,
    outros: false
  })

  const grouped = useMemo(() => {
    const filtered = modules.filter((m) => m.label.toLowerCase().includes(query.toLowerCase()))
    const groups: Record<string, VegaModule[]> = {}
    for (const mod of filtered) {
      groups[mod.section] = groups[mod.section] ?? []
      groups[mod.section].push(mod)
    }
    return groups
  }, [modules, query])

  useEffect(() => {
    if (query.trim()) {
      setExpanded((current) => ({
        ...current,
        ...Object.fromEntries(Object.keys(grouped).map((section) => [section, true]))
      }))
      return
    }
    const active = modules.find((mod) => mod.id === activeId)
    if (active) setExpanded((current) => ({ ...current, [active.section]: true }))
  }, [activeId, grouped, modules, query])

  function toggleSection(section: string): void {
    setExpanded((current) => ({ ...current, [section]: !current[section] }))
  }

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
      {Object.entries(grouped).map(([section, items]) => {
        const open = Boolean(expanded[section])
        return (
          <div className="sidebar__panel" key={section}>
            <button className="sidebar__panel-trigger" onClick={() => toggleSection(section)} aria-expanded={open}>
              <span>{sectionLabels[section] ?? section}</span>
              <span className={`sidebar__panel-chevron ${open ? 'sidebar__panel-chevron--open' : ''}`}>›</span>
            </button>
            {open && (
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
            )}
          </div>
        )
      })}
    </nav>
  )
}
