import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SessionMetadata } from '../types'
import { useToast } from '../contexts/ToastContext'
import { useConfirmation } from '../hooks/useConfirmation'
import ConfirmationModal from './ConfirmationModal'
import TypedConfirmationModal from './TypedConfirmationModal'
import ScrollableContainer from './ScrollableContainer'
import { protectedOperations } from '../services/csrfProtection'
import '../styles/settings.css'
import '../styles/tabs.css'

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
  const [highContrastMode, setHighContrastMode] = useState(false)
  
  // Separate input values for validation
  const [retentionInputValue, setRetentionInputValue] = useState('90')
  const [storagePathInputValue, setStoragePathInputValue] = useState('./gait_data')
  
  // Add hooks for proper error handling
  const { showSuccess, showError, showInfo, showSettingsSaved } = useToast()
  const { confirmationState, typedConfirmationState, showConfirmation, showTypedConfirmation } = useConfirmation()

  // Load settings from localStorage
  useEffect(() => {
    const savedSettings = localStorage.getItem('appSettings')
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings)
        setSettings(parsed)
        // Initialize input values
        setRetentionInputValue(parsed.dataRetentionDays?.toString() || '90')
        setStoragePathInputValue(parsed.defaultStoragePath || './gait_data')
      } catch (e) {
        console.error('Failed to parse saved settings:', e)
        // Set default input values
        setRetentionInputValue('90')
        setStoragePathInputValue('./gait_data')
      }
    } else {
      // Set default input values
      setRetentionInputValue('90')
      setStoragePathInputValue('./gait_data')
    }

    // Load high contrast mode preference
    const savedHighContrast = localStorage.getItem('highContrastMode')
    if (savedHighContrast === 'true') {
      setHighContrastMode(true)
      document.documentElement.classList.add('high-contrast')
    }
  }, [])

  // Apply high contrast mode changes
  useEffect(() => {
    if (highContrastMode) {
      document.documentElement.classList.add('high-contrast')
      localStorage.setItem('highContrastMode', 'true')
    } else {
      document.documentElement.classList.remove('high-contrast')
      localStorage.setItem('highContrastMode', 'false')
    }
  }, [highContrastMode])

  const handleSettingChange = <K extends keyof SettingsData>(
    key: K,
    value: SettingsData[K]
  ) => {
    // Input validation
    if (key === 'dataRetentionDays' && (Number(value) < 0 || Number(value) > 365)) {
      return // Don't allow invalid values
    }
    if (key === 'defaultStoragePath' && !String(value).trim()) {
      return // Don't allow empty storage path
    }
    if (key === 'sampleRate' && (Number(value) <= 0 || Number(value) > 1000)) {
      return // Don't allow invalid sample rates
    }
    
    setSettings(prev => ({ ...prev, [key]: value }))
    setIsModified(true)
  }

  // Controlled input handlers with validation
  const handleRetentionDaysChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    const numValue = Number(value)
    
    // Validate and either accept or reject the change
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 365) {
      setRetentionInputValue(value)
      handleSettingChange('dataRetentionDays', numValue)
    } else {
      // For invalid values, revert to the current valid value
      setRetentionInputValue(retentionInputValue)
    }
  }

  const handleStoragePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    
    // Validate and either accept or reject the change
    if (value.trim()) {
      setStoragePathInputValue(value)
      handleSettingChange('defaultStoragePath', value)
    } else {
      // For empty values, revert to the current valid value
      setStoragePathInputValue(storagePathInputValue)
    }
  }

  const toggleHighContrast = () => {
    setHighContrastMode(prev => !prev)
  }

  const handleSaveSettings = () => {
    try {
      localStorage.setItem('appSettings', JSON.stringify(settings))
      setIsModified(false)
      showSettingsSaved()
    } catch (e) {
      showError('Save Failed', `Failed to save settings: ${e}`)
    }
  }

  const handleResetSettings = async () => {
    const confirmed = await showConfirmation({
      title: 'Reset Settings',
      message: 'Are you sure you want to reset all settings to their default values? This action cannot be undone.',
      confirmText: 'Reset',
      cancelText: 'Cancel',
      type: 'warning'
    })
    
    if (confirmed) {
      const defaultSettings: SettingsData = {
        defaultStoragePath: './gait_data',
        dataRetentionDays: 90,
        autoBackup: false,
        exportFormat: 'csv',
        sampleRate: 100
      }
      setSettings(defaultSettings)
      setRetentionInputValue('90')
      setStoragePathInputValue('./gait_data')
      setIsModified(true)
      showInfo('Settings Reset', 'All settings have been reset to their default values.')
    }
  }

  const handleChooseStoragePath = async () => {
    try {
      const result = await protectedOperations.chooseStorageDirectory() as string | null
      if (result) {
        handleSettingChange('defaultStoragePath', result)
        setStoragePathInputValue(result)
        showSuccess('Storage Path Updated', `Storage path has been updated to: ${result}`)
      }
    } catch (error) {
      console.error('Failed to choose storage path:', error)
      showError('Path Selection Failed', `Failed to choose storage path: ${error}`)
    }
  }

  const handleClearAllData = async () => {
    const firstConfirmed = await showConfirmation({
      title: 'Clear All Data',
      message: 'Are you sure you want to clear all data? This action cannot be undone and will permanently delete all saved sessions and logs.',
      confirmText: 'Continue',
      cancelText: 'Cancel',
      type: 'danger'
    })
    
    if (firstConfirmed) {
      const finalConfirmed = await showTypedConfirmation({
        title: 'Final Confirmation - Type to Confirm',
        message: 'This will permanently delete ALL saved sessions and logs. This action cannot be undone.',
        requiredPhrase: 'DELETE ALL DATA',
        confirmText: 'Delete All Data',
        cancelText: 'Cancel',
        type: 'danger'
      })
      
      if (finalConfirmed) {
        try {
          // Get all sessions first
          const sessions = await invoke<SessionMetadata[]>('get_sessions')
          
          // Delete each session using CSRF protection
          for (const session of sessions) {
            await protectedOperations.deleteSession(session.id)
          }
          
          showSuccess('Data Cleared', `Successfully deleted ${sessions.length} session(s) and their data files.`)
        } catch (error) {
          console.error('Failed to clear data:', error)
          showError('Clear Data Failed', `Failed to clear data: ${error}`)
        }
      }
    }
  }

  return (
    <ScrollableContainer id="settings-tab" className="tab-content">
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
            
            <div className="setting-item">
              <label className="setting-label">
                <span>High Contrast Mode</span>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={highContrastMode}
                    onChange={toggleHighContrast}
                    aria-label="Toggle high contrast mode for better accessibility"
                  />
                  <span className="toggle-slider"></span>
                </label>
              </label>
              <p className="setting-description">
                Enhance contrast for improved visibility and accessibility
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
                  data-testid="sample-rate"
                  value={settings.sampleRate}
                  onChange={e => handleSettingChange('sampleRate', Number(e.target.value))}
                  aria-label="Sample rate in Hz"
                  aria-describedby="sample-rate-description"
                >
                  <option value={50}>50 Hz</option>
                  <option value={100}>100 Hz</option>
                  <option value={200}>200 Hz</option>
                  <option value={500}>500 Hz</option>
                </select>
              </label>
              <p className="setting-description" id="sample-rate-description">
                Higher sample rates provide more detailed data but use more storage
              </p>
            </div>

            <div className="setting-item">
              <label className="setting-label">
                Export Format
                <select
                  data-testid="export-format"
                  value={settings.exportFormat}
                  onChange={e => handleSettingChange('exportFormat', e.target.value as 'csv' | 'json')}
                  aria-label="Export format"
                  aria-describedby="export-format-description"
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
              </label>
              <p className="setting-description" id="export-format-description">
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
                    data-testid="storage-path"
                    type="text"
                    value={storagePathInputValue}
                    onChange={handleStoragePathChange}
                    placeholder="./gait_data"
                    aria-label="Default storage path"
                    aria-describedby="storage-path-description"
                  />
                  <button type="button" onClick={handleChooseStoragePath}>
                    Browse
                  </button>
                </div>
              </label>
              <p className="setting-description" id="storage-path-description">
                Where to save collected data files by default
              </p>
            </div>

            <div className="setting-item">
              <label className="setting-label">
                Data Retention (days)                  <input
                    data-testid="retention-days"
                    type="number"
                    min="1"
                    max="365"
                    value={retentionInputValue}
                    onChange={handleRetentionDaysChange}
                    aria-label="Data retention days"
                    aria-describedby="retention-days-description"
                  />
              </label>
              <p className="setting-description" id="retention-days-description">
                Automatically delete data older than this many days (0 = never delete)
              </p>
            </div>

            <div className="setting-item">
              <label className="setting-label">
                <span>Auto Backup</span>
                <label className="toggle-switch">
                  <input
                    data-testid="auto-backup"
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

        {/* Storage Information */}
        <div className="card">
          <h2>Storage Information</h2>
          <StorageInfo />
        </div>

        {/* Advanced Settings */}
        <div className="card">
          <h2>Advanced</h2>
          <div className="setting-group">
            <div className="setting-item">
              <div className="setting-actions">
                <button 
                  className="btn btn-danger"
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
                  className="btn btn-secondary"
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
          <div className="unsaved-indicator">
            <p className="unsaved-changes">You have unsaved changes</p>
          </div>
          <div className="action-buttons">
            <button 
              className="btn btn-primary"
              onClick={handleSaveSettings}
              aria-describedby="unsaved-changes-text"
            >
              Save Settings
            </button>
          </div>
        </div>
      )}
      
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        title={confirmationState.title}
        message={confirmationState.message}
        confirmText={confirmationState.confirmText}
        cancelText={confirmationState.cancelText}
        onConfirm={confirmationState.onConfirm}
        onCancel={confirmationState.onCancel}
        type={confirmationState.type}
      />
      
      {/* Typed Confirmation Modal */}
      <TypedConfirmationModal
        isOpen={typedConfirmationState.isOpen}
        title={typedConfirmationState.title}
        message={typedConfirmationState.message}
        requiredPhrase={typedConfirmationState.requiredPhrase}
        confirmText={typedConfirmationState.confirmText}
        cancelText={typedConfirmationState.cancelText}
        onConfirm={typedConfirmationState.onConfirm}
        onCancel={typedConfirmationState.onCancel}
        type={typedConfirmationState.type}
      />
    </ScrollableContainer>
  )
}

