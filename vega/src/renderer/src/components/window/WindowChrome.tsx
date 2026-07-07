import { useEffect, useState } from 'react'

interface WindowState {
  maximized: boolean
}

export default function WindowChrome(): JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    window.vega.windowIsMaximized().then(setMaximized).catch(() => setMaximized(false))
    return window.vega.onWindowState((state: WindowState) => setMaximized(state.maximized))
  }, [])

  return (
    <header className="window-chrome">
      <div className="window-chrome__drag">
        <div className="window-chrome__brand">
          <span className="window-chrome__mark" />
          <span>Vega</span>
        </div>
      </div>
      <div className="window-chrome__controls">
        <button className="window-control" title="Minimizar" onClick={() => window.vega.windowMinimize()}>
          –
        </button>
        <button
          className="window-control"
          title={maximized ? 'Restaurar' : 'Maximizar'}
          onClick={async () => {
            const state = await window.vega.windowToggleMaximize()
            setMaximized(state.maximized)
          }}
        >
          {maximized ? '▢' : '□'}
        </button>
        <button className="window-control window-control--close" title="Fechar" onClick={() => window.vega.windowClose()}>
          ×
        </button>
      </div>
    </header>
  )
}
