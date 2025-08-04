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
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'
import { useBufferManager } from '../hooks/useBufferManager'
import { config } from '../config'
import { useTimestampManager } from '../hooks/useTimestampManager'
import { generateMultiDeviceColors, getDeviceLabel, type ChannelType } from '../utils/colorGeneration'

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

interface GaitData {
  device_id: string
  R1: number
  R2: number
  R3: number
  X: number
  Y: number
  Z: number
  timestamp: number
}

interface GaitDataPayload {
  device_id: string,
  r1: number, r2: number, r3: number,
  x: number, y: number, z: number,
  timestamp: number,
  sample_rate?: number  // Add optional sample rate field
}

export default function LiveChart({ isCollecting = false }: Props) {
  // Chart state
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [chartMode, setChartMode] = useState<'all' | 'resistance' | 'acceleration'>('all')
  const [showDataTable, setShowDataTable] = useState(false)
  const [announcementText, setAnnouncementText] = useState('')
  
  // Color management for multi-device support
  const [deviceColors, setDeviceColors] = useState<Map<string, Record<ChannelType, { primary: string; light: string; dark: string; background: string }>>>(new Map())
  
  // Use global device connection context (read-only)
  const { 
    connectedDevices, 
    activeCollectingDevices,
    connectionStatus, 
    subscribeToGaitData,
    lastGaitDataTime,
    getCurrentSampleRate
  } = useDeviceConnection()
  
  // Initialize unified buffer manager
  const bufferManager = useBufferManager()
  
  // Optimized timestamp management with caching
  const { getChartTimestamp } = useTimestampManager({
    useRelativeTime: true,
    autoSetBase: true,
    cacheExpiration: 1000 // 1 second cache for high-frequency data
  })

  // Update device colors when connected devices change
  useEffect(() => {
    if (connectedDevices.length > 0) {
      const newColors = generateMultiDeviceColors(connectedDevices)
      setDeviceColors(newColors)
    }
  }, [connectedDevices])

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

  // Convert Tauri payload to internal format
  const convertPayloadToGaitData = useCallback((payload: GaitDataPayload): GaitData => {
    return {
      device_id: payload.device_id,
      R1: payload.r1,
      R2: payload.r2,
      R3: payload.r3,
      X: payload.x,
      Y: payload.y,
      Z: payload.z,
      timestamp: payload.timestamp
    }
  }, [])

  // Function to update chart datasets for a specific device
  const updateChartForDevice = useCallback((deviceId: string, gaitData: GaitData) => {
    if (!chartRef.current) return

    const chart = chartRef.current
    const deviceLabel = getDeviceLabel(deviceId)
    
    // Get color palette for this device
    const deviceColorPalette = deviceColors.get(deviceId)
    if (!deviceColorPalette) {
      console.warn(`🎨 No color palette found for device ${deviceId}`)
      return
    }
    
    // Helper function to find or create dataset with proper colors
    const findOrCreateDataset = (channel: ChannelType, fullLabel: string) => {
      const label = `${deviceLabel} - ${fullLabel}`
      let dataset = chart.data.datasets.find(ds => ds.label === label)
      
      if (!dataset) {
        const colors = deviceColorPalette[channel]
        dataset = {
          label,
          data: [],
          borderColor: colors.primary,
          backgroundColor: colors.background,
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        }
        chart.data.datasets.push(dataset)
        console.log(`📊 Created new dataset: ${label} with color ${colors.primary} (total datasets: ${chart.data.datasets.length})`)
      }
      
      return dataset
    }

    // Update datasets based on current mode
    if (chartMode === 'all' || chartMode === 'resistance') {
      const r1Dataset = findOrCreateDataset('R1', 'R1 (Resistance)')
      const r2Dataset = findOrCreateDataset('R2', 'R2 (Resistance)')
      const r3Dataset = findOrCreateDataset('R3', 'R3 (Resistance)')
      
      r1Dataset.data.push({ x: gaitData.timestamp, y: gaitData.R1 })
      r2Dataset.data.push({ x: gaitData.timestamp, y: gaitData.R2 })
      r3Dataset.data.push({ x: gaitData.timestamp, y: gaitData.R3 })
      
      // Time-based data retention using configuration
      const cutoffTime = gaitData.timestamp - config.bufferConfig.slidingWindowSeconds
      
      // Debug logging for timestamp issues
      if (r1Dataset.data.length > 0 && r1Dataset.data.length % 500 === 0) {
        const oldestPoint = r1Dataset.data[0] as { x: number; y: number }
        const newestPoint = r1Dataset.data[r1Dataset.data.length - 1] as { x: number; y: number }
        console.log(`🕐 Chart timestamps - Current: ${gaitData.timestamp}s, Cutoff: ${cutoffTime}s, Oldest: ${oldestPoint.x}s, Newest: ${newestPoint.x}s, Points: ${r1Dataset.data.length}`)
      }
      
      r1Dataset.data = (r1Dataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
      r2Dataset.data = (r2Dataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
      r3Dataset.data = (r3Dataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
      
      // Enforce maximum chart points limit
      const maxPoints = config.bufferConfig.maxChartPoints
      if (r1Dataset.data.length > maxPoints) {
        r1Dataset.data = r1Dataset.data.slice(-maxPoints)
      }
      if (r2Dataset.data.length > maxPoints) {
        r2Dataset.data = r2Dataset.data.slice(-maxPoints)
      }
      if (r3Dataset.data.length > maxPoints) {
        r3Dataset.data = r3Dataset.data.slice(-maxPoints)
      }
    }
    
    if (chartMode === 'all' || chartMode === 'acceleration') {
      const xDataset = findOrCreateDataset('X', 'X (Accel)')
      const yDataset = findOrCreateDataset('Y', 'Y (Accel)')
      const zDataset = findOrCreateDataset('Z', 'Z (Accel)')
      
      xDataset.data.push({ x: gaitData.timestamp, y: gaitData.X })
      yDataset.data.push({ x: gaitData.timestamp, y: gaitData.Y })
      zDataset.data.push({ x: gaitData.timestamp, y: gaitData.Z })
      
      // Time-based data retention using configuration
      const cutoffTime = gaitData.timestamp - config.bufferConfig.slidingWindowSeconds
      xDataset.data = (xDataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
      yDataset.data = (yDataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
      zDataset.data = (zDataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
      
      // Enforce maximum chart points limit
      const maxPoints = config.bufferConfig.maxChartPoints
      if (xDataset.data.length > maxPoints) {
        xDataset.data = xDataset.data.slice(-maxPoints)
      }
      if (yDataset.data.length > maxPoints) {
        yDataset.data = yDataset.data.slice(-maxPoints)
      }
      if (zDataset.data.length > maxPoints) {
        zDataset.data = zDataset.data.slice(-maxPoints)
      }
    }

    chart.update('none')
  }, [chartMode, deviceColors])

  // Function to add real BLE data to chart
  const addBLEDataToChart = useCallback((gaitData: GaitData) => {
    const deviceId = gaitData.device_id
    
    // Use timestamp manager for optimized timestamp handling
    const relativeTime = getChartTimestamp(gaitData.timestamp)
    const normalizedGaitData = { 
      ...gaitData, 
      timestamp: relativeTime 
    }
    
    // Add to unified buffer manager
    bufferManager.addDataPoint(deviceId, {
      device_id: deviceId,
      R1: normalizedGaitData.R1,
      R2: normalizedGaitData.R2,
      R3: normalizedGaitData.R3,
      X: normalizedGaitData.X,
      Y: normalizedGaitData.Y,
      Z: normalizedGaitData.Z,
      timestamp: relativeTime
    })
    
    // Update chart with new data
    if (chartRef.current) {
      updateChartForDevice(deviceId, normalizedGaitData)
      
      // Get buffer stats for debugging
      const bufferStats = bufferManager.getBufferStats()
      if (bufferStats && bufferStats.totalDataPoints % 100 === 0) { // Log every 100 points
        console.log(`📈 BufferManager: ${bufferStats.totalDataPoints} total points across ${bufferStats.totalDevices} devices, memory: ${bufferStats.memoryUsageMB.toFixed(2)}MB`)
      }
    }
  }, [updateChartForDevice, bufferManager, getChartTimestamp])

  // Initialize chart with original UI style
  useEffect(() => {
    if (!canvasRef.current) return
    
    // Use default colors for initial chart setup (will be replaced when devices connect)
    const defaultColors = {
      R1: '#ef4444', // red
      R2: '#f97316', // orange  
      R3: '#eab308', // yellow
      X: '#22c55e',  // green
      Y: '#3b82f6',  // blue
      Z: '#8b5cf6'   // purple
    }
    
    const datasets = []
    
    if (chartMode === 'all' || chartMode === 'resistance') {
      datasets.push(
        { 
          label: 'R1 (Resistance)', 
          data: [],
          borderColor: defaultColors.R1,
          backgroundColor: defaultColors.R1 + '20',
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        },
        { 
          label: 'R2 (Resistance)', 
          data: [],
          borderColor: defaultColors.R2,
          backgroundColor: defaultColors.R2 + '20',
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        },
        { 
          label: 'R3 (Resistance)', 
          data: [],
          borderColor: defaultColors.R3,
          backgroundColor: defaultColors.R3 + '20',
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        }
      )
    }
    
    if (chartMode === 'all' || chartMode === 'acceleration') {
      datasets.push(
        { 
          label: 'X (Accel)', 
          data: [],
          borderColor: defaultColors.X,
          backgroundColor: defaultColors.X + '20',
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        },
        { 
          label: 'Y (Accel)', 
          data: [],
          borderColor: defaultColors.Y,
          backgroundColor: defaultColors.Y + '20',
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        },
        { 
          label: 'Z (Accel)', 
          data: [],
          borderColor: defaultColors.Z,
          backgroundColor: defaultColors.Z + '20',
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        }
      )
    }
    
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
              text: chartMode === 'resistance' ? 'Resistance Values' : 
                    chartMode === 'acceleration' ? 'Acceleration (m/s²)' : 
                    'Sensor Values'
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

  // Subscribe to gait data from context and handle simulation
  useEffect(() => {
    if (!isCollecting) return

    let simulationInterval: ReturnType<typeof setInterval> | null = null
    
    // Clear buffers when starting collection (TimestampManager handles base timestamp)
    bufferManager.clearAll()
    
    // Clear existing chart data
    if (chartRef.current) {
      chartRef.current.data.datasets.forEach(dataset => {
        dataset.data = []
      })
      chartRef.current.update('none')
    }
    
    console.log('🔄 Starting new data collection session')
    
    // Subscribe to real BLE data
    const unsubscribeGait = subscribeToGaitData((payload: GaitDataPayload) => {
      const gaitData = convertPayloadToGaitData(payload)
      console.log('📡 Received real BLE data from device:', payload.device_id, 'at timestamp:', payload.timestamp)
      addBLEDataToChart(gaitData)
    })
    
    // Start simulation if no active collecting devices after 2 seconds
    const fallbackTimeout = setTimeout(() => {
      if (activeCollectingDevices.length === 0) {
        console.log('🔄 Starting simulation mode')
        const simStartTime = Date.now()
        
        simulationInterval = setInterval(() => {
          const now = Date.now()
          const timeSeconds = (now - simStartTime) / 1000
          
          // Simulate realistic gait data
          const walkCycle = Math.sin(timeSeconds * 2 * Math.PI) // 1 Hz walking cycle
          const noise = () => (Math.random() - 0.5) * 2
          
          const gaitData: GaitData = {
            device_id: 'simulation',
            R1: 10.0 + walkCycle * 5 + noise(), // Resistance values with walking pattern
            R2: 11.0 + walkCycle * 4 + noise(),
            R3: 12.0 + walkCycle * 3 + noise(),
            X: walkCycle * 2 + noise(), // Acceleration data
            Y: Math.cos(timeSeconds * 2 * Math.PI) * 1.5 + noise(),
            Z: 9.8 + walkCycle * 0.5 + noise(), // Gravity + movement
            timestamp: now // Use absolute timestamp like real BLE data
          }
          
          addBLEDataToChart(gaitData)
        }, 10) // 100Hz to match Arduino
      }
    }, 2000)
    
    // Cleanup function
    return () => {
      clearTimeout(fallbackTimeout)
      unsubscribeGait()
      if (simulationInterval) {
        clearInterval(simulationInterval)
      }
    }
  }, [isCollecting, subscribeToGaitData, convertPayloadToGaitData, addBLEDataToChart, activeCollectingDevices.length, bufferManager])

  // Accessibility helpers
  const getChartSummary = useCallback((): string => {
    const stats = bufferManager.getBufferStats()
    const totalSamples = stats ? stats.totalDataPoints : 0
    const deviceCount = connectedDevices.length
    const currentMode = chartMode === 'all' ? 'all channels' : 
                       chartMode === 'resistance' ? 'resistance channels (R1, R2, R3)' : 
                       'acceleration channels (X, Y, Z)'
    
    if (totalSamples === 0) {
      return `Gait monitoring chart showing ${currentMode}. No data collected yet. ${deviceCount} device${deviceCount !== 1 ? 's' : ''} connected.`
    }
    
    return `Gait monitoring chart showing ${currentMode}. ${totalSamples} data points collected from ${deviceCount} device${deviceCount !== 1 ? 's' : ''}. Current sample rate: ${getCurrentSampleRateDisplay()}.`
  }, [bufferManager, connectedDevices.length, chartMode, getCurrentSampleRateDisplay])

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
      case '3':
        setChartMode('acceleration')
        setAnnouncementText('Switched to acceleration channels view')
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
              aria-pressed={chartMode === 'all' ? 'true' : 'false'}
              aria-describedby="chart-mode-help"
            >
              All Channels (1)
            </button>
            <button 
              className={`mode-btn ${chartMode === 'resistance' ? 'active' : ''}`}
              onClick={() => setChartMode('resistance')}
              aria-pressed={chartMode === 'resistance' ? 'true' : 'false'}
              aria-describedby="chart-mode-help"
            >
              Resistance (2)
            </button>
            <button 
              className={`mode-btn ${chartMode === 'acceleration' ? 'active' : ''}`}
              onClick={() => setChartMode('acceleration')}
              aria-pressed={chartMode === 'acceleration' ? 'true' : 'false'}
              aria-describedby="chart-mode-help"
            >
              Acceleration (3)
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
          <span>Total Samples: {(() => {
            const stats = bufferManager.getBufferStats()
            return stats ? stats.totalDataPoints : 0
          })()}</span>
          <span>•</span>
          <span>Channels: R1, R2, R3, X, Y, Z</span>
        </div>
      </div>
      
      {/* Buffer Statistics Panel (Debug Mode) */}
      {/* Removed buffer stats panel to simplify UI */}

      {/* Data Table for Accessibility */}
      {showDataTable && (
        <DataTable />
      )}
    </section>
  )
}
