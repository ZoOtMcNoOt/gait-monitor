import { useState, useEffect } from 'react'

interface LogEntry {
  id: string
  sessionName: string
  subjectId: string
  timestamp: Date
  dataPoints: number
  filePath: string
  notes?: string
}

export default function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState({
    totalSessions: 0,
    totalDataPoints: 0,
    lastSession: null as Date | null
  })

  // Load logs from storage
  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = () => {
    // TODO: Load from actual storage (localStorage, IndexedDB, or filesystem)
    const mockLogs: LogEntry[] = [
      {
        id: '1',
        sessionName: 'Morning Walk Test',
        subjectId: 'SUBJ001',
        timestamp: new Date('2025-06-29T10:30:00'),
        dataPoints: 1250,
        filePath: 'gait_data_20250629_103000.csv',
        notes: 'Normal walking pace, clear day'
      },
      {
        id: '2',
        sessionName: 'Evening Jog',
        subjectId: 'SUBJ001',
        timestamp: new Date('2025-06-29T18:15:00'),
        dataPoints: 3500,
        filePath: 'gait_data_20250629_181500.csv',
        notes: 'Faster pace, some fatigue noted'
      }
    ]
    
    setLogs(mockLogs)
    
    // Calculate stats
    const totalSessions = mockLogs.length
    const totalDataPoints = mockLogs.reduce((sum, log) => sum + log.dataPoints, 0)
    const lastSession = mockLogs.length > 0 
      ? new Date(Math.max(...mockLogs.map(log => log.timestamp.getTime())))
      : null
      
    setStats({ totalSessions, totalDataPoints, lastSession })
  }

  const handleViewLog = (log: LogEntry) => {
    // TODO: Implement in-app data viewer
    alert(`Viewing log: ${log.sessionName}\nData points: ${log.dataPoints}`)
  }

  const handleDownloadLog = (log: LogEntry) => {
    // TODO: Implement file download
    alert(`Downloading: ${log.filePath}`)
  }

  const handleDeleteLog = (logId: string) => {
    if (confirm('Are you sure you want to delete this log? This action cannot be undone.')) {
      setLogs(logs.filter(log => log.id !== logId))
      // TODO: Delete from actual storage
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
    <div className="tab-content">
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
        <h2>Session Logs</h2>
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
                    <td className="session-name">{log.sessionName}</td>
                    <td>{log.subjectId}</td>
                    <td>{log.timestamp.toLocaleString()}</td>
                    <td>{log.dataPoints.toLocaleString()}</td>
                    <td>{formatFileSize(log.dataPoints)}</td>
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
    </div>
  )
}
