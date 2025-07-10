import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ConnectTab from './components/ConnectTab'
import CollectTab from './components/CollectTab'
import LogsTab from './components/LogsTab'
import SettingsTab from './components/SettingsTab'
import { DeviceConnectionProvider } from './contexts/DeviceConnectionContext'
import { ToastProvider } from './contexts/ToastContext'

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

  // Scroll to top when page changes
  useEffect(() => {
    // Multiple strategies to ensure we scroll to top
    const scrollToTop = () => {
      // Use instant scroll for tab changes (no smooth animation)
      const scrollOptions: ScrollToOptions = { top: 0, behavior: 'instant' }
      
      // 1. Try to scroll the main content area
      const mainContent = document.querySelector('.content')
      if (mainContent) {
        mainContent.scrollTo(scrollOptions)
      }
      
      // 2. Try to scroll any tab-content containers
      const tabContent = document.querySelector('.tab-content')
      if (tabContent) {
        tabContent.scrollTo(scrollOptions)
      }
      
      // 3. Scroll device list containers in sidebar
      const deviceLists = document.querySelectorAll('.multi-device-selector .device-list')
      deviceLists.forEach(list => {
        list.scrollTo(scrollOptions)
      })
      
      // 4. Scroll collection sidebar
      const collectionSidebar = document.querySelector('.collection-sidebar')
      if (collectionSidebar) {
        collectionSidebar.scrollTo(scrollOptions)
      }
      
      // 5. Scroll any other scrollable containers
      const scrollableContainers = document.querySelectorAll('[style*="overflow"], .scrollable, .scroll-container')
      scrollableContainers.forEach(container => {
        if (container instanceof HTMLElement) {
          container.scrollTo(scrollOptions)
        }
      })
      
      // 6. Scroll the window as fallback
      window.scrollTo(scrollOptions)
      
      // 7. Scroll the document body as additional fallback (for older browsers)
      document.body.scrollTop = 0
      document.documentElement.scrollTop = 0
    }
    
    // Small delay to ensure DOM is ready after tab change
    const timeoutId = setTimeout(scrollToTop, 50)
    
    // Also scroll immediately
    scrollToTop()
    
    // Cleanup timeout
    return () => clearTimeout(timeoutId)
  }, [page])

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode
    setDarkMode(newDarkMode)
    localStorage.setItem('darkMode', JSON.stringify(newDarkMode))
  }

  return (
    <ToastProvider>
      <DeviceConnectionProvider>
        <div className="app">
          <Sidebar page={page} onChange={setPage} />
          <main className="content">
            {page === 'connect' && <ConnectTab />}
            {page === 'collect' && <CollectTab />}
            {page === 'logs' && <LogsTab />}
            {page === 'settings' && <SettingsTab darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />}
          </main>
        </div>
      </DeviceConnectionProvider>
    </ToastProvider>
  )
}
