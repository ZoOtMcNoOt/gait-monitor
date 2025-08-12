import { useEffect, useRef, useState, useCallback } from 'react'
import '../styles/chart.css'
import '../styles/collect.css'
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
    subscribeToGaitData,
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

  // Data table component for accessibility - REMOVED

  return (
    <section 
      className="card"
      role="region"
      aria-labelledby="chart-title"
      onKeyDown={handleKeyboardNavigation}
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

      <header className="chart-header">
        <div className="chart-header-row">
          <div className="chart-title-area">
            <h2 id="chart-title">Live Gait Data</h2>
            <div className="chart-meta">
              <span className="data-count">
                {(() => {
                  const stats = bufferManager.getBufferStats()
                  return stats ? `${stats.totalDataPoints.toLocaleString()} samples` : '0 samples'
                })()}
              </span>
              <span className="sample-rate">{getCurrentSampleRateDisplay()}</span>
            </div>
          </div>
          
          <div className="chart-controls-area">
            <div className="view-controls">
              <div className="button-group" role="group" aria-label="Chart view modes">
                <button 
                  type="button"
                  className={`view-btn ${chartMode === 'all' ? 'active' : ''}`}
                  onClick={() => setChartMode('all')}
                  aria-pressed={chartMode === 'all'}
                  title="Show all channels (keyboard: 1)"
                >
                  All
                </button>
                <button 
                  type="button"
                  className={`view-btn ${chartMode === 'resistance' ? 'active' : ''}`}
                  onClick={() => setChartMode('resistance')}
                  aria-pressed={chartMode === 'resistance'}
                  title="Show resistance channels only (keyboard: 2)"
                >
                  Resistance
                </button>
                <button 
                  type="button"
                  className={`view-btn ${chartMode === 'acceleration' ? 'active' : ''}`}
                  onClick={() => setChartMode('acceleration')}
                  aria-pressed={chartMode === 'acceleration'}
                  title="Show acceleration channels only (keyboard: 3)"
                >
                  Acceleration
                </button>
              </div>
            </div>
            
            <div className="chart-status-area">
              <div className={`recording-badge ${isCollecting ? 'recording' : 'idle'}`}>
                <div className="status-indicator">
                  {isCollecting ? <Icon.Radio title="Recording" /> : <Icon.Pause title="Idle" />}
                </div>
                <span className="status-label">
                  {isCollecting ? 'Recording' : 'Ready'}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <p className="chart-description sr-only">
          {getChartSummary()}
        </p>
      </header>
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
      
      {/* Buffer Statistics Panel (Debug Mode) */}
      {/* Removed buffer stats panel to simplify UI */}
    </section>
  )
}
