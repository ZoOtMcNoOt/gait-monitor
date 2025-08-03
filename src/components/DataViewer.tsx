import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Line } from 'react-chartjs-2'
import { Chart } from 'chart.js'
import { registerChartComponents } from '../utils/chartSetup'
import { config } from '../config'
import { generateMultiDeviceColors, getDeviceLabel, type ChannelType } from '../utils/colorGeneration'
import { useTimestampManager } from '../hooks/useTimestampManager'
import { useToast } from '../contexts/ToastContext'
import { protectedOperations } from '../services/csrfProtection'

// Register Chart.js components
registerChartComponents()

interface DataViewerProps {
  sessionId: string
  sessionName: string
  onClose: () => void
}

// Types for optimized backend
interface ChartPoint {
  x: number
  y: number
}

interface OptimizedChartData {
  datasets: Record<string, Record<string, ChartPoint[]>>  // device -> dataType -> points
  metadata: {
    devices: string[]
    data_types: string[]
    sample_rate: number
    duration: number
  }
}

interface DeviceStats {
  count: number
  mean: number
  min: number
  max: number
  std: number
  unit: string
}

interface FilteredDataPoint {
  device_id: string
  data_type: string
  timestamp: number
  value: number
  unit: string
}

export default function DataViewer({ sessionId, sessionName, onClose }: DataViewerProps) {
  const [optimizedData, setOptimizedData] = useState<OptimizedChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDevices, setSelectedDevices] = useState<string[]>([])
  const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<'chart' | 'table' | 'stats'>('chart')
  const [timeRange] = useState<{ start: number; end: number } | null>(null)
  
  // Performance settings for large datasets
  const [maxDataPoints, setMaxDataPoints] = useState<number>(10000) // Default max points per dataset
  const [useDownsampling, setUseDownsampling] = useState<boolean>(true)
  
  // Color management for multi-device support
  const [deviceColors, setDeviceColors] = useState<Map<string, Record<string, { primary: string; light: string; dark: string; background: string }>>>(new Map())
  
  const { formatTimestamp } = useTimestampManager()
  const { showError, showInfo, showSuccess } = useToast()

  // Downsampling utility for client-side optimization
  const downsampleData = useCallback((points: ChartPoint[], maxPoints: number): ChartPoint[] => {
    if (points.length <= maxPoints) return points
    
    // Use LTTB (Largest Triangle Three Buckets) algorithm for better visual preservation
    const bucketSize = (points.length - 2) / (maxPoints - 2)
    const sampled: ChartPoint[] = [points[0]] // Always keep first point
    
    for (let i = 1; i < maxPoints - 1; i++) {
      const bucketStart = Math.floor(i * bucketSize) + 1
      const bucketEnd = Math.floor((i + 1) * bucketSize) + 1
      
      // Find point with largest triangle area
      let maxArea = 0
      let selectedPoint = points[bucketStart]
      
      const prevPoint = sampled[sampled.length - 1]
      const nextBucketPoint = i < maxPoints - 2 ? 
        points[Math.floor(((i + 1) * bucketSize) + 1)] : 
        points[points.length - 1]
      
      for (let j = bucketStart; j < Math.min(bucketEnd, points.length - 1); j++) {
        const area = Math.abs(
          (prevPoint.x - nextBucketPoint.x) * (points[j].y - prevPoint.y) -
          (prevPoint.x - points[j].x) * (nextBucketPoint.y - prevPoint.y)
        )
        
        if (area > maxArea) {
          maxArea = area
          selectedPoint = points[j]
        }
      }
      
      sampled.push(selectedPoint)
    }
    
    sampled.push(points[points.length - 1]) // Always keep last point
    return sampled
  }, [])

  const loadSessionData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Estimate appropriate downsampling based on session duration and device count
      // For large datasets, use backend downsampling for better performance
      const estimatedMaxPoints = useDownsampling ? maxDataPoints : null
      
      console.log(`🚀 Loading session with downsampling: ${estimatedMaxPoints ? `${estimatedMaxPoints} points max` : 'disabled'}`)
      
      // Use optimized Rust backend
      const data: OptimizedChartData = await invoke('load_optimized_chart_data', {
        sessionId,
        selectedDevices: [], // Load all devices initially
        selectedDataTypes: [], // Load all data types initially
        startTime: null,
        endTime: null,
        maxPointsPerDataset: estimatedMaxPoints // Use backend downsampling for performance
      })
      
      setOptimizedData(data)
      
      // Auto-select all available devices and data types
      const devices = data.metadata.devices
      const dataTypes = data.metadata.data_types
      
      setSelectedDevices(devices)
      setSelectedDataTypes(dataTypes)
      
      // Calculate total data points for performance info
      const totalPoints = Object.values(data.datasets)
        .flatMap(deviceData => Object.values(deviceData))
        .reduce((sum, points) => sum + points.length, 0)
      
      console.log(`📊 Loaded ${totalPoints.toLocaleString()} total data points across ${devices.length} devices and ${dataTypes.length} data types`)
      
      // Auto-enable downsampling for very large datasets
      if (totalPoints > 50000 && !useDownsampling) {
        setUseDownsampling(true)
        showInfo('Performance Optimization', 
          `Large dataset detected (${totalPoints.toLocaleString()} points). Enabling downsampling for better performance.`)
      }
      
      // Generate device colors for all detected devices
      if (devices.length > 0) {
        const deviceColorPalettes = generateMultiDeviceColors(devices)
        const colorMap = new Map<string, Record<string, { primary: string; light: string; dark: string; background: string }>>()
        
        devices.forEach(device => {
          const palette = deviceColorPalettes.get(device)!
          const dataTypeColors: Record<string, { primary: string; light: string; dark: string; background: string }> = {}
          
          // Map data types to channel colors for consistent coloring
          dataTypes.forEach((dataType, index) => {
            // Map data types to our channel system
            const channelMapping: Record<string, ChannelType> = {
              'r1': 'R1', 'r2': 'R2', 'r3': 'R3',
              'x': 'X', 'y': 'Y', 'z': 'Z',
              'R1': 'R1', 'R2': 'R2', 'R3': 'R3',
              'X': 'X', 'Y': 'Y', 'Z': 'Z'
            }
            
            // Use explicit mapping if available, otherwise distribute evenly across channels
            const channel = channelMapping[dataType] || (['R1', 'R2', 'R3', 'X', 'Y', 'Z'] as ChannelType[])[index % 6]
            dataTypeColors[dataType] = palette[channel]
          })
          
          colorMap.set(device, dataTypeColors)
        })
        
        setDeviceColors(colorMap)
        console.log('Generated device colors:', Object.fromEntries(colorMap))
      }
      
    } catch (err) {
      console.error('Failed to load session data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load session data')
      showError('Data Load Error', `Failed to load session data: ${err}`)
    } finally {
      setLoading(false)
    }
  }, [sessionId, showError, useDownsampling, maxDataPoints, showInfo])

  useEffect(() => {
    loadSessionData()
  }, [loadSessionData])

  // Simple cleanup on component unmount only
  useEffect(() => {
    return () => {
      // Clean up any chart instances when component unmounts
      try {
        const container = document.getElementById('data-viewer-chart')
        if (container) {
          const canvases = container.querySelectorAll('canvas')
          canvases.forEach(canvas => {
            const chart = Chart.getChart(canvas)
            if (chart) {
              chart.destroy()
            }
          })
        }
      } catch (error) {
        console.warn('Error cleaning up DataViewer charts:', error)
      }
    }
  }, [])

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
    
    // Fallback to neutral gray colors if device colors not ready
    const hash = (device + dataType).split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0)
      return a & a
    }, 0)
    
    const lightness = 40 + (Math.abs(hash) % 30) // 40-70% lightness for variety
    return `hsl(0, 0%, ${lightness}%, ${alpha})` // Neutral gray
  }, [deviceColors])

  // Filter data and prepare for visualization
  const filteredData = useMemo((): FilteredDataPoint[] => {
    if (!optimizedData) return []
    
    const filtered: FilteredDataPoint[] = []
    
    for (const [device, deviceData] of Object.entries(optimizedData.datasets)) {
      if (!selectedDevices.includes(device)) continue
      
      for (const [dataType, points] of Object.entries(deviceData)) {
        if (!selectedDataTypes.includes(dataType)) continue
        
        for (const point of points) {
          const timeMatch = !timeRange || (
            point.x >= timeRange.start && 
            point.x <= timeRange.end
          )
          
          if (timeMatch) {
            filtered.push({
              device_id: device,
              data_type: dataType,
              timestamp: point.x,
              value: point.y,
              unit: '' // Unit info not included in optimized format
            })
          }
        }
      }
    }
    
    return filtered
  }, [optimizedData, selectedDevices, selectedDataTypes, timeRange])

  // Prepare chart data
  const chartData = useMemo(() => {
    // Don't render chart until device colors are initialized
    if (!optimizedData || deviceColors.size === 0) return null

    const datasets = []
    let totalDataPoints = 0
    
    for (const [device, deviceData] of Object.entries(optimizedData.datasets)) {
      if (!selectedDevices.includes(device)) continue
      
      for (const [dataType, points] of Object.entries(deviceData)) {
        if (!selectedDataTypes.includes(dataType)) continue
        
        const deviceLabel = getDeviceLabel(device)
        const filteredPoints = timeRange 
          ? points.filter((point: ChartPoint) => point.x >= timeRange.start && point.x <= timeRange.end)
          : points
        
        if (filteredPoints.length > 0) {
          // Ensure all data points are properly formatted and not null/undefined
          let validDataPoints = filteredPoints.filter(point => 
            point && 
            typeof point.x === 'number' && 
            typeof point.y === 'number' && 
            !isNaN(point.x) && 
            !isNaN(point.y)
          )
          
          // Apply client-side downsampling if needed and enabled
          if (useDownsampling && validDataPoints.length > maxDataPoints / selectedDevices.length / selectedDataTypes.length) {
            const targetPoints = Math.max(50, Math.floor(maxDataPoints / selectedDevices.length / selectedDataTypes.length))
            validDataPoints = downsampleData(validDataPoints, targetPoints)
            console.log(`Client-side downsampled ${device}-${dataType}: ${filteredPoints.length} → ${validDataPoints.length} points`)
          }
          
          if (validDataPoints.length > 0) {
            totalDataPoints += validDataPoints.length
            
            // Adjust visual styling based on dataset size for performance
            const isLargeDataset = validDataPoints.length > 1000
            
            datasets.push({
              label: `${deviceLabel} - ${dataType}`,
              data: validDataPoints,
              borderColor: getDeviceColor(device, dataType),
              backgroundColor: getDeviceColor(device, dataType, 0.1),
              borderWidth: isLargeDataset ? 1 : 2,
              pointRadius: isLargeDataset ? 0 : 1,
              tension: config.chartSmoothing,
              spanGaps: false, // Don't connect points across gaps
              pointHoverRadius: isLargeDataset ? 2 : 4,
              pointHitRadius: isLargeDataset ? 4 : 6
            })
          }
        }
      }
    }
    
    // Log performance information
    if (totalDataPoints > 0) {
      console.log(`Chart prepared with ${totalDataPoints} total data points across ${datasets.length} datasets`)
      if (totalDataPoints > maxDataPoints) {
        console.warn(`High data point count (${totalDataPoints}) may impact performance. Consider enabling downsampling.`)
      }
    }
    
    return { datasets }
  }, [optimizedData, selectedDevices, selectedDataTypes, getDeviceColor, deviceColors, timeRange, useDownsampling, maxDataPoints, downsampleData])

  // Calculate statistics
  const statistics = useMemo(() => {
    if (!filteredData.length) return null

    const stats: Record<string, Record<string, DeviceStats>> = {}
    
    selectedDataTypes.forEach(dataType => {
      stats[dataType] = {}
      
      selectedDevices.forEach(device => {
        const deviceData = filteredData.filter(
          (point: FilteredDataPoint) => point.device_id === device && point.data_type === dataType
        )
        
        if (deviceData.length > 0) {
          const values = deviceData.map((point: FilteredDataPoint) => point.value)
          const mean = values.reduce((sum: number, val: number) => sum + val, 0) / values.length
          const min = Math.min(...values)
          const max = Math.max(...values)
          const std = Math.sqrt(
            values.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / values.length
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
        ...filteredData.map((point: FilteredDataPoint) => {
          return [
            new Date(point.timestamp).toISOString(),
            point.device_id,
            point.data_type,
            point.value,
            point.unit
          ].join(',')
        })
      ].join('\n')

      const fileName = `${sessionName}_filtered_${new Date().toISOString().split('T')[0]}.csv`
      
      // Save filtered data to app data directory using CSRF protection
      const savedPath = await protectedOperations.saveFilteredData(fileName, csvContent) as string
      
      // Then copy it to Downloads folder using CSRF protection
      try {
        const result = await protectedOperations.copyFileToDownloads(savedPath, fileName)
        
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
          <div className="data-viewer-header">
            <h2>Loading Session Data...</h2>
          </div>
          <div className="data-viewer-content">
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Loading {sessionName}...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="data-viewer-overlay">
        <div className="data-viewer-modal">
          <div className="data-viewer-header">
            <h2>Error Loading Data</h2>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
          <div className="data-viewer-content">
            <div className="data-viewer-error">
              <h3>❌ No Data Available</h3>
              <p>Session data could not be loaded.</p>
              <p className="error-details">{error}</p>
              <div className="button-group">
                <button onClick={reloadData} className="btn-primary">🔄 Retry</button>
                <button onClick={onClose} className="btn-secondary">Close</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!optimizedData) {
    return (
      <div className="data-viewer-overlay">
        <div className="data-viewer-modal">
          <div className="data-viewer-error">
            <h3>❌ No Data Available</h3>
            <p>Session data could not be loaded.</p>
            <button className="btn-secondary" onClick={onClose}>Close</button>
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
            <h2>📊 {sessionName}</h2>
            <p>Duration: {Math.round(optimizedData.metadata.duration)}s | Sample Rate: {Math.round(optimizedData.metadata.sample_rate * 10) / 10}Hz | Devices: {optimizedData.metadata.devices.length}</p>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
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
                � Chart
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
                � Statistics
              </button>
            </div>
          </div>
          
          {/* Device Filter */}
          <div className="control-group">
            <label>Devices:</label>
            <div className="checkbox-group">
              {optimizedData.metadata.devices.map(device => (
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
                  {getDeviceLabel(device)}
                </label>
              ))}
            </div>
          </div>
          
          {/* Data Type Filter */}
          <div className="control-group">
            <label>Data Types:</label>
            <div className="checkbox-group">
              {optimizedData.metadata.data_types.map(dataType => (
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

          {/* Performance Settings */}
          <div className="control-group">
            <label>Performance:</label>
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={useDownsampling}
                  onChange={(e) => setUseDownsampling(e.target.checked)}
                />
                Enable Downsampling
              </label>
            </div>
            <div className="input-group">
              <label htmlFor="maxDataPoints">Max Data Points:</label>
              <input
                id="maxDataPoints"
                type="number"
                min="100"
                max="50000"
                step="500"
                value={maxDataPoints}
                onChange={(e) => setMaxDataPoints(parseInt(e.target.value) || 5000)}
                className="number-input"
              />
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
            <div className="chart-container" id="data-viewer-chart">
              {(() => {
                try {
                  return (
                    <Line
                      key={`data-chart-${selectedDevices.join('-')}-${selectedDataTypes.join('-')}-${viewMode}`}
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
                            text: `${sessionName} - Data Visualization`
                          },
                          tooltip: {
                            enabled: true,
                            mode: 'index',
                            intersect: false,
                            filter: function(tooltipItem) {
                              // Filter out null/undefined values from tooltips
                              return tooltipItem && 
                                     tooltipItem.parsed && 
                                     typeof tooltipItem.parsed.x === 'number' && 
                                     typeof tooltipItem.parsed.y === 'number' &&
                                     !isNaN(tooltipItem.parsed.x) &&
                                     !isNaN(tooltipItem.parsed.y)
                            },
                            callbacks: {
                              title: function(context) {
                                if (context && context[0] && context[0].parsed) {
                                  return `Time: ${new Date(context[0].parsed.x).toLocaleTimeString()}`
                                }
                                return 'Data Point'
                              },
                              label: function(context) {
                                if (context && context.parsed && typeof context.parsed.y === 'number') {
                                  return `${context.dataset.label}: ${context.parsed.y.toFixed(3)}`
                                }
                                return `${context.dataset.label}: N/A`
                              }
                            }
                          }
                        },
                        scales: {
                          x: {
                            type: 'linear',
                            position: 'bottom',
                            title: {
                              display: true,
                              text: 'Time (ms)'
                            },
                            ticks: {
                              callback: function(value) {
                                // Format timestamp for display
                                if (typeof value === 'number' && !isNaN(value)) {
                                  return new Date(value).toLocaleTimeString()
                                }
                                return value
                              }
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
                        },
                        elements: {
                          point: {
                            radius: 1,
                            hoverRadius: 4,
                            hitRadius: 6
                          }
                        }
                      }}
                    />
                  )
                } catch (error) {
                  console.error('Chart rendering error:', error)
                  return (
                    <div className="chart-error">
                      <p>❌ Error rendering chart. Please try refreshing the data.</p>
                      <button onClick={reloadData} className="btn-secondary">
                        🔄 Reload Data
                      </button>
                    </div>
                  )
                }
              })()}
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
                  </tr>
                </thead>
                <tbody>
                  {filteredData.slice(0, 1000).map((point: FilteredDataPoint, index) => (
                    <tr key={index}>
                      <td>{formatTimestamp(point.timestamp)}</td>
                      <td>{getDeviceLabel(point.device_id)}</td>
                      <td>{point.data_type}</td>
                      <td>{point.value.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredData.length > 1000 && (
                <p className="table-note">Showing first 1000 rows of {filteredData.length.toLocaleString()} total</p>
              )}
            </div>
          )}
          
          {viewMode === 'stats' && statistics && (
            <div className="stats-container">
              {Object.entries(statistics).map(([dataType, deviceStats]) => (
                <div key={dataType} className="stats-section">
                  <h3>{dataType} Statistics</h3>
                  <table className="stats-table">
                    <thead>
                      <tr>
                        <th>Device</th>
                        <th>Count</th>
                        <th>Mean</th>
                        <th>Min</th>
                        <th>Max</th>
                        <th>Std Dev</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(deviceStats).map(([device, stats]) => (
                        <tr key={device}>
                          <td>{getDeviceLabel(device)}</td>
                          <td>{stats.count.toLocaleString()}</td>
                          <td>{stats.mean}</td>
                          <td>{stats.min}</td>
                          <td>{stats.max}</td>
                          <td>{stats.std}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