// Storage Information Component
function StorageInfo() {
  const [storagePath, setStoragePath] = useState<string>('')
  const [sessionCount, setSessionCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const { showError } = useToast()

  useEffect(() => {
    const loadStorageInfo = async () => {
      try {
        setLoading(true)
        
        // Get storage path
        const path = await invoke<string>('get_storage_path')
        setStoragePath(path)
        
        // Get session count
        const sessions = await invoke<SessionMetadata[]>('get_sessions')
        setSessionCount(sessions.length)
        
      } catch (error) {
        // Don't log cleanup errors during testing
        if (error instanceof Error && error.message !== 'Cleanup failed') {
          console.error('Failed to load storage info:', error)
        }
        showError('Storage Info Error', `Failed to load storage information: ${error}`)
      } finally {
        setLoading(false)
      }
    }

    loadStorageInfo().catch(error => {
      console.error('Storage info loading failed:', error)
      setLoading(false)
    })
  }, [showError])

  if (loading) {
    return <div>Loading storage information...</div>
  }

  return (
    <div className="storage-info">
      <div className="setting-group">
        <label>Storage Location:</label>
        <p className="storage-path">{storagePath}</p>
      </div>
      <div className="setting-group">
        <label>Saved Sessions:</label>
        <p>{sessionCount} session(s)</p>
      </div>
    </div>
  )
}
