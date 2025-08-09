import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Consolidated global styles imported once to ensure bundling in production
import './styles/globals.css'
import './styles/sidebar.css'
import './styles/tabs.css'
import './styles/tables.css'
import './styles/modal.css'
import './styles/settings.css'
import './styles/keyboard-help.css'
import './styles/chart.css'
import './styles/toast.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
