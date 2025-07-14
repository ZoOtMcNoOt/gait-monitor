import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ConnectTab from './components/ConnectTab'
import CollectTab from './components/CollectTab'
import LogsTab from './components/LogsTab'
import SettingsTab from './components/SettingsTab'
import ScrollableContainer from './components/ScrollableContainer'
import { DeviceConnectionProvider } from './contexts/DeviceConnectionContext'
import { ToastProvider } from './contexts/ToastContext'
import { ScrollProvider } from './contexts/ScrollContext'
import { useTabScrollReset } from './hooks/useTabScrollReset'

type Page = 'connect' | 'collect' | 'logs' | 'settings'

function AppContent() {
  const [page, setPage] = useState<Page>('connect')
  const [darkMode, setDarkMode] = useState(false)

  // Use declarative scroll reset when page changes
  useTabScrollReset([page])

  // Load dark mode setting from localStorage on app start
  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode')
    if (savedDarkMode !== null) {
      setDarkMode(JSON.parse(savedDarkMode))
    }
  }, [])

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)
    localStorage.setItem('darkMode', JSON.stringify(newDarkMode))
  }

  return (
    <div className="app">
      <Sidebar page={page} onChange={setPage} />
      <ScrollableContainer id="main-content" className="content">
        {page === 'connect' && <ConnectTab />}
        {page === 'collect' && <CollectTab />}
        {page === 'logs' && <LogsTab />}
        {page === 'settings' && <SettingsTab darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />}
      </ScrollableContainer>
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <DeviceConnectionProvider>
        <ScrollProvider>
          <AppContent />
        </ScrollProvider>
      </DeviceConnectionProvider>
    </ToastProvider>
  )
}
