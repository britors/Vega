import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import { modules } from './modules/registry'
import WindowChrome from './components/window/WindowChrome'
import { DialogProvider } from './components/dialogs/DialogProvider'
import { NavigationContext } from './components/navigation/NavigationContext'
import { isModuleVisible } from './modules/platformVisibility'
import UpdateNotification from './components/UpdateNotification'

export default function App(): JSX.Element {
  const fallbackModules = useMemo(() => modules.filter((module) => module.id === 'about'), [])
  const [availableModules, setAvailableModules] = useState(fallbackModules)
  const [activeId, setActiveId] = useState(fallbackModules[0].id)
  const ActiveComponent =
    availableModules.find((module) => module.id === activeId)?.Component ?? availableModules[0].Component

  useEffect(() => {
    let active = true
    window.vega.getCapabilities().then(
      (capabilities) => {
        if (!active) return
        const supported = modules.filter((module) => isModuleVisible(module.id, capabilities))
        const next = supported.length > 0 ? supported : fallbackModules
        setAvailableModules(next)
        setActiveId((current) => next.some((module) => module.id === current) ? current : next[0].id)
      },
      () => {
        if (active) setAvailableModules(fallbackModules)
      }
    )
    return () => { active = false }
  }, [fallbackModules])

  return (
    <DialogProvider>
      <NavigationContext.Provider value={{ navigate: setActiveId }}>
        <div className="app-frame">
          <WindowChrome />
          <div className="app-shell">
            <Sidebar activeId={activeId} onSelect={setActiveId} modules={availableModules} />
            <main className="content">
              <ActiveComponent />
            </main>
            <UpdateNotification />
          </div>
        </div>
      </NavigationContext.Provider>
    </DialogProvider>
  )
}
