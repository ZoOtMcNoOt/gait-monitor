import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ConnectTab from './components/ConnectTab'
import CollectTab from './components/CollectTab'
import LogsTab from './components/LogsTab'
import SettingsTab from './components/SettingsTab'

type Page = 'connect' | 'collect' | 'logs' | 'settings'

export default function App() {
  const [page, setPage] = useState<Page>('connect')
  const [darkMode, setDarkMode] = useState(false)

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
      <main className="content">
        {page === 'connect' && <ConnectTab />}
        {page === 'collect' && <CollectTab />}
        {page === 'logs' && <LogsTab />}
        {page === 'settings' && <SettingsTab darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />}
      </main>
    </div>
  )
}
