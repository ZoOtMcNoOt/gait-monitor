import { useEffect, useRef, useState, useCallback } from 'react'
import '../styles/chart.css'
import { 
  Chart, 
  LineController, 
  LineElement, 
  PointElement, 
  LinearScale, 
  TimeScale,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { invoke } from '@tauri-apps/api/core'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'
import { useBufferManager } from '../hooks/useBufferManager'
import { config } from '../config'
import { useTimestampManager } from '../hooks/useTimestampManager'

Chart.register(
  LineController, 
  LineElement, 
  PointElement, 
  LinearScale, 
  TimeScale,
  Title,
  Tooltip,
  Legend
)

interface Props {
  isCollecting?: boolean
}

const CHART_COLORS = {
  R1: 'var(--chart-color-r1, #ef4444)', // red
  R2: 'var(--chart-color-r2, #f97316)', // orange
  R3: 'var(--chart-color-r3, #eab308)', // yellow
} as const

export default function LiveChart({ isCollecting = false }: Props) {
  // Chart state
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [chartMode, setChartMode] = useState<'all' | 'resistance'>('resistance')
  const [showDataTable, setShowDataTable] = useState(false)
  const [announcementText, setAnnouncementText] = useState('')
  
  // Use global device connection context (read-only)
  const { 
    connectedDevices, 
    activeCollectingDevices,
    connectionStatus, 
    lastGaitDataTime,
    getCurrentSampleRate
  } = useDeviceConnection()
  
  // Initialize unified buffer manager  
  const { state: bufferState } = useBufferManager()
  
  // Optimized timestamp management with caching
  const { getChartTimestamp } = useTimestampManager({
    useRelativeTime: true,
    autoSetBase: true,
    cacheExpiration: 1000 // 1 second cache for high-frequency data
  })

  // Calculate current sample rate display
  const getCurrentSampleRateDisplay = useCallback((): string => {
    if (activeCollectingDevices.length === 0) {
      return "0 Hz"
    }
    
    const rates = activeCollectingDevices
      .map(deviceId => getCurrentSampleRate(deviceId))
      .filter((rate): rate is number => rate !== null && rate > 0)
    
    if (rates.length === 0) {
      return "calculating..."
    }
    
    if (rates.length === 1) {
      return `${rates[0].toFixed(1)} Hz`
    }
    
    // Multiple devices - show range or average
    const minRate = Math.min(...rates)
    const maxRate = Math.max(...rates)
    
    if (Math.abs(maxRate - minRate) < 1) {
      // Similar rates, show average
      const avgRate = rates.reduce((sum, rate) => sum + rate, 0) / rates.length
      return `${avgRate.toFixed(1)} Hz`
    } else {
      // Different rates, show range
      return `${minRate.toFixed(1)}-${maxRate.toFixed(1)} Hz`
    }
  }, [activeCollectingDevices, getCurrentSampleRate])

  // Function to update chart from backend data
  const updateChartFromBackendData = useCallback((backendData: Record<string, unknown>) => {
    if (!chartRef.current) return

    const chart = chartRef.current
    
    // Clear existing datasets to avoid duplicates
    chart.data.datasets = []
    
    // Process backend data and create datasets
    Object.entries(backendData).forEach(([, series]) => {
      const seriesData = series as { device_id: string; data_type: string; queue: Array<{ timestamp: number; value: number }> }
      const { device_id, data_type, queue } = seriesData
      const deviceLabel = device_id === 'simulation' ? 'Sim' : `Device ${device_id.slice(-4)}`
      
      // Map data type to color and label (resistance only)
      const colorMap: Record<string, string> = {
        'r1': CHART_COLORS.R1,
        'r2': CHART_COLORS.R2, 
        'r3': CHART_COLORS.R3
      }
      
      const labelMap: Record<string, string> = {
        'r1': 'R1 (Resistance)',
        'r2': 'R2 (Resistance)',
        'r3': 'R3 (Resistance)'
      }
      
      // Only show resistance datasets (R1, R2, R3)
      const shouldShow = (dataType: string) => {
        return ['r1', 'r2', 'r3'].includes(dataType)
      }
      
      if (!shouldShow(data_type)) return
      
      const color = colorMap[data_type] || '#666666'
      const label = `${deviceLabel} - ${labelMap[data_type] || data_type.toUpperCase()}`
      
      // Convert backend queue data to chart format
      const chartPoints = queue.map((point) => ({
        x: getChartTimestamp(point.timestamp),
        y: point.value
      }))
      
      const dataset = {
        label,
        data: chartPoints,
        borderColor: color,
        backgroundColor: color + '20',
        tension: 0.1,
        pointRadius: 0,
        borderWidth: 2
      }
      
      chart.data.datasets.push(dataset)
    })
    
    chart.update('none')
    
    // Log backend data stats
    const totalPoints = Object.values(backendData).reduce((sum: number, series) => {
      const seriesData = series as { queue: Array<unknown> }
      return sum + seriesData.queue.length
    }, 0)
    if (totalPoints > 0) {
      console.log(`📊 Updated chart from backend: ${Object.keys(backendData).length} series, ${totalPoints} total points`)
    }
  }, [getChartTimestamp])

  // Initialize chart with original UI style
  useEffect(() => {
    if (!canvasRef.current) return
    
    const datasets = []
    
    // Only initialize resistance datasets (R1, R2, R3)
    datasets.push(
      { 
        label: 'R1 (Resistance)', 
        data: [],
        borderColor: CHART_COLORS.R1,
        backgroundColor: CHART_COLORS.R1 + '20',
        tension: 0.1,
        pointRadius: 0,
        borderWidth: 2
      },
      { 
        label: 'R2 (Resistance)', 
        data: [],
        borderColor: CHART_COLORS.R2,
        backgroundColor: CHART_COLORS.R2 + '20',
        tension: 0.1,
        pointRadius: 0,
        borderWidth: 2
      },
      { 
        label: 'R3 (Resistance)', 
        data: [],
        borderColor: CHART_COLORS.R3,
        backgroundColor: CHART_COLORS.R3 + '20',
        tension: 0.1,
        pointRadius: 0,
        borderWidth: 2
      }
    )
    
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { datasets },
      options: { 
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        scales: { 
          x: { 
            type: 'linear',
            title: {
              display: true,
              text: 'Time (seconds)'
            },
            grid: {
              color: 'rgba(0,0,0,0.1)'
            }
          },
          y: {
            title: {
              display: true,
              text: 'Resistance Values'
            },
            grid: {
              color: 'rgba(0,0,0,0.1)'
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              pointStyle: 'line'
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || ''
                const value = typeof context.parsed.y === 'number' ? context.parsed.y.toFixed(2) : context.parsed.y
                return `${label}: ${value}`
              }
            }
          }
        }
      }
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [chartMode])

  // Subscribe to processed data from backend instead of raw BLE data
  useEffect(() => {
    if (!isCollecting) return

    let updateInterval: ReturnType<typeof setInterval> | null = null
    let simulationInterval: ReturnType<typeof setInterval> | null = null
    
    // Clear chart data only when starting a new collection session
    if (chartRef.current) {
      chartRef.current.data.datasets.forEach(dataset => {
        dataset.data = []
      })
      chartRef.current.update('none')
      console.log('🔄 Cleared chart for new collection session')
    }
    
    console.log('🔄 Starting data collection from backend chart queue')
    
    // Get data from backend buffer instead of raw BLE subscription
    updateInterval = setInterval(async () => {
      if (activeCollectingDevices.length > 0) {
        try {
          // Get processed data from backend for all active devices
          const combinedData: Record<string, unknown> = {}
          
          for (const deviceId of activeCollectingDevices) {
            try {
              const deviceData = await invoke('get_device_buffer_data_cmd', {
                deviceId: deviceId,
                count: config.bufferConfig.maxChartPoints || 1000
              }) as Array<{ device_id: string, r1: number, r2: number, r3: number, timestamp: string }>
              
              // Convert buffer data to chart format (resistance only)
              const r1Data = deviceData.map(point => ({ 
                timestamp: new Date(point.timestamp).getTime(), 
                value: point.r1 
              }))
              const r2Data = deviceData.map(point => ({ 
                timestamp: new Date(point.timestamp).getTime(), 
                value: point.r2 
              }))
              const r3Data = deviceData.map(point => ({ 
                timestamp: new Date(point.timestamp).getTime(), 
                value: point.r3 
              }))
              
              combinedData[`${deviceId}:r1`] = { device_id: deviceId, data_type: 'r1', queue: r1Data }
              combinedData[`${deviceId}:r2`] = { device_id: deviceId, data_type: 'r2', queue: r2Data }
              combinedData[`${deviceId}:r3`] = { device_id: deviceId, data_type: 'r3', queue: r3Data }
            } catch (deviceError) {
              console.warn(`Failed to get data for device ${deviceId}:`, deviceError)
            }
          }
          
          // Update chart with backend data
          updateChartFromBackendData(combinedData)
        } catch (error) {
          console.error('Failed to get chart data from backend:', error)
        }
      }
    }, 100) // Update every 100ms for smooth visualization
    
    // Start simulation if no active collecting devices after 2 seconds
    const fallbackTimeout = setTimeout(() => {
      if (activeCollectingDevices.length === 0) {
        console.log('🔄 Starting simulation mode')
        
        simulationInterval = setInterval(() => {
          // Simulation placeholder - backend should handle simulation data
          console.log('🎯 Simulation running - backend should provide data via chart queue')
        }, 100) // Check every 100ms
      }
    }, 2000)
    
    // Cleanup function
    return () => {
      clearTimeout(fallbackTimeout)
      if (updateInterval) {
        clearInterval(updateInterval)
      }
      if (simulationInterval) {
        clearInterval(simulationInterval)
      }
    }
  }, [isCollecting, activeCollectingDevices, chartMode, updateChartFromBackendData])

  // Accessibility helpers
  const getChartSummary = useCallback((): string => {
    const totalSamples = bufferState.globalMetrics ? bufferState.globalMetrics.total_data_points : 0
    const deviceCount = connectedDevices.length
    const currentMode = chartMode === 'all' ? 'all resistance channels' : 'resistance channels (R1, R2, R3)'
    
    if (totalSamples === 0) {
      return `Gait monitoring chart showing ${currentMode}. No data collected yet. ${deviceCount} device${deviceCount !== 1 ? 's' : ''} connected.`
    }
    
    return `Gait monitoring chart showing ${currentMode}. ${totalSamples} data points collected from ${deviceCount} device${deviceCount !== 1 ? 's' : ''}. Current sample rate: ${getCurrentSampleRateDisplay()}.`
  }, [bufferState.globalMetrics, connectedDevices.length, chartMode, getCurrentSampleRateDisplay])

  const getLatestDataSummary = useCallback(() => {
    const chart = chartRef.current
    if (!chart || !chart.data.datasets.length) {
      return 'No data available'
    }

    const summaries: string[] = []
    chart.data.datasets.forEach(dataset => {
      const data = dataset.data as { x: number; y: number }[]
      if (data.length > 0) {
        const latest = data[data.length - 1]
        const value = latest.y.toFixed(2)
        summaries.push(`${dataset.label}: ${value}`)
      }
    })

    return summaries.length > 0 ? summaries.join(', ') : 'No current readings'
  }, [])

  const handleKeyboardNavigation = useCallback((event: React.KeyboardEvent) => {
    switch (event.key) {
      case '1':
        setChartMode('all')
        setAnnouncementText('Switched to all channels view')
        break
      case '2':
        setChartMode('resistance')
        setAnnouncementText('Switched to resistance channels view')
        break
      case 't':
      case 'T':
        setShowDataTable(prev => {
          const newState = !prev
          setAnnouncementText(newState ? 'Data table opened' : 'Data table closed')
          return newState
        })
        break
      case 's':
      case 'S':
        setAnnouncementText(getChartSummary())
        break
      case 'd':
      case 'D':
        setAnnouncementText(`Latest readings: ${getLatestDataSummary()}`)
        break
    }
  }, [getChartSummary, getLatestDataSummary])

  // Data table component for accessibility
  const DataTable = () => {
    const chart = chartRef.current
    if (!chart || !chart.data.datasets.length) {
      return (
        <div className="data-table-container">
          <p>No chart data available to display in table format.</p>
        </div>
      )
    }

    // Get recent data points (last 10 for performance)
    const recentData: { timestamp: number; [key: string]: number }[] = []
    const timestamps = new Set<number>()

    chart.data.datasets.forEach(dataset => {
      const data = dataset.data as { x: number; y: number }[]
      data.slice(-10).forEach(point => {
        timestamps.add(point.x)
      })
    })

    const sortedTimestamps = Array.from(timestamps).sort((a, b) => b - a)

    sortedTimestamps.forEach(timestamp => {
      const dataPoint: { timestamp: number; [key: string]: number } = { timestamp }
      chart.data.datasets.forEach(dataset => {
        const data = dataset.data as { x: number; y: number }[]
        const point = data.find(p => p.x === timestamp)
        if (point) {
          dataPoint[dataset.label || 'Unknown'] = point.y
        }
      })
      recentData.push(dataPoint)
    })

    return (
      <div className="data-table-container">
        <h3>Recent Chart Data</h3>
        <table 
          className="chart-data-table" 
          aria-label="Recent gait monitoring data in table format"
        >
          <thead>
            <tr>
              <th scope="col">Time</th>
              {chart.data.datasets.map((dataset, index) => (
                <th key={index} scope="col">{dataset.label || 'Unknown'}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentData.map((row, index) => (
              <tr key={index}>
                <th scope="row">
                  {new Date(row.timestamp).toLocaleTimeString()}
                </th>
                {chart.data.datasets.map((dataset, dataIndex) => (
                  <td key={dataIndex}>
                    {row[dataset.label || 'Unknown']?.toFixed(2) || 'N/A'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="table-summary">
          Showing the most recent 10 data points. Use keyboard shortcuts to navigate: 
          Press 'T' to toggle this table, '1-3' to change chart view, 'S' for summary, 'D' for latest data.
        </p>
      </div>
    )
  }

  return (
    <section 
      className="card"
      role="region"
      aria-labelledby="chart-title"
      onKeyDown={handleKeyboardNavigation}
      tabIndex={0}
    >
      {/* Screen reader announcements */}
      <div 
        aria-live="polite" 
        aria-atomic="true" 
        className="sr-only"
        role="status"
      >
        {announcementText}
      </div>

      <div className="chart-header">
        <h2 id="chart-title">Live Gait Data</h2>
        <p className="chart-description">
          {getChartSummary()}
        </p>
        <div className="chart-controls">
          <div className="chart-status">
            <span className={`status-indicator ${isCollecting ? 'collecting' : 'idle'}`}>
              {isCollecting ? '● Recording' : '○ Idle'}
            </span>
            {/* Device connection status */}
            {connectedDevices.length > 0 && (
              <div className="device-status">
                {connectedDevices.map(deviceId => {
                  const status = connectionStatus.get(deviceId) || 'disconnected'
                  const lastGait = lastGaitDataTime.get(deviceId)
                  const now = Date.now()
                  
                  return (
                    <div key={deviceId} className={`device-connection ${status}`}>
                      <span className="device-name">{deviceId.slice(-8)}</span>
                      <span className={`connection-indicator ${status}`}>
                        {status === 'connected' ? '🟢' : status === 'timeout' ? '🟡' : '🔴'}
                      </span>
                      {lastGait && (
                        <span className="gait-info" title={`Last gait data: ${now - lastGait}ms ago`}>
                          📊{Math.round((now - lastGait) / 1000)}s
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="chart-mode-selector" role="group" aria-label="Chart view options">
            <button 
              className={`mode-btn ${chartMode === 'all' ? 'active' : ''}`}
              onClick={() => setChartMode('all')}
              aria-describedby="chart-mode-help"
            >
              All Channels (1)
            </button>
            <button 
              className={`mode-btn ${chartMode === 'resistance' ? 'active' : ''}`}
              onClick={() => setChartMode('resistance')}
              aria-describedby="chart-mode-help"
            >
              Resistance (2)
            </button>
          </div>
          <div className="accessibility-controls">
            <button
              onClick={() => setShowDataTable(!showDataTable)}
              className="btn-secondary"
              aria-label={`${showDataTable ? 'Hide' : 'Show'} data table for screen readers`}
              aria-describedby="data-table-help"
            >
              {showDataTable ? 'Hide' : 'Show'} Data Table (T)
            </button>
          </div>
        </div>
        <div className="help-text" id="chart-mode-help">
          Keyboard shortcuts: 1-3 to switch views, T to toggle data table, S for summary, D for latest data
        </div>
      </div>
      <div className="chart-container">
        <canvas 
          ref={canvasRef} 
          role="img"
          aria-label={getChartSummary()}
          aria-describedby="chart-data-summary"
          tabIndex={-1}
        />
        <div id="chart-data-summary" className="sr-only">
          Latest readings: {getLatestDataSummary()}
        </div>
      </div>
      
      {/* Accessible data table */}
      {showDataTable && <DataTable />}
      <div className="chart-info">
        <div className="data-info">
          <span>Sample Rate: {getCurrentSampleRateDisplay()}</span>
          <span>•</span>
          <span>Devices: {connectedDevices.length}</span>
          <span>•</span>
          <span>Total Samples: {bufferState.globalMetrics ? bufferState.globalMetrics.total_data_points : 0}</span>
          <span>•</span>
          <span>Channels: R1, R2, R3</span>
        </div>
      </div>
      
      {/* Data Table for Accessibility */}
      {showDataTable && (
        <DataTable />
      )}
    </section>
  )
}
