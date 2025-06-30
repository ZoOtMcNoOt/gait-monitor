import { useEffect, useRef, useState, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
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

// Web Bluetooth API types
declare global {
  interface BluetoothRemoteGATTCharacteristic extends EventTarget {
    value: DataView | null
    startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
    stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>
  }
}

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
  onBLEFunctionsReady?: (functions: BLEFunctions) => void
}

interface BLEFunctions {
  setupNotifications: (characteristic: BluetoothRemoteGATTCharacteristic) => Promise<void>
  cleanupNotifications: (characteristic: BluetoothRemoteGATTCharacteristic) => void
}

interface GaitData {
  device_id: string  // Add device identification
  R1: number
  R2: number
  R3: number
  X: number
  Y: number
  Z: number
  timestamp: number
}

interface BLEPayload {
  device_id: string  // Add device identification
  r1: number
  r2: number
  r3: number
  x: number
  y: number
  z: number
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

export default function LiveChart({ isCollecting = false, onBLEFunctionsReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [chartMode, setChartMode] = useState<'all' | 'resistance' | 'acceleration'>('all')
  const [availableDevices, setAvailableDevices] = useState<string[]>([])
  
  // Store data per device
  const deviceDataBuffers = useRef<Map<string, GaitData[]>>(new Map())

  // Function to parse BLE data packet (24 bytes = 6 floats)
  const parseBLEData = (dataView: DataView, deviceId: string = 'unknown'): GaitData => {
    return {
      device_id: deviceId,
      R1: dataView.getFloat32(0, true),  // little endian
      R2: dataView.getFloat32(4, true),
      R3: dataView.getFloat32(8, true),
      X: dataView.getFloat32(12, true),
      Y: dataView.getFloat32(16, true),
      Z: dataView.getFloat32(20, true),
      timestamp: Date.now() / 1000
    }
  }

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
    }
    
    if (chartMode === 'all' || chartMode === 'acceleration') {
      const xDataset = findOrCreateDataset(CHART_COLORS.X, 'X (Accel)')
      const yDataset = findOrCreateDataset(CHART_COLORS.Y, 'Y (Accel)')
      const zDataset = findOrCreateDataset(CHART_COLORS.Z, 'Z (Accel)')
      
      xDataset.data.push({ x: gaitData.timestamp, y: gaitData.X })
      yDataset.data.push({ x: gaitData.timestamp, y: gaitData.Y })
      zDataset.data.push({ x: gaitData.timestamp, y: gaitData.Z })
    }

    // Keep only last 5 seconds of data for performance
    chart.data.datasets.forEach(dataset => {
      if (dataset.data.length > 500) {
        dataset.data.shift()
      }
    })

    chart.update('none')
  }, [chartMode])

  // Function to add real BLE data to chart
  const addBLEDataToChart = useCallback((gaitData: GaitData) => {
    const deviceId = gaitData.device_id
    
    // Get or create device buffer
    if (!deviceDataBuffers.current.has(deviceId)) {
      deviceDataBuffers.current.set(deviceId, [])
      setAvailableDevices(prev => [...prev, deviceId])
    }
    
    const deviceBuffer = deviceDataBuffers.current.get(deviceId)!
    deviceBuffer.push(gaitData)
    
    // Keep only last 5 seconds at 100Hz per device
    if (deviceBuffer.length > 500) {
      deviceBuffer.shift()
    }
    
    if (chartRef.current) {
      updateChartForDevice(deviceId, gaitData)
    }
  }, [updateChartForDevice])

  // BLE characteristic event handler
  const handleBLECharacteristicChange = useCallback((event: Event) => {
    const target = event.target as BluetoothRemoteGATTCharacteristic
    const dataView = target.value
    
    if (dataView && dataView.byteLength === 24) { // 6 floats * 4 bytes each
      try {
        const gaitData = parseBLEData(dataView)
        addBLEDataToChart(gaitData)
      } catch (error) {
        console.error('Error parsing BLE data:', error)
      }
    } else {
      console.warn('Received BLE data with unexpected length:', dataView?.byteLength)
    }
  }, [addBLEDataToChart])

  // Function to setup BLE characteristic notifications
  const setupBLENotifications = useCallback(async (characteristic: BluetoothRemoteGATTCharacteristic) => {
    try {
      await characteristic.startNotifications()
      characteristic.addEventListener('characteristicvaluechanged', handleBLECharacteristicChange)
      console.log('✅ BLE notifications setup successfully')
    } catch (error) {
      console.error('❌ Failed to setup BLE notifications:', error)
      throw error
    }
  }, [handleBLECharacteristicChange])

  // Function to cleanup BLE notifications
  const cleanupBLENotifications = useCallback((characteristic: BluetoothRemoteGATTCharacteristic) => {
    try {
      characteristic.removeEventListener('characteristicvaluechanged', handleBLECharacteristicChange)
      characteristic.stopNotifications()
      console.log('🔄 BLE notifications cleaned up')
    } catch (error) {
      console.error('⚠️ Error cleaning up BLE notifications:', error)
    }
  }, [handleBLECharacteristicChange])

  // Expose BLE functions to parent component
  useEffect(() => {
    if (onBLEFunctionsReady) {
      onBLEFunctionsReady({
        setupNotifications: setupBLENotifications,
        cleanupNotifications: cleanupBLENotifications
      })
    }
  }, [onBLEFunctionsReady, setupBLENotifications, cleanupBLENotifications])

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

  useEffect(() => {
    if (isCollecting && chartRef.current) {
      const startTime = Date.now()
      let simulationInterval: number | null = null
      let bleListener: (() => void) | null = null
      
      // Set up real BLE data listener
      const setupBLEListener = async () => {
        try {
          const unlisten = await listen('gait-data', (event: { payload: BLEPayload }) => {
            const payload = event.payload as {
              device_id: string,
              r1: number, r2: number, r3: number,
              x: number, y: number, z: number,
              timestamp: number
            }
            
            const gaitData: GaitData = {
              device_id: payload.device_id,
              R1: payload.r1,
              R2: payload.r2,
              R3: payload.r3,
              X: payload.x,
              Y: payload.y,
              Z: payload.z,
              timestamp: (payload.timestamp - startTime) / 1000 // Convert to seconds relative to start
            }
            
            console.log('📡 Received real BLE data:', gaitData)
            addBLEDataToChart(gaitData)
          })
          
          bleListener = unlisten
          console.log('✅ BLE data listener setup complete')
        } catch (error) {
          console.warn('Failed to setup BLE listener, using simulation:', error)
          startSimulation()
        }
      }
      
      const startSimulation = () => {
        console.log('🔄 Starting simulation mode')
        simulationInterval = setInterval(() => {
          const now = Date.now()
          const timeSeconds = (now - startTime) / 1000
          
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
            timestamp: timeSeconds
          }
          
          addBLEDataToChart(gaitData)
        }, 10) // 100Hz to match Arduino
      }
      
      // Try BLE first, fallback to simulation
      setupBLEListener()
      
      // If no BLE data received within 2 seconds, start simulation
      const fallbackTimeout = setTimeout(() => {
        if (!bleListener) {
          startSimulation()
        }
      }, 2000)
      
      // Cleanup function
      return () => {
        clearTimeout(fallbackTimeout)
        if (bleListener) {
          bleListener()
        }
        if (simulationInterval) {
          clearInterval(simulationInterval)
        }
      }
    }
  }, [isCollecting, chartMode, addBLEDataToChart])

  return (
    <section className="card">
      <div className="chart-header">
        <h2>Live Gait Data</h2>
        <div className="chart-controls">
          <div className="chart-status">
            <span className={`status-indicator ${isCollecting ? 'collecting' : 'idle'}`}>
              {isCollecting ? '● Recording' : '○ Idle'}
            </span>
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
          <span>Devices: {availableDevices.length}</span>
          <span>•</span>
          <span>Total Samples: {Array.from(deviceDataBuffers.current.values()).reduce((sum, buffer) => sum + buffer.length, 0)}</span>
          <span>•</span>
          <span>Channels: R1, R2, R3, X, Y, Z</span>
        </div>
      </div>
    </section>
  )
}
