import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useToast } from '../contexts/ToastContext'
import { useConfirmation } from '../hooks/useConfirmation'
import { useTimestampManager } from '../hooks/useTimestampManager'
import ConfirmationModal from './ConfirmationModal'
import ErrorBoundary from './ErrorBoundary'
import DataViewer from './DataViewer'
import ScrollableContainer from './ScrollableContainer'

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
      
      console.log('📊 Loaded sessions from backend:', sessions.length)
      console.log('📊 Sample session timestamps:', sessions.slice(0, 3).map(s => ({ 
        name: s.session_name, 
        timestamp: s.timestamp,
        timestampType: s.timestamp > 1e12 ? 'microseconds' : s.timestamp > 1e9 ? 'milliseconds' : 'seconds',
        asDate: formatTimestamp(s.timestamp),
        directDate: new Date(s.timestamp).toLocaleString(),
        adjustedDate: s.timestamp > 1e12 ? new Date(s.timestamp / 1000).toLocaleString() : new Date(s.timestamp).toLocaleString()
      })))
      
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
      
      setLogs(logEntries)
      
      // Calculate stats
      const totalSessions = logEntries.length
      const totalDataPoints = logEntries.reduce((sum, log) => sum + log.data_points, 0)
      
      // Handle timestamp validation with auto-detection of precision
      const validTimestamps = logEntries
        .map(log => {
          const ts = log.timestamp;
          if (!ts || ts <= 0) return null;
          
          // Auto-detect timestamp precision and normalize to milliseconds
          if (ts > 1e12) {
            // Microseconds - convert to milliseconds
            return ts / 1000;
          } else if (ts > 1e9) {
            // Already milliseconds
            return ts;
          } else {
            // Seconds - convert to milliseconds  
            return ts * 1000;
          }
        })
        .filter((ts): ts is number => ts !== null)
        
      const lastSession = validTimestamps.length > 0 
        ? new Date(Math.max(...validTimestamps))
        : null
        
      console.log('📊 Valid timestamps:', validTimestamps.length, 'of', logEntries.length)
      if (validTimestamps.length > 0) {
        console.log('📊 Latest timestamp (ms):', Math.max(...validTimestamps), 'Date:', new Date(Math.max(...validTimestamps)))
      }
        
      setStats({ totalSessions, totalDataPoints, lastSession })
      
      if (logEntries.length === 0) {
        showInfo('No Sessions', 'No saved sessions found. Complete the data collection process to create sessions.')
      }
      
    } catch (error) {
      console.error('Failed to load sessions:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      showError('Load Error', `Failed to load sessions: ${errorMessage}`)
      
      // Fallback to empty state
      setLogs([])
      setStats({ totalSessions: 0, totalDataPoints: 0, lastSession: null })
    }
  }, [showError, showInfo, formatTimestamp])

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
      // Get CSRF token first
      const csrfToken = await invoke('get_csrf_token')
      
      // Copy the file to Downloads folder with a user-friendly name
      const safeDate = log.timestamp && log.timestamp > 0 
        ? (() => {
            // Auto-detect timestamp precision and normalize to milliseconds
            let normalizedTimestamp = log.timestamp;
            if (log.timestamp > 1e12) {
              // Microseconds - convert to milliseconds
              normalizedTimestamp = log.timestamp / 1000;
            } else if (log.timestamp < 1e9) {
              // Seconds - convert to milliseconds  
              normalizedTimestamp = log.timestamp * 1000;
            }
            return new Date(normalizedTimestamp).toISOString().split('T')[0];
          })()
        : 'unknown-date'
        
      const result = await invoke('copy_file_to_downloads', { 
        filePath: log.file_path,
        fileName: `${log.session_name}_${log.subject_id}_${safeDate}.csv`,
        csrfToken
      })
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
        // Get CSRF token first
        const csrfToken = await invoke('get_csrf_token')
        
        await invoke('delete_session', { sessionId: logId, csrfToken })
        // Reload logs after deletion
        await loadLogs()
        showSuccess('Session Deleted', 'The session has been successfully deleted.')
      } catch (error) {
        console.error('Failed to delete session:', error)
        showError('Delete Failed', `Failed to delete session: ${error}`)
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
            🔄 Refresh
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
                      >
                        👁️
                      </button>
                      <button 
                        className="btn-small btn-secondary"
                        onClick={() => handleDownloadLog(log)}
                        title="Download CSV"
                      >
                        📥
                      </button>
                      <button 
                        className="btn-small btn-danger"
                        onClick={() => handleDeleteLog(log.id)}
                        title="Delete log"
                      >
                        🗑️
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
