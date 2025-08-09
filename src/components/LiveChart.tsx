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
import { Icon } from './icons'
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
  
  // Single data storage for all channels - will be filtered for display
  const [allDataPoints, setAllDataPoints] = useState<Map<string, Array<{
    timestamp: number;
    R1: number;
    R2: number;
    R3: number;
    X: number;
    Y: number;
    Z: number;
  }>>>(new Map())
  
  // Color management for multi-device support
  const [deviceColors, setDeviceColors] = useState<Map<string, Record<ChannelType, { primary: string; light: string; dark: string; background: string }>>>(new Map())
  
  // Performance optimization: batch chart updates to avoid 400Hz update calls
  const chartUpdateBatchRef = useRef<NodeJS.Timeout | null>(null)
  const pendingUpdatesRef = useRef<Set<string>>(new Set())
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (chartUpdateBatchRef.current) {
        clearTimeout(chartUpdateBatchRef.current)
      }
    }
  }, [])
  
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
    // Optimize state updates by batching them - use callback form to avoid excessive re-renders
    setAllDataPoints(prev => {
      const deviceData = prev.get(deviceId) || []
      
      // Add new point
      const newPoint = {
        timestamp: gaitData.timestamp,
        R1: gaitData.R1,
        R2: gaitData.R2,
        R3: gaitData.R3,
        X: gaitData.X,
        Y: gaitData.Y,
        Z: gaitData.Z
      }
      
      // Performance optimization: only create new Map if data actually changes
      const updatedData = [...deviceData, newPoint]
      
      // Apply time-based filtering to keep only recent data
      const cutoffTime = gaitData.timestamp - config.bufferConfig.slidingWindowSeconds
      const filteredData = updatedData.filter(point => point.timestamp >= cutoffTime)
      
      // Apply maximum points limit
      const maxPoints = config.bufferConfig.maxChartPoints
      const finalData = filteredData.length > maxPoints 
        ? filteredData.slice(-maxPoints) 
        : filteredData
      
      // Only update state if data actually changed
      if (finalData.length === deviceData.length && 
          finalData.every((point, index) => 
            deviceData[index] && point.timestamp === deviceData[index].timestamp)) {
        return prev // No change needed
      }
      
      const newMap = new Map(prev)
      newMap.set(deviceId, finalData)
      return newMap
    })

    // Update sliding window x-axis range based on latest data (no chart.update here - batched)
    if (!chartRef.current) return
    
    const chart = chartRef.current
    const currentTime = gaitData.timestamp
    const windowSize = config.bufferConfig.slidingWindowSeconds
    const xScale = chart.options.scales?.x
    if (xScale && typeof xScale === 'object') {
      if (currentTime <= windowSize) {
        xScale.min = 0
        xScale.max = Math.max(windowSize, currentTime + 1)
      } else {
        xScale.min = currentTime - windowSize
        xScale.max = currentTime + 1
      }
    }
    // Note: chart.update() is now batched in addBLEDataToChart for performance
  }, [])

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
    
    // Update local data state immediately for responsiveness
    if (chartRef.current) {
      updateChartForDevice(deviceId, normalizedGaitData)
      
      // Mark device for batched chart update
      pendingUpdatesRef.current.add(deviceId)
      
      // Batch chart updates to reduce render frequency from 400Hz to ~20Hz
      if (chartUpdateBatchRef.current) {
        clearTimeout(chartUpdateBatchRef.current)
      }
      
      chartUpdateBatchRef.current = setTimeout(() => {
        if (chartRef.current && pendingUpdatesRef.current.size > 0) {
          // Single chart update for all pending device updates
          chartRef.current.update('none')
          pendingUpdatesRef.current.clear()
        }
        chartUpdateBatchRef.current = null
      }, 50) // 20Hz update rate instead of 400Hz
      
      // Get buffer stats for debugging
      const bufferStats = bufferManager.getBufferStats()
      if (bufferStats && bufferStats.totalDataPoints % 100 === 0) { // Log every 100 points
      console.log(`[Buffer] ${bufferStats.totalDataPoints} total points across ${bufferStats.totalDevices} devices, memory: ${bufferStats.memoryUsageMB.toFixed(2)}MB`)
      }
    }
  }, [updateChartForDevice, bufferManager, getChartTimestamp])

  // Chart mode filter effect - rebuild datasets based on selected channels and current data
  // Optimized with caching to avoid expensive rebuilds
  useEffect(() => {
    if (!chartRef.current) return
    
    const chart = chartRef.current
  console.log(`[LiveChart] Chart mode changed to: ${chartMode}`)
    
    // Performance optimization: only rebuild if we have data to avoid empty rebuilds
    if (allDataPoints.size === 0) {
      chart.data.datasets = []
      chart.update('none')
      return
    }
    
    // Clear existing datasets and rebuild them based on current mode and data
    chart.data.datasets = []
    
    // Define which channels to show based on mode (using constants for performance)
    const channelConfigs = {
      all: [
        {key: 'R1' as const, label: 'R1 (Resistance)', colorKey: 'R1' as const},
        {key: 'R2' as const, label: 'R2 (Resistance)', colorKey: 'R2' as const},
        {key: 'R3' as const, label: 'R3 (Resistance)', colorKey: 'R3' as const},
        {key: 'X' as const, label: 'X (Accel)', colorKey: 'X' as const},
        {key: 'Y' as const, label: 'Y (Accel)', colorKey: 'Y' as const},
        {key: 'Z' as const, label: 'Z (Accel)', colorKey: 'Z' as const}
      ],
      resistance: [
        {key: 'R1' as const, label: 'R1 (Resistance)', colorKey: 'R1' as const},
        {key: 'R2' as const, label: 'R2 (Resistance)', colorKey: 'R2' as const},
        {key: 'R3' as const, label: 'R3 (Resistance)', colorKey: 'R3' as const}
      ],
      acceleration: [
        {key: 'X' as const, label: 'X (Accel)', colorKey: 'X' as const},
        {key: 'Y' as const, label: 'Y (Accel)', colorKey: 'Y' as const},
        {key: 'Z' as const, label: 'Z (Accel)', colorKey: 'Z' as const}
      ]
    }
    
    const channelsToShow = channelConfigs[chartMode] || channelConfigs.all
    
    // Create datasets for each device and channel combination
    allDataPoints.forEach((deviceData, deviceId) => {
      if (deviceData.length === 0) return
      
      const deviceLabel = getDeviceLabel(deviceId)
      const deviceColorPalette = deviceColors.get(deviceId)
      
      if (!deviceColorPalette) return
      
      channelsToShow.forEach(({key, label, colorKey}) => {
        const colors = deviceColorPalette[colorKey]
        const datasetLabel = `${deviceLabel} - ${label}`
        
        // Create filtered data points for this channel
        const channelData = deviceData.map(point => ({
          x: point.timestamp,
          y: point[key] as number
        }))
        
        const dataset = {
          label: datasetLabel,
          data: channelData,
          borderColor: colors.primary,
          backgroundColor: colors.background,
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        }
        
        chart.data.datasets.push(dataset)
      })
    })

    // Update y-axis title based on chart mode
    const yScale = chart.options.scales?.y
    if (yScale && typeof yScale === 'object' && 'title' in yScale && yScale.title) {
      yScale.title.text = chartMode === 'resistance' ? 'Resistance Values' : 
                         chartMode === 'acceleration' ? 'Acceleration (m/s²)' : 
                         'Sensor Values'
    }
    
  console.log(`[LiveChart] Created ${chart.data.datasets.length} datasets for ${allDataPoints.size} devices`)
    chart.update('none')
  }, [chartMode, allDataPoints, deviceColors])

  // Chart initialization effect - create empty chart once
  useEffect(() => {
    if (!canvasRef.current || chartRef.current) return

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { datasets: [] },
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
            },
            min: 0,
            max: config.bufferConfig.slidingWindowSeconds,
            ticks: {
              stepSize: 2
            }
          },
          y: {
            title: {
              display: true,
              text: 'Sensor Values'
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
              pointStyle: 'line',
              padding: 15,
              font: {
                size: 12
              }
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
  }, [])

  // Subscribe to gait data from context and handle simulation
  useEffect(() => {
  console.log(`[LiveChart] Collection effect triggered. isCollecting: ${isCollecting}`)
    
    if (!isCollecting) return

    let simulationInterval: ReturnType<typeof setInterval> | null = null
    
  console.log('[LiveChart] Clearing buffers and chart data for new collection session')
    
    // Clear buffers when starting collection (TimestampManager handles base timestamp)
    bufferManager.clearAll()
    
    // Clear our single data storage
    setAllDataPoints(new Map())
    
  console.log('[LiveChart] Starting new data collection session')
    
    // Subscribe to real BLE data
    const unsubscribeGait = subscribeToGaitData((payload: GaitDataPayload) => {
      const gaitData = convertPayloadToGaitData(payload)
  console.log('[LiveChart] Received BLE data:', payload.device_id, 'at timestamp:', payload.timestamp)
      addBLEDataToChart(gaitData)
    })
    
    // Start simulation if no active collecting devices after 2 seconds
    const fallbackTimeout = setTimeout(() => {
      if (activeCollectingDevices.length === 0) {
  console.log('[LiveChart] Starting simulation mode')
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
        <p className="chart-description sr-only">
          {getChartSummary()}
        </p>
        <div className="chart-controls">
          <div className="chart-status">
            <span className={`status-indicator ${isCollecting ? 'collecting' : 'idle'}`}>
              <span aria-hidden="true" className="status-dot">
                {isCollecting ? <Icon.Radio title="Recording" /> : <Icon.Pause title="Idle" />}
              </span>
              {isCollecting ? 'Recording' : 'Idle'}
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
                      <span className={`connection-indicator ${status}`} aria-hidden="true">
                        {status === 'connected' ? (
                          <Icon.Success title="Connected" />
                        ) : status === 'timeout' ? (
                          <Icon.Warning title="Timeout" />
                        ) : (
                          <Icon.Error title="Disconnected" />
                        )}
                      </span>
                      {lastGait && (
                        <span className="gait-info" title={`Last gait data: ${now - lastGait}ms ago`}>
                          <span aria-hidden="true" className="gait-icon"><Icon.Chart title="Last data age" /></span>
                          {Math.round((now - lastGait) / 1000)}s
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
            <button 
              className={`mode-btn ${chartMode === 'acceleration' ? 'active' : ''}`}
              onClick={() => setChartMode('acceleration')}
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
          <span className="dot-sep" aria-hidden="true">•</span>
          <span>Devices: {connectedDevices.length}</span>
          <span className="dot-sep" aria-hidden="true">•</span>
          <span>Total Samples: {(() => {
            const stats = bufferManager.getBufferStats()
            return stats ? stats.totalDataPoints : 0
          })()}</span>
          <span className="dot-sep" aria-hidden="true">•</span>
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
