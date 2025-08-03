import { useState, useEffect, useMemo, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useToast } from '../contexts/ToastContext'
import { config } from '../config'
import { Line } from 'react-chartjs-2'
import { registerChartComponents } from '../utils/chartSetup'
import { generateMultiDeviceColors, getDeviceLabel, type ChannelType } from '../utils/colorGeneration'
import '../styles/modal.css'

// Register Chart.js components
registerChartComponents()

interface ChartPoint {
  x: number
  y: number
}

interface ChartDataset {
  label: string
  device_id: string
  data_type: string
  data: ChartPoint[]
}

interface OptimizedChartData {
  datasets: ChartDataset[]
  metadata: {
    devices: string[]
    data_types: string[]
    sample_rate: number
    duration: number
  }
}

interface OptimizedDataViewerProps {
  sessionId: string
  sessionName: string
  onClose: () => void
}

export default function OptimizedDataViewer({ sessionId, sessionName, onClose }: OptimizedDataViewerProps) {
  const [chartData, setChartData] = useState<OptimizedChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>([])
  const [timeRange] = useState<{ start: number; end: number } | null>(null)
  
  // Color management for multi-device support
  const [deviceColors, setDeviceColors] = useState<Map<string, Record<string, { primary: string; light: string; dark: string; background: string }>>>(new Map())
  
  const { showError } = useToast()

  const loadOptimizedChartData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      console.log('🚀 Loading optimized chart data...', {
        sessionId,
        selectedDevices,
        selectedDataTypes,
        timeRange,
        maxPoints: 2000 // Limit to 2000 points per dataset for smooth rendering
      })
      
      const data: OptimizedChartData = await invoke('load_optimized_chart_data', { 
        sessionId,
        selectedDevices: selectedDevices.length > 0 ? selectedDevices : [], // Empty array means all devices
        selectedDataTypes: selectedDataTypes.length > 0 ? selectedDataTypes : [], // Empty array means all data types
        startTime: timeRange?.start || null,
        endTime: timeRange?.end || null,
        maxPointsPerDataset: 2000
      })
      
      setChartData(data)
      
      // Initialize filters if not set
      if (selectedDevices.length === 0) {
        setSelectedDevices(data.metadata.devices)
      }
      if (selectedDataTypes.length === 0) {
        setSelectedDataTypes(data.metadata.data_types)
      }
      
      console.log('✅ Optimized chart data loaded:', {
        datasets: data.datasets.length,
        totalPoints: data.datasets.reduce((sum, ds) => sum + ds.data.length, 0)
      })
      
    } catch (err) {
      console.error('Failed to load optimized chart data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load chart data')
      showError('Data Load Error', `Failed to load chart data: ${err}`)
    } finally {
      setLoading(false)
    }
  }, [sessionId, selectedDevices, selectedDataTypes, timeRange, showError])

  // Initialize device colors when chart data is loaded
  useEffect(() => {
    if (chartData && chartData.metadata.devices.length > 0) {
      // Create a mapping of device -> data type -> color scheme
      const deviceColorMap = new Map<string, Record<string, { primary: string; light: string; dark: string; background: string }>>()
      
      // Generate colors for each device
      const deviceColorPalettes = generateMultiDeviceColors(chartData.metadata.devices)
      
      chartData.metadata.devices.forEach(deviceId => {
        const palette = deviceColorPalettes.get(deviceId)!
        const dataTypeColors: Record<string, { primary: string; light: string; dark: string; background: string }> = {}
        
        // Map data types to channel colors
        chartData.metadata.data_types.forEach((dataType, index) => {
          // Map data types to our channel system for consistent coloring
          const channelMapping: Record<string, ChannelType> = {
            'R1': 'R1', 'r1': 'R1', 'resistance_1': 'R1',
            'R2': 'R2', 'r2': 'R2', 'resistance_2': 'R2', 
            'R3': 'R3', 'r3': 'R3', 'resistance_3': 'R3',
            'X': 'X', 'x': 'X', 'accel_x': 'X', 'acceleration_x': 'X',
            'Y': 'Y', 'y': 'Y', 'accel_y': 'Y', 'acceleration_y': 'Y',
            'Z': 'Z', 'z': 'Z', 'accel_z': 'Z', 'acceleration_z': 'Z'
          }
          
          // Use explicit mapping if available, otherwise distribute evenly across all channels
          const channel = channelMapping[dataType] || (['R1', 'R2', 'R3', 'X', 'Y', 'Z'] as ChannelType[])[index % 6]
          dataTypeColors[dataType] = palette[channel]
        })
        
        deviceColorMap.set(deviceId, dataTypeColors)
      })
      
      setDeviceColors(deviceColorMap)
    }
  }, [chartData])

  // Helper function to get device and data type color
  const getDeviceColor = useCallback((device: string, dataType: string, alpha: number = 1): string => {
    const devicePalette = deviceColors.get(device)
    if (devicePalette && devicePalette[dataType]) {
      const color = devicePalette[dataType].primary
      if (alpha === 1) return color
      
      // Convert hex to rgba with alpha
      const hex = color.replace('#', '')
      const r = parseInt(hex.substr(0, 2), 16)
      const g = parseInt(hex.substr(2, 2), 16) 
      const b = parseInt(hex.substr(4, 2), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
    
    // Fallback to neutral gray if device colors not ready
    return `hsl(0, 0%, 50%, ${alpha})`
  }, [deviceColors])

  // Prepare Chart.js formatted data
  const chartJsData = useMemo(() => {
    if (!chartData || deviceColors.size === 0) return null

    const datasets = chartData.datasets.map(dataset => ({
      label: `${getDeviceLabel(dataset.device_id)} - ${dataset.data_type}`,
      data: dataset.data,
      borderColor: getDeviceColor(dataset.device_id, dataset.data_type),
      backgroundColor: getDeviceColor(dataset.device_id, dataset.data_type, 0.1),
      borderWidth: 2,
      pointRadius: 0, // Hide points for better performance
      tension: config.chartSmoothing
    }))

    return { datasets }
  }, [chartData, deviceColors, getDeviceColor])

  useEffect(() => {
    loadOptimizedChartData()
  }, [loadOptimizedChartData])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false as const, // Disable animations for better performance
    interaction: {
      intersect: false,
      mode: 'index' as const
    },
    scales: {
      x: {
        type: 'linear' as const,
        title: {
          display: true,
          text: 'Time (ms)'
        }
      },
      y: {
        title: {
          display: true,
          text: 'Sensor Values'
        }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const
      }
    }
  }

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content data-viewer" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Loading {sessionName}...</h2>
            <button onClick={onClose} className="modal-close" aria-label="Close">×</button>
          </div>
          <div className="modal-body">
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Optimizing chart data...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content data-viewer" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Error Loading {sessionName}</h2>
            <button onClick={onClose} className="modal-close" aria-label="Close">×</button>
          </div>
          <div className="modal-body">
            <div className="error-message">
              <p>{error}</p>
              <button onClick={loadOptimizedChartData} className="btn-primary">
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content data-viewer" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{sessionName} - Optimized View</h2>
          <button onClick={onClose} className="modal-close" aria-label="Close">×</button>
        </div>
        
        <div className="modal-body">
          {chartData && (
            <div className="data-viewer-info">
              <p>
                <strong>{chartData.datasets.length}</strong> datasets, 
                <strong> {chartData.datasets.reduce((sum, ds) => sum + ds.data.length, 0)}</strong> total points,
                <strong> {chartData.metadata.sample_rate.toFixed(1)} Hz</strong>,
                <strong> {chartData.metadata.duration.toFixed(1)}s</strong>
              </p>
            </div>
          )}
          
          <div className="chart-container optimized-chart">
            {chartJsData && (
              <Line 
                data={chartJsData} 
                options={chartOptions}
                id="optimized-data-viewer-chart"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
