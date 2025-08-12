// Sidebar Component
import '../styles/sidebar.css'
import { Icon } from './icons'

interface Props {
  page: 'connect' | 'collect' | 'logs' | 'settings'
  onChange: (p: 'connect' | 'collect' | 'logs' | 'settings') => void
}

const tabs = [
  { id: 'connect', label: 'Connect', icon: <Icon.Link title="Connect" />, shortcut: 'Ctrl+1' },
  { id: 'collect', label: 'Collect', icon: <Icon.Chart title="Collect" />, shortcut: 'Ctrl+2' },
  { id: 'logs', label: 'Logs', icon: <Icon.Clipboard title="Logs" />, shortcut: 'Ctrl+3' },
  { id: 'settings', label: 'Settings', icon: <Icon.Gear title="Settings" />, shortcut: 'Ctrl+4' },
] as const

export default function Sidebar({ page, onChange }: Props) {
  const handleKeyDown = (e: React.KeyboardEvent, tabId: string) => {
    // Handle Enter and Space keys for accessibility
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onChange(tabId as 'connect' | 'collect' | 'logs' | 'settings')
    }
  }

  return (
    <nav className="sidebar" role="navigation" aria-label="Main navigation">
      <div className="sidebar-header">
        <h1>Gait Monitor</h1>
      </div>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          className={page === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
          onKeyDown={(e) => handleKeyDown(e, tab.id)}
          aria-current={page === tab.id ? 'page' : undefined}
          aria-label={`${tab.label} tab (${tab.shortcut})`}
          tabIndex={0}
          data-tab-index={index + 1}
        >
          <span className="tab-icon" aria-hidden="true">
            {tab.icon}
          </span>
          <span className="tab-label">{tab.label}</span>
          <span className="tab-shortcut" aria-hidden="true">
            {tab.shortcut}
          </span>
        </button>
      ))}
    </nav>
  )
}
