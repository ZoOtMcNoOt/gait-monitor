import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ConnectTab from './components/ConnectTab'
import CollectTab from './components/CollectTab'
import LogsTab from './components/LogsTab'
import SettingsTab from './components/SettingsTab'
import ScrollableContainer from './components/ScrollableContainer'
import KeyboardHelpDialog from './components/KeyboardHelpDialog'
import { DeviceConnectionProvider } from './contexts/DeviceConnectionContext'
import { ToastProvider } from './contexts/ToastContext'
import { ScrollProvider } from './contexts/ScrollContext'
import { useTabScrollReset } from './hooks/useTabScrollReset'
import { useKeyboardShortcuts, createCommonShortcuts } from './hooks/useKeyboardShortcuts'

type Page = 'connect' | 'collect' | 'logs' | 'settings'

function AppContent() {
  const [page, setPage] = useState<Page>('connect')
  const [darkMode, setDarkMode] = useState(false)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)

  useTabScrollReset([page])

  const shortcuts = createCommonShortcuts(
    setPage,
    () => setDarkMode(!darkMode),
    () => setShowKeyboardHelp(true),
  )

  useKeyboardShortcuts({
    shortcuts,
    enabled: !showKeyboardHelp, // Disable when help dialog is open to avoid conflicts
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        document.body.setAttribute('data-keyboard-navigation', 'true')
      }
    }

    const handleMouseDown = () => {
      document.body.removeAttribute('data-keyboard-navigation')
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [])

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode')
    if (savedDarkMode !== null) {
      setDarkMode(JSON.parse(savedDarkMode))
    }
  }, [])

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
        {page === 'collect' && <CollectTab onNavigateToConnect={() => setPage('connect')} />}
        {page === 'logs' && <LogsTab />}
        {page === 'settings' && (
          <SettingsTab darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
        )}
      </ScrollableContainer>

      <KeyboardHelpDialog
        isOpen={showKeyboardHelp}
        onClose={() => setShowKeyboardHelp(false)}
        shortcuts={shortcuts}
      />
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
