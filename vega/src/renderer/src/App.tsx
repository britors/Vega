import { useState } from 'react'
import Sidebar from './components/Sidebar'
import { modules } from './modules/registry'
import WindowChrome from './components/window/WindowChrome'
import { DialogProvider } from './components/dialogs/DialogProvider'
import { NavigationContext } from './components/navigation/NavigationContext'

export default function App(): JSX.Element {
  const [activeId, setActiveId] = useState(modules[0].id)
  const ActiveComponent = modules.find((m) => m.id === activeId)?.Component ?? modules[0].Component

  return (
    <DialogProvider>
      <NavigationContext.Provider value={{ navigate: setActiveId }}>
        <div className="app-frame">
          <WindowChrome />
          <div className="app-shell">
            <Sidebar activeId={activeId} onSelect={setActiveId} />
            <main className="content">
              <ActiveComponent />
            </main>
          </div>
        </div>
      </NavigationContext.Provider>
    </DialogProvider>
  )
}
