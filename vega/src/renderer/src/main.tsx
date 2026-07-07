import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installDemoVegaApi } from './demoVega'
import './styles/tokens.css'
import './styles/global.css'

installDemoVegaApi()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
