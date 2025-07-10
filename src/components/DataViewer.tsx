import { useState, useEffect, useMemo, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useToast } from '../contexts/ToastContext'
import { config } from '../config'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import 'chartjs-adapter-date-fns'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
)

interface DataPoint {
  timestamp: number
  device_id: string
  data_type: string
  value: number
  unit: string
}

interface SessionData {
  session_name: string
  subject_id: string
  start_time: number
  end_time: number
  data: DataPoint[]
  metadata: {
    devices: string[]
    data_types: string[]
    sample_rate: number
    duration: number
  }
}

interface DataViewerProps {
  sessionId: string
  sessionName: string
  onClose: () => void
}

interface DeviceStats {
  count: number
  mean: number
  min: number
  max: number
  std: number
  unit: string
}

export default function DataViewer({ sessionId, sessionName, onClose }: DataViewerProps) {
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'chart' | 'table' | 'stats'>('chart')
  const [timeRange, setTimeRange] = useState<{ start: number; end: number } | null>(null)
  
  const { showError, showInfo, showSuccess } = useToast()

  const loadSessionData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const data: SessionData = await invoke('load_session_data', { sessionId })
      setSessionData(data)
      
      // Initialize filters with all available options
      setSelectedDevices(data.metadata.devices)
      setSelectedDataTypes(data.metadata.data_types)
      
      // Set initial time range to full session
      setTimeRange({
        start: data.start_time,
        end: data.end_time
      })
      
    } catch (err) {
      console.error('Failed to load session data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load session data')
      showError('Data Load Error', `Failed to load session data: ${err}`)
    } finally {
      setLoading(false)
    }
  }, [sessionId, showError])

  useEffect(() => {
    loadSessionData()
  }, [loadSessionData])

  // Helper function to generate consistent colors for device/data type combinations
  const getDeviceColor = (device: string, dataType: string, alpha: number = 1) => {
    const hash = (device + dataType).split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0)
      return a & a
    }, 0)
    
    const hue = Math.abs(hash) % 360
    return `hsla(${hue}, 70%, 50%, ${alpha})`
  }

  // Filter data based on selected devices, data types, and time range
  const filteredData = useMemo(() => {
    if (!sessionData) return []
    
    return sessionData.data.filter(point => {
      const deviceMatch = selectedDevices.includes(point.device_id)
      const typeMatch = selectedDataTypes.includes(point.data_type)
      const timeMatch = !timeRange || (
        point.timestamp >= timeRange.start && 
        point.timestamp <= timeRange.end
      )
      
      return deviceMatch && typeMatch && timeMatch
    })
  }, [sessionData, selectedDevices, selectedDataTypes, timeRange])

  // Prepare chart data
  const chartData = useMemo(() => {
    if (!filteredData.length) return null

    const datasets = selectedDataTypes.map(dataType => {
      const typeData = filteredData.filter(point => point.data_type === dataType)
      
      return selectedDevices.map(device => {
        const deviceData = typeData.filter(point => point.device_id === device)
        
        return {
          label: `${device} - ${dataType}`,
          data: deviceData.map(point => ({
            x: point.timestamp * 1000, // Convert to milliseconds for Chart.js
            y: point.value
          })),
          borderColor: getDeviceColor(device, dataType),
          backgroundColor: getDeviceColor(device, dataType, 0.1),
          borderWidth: 2,
          pointRadius: 1,
          tension: config.chartSmoothing
        }
      })
    }).flat()

    return {
      datasets: datasets.filter(dataset => dataset.data.length > 0)
    }
  }, [filteredData, selectedDevices, selectedDataTypes])

  // Calculate statistics
  const statistics = useMemo(() => {
    if (!filteredData.length) return null

    const stats: Record<string, Record<string, DeviceStats>> = {}
    
    selectedDataTypes.forEach(dataType => {
      stats[dataType] = {}
      
      selectedDevices.forEach(device => {
        const deviceData = filteredData.filter(
          point => point.device_id === device && point.data_type === dataType
        )
        
        if (deviceData.length > 0) {
          const values = deviceData.map(point => point.value)
          const mean = values.reduce((sum, val) => sum + val, 0) / values.length
          const min = Math.min(...values)
          const max = Math.max(...values)
          const std = Math.sqrt(
            values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
          )
          
          stats[dataType][device] = {
            count: values.length,
            mean: Number(mean.toFixed(3)),
            min: Number(min.toFixed(3)),
            max: Number(max.toFixed(3)),
            std: Number(std.toFixed(3)),
            unit: deviceData[0]?.unit || ''
          }
        }
      })
    })
    
    return stats
  }, [filteredData, selectedDevices, selectedDataTypes])

  const reloadData = () => {
    loadSessionData()
  }

  const exportFilteredData = async () => {
    try {
      const csvContent = [
        ['Timestamp', 'Device', 'Data Type', 'Value', 'Unit'].join(','),
        ...filteredData.map(point => [
          new Date(point.timestamp * 1000).toISOString(),
          point.device_id,
          point.data_type,
          point.value,
          point.unit
        ].join(','))
      ].join('\n')

      const fileName = `${sessionName}_filtered_${new Date().toISOString().split('T')[0]}.csv`
      
      // Save filtered data to app data directory
      const savedPath = await invoke('save_filtered_data', {
        fileName,
        content: csvContent
      })
      
      // Then copy it to Downloads folder using the working copy function
      try {
        // Get CSRF token first
        const csrfToken = await invoke('get_csrf_token')
        
        const result = await invoke('copy_file_to_downloads', { 
          filePath: savedPath,
          fileName: fileName,
          csrfToken
        })
        
        showSuccess(
          'File Exported Successfully',
          `Filtered data exported to Downloads folder: ${result}`
        )
      } catch {
        // If copy fails, at least show where the file was saved
        showInfo(
          'Export Completed - Manual Copy Available',
          `Filtered data saved to: ${savedPath}\n\nNote: You can manually copy this file to your desired location.`
        )
      }
    } catch (err) {
      console.error('Failed to export filtered data:', err)
      showError('Export Failed', `Failed to export filtered data: ${err}`)
    }
  }

  if (loading) {
    return (
      <div className="data-viewer-overlay">
        <div className="data-viewer-modal">
          <div className="data-viewer-loading">
            <div className="spinner"></div>
            <p>Loading session data...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="data-viewer-overlay">
        <div className="data-viewer-modal">
          <div className="data-viewer-error">
            <h3>❌ Error Loading Data</h3>
            <p>{error}</p>
            <div className="error-actions">
              <button className="btn-primary" onClick={reloadData}>
                🔄 Retry
              </button>
              <button className="btn-secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!sessionData) {
    return (
      <div className="data-viewer-overlay">
        <div className="data-viewer-modal">
          <div className="data-viewer-error">
            <h3>❌ No Data Available</h3>
            <p>Session data could not be loaded.</p>
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="data-viewer-overlay">
      <div className="data-viewer-modal">
        <div className="data-viewer-header">
          <div className="session-info">
            <h2>📊 {sessionData.session_name}</h2>
            <p>Subject: {sessionData.subject_id} | Duration: {Math.round(sessionData.metadata.duration)}s | Sample Rate: {sessionData.metadata.sample_rate}Hz</p>
          </div>
          <button className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="data-viewer-controls">
          {/* View Mode Selector */}
          <div className="control-group">
            <label>View:</label>
            <div className="btn-group">
              <button 
                className={`btn-small ${viewMode === 'chart' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('chart')}
              >
                📈 Chart
              </button>
              <button 
                className={`btn-small ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('table')}
              >
                📋 Table
              </button>
              <button 
                className={`btn-small ${viewMode === 'stats' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('stats')}
              >
                📊 Statistics
              </button>
            </div>
          </div>

          {/* Device Filter */}
          <div className="control-group">
            <label>Devices:</label>
            <div className="checkbox-group">
              {sessionData.metadata.devices.map(device => (
                <label key={device} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedDevices.includes(device)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDevices([...selectedDevices, device])
                      } else {
                        setSelectedDevices(selectedDevices.filter(d => d !== device))
                      }
                    }}
                  />
                  {device}
                </label>
              ))}
            </div>
          </div>

          {/* Data Type Filter */}
          <div className="control-group">
            <label>Data Types:</label>
            <div className="checkbox-group">
              {sessionData.metadata.data_types.map(dataType => (
                <label key={dataType} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedDataTypes.includes(dataType)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDataTypes([...selectedDataTypes, dataType])
                      } else {
                        setSelectedDataTypes(selectedDataTypes.filter(t => t !== dataType))
                      }
                    }}
                  />
                  {dataType}
                </label>
              ))}
            </div>
          </div>

          {/* Export Button */}
          <div className="control-group">
            <button className="btn-secondary" onClick={exportFilteredData}>
              📥 Export Filtered Data
            </button>
          </div>
        </div>

        <div className="data-viewer-content">
          {viewMode === 'chart' && chartData && (
            <div className="chart-container">
              <Line
                data={chartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'top',
                      labels: {
                        boxWidth: 12,
                        padding: 10
                      }
                    },
                    title: {
                      display: true,
                      text: `${sessionData.session_name} - Data Visualization`
                    }
                  },
                  scales: {
                    x: {
                      type: 'time',
                      time: {
                        displayFormats: {
                          millisecond: 'HH:mm:ss.SSS',
                          second: 'HH:mm:ss',
                          minute: 'HH:mm'
                        }
                      },
                      title: {
                        display: true,
                        text: 'Time'
                      }
                    },
                    y: {
                      title: {
                        display: true,
                        text: 'Value'
                      }
                    }
                  },
                  interaction: {
                    intersect: false,
                    mode: 'index'
                  }
                }}
              />
            </div>
          )}

          {viewMode === 'table' && (
            <div className="table-container-scrollable">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Device</th>
                    <th>Data Type</th>
                    <th>Value</th>
                    <th>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.slice(0, config.maxChartPoints).map((point, index) => (
                    <tr key={index}>
                      <td>{new Date(point.timestamp * 1000).toLocaleTimeString()}</td>
                      <td>{point.device_id}</td>
                      <td>{point.data_type}</td>
                      <td>{point.value.toFixed(3)}</td>
                      <td>{point.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredData.length > config.maxChartPoints && (
                <div className="table-note">
                  Showing first {config.maxChartPoints} of {filteredData.length} data points
                </div>
              )}
            </div>
          )}

          {viewMode === 'stats' && statistics && (
            <div className="statistics-container">
              {Object.entries(statistics).map(([dataType, deviceStats]) => (
                <div key={dataType} className="stats-section">
                  <h3>{dataType}</h3>
                  <div className="stats-grid">
                    {Object.entries(deviceStats).map(([device, stats]) => (
                      <div key={device} className="stat-card">
                        <h4>{device}</h4>
                        <div className="stat-values">
                          <div>Count: {stats.count}</div>
                          <div>Mean: {stats.mean} {stats.unit}</div>
                          <div>Min: {stats.min} {stats.unit}</div>
                          <div>Max: {stats.max} {stats.unit}</div>
                          <div>Std Dev: {stats.std} {stats.unit}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
