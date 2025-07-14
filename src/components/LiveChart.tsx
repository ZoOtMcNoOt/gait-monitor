import { useEffect, useRef, useState, useCallback } from 'react'
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
import BufferStatsPanel from './BufferStatsPanel'

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

const CHART_COLORS = {
  R1: '#ef4444', // red
  R2: '#f97316', // orange
  R3: '#eab308', // yellow
  X: '#22c55e',  // green
  Y: '#3b82f6',  // blue
  Z: '#8b5cf6'   // purple
} as const

export default function LiveChart({ isCollecting = false }: Props) {
  // Chart state
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [chartMode, setChartMode] = useState<'all' | 'resistance' | 'acceleration'>('all')
  const [showBufferStats, setShowBufferStats] = useState(false)
  
  // Use global device connection context (read-only)
  const { 
    connectedDevices, 
    activeCollectingDevices,
    connectionStatus, 
    deviceHeartbeats,
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
    const deviceLabel = deviceId === 'simulation' ? 'Sim' : `Device ${deviceId.slice(-4)}`
    
    // Device color mapping for multi-device support
    const deviceColors = [
      '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
      '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#eab308'
    ]
    
    const getDeviceColor = (baseColor: string) => {
      // Get all active device IDs from buffer manager for consistent indexing
      const bufferStats = bufferManager.getBufferStats()
      const deviceIds = bufferStats ? Array.from(bufferStats.deviceStats.keys()) : []
      const deviceIndex = deviceIds.indexOf(deviceId)
      
      // If it's the first device or simulation, use base colors
      if (deviceIndex === 0 || deviceId === 'simulation') {
        return baseColor
      }
      
      // For other devices, use device-specific colors while maintaining channel relationships
      const modifier = deviceIndex % deviceColors.length
      return deviceColors[modifier]
    }
    
    // Helper function to find or create dataset
    const findOrCreateDataset = (color: string, fullLabel: string) => {
      const label = `${deviceLabel} - ${fullLabel}`
      let dataset = chart.data.datasets.find(ds => ds.label === label)
      
      if (!dataset) {
        const finalColor = getDeviceColor(color)
        dataset = {
          label,
          data: [],
          borderColor: finalColor,
          backgroundColor: finalColor + '20',
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        }
        chart.data.datasets.push(dataset)
        console.log(`📊 Created new dataset: ${label} (total datasets: ${chart.data.datasets.length})`)
      }
      
      return dataset
    }

    // Update datasets based on current mode
    if (chartMode === 'all' || chartMode === 'resistance') {
      const r1Dataset = findOrCreateDataset(CHART_COLORS.R1, 'R1 (Resistance)')
      const r2Dataset = findOrCreateDataset(CHART_COLORS.R2, 'R2 (Resistance)')
      const r3Dataset = findOrCreateDataset(CHART_COLORS.R3, 'R3 (Resistance)')
      
      r1Dataset.data.push({ x: gaitData.timestamp, y: gaitData.R1 })
      r2Dataset.data.push({ x: gaitData.timestamp, y: gaitData.R2 })
      r3Dataset.data.push({ x: gaitData.timestamp, y: gaitData.R3 })
      
      // Time-based data retention using configuration
      const cutoffTime = gaitData.timestamp - config.bufferConfig.slidingWindowSeconds
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
      const xDataset = findOrCreateDataset(CHART_COLORS.X, 'X (Accel)')
      const yDataset = findOrCreateDataset(CHART_COLORS.Y, 'Y (Accel)')
      const zDataset = findOrCreateDataset(CHART_COLORS.Z, 'Z (Accel)')
      
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
  }, [chartMode, bufferManager])

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
    
    const datasets = []
    
    if (chartMode === 'all' || chartMode === 'resistance') {
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
    }
    
    if (chartMode === 'all' || chartMode === 'acceleration') {
      datasets.push(
        { 
          label: 'X (Accel)', 
          data: [],
          borderColor: CHART_COLORS.X,
          backgroundColor: CHART_COLORS.X + '20',
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        },
        { 
          label: 'Y (Accel)', 
          data: [],
          borderColor: CHART_COLORS.Y,
          backgroundColor: CHART_COLORS.Y + '20',
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2
        },
        { 
          label: 'Z (Accel)', 
          data: [],
          borderColor: CHART_COLORS.Z,
          backgroundColor: CHART_COLORS.Z + '20',
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

  return (
    <section className="card">
      <div className="chart-header">
        <h2>Live Gait Data</h2>
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
                  const lastHeartbeat = deviceHeartbeats.get(deviceId)
                  const lastGait = lastGaitDataTime.get(deviceId)
                  const now = Date.now()
                  
                  return (
                    <div key={deviceId} className={`device-connection ${status}`}>
                      <span className="device-name">{deviceId.slice(-8)}</span>
                      <span className={`connection-indicator ${status}`}>
                        {status === 'connected' ? '🟢' : status === 'timeout' ? '🟡' : '🔴'}
                      </span>
                      {lastHeartbeat && (
                        <span className="heartbeat-info" title={`Seq: ${lastHeartbeat.sequence}, Device time: ${lastHeartbeat.device_timestamp}ms ago: ${now - lastHeartbeat.received_timestamp}ms`}>
                          ♥#{lastHeartbeat.sequence}
                        </span>
                      )}
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
          <div className="chart-mode-selector">
            <button 
              className={`mode-btn ${chartMode === 'all' ? 'active' : ''}`}
              onClick={() => setChartMode('all')}
            >
              All Channels
            </button>
            <button 
              className={`mode-btn ${chartMode === 'resistance' ? 'active' : ''}`}
              onClick={() => setChartMode('resistance')}
            >
              Resistance (R1-R3)
            </button>
            <button 
              className={`mode-btn ${chartMode === 'acceleration' ? 'active' : ''}`}
              onClick={() => setChartMode('acceleration')}
            >
              Acceleration (XYZ)
            </button>
          </div>
        </div>
      </div>
      <div className="chart-container">
        <canvas ref={canvasRef} />
      </div>
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
          {config.debugEnabled && (
            <>
              <span>•</span>
              <button
                onClick={() => setShowBufferStats(!showBufferStats)}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  showBufferStats 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {showBufferStats ? 'Hide' : 'Show'} Buffer Stats
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Buffer Statistics Panel (Debug Mode) */}
      {config.debugEnabled && (
        <BufferStatsPanel isVisible={showBufferStats} />
      )}
    </section>
  )
}
