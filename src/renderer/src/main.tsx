import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { useUiStore } from './store/ui'
import { applyThemeClass } from './hooks/useThemeSync'
import './assets/theme.css'
import './assets/index.css'

// Apply the stored theme before the first paint (CSP blocks inline scripts in index.html)
applyThemeClass(useUiStore.getState().theme)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
