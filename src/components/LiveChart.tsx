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
  R1: number
  R2: number
  R3: number
  X: number
  Y: number
  Z: number
  timestamp: number
}

interface BLEPayload {
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
  const dataBufferRef = useRef<GaitData[]>([])

  // Function to parse BLE data packet (24 bytes = 6 floats)
  const parseBLEData = (dataView: DataView): GaitData => {
    return {
      R1: dataView.getFloat32(0, true),  // little endian
      R2: dataView.getFloat32(4, true),
      R3: dataView.getFloat32(8, true),
      X: dataView.getFloat32(12, true),
      Y: dataView.getFloat32(16, true),
      Z: dataView.getFloat32(20, true),
      timestamp: Date.now() / 1000
    }
  }

  // Function to add real BLE data to chart
  const addBLEDataToChart = useCallback((gaitData: GaitData) => {
    // Store data for analysis
    dataBufferRef.current.push(gaitData)
    if (dataBufferRef.current.length > 500) { // Keep last 5 seconds at 100Hz
      dataBufferRef.current.shift()
    }
    
    if (chartRef.current) {
      const datasets = chartRef.current.data.datasets
      
      // Update datasets based on current mode
      if (chartMode === 'all' || chartMode === 'resistance') {
        const rIndex = chartMode === 'all' ? 0 : 0
        if (datasets[rIndex]) datasets[rIndex].data.push({ x: gaitData.timestamp, y: gaitData.R1 })
        if (datasets[rIndex + 1]) datasets[rIndex + 1].data.push({ x: gaitData.timestamp, y: gaitData.R2 })
        if (datasets[rIndex + 2]) datasets[rIndex + 2].data.push({ x: gaitData.timestamp, y: gaitData.R3 })
      }
      
      if (chartMode === 'all' || chartMode === 'acceleration') {
        const aIndex = chartMode === 'all' ? 3 : 0
        if (datasets[aIndex]) datasets[aIndex].data.push({ x: gaitData.timestamp, y: gaitData.X })
        if (datasets[aIndex + 1]) datasets[aIndex + 1].data.push({ x: gaitData.timestamp, y: gaitData.Y })
        if (datasets[aIndex + 2]) datasets[aIndex + 2].data.push({ x: gaitData.timestamp, y: gaitData.Z })
      }
      
      // Keep only last 5 seconds of data for performance
      datasets.forEach(dataset => {
        if (dataset.data.length > 500) {
          dataset.data.shift()
        }
      })
      
      chartRef.current.update('none')
    }
  }, [chartMode])

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
              r1: number, r2: number, r3: number,
              x: number, y: number, z: number,
              timestamp: number
            }
            
            const gaitData: GaitData = {
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
          <span>Buffer: {dataBufferRef.current.length} samples</span>
          <span>•</span>
          <span>Channels: R1, R2, R3, X, Y, Z</span>
        </div>
      </div>
    </section>
  )
}
