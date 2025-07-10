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
  timestamp: number
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
  
  // Use global device connection context (read-only)
  const { 
    connectedDevices, 
    activeCollectingDevices,
    connectionStatus, 
    deviceHeartbeats,
    subscribeToGaitData,
    lastGaitDataTime
  } = useDeviceConnection()
  
  // Store data per device and timing reference
  const deviceDataBuffers = useRef<Map<string, GaitData[]>>(new Map())
  const baseTimestamp = useRef<number | null>(null)

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
      const deviceIndex = [...deviceDataBuffers.current.keys()].indexOf(deviceId)
      
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
      
      // Time-based data retention: keep data from last 10 seconds
      const cutoffTime = gaitData.timestamp - 10
      r1Dataset.data = (r1Dataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
      r2Dataset.data = (r2Dataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
      r3Dataset.data = (r3Dataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
    }
    
    if (chartMode === 'all' || chartMode === 'acceleration') {
      const xDataset = findOrCreateDataset(CHART_COLORS.X, 'X (Accel)')
      const yDataset = findOrCreateDataset(CHART_COLORS.Y, 'Y (Accel)')
      const zDataset = findOrCreateDataset(CHART_COLORS.Z, 'Z (Accel)')
      
      xDataset.data.push({ x: gaitData.timestamp, y: gaitData.X })
      yDataset.data.push({ x: gaitData.timestamp, y: gaitData.Y })
      zDataset.data.push({ x: gaitData.timestamp, y: gaitData.Z })
      
      // Time-based data retention: keep data from last 10 seconds
      const cutoffTime = gaitData.timestamp - 10
      xDataset.data = (xDataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
      yDataset.data = (yDataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
      zDataset.data = (zDataset.data as Array<{ x: number; y: number }>).filter(point => point.x >= cutoffTime)
    }

    chart.update('none')
  }, [chartMode])

  // Function to add real BLE data to chart
  const addBLEDataToChart = useCallback((gaitData: GaitData) => {
    const deviceId = gaitData.device_id
    
    // Initialize base timestamp on first data point from any device
    if (baseTimestamp.current === null) {
      baseTimestamp.current = gaitData.timestamp
      console.log('📏 Base timestamp set:', baseTimestamp.current, 'for device:', deviceId)
    }
    
    // Convert to relative time from base timestamp (in seconds)
    const relativeTime = (gaitData.timestamp - baseTimestamp.current) / 1000
    const normalizedGaitData = { 
      ...gaitData, 
      timestamp: relativeTime 
    }
    
    // Debug logging for timing analysis
    console.log(`📊 Device ${deviceId}: Raw timestamp: ${gaitData.timestamp}, Relative time: ${relativeTime.toFixed(3)}s`)
    
    // Get or create device buffer
    if (!deviceDataBuffers.current.has(deviceId)) {
      deviceDataBuffers.current.set(deviceId, [])
      console.log('📱 New device added:', deviceId, 'at relative time:', relativeTime.toFixed(3) + 's')
    }
    
    const deviceBuffer = deviceDataBuffers.current.get(deviceId)!
    deviceBuffer.push(normalizedGaitData)
    
    // Keep only last 10 seconds at 100Hz per device (increased from 5 to 10 seconds)
    if (deviceBuffer.length > 1000) {
      deviceBuffer.shift()
    }
    
    if (chartRef.current) {
      updateChartForDevice(deviceId, normalizedGaitData)
      
      // Debug logging for multi-device data retention
      const deviceBuffer = deviceDataBuffers.current.get(deviceId)!
      if (deviceBuffer.length % 100 === 0) { // Log every 100 points
        console.log(`📈 Device ${deviceId}: ${deviceBuffer.length} points buffered, latest timestamp: ${normalizedGaitData.timestamp.toFixed(2)}s`)
        
        // Also log chart dataset info
        const deviceDatasets = chartRef.current.data.datasets.filter(ds => ds.label?.includes(deviceId.slice(-4)))
        console.log(`📊 Device ${deviceId} chart datasets:`, deviceDatasets.map(ds => ({ 
          label: ds.label, 
          points: ds.data.length,
          firstTime: ds.data.length > 0 ? (ds.data[0] as { x: number; y: number })?.x : 'none',
          lastTime: ds.data.length > 0 ? (ds.data[ds.data.length - 1] as { x: number; y: number })?.x : 'none'
        })))
      }
    }
  }, [updateChartForDevice])

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

    let simulationInterval: number | null = null
    
    // Reset base timestamp and clear data when starting collection
    baseTimestamp.current = null
    deviceDataBuffers.current.clear()
    
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
  }, [isCollecting, subscribeToGaitData, convertPayloadToGaitData, addBLEDataToChart, activeCollectingDevices.length])

  // Cleanup datasets for disconnected devices to prevent memory leaks
  useEffect(() => {
    if (!chartRef.current) return

    const chart = chartRef.current
    const connectedDeviceIds = new Set(connectedDevices)
    
    // Remove datasets for devices that are no longer connected
    chart.data.datasets = chart.data.datasets.filter(dataset => {
      if (!dataset.label) return true
      
      // Keep simulation datasets
      if (dataset.label.includes('Sim -')) return true
      
      // Check if this dataset belongs to a connected device
      const belongsToConnectedDevice = connectedDevices.some(deviceId => 
        dataset.label!.includes(`Device ${deviceId.slice(-4)}`)
      )
      
      if (!belongsToConnectedDevice) {
        console.log(`🗑️ Removing dataset for disconnected device: ${dataset.label}`)
        return false
      }
      
      return true
    })
    
    // Clean up device data buffers for disconnected devices
    const disconnectedDevices = Array.from(deviceDataBuffers.current.keys()).filter(
      deviceId => !connectedDeviceIds.has(deviceId) && deviceId !== 'simulation'
    )
    
    disconnectedDevices.forEach(deviceId => {
      console.log(`🗑️ Cleaning up data buffer for disconnected device: ${deviceId}`)
      deviceDataBuffers.current.delete(deviceId)
    })
    
    if (disconnectedDevices.length > 0) {
      chart.update('none')
    }
  }, [connectedDevices])

  // Memory monitoring and aggressive cleanup for long sessions
  useEffect(() => {
    if (!isCollecting) return

    const memoryCleanupInterval = setInterval(() => {
      if (!chartRef.current) return

      const chart = chartRef.current
      const now = Date.now()
      const MEMORY_CLEANUP_THRESHOLD = 5000 // Clean up if more than 5000 total data points
      
      // Count total data points across all datasets
      const totalDataPoints = chart.data.datasets.reduce(
        (total, dataset) => total + dataset.data.length, 0
      )
      
      if (totalDataPoints > MEMORY_CLEANUP_THRESHOLD) {
        console.log(`🧹 Memory cleanup triggered: ${totalDataPoints} total data points`)
        
        // More aggressive cleanup - keep only last 5 seconds of data
        chart.data.datasets.forEach(dataset => {
          const cutoffTime = now / 1000 - 5 // 5 seconds ago
          dataset.data = (dataset.data as Array<{ x: number; y: number }>)
            .filter(point => point.x >= cutoffTime)
        })
        
        // Clean up device buffers more aggressively
        deviceDataBuffers.current.forEach((buffer, deviceId) => {
          if (buffer.length > 500) { // Keep only 500 most recent points per device
            buffer.splice(0, buffer.length - 500)
            console.log(`🧹 Trimmed buffer for device ${deviceId} to 500 points`)
          }
        })
        
        chart.update('none')
      }
    }, 30000) // Check every 30 seconds

    return () => clearInterval(memoryCleanupInterval)
  }, [isCollecting])

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
          <span>Sample Rate: 100 Hz</span>
          <span>•</span>
          <span>Devices: {connectedDevices.length}</span>
          <span>•</span>
          <span>Total Samples: {Array.from(deviceDataBuffers.current.values()).reduce((sum, buffer) => sum + buffer.length, 0)}</span>
          <span>•</span>
          <span>Channels: R1, R2, R3, X, Y, Z</span>
        </div>
      </div>
    </section>
  )
}
