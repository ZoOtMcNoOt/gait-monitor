import { useState, useEffect } from 'react'

interface Props {
  darkMode: boolean
  onToggleDarkMode: () => void
}

interface SettingsData {
  defaultStoragePath: string
  dataRetentionDays: number
  autoBackup: boolean
  exportFormat: 'csv' | 'json'
  sampleRate: number
}

export default function SettingsTab({ darkMode, onToggleDarkMode }: Props) {
  const [settings, setSettings] = useState<SettingsData>({
    defaultStoragePath: './gait_data',
    dataRetentionDays: 90,
    autoBackup: false,
    exportFormat: 'csv',
    sampleRate: 100
  })

  const [isModified, setIsModified] = useState(false)

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('appSettings')
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        setSettings(parsed)
      } catch (e) {
        console.error('Failed to parse saved settings:', e)
      }
    }
  }, [])

  const handleSettingChange = <K extends keyof SettingsData>(
    key: K,
    value: SettingsData[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setIsModified(true)
  }

  const handleSaveSettings = () => {
    try {
      localStorage.setItem('appSettings', JSON.stringify(settings))
      setIsModified(false)
      alert('Settings saved successfully!')
    } catch (e) {
      alert('Failed to save settings: ' + e)
    }
  }

  const handleResetSettings = () => {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      const defaultSettings: SettingsData = {
        defaultStoragePath: './gait_data',
        dataRetentionDays: 90,
        autoBackup: false,
        exportFormat: 'csv',
        sampleRate: 100
      }
      setSettings(defaultSettings)
      setIsModified(true)
    }
  }

  const handleChooseStoragePath = () => {
    // TODO: Implement file picker using Tauri's file dialog
    alert('File picker would open here in a full implementation')
  }

  const handleClearAllData = () => {
    if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
      if (confirm('This will delete all saved sessions and logs. Are you absolutely sure?')) {
        // TODO: Clear all data
        alert('All data would be cleared in a full implementation')
      }
    }
  }

  return (
    <div className="tab-content">
      <div className="tab-header">
        <h1>Settings</h1>
        <p>Configure application preferences and data management options.</p>
      </div>

      <div className="settings-grid">
        {/* Appearance Settings */}
        <div className="card">
          <h2>Appearance</h2>
          <div className="setting-group">
            <div className="setting-item">
              <label className="setting-label">
                <span>Dark Mode</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={darkMode}
                    onChange={onToggleDarkMode}
                    aria-label="Toggle dark mode"
                  />
                  <span className="toggle-slider"></span>
                </label>
              </label>
              <p className="setting-description">
                Enable dark mode for better viewing in low-light conditions
              </p>
            </div>
          </div>
        </div>

        {/* Data Collection Settings */}
        <div className="card">
          <h2>Data Collection</h2>
          <div className="setting-group">
            <div className="setting-item">
              <label className="setting-label">
                Sample Rate (Hz)
                <select
                  value={settings.sampleRate}
                  onChange={e => handleSettingChange('sampleRate', Number(e.target.value))}
                >
                  <option value={50}>50 Hz</option>
                  <option value={100}>100 Hz</option>
                  <option value={200}>200 Hz</option>
                  <option value={500}>500 Hz</option>
                </select>
              </label>
              <p className="setting-description">
                Higher sample rates provide more detailed data but use more storage
              </p>
            </div>

            <div className="setting-item">
              <label className="setting-label">
                Export Format
                <select
                  value={settings.exportFormat}
                  onChange={e => handleSettingChange('exportFormat', e.target.value as 'csv' | 'json')}
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
              </label>
              <p className="setting-description">
                Default format when saving collected data
              </p>
            </div>
          </div>
        </div>

        {/* Storage Settings */}
        <div className="card">
          <h2>Storage</h2>
          <div className="setting-group">
            <div className="setting-item">
              <label className="setting-label">
                Default Storage Path
                <div className="path-input">
                  <input
                    type="text"
                    value={settings.defaultStoragePath}
                    onChange={e => handleSettingChange('defaultStoragePath', e.target.value)}
                    placeholder="./gait_data"
                  />
                  <button type="button" onClick={handleChooseStoragePath}>
                    Browse
                  </button>
                </div>
              </label>
              <p className="setting-description">
                Where to save collected data files by default
              </p>
            </div>

            <div className="setting-item">
              <label className="setting-label">
                Data Retention (days)
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={settings.dataRetentionDays}
                  onChange={e => handleSettingChange('dataRetentionDays', Number(e.target.value))}
                />
              </label>
              <p className="setting-description">
                Automatically delete data older than this many days (0 = never delete)
              </p>
            </div>

            <div className="setting-item">
              <label className="setting-label">
                <span>Auto Backup</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={settings.autoBackup}
                    onChange={e => handleSettingChange('autoBackup', e.target.checked)}
                    aria-label="Toggle auto backup"
                  />
                  <span className="toggle-slider"></span>
                </label>
              </label>
              <p className="setting-description">
                Automatically backup data to cloud storage when available
              </p>
            </div>
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="card">
          <h2>Advanced</h2>
          <div className="setting-group">
            <div className="setting-item">
              <div className="setting-actions">
                <button 
                  className="btn-danger"
                  onClick={handleClearAllData}
                >
                  Clear All Data
                </button>
                <p className="setting-description">
                  Permanently delete all collected data and logs
                </p>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-actions">
                <button 
                  className="btn-secondary"
                  onClick={handleResetSettings}
                >
                  Reset to Defaults
                </button>
                <p className="setting-description">
                  Reset all settings to their default values
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Settings */}
      {isModified && (
        <div className="settings-actions">
          <button 
            className="btn-primary"
            onClick={handleSaveSettings}
          >
            Save Settings
          </button>
          <p className="unsaved-changes">You have unsaved changes</p>
        </div>
      )}
    </div>
  )
}
