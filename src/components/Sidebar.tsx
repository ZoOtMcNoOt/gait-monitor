// Sidebar Component
import '../styles/sidebar.css'

interface Props { 
  page: 'connect' | 'collect' | 'logs' | 'settings'
  onChange: (p: 'connect' | 'collect' | 'logs' | 'settings') => void 
}

const tabs = [
  { id: 'connect', label: 'Connect', icon: '🔗' },
  { id: 'collect', label: 'Collect', icon: '📊' },
  { id: 'logs', label: 'Logs', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
] as const

export default function Sidebar({ page, onChange }: Props) {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <h1>Gait Monitor</h1>
      </div>
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={page === tab.id ? 'active' : ''}
          onClick={() => onChange(tab.id)}
        >
          <span className="tab-icon">{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
