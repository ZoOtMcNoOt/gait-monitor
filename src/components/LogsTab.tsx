import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useToast } from '../contexts/ToastContext'
import { useConfirmation } from '../hooks/useConfirmation'
import { useTimestampManager } from '../hooks/useTimestampManager'
import ConfirmationModal from './ConfirmationModal'
import ErrorBoundary from './ErrorBoundary'
import DataViewer from './DataViewer'
import ScrollableContainer from './ScrollableContainer'
import { protectedOperations } from '../services/csrfProtection'
import '../styles/tables.css'
import '../styles/tabs.css'
import { Icon } from './icons'

interface LogEntry {
  id: string
  session_name: string
  subject_id: string
  timestamp: number
  data_points: number
  file_path: string
  notes?: string
  devices: string[]
}

interface SessionMetadata {
  id: string
  session_name: string
  subject_id: string
  notes: string
  timestamp: number
  data_points: number
  file_path: string
  devices: string[]
}

export default function LogsTab() {
  return (
    <ErrorBoundary>
      <LogsTabContent />
    </ErrorBoundary>
  )
}

function LogsTabContent() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalDataPoints: 0,
    lastSession: null as Date | null
  })
  const [viewingSession, setViewingSession] = useState<LogEntry | null>(null)
  
  // Optimized timestamp management
  const { formatTimestamp } = useTimestampManager()
  
  // Add hooks for proper error handling
  const { showSuccess, showError, showInfo } = useToast()
  const { confirmationState, showConfirmation } = useConfirmation()

  const loadLogs = useCallback(async () => {
    try {
      // Load real sessions from backend
      const sessions: SessionMetadata[] = await invoke('get_sessions')
      
  console.log('[Logs] Loaded sessions from backend:', sessions.length)

      // Convert to LogEntry format
      const logEntries: LogEntry[] = sessions.map(session => ({
        id: session.id,
        session_name: session.session_name,
        subject_id: session.subject_id,
        timestamp: session.timestamp,
        data_points: session.data_points,
        file_path: session.file_path,
        notes: session.notes,
        devices: session.devices
      }))
      
      // Sort logs by timestamp - most recent at the top
      logEntries.sort((a, b) => {
        // Handle cases where timestamps might be missing or invalid
        const timestampA = a.timestamp || 0
        const timestampB = b.timestamp || 0
        return timestampB - timestampA // Descending order (newest first)
      })
      
      setLogs(logEntries)
      
      // Calculate stats
      const totalSessions = logEntries.length
      const totalDataPoints = logEntries.reduce((sum, log) => sum + log.data_points, 0)
      
      // Since backend generates consistent millisecond timestamps, use them directly
      const validTimestamps = logEntries
        .map(log => log.timestamp)
        .filter(timestamp => timestamp && timestamp > 0)
        
      const lastSession = validTimestamps.length > 0 
        ? new Date(Math.max(...validTimestamps))
        : null
        
      setStats({ totalSessions, totalDataPoints, lastSession })
      
    } catch (error) {
      console.error('Failed to load sessions:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      showError('Load Error', `Failed to load sessions: ${errorMessage}`)
      
      // Fallback to empty state
      setLogs([])
      setStats({ totalSessions: 0, totalDataPoints: 0, lastSession: null })
    }
  }, [showError])

  // Load logs from storage
  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const handleViewLog = (log: LogEntry) => {
    // Open the data viewer with the selected session
    setViewingSession(log)
  }

  const handleDownloadLog = async (log: LogEntry) => {
    try {
      // Copy the file to Downloads folder with a user-friendly name using enhanced CSRF protection
      const safeDate = log.timestamp && log.timestamp > 0 
        ? new Date(log.timestamp).toISOString().split('T')[0] // Backend now provides milliseconds directly
        : 'unknown-date'
        
      const result = await protectedOperations.copyFileToDownloads(
        log.file_path,
        `${log.session_name}_${log.subject_id}_${safeDate}.csv`
      )
      
      showSuccess(
        'File Exported Successfully',
        `File exported to Downloads folder: ${result}`
      )
    } catch (error) {
      console.error('Failed to export file:', error)
      // Fallback: show file location
      showInfo(
        'Export Failed - Manual Copy Available',
        `File location: ${log.file_path}\n\nNote: You can manually copy this file to your desired location.`
      )
    }
  }

  const handleDeleteLog = async (logId: string) => {
    const confirmed = await showConfirmation({
      title: 'Delete Session',
      message: 'Are you sure you want to delete this session? This action cannot be undone and will permanently remove all associated data.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'danger'
    })
    
    if (confirmed) {
      try {
        // Use enhanced CSRF protection for delete operation
        await protectedOperations.deleteSession(logId)
        
        // Reload logs after deletion
        await loadLogs()
        showSuccess('Session Deleted', 'The session has been successfully deleted.')
      } catch (error) {
        console.error('Failed to delete session:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        
        // Enhanced error handling for CSRF-related errors
        if (errorMessage.includes('CSRF')) {
          showError('Security Error', `${errorMessage}\n\nThe page will refresh to get a new security token.`)
          setTimeout(() => window.location.reload(), 3000)
        } else if (errorMessage.includes('rate limit')) {
          showError('Rate Limit Exceeded', `${errorMessage}\n\nPlease wait a moment before trying again.`)
        } else {
          showError('Delete Failed', `Failed to delete session: ${errorMessage}`)
        }
      }
    }
  }

  const formatFileSize = (dataPoints: number) => {
    // Rough estimate: each data point ~50 bytes
    const bytes = dataPoints * 50
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${Math.round(bytes / (1024 * 1024))} MB`
  }

  return (
    <ScrollableContainer id="logs-tab" className="tab-content">
      <div className="tab-header">
        <h1>Data Logs</h1>
        <p>View, download, and manage your saved gait data sessions.</p>
      </div>

      {/* Statistics */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Sessions</h3>
          <div className="stat-value">{stats.totalSessions}</div>
        </div>
        <div className="stat-card">
          <h3>Total Data Points</h3>
          <div className="stat-value">{stats.totalDataPoints.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <h3>Last Session</h3>
          <div className="stat-value">
            {stats.lastSession ? stats.lastSession.toLocaleDateString() : 'N/A'}
          </div>
        </div>
        <div className="stat-card">
          <h3>Storage Used</h3>
          <div className="stat-value">{formatFileSize(stats.totalDataPoints)}</div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="card">
        <div className="logs-header">
          <h2>Session Logs</h2>
          <button 
            className="btn-secondary logs-refresh-btn" 
            onClick={loadLogs}
          >
            <span aria-hidden="true" className="btn-icon"><Icon.Refresh title="Refresh" /></span> Refresh
          </button>
        </div>
        {logs.length === 0 ? (
          <div className="empty-state">
            <p>No data logs found.</p>
            <p>Complete a data collection session to see logs here.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>Session Name</th>
                  <th>Subject ID</th>
                  <th>Date & Time</th>
                  <th>Data Points</th>
                  <th>File Size</th>
                  <th>Notes</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="session-name">{log.session_name}</td>
                    <td>{log.subject_id}</td>
                    <td>{formatTimestamp(log.timestamp, 'full')}</td>
                    <td>{log.data_points.toLocaleString()}</td>
                    <td>{formatFileSize(log.data_points)}</td>
                    <td className="notes-cell">
                      {log.notes ? (
                        <span title={log.notes}>
                          {log.notes.length > 30 ? `${log.notes.substring(0, 30)}...` : log.notes}
                        </span>
                      ) : (
                        <span className="no-notes">—</span>
                      )}
                    </td>
                    <td className="actions-cell">
                      <button 
                        className="btn-small btn-primary"
                        onClick={() => handleViewLog(log)}
                        title="View data"
                        aria-label={`View ${log.session_name}`}
                      >
                        <span aria-hidden="true" className="btn-icon"><Icon.Eye title="View" /></span>
                      </button>
                      <button 
                        className="btn-small btn-secondary"
                        onClick={() => handleDownloadLog(log)}
                        title="Download CSV"
                        aria-label={`Download ${log.session_name}`}
                      >
                        <span aria-hidden="true" className="btn-icon"><Icon.Download title="Download" /></span>
                      </button>
                      <button 
                        className="btn-small btn-danger"
                        onClick={() => handleDeleteLog(log.id)}
                        title="Delete log"
                        aria-label={`Delete ${log.session_name}`}
                      >
                        <span aria-hidden="true" className="btn-icon"><Icon.Trash title="Delete" /></span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
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
      
      {/* Data Viewer Modal */}
      {viewingSession && (
        <DataViewer
          sessionId={viewingSession.id}
          sessionName={viewingSession.session_name}
          onClose={() => setViewingSession(null)}
        />
      )}
    </ScrollableContainer>
  )
}
