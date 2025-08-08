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
  const [timeRange, setTimeRange] = useState<{ start: number; end: number } | null>(null)
  
  // Enhanced time navigation and zoom controls
  const [timeWindowSize, setTimeWindowSize] = useState<number>(10) // seconds - base window size
  const [currentTimePosition, setCurrentTimePosition] = useState<number>(0) // start position in seconds
  const [zoomLevel, setZoomLevel] = useState<number>(1) // 1x to 10x zoom
  const [selectionBox, setSelectionBox] = useState<{ start: number; end: number } | null>(null)
  
  // Performance settings for large datasets
  const [maxDataPoints, setMaxDataPoints] = useState<number>(10000) // Default max points per dataset
  const [useDownsampling, setUseDownsampling] = useState<boolean>(true)
  const [enableAnimations] = useState<boolean>(false) // Disabled by default for performance
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false)
  
  // Color management for multi-device support
  const [deviceColors, setDeviceColors] = useState<Map<string, Record<string, { primary: string; light: string; dark: string; background: string }>>>(new Map())
  
  const { getChartTimestamp } = useTimestampManager({
    useRelativeTime: true, // Match LiveChart configuration
  })
  const { showError, showInfo, showSuccess } = useToast()

  // Time navigation and zoom utilities
  const getEffectiveTimeWindow = useCallback(() => {
    if (!optimizedData) return { start: 0, end: timeWindowSize }
    
    const dataDuration = optimizedData.metadata.duration
    const adjustedWindowSize = Math.min(timeWindowSize / zoomLevel, dataDuration)
    const maxStartPosition = Math.max(0, dataDuration - adjustedWindowSize)
    const safeStartPosition = Math.min(currentTimePosition, maxStartPosition)
    
    return {
      start: safeStartPosition,
      end: Math.min(safeStartPosition + adjustedWindowSize, dataDuration)
    }
  }, [currentTimePosition, timeWindowSize, zoomLevel, optimizedData])

  // Check if we're zoomed in enough to show the time slider
  const isZoomedIn = useCallback(() => {
    if (!optimizedData) return false
    const totalDuration = optimizedData.metadata.duration
    const currentViewDuration = timeWindowSize / zoomLevel
    return currentViewDuration < totalDuration * 0.9 // Show slider when viewing less than 90% of total data
  }, [optimizedData, timeWindowSize, zoomLevel])

  // Enhanced time slider with smooth dragging
  const handleTimePositionDrag = useCallback((value: number) => {
    setCurrentTimePosition(value)
  }, [])

  const handleZoomChange = useCallback((direction: 'in' | 'out' | 'reset') => {
    if (direction === 'reset') {
      setZoomLevel(1)
      setCurrentTimePosition(0)
      setTimeRange(null)
    } else if (direction === 'in') {
      const newZoom = Math.min(10.0, zoomLevel * 1.5)
      setZoomLevel(newZoom)
      // Adjust position to keep current view centered
      if (optimizedData) {
        const currentViewCenter = currentTimePosition + (timeWindowSize / zoomLevel) / 2
        const newViewDuration = timeWindowSize / newZoom
        const newPosition = Math.max(0, Math.min(
          optimizedData.metadata.duration - newViewDuration,
          currentViewCenter - newViewDuration / 2
        ))
        setCurrentTimePosition(newPosition)
      }
    } else if (direction === 'out') {
      const newZoom = Math.max(1.0, zoomLevel / 1.5)
      setZoomLevel(newZoom)
      // Adjust position to keep view within bounds
      if (optimizedData) {
        const newViewDuration = timeWindowSize / newZoom
        const maxPosition = Math.max(0, optimizedData.metadata.duration - newViewDuration)
        if (currentTimePosition > maxPosition) {
          setCurrentTimePosition(maxPosition)
        }
      }
    }
  }, [zoomLevel, currentTimePosition, timeWindowSize, optimizedData])

  const clearSelection = useCallback(() => {
    setSelectionBox(null)
    setTimeRange(null)
    setCurrentTimePosition(0)
    setZoomLevel(1)
  }, [])

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
        selectedDevices: [], // Load all devices (empty array = all devices)
        selectedDataTypes: [], // Load all data types (empty array = all data types)
        startTime: null,
        endTime: null,
        maxPointsPerDataset: estimatedMaxPoints // Use backend downsampling for performance
      })
      
      setOptimizedData(data)
      
      // Initialize timeWindowSize based on actual data duration
      const dataDuration = data.metadata.duration
      if (dataDuration <= 30) {
        // For short sessions, show all data by default
        setTimeWindowSize(Math.ceil(dataDuration))
      } else {
        // For longer sessions, start with a reasonable window
        setTimeWindowSize(Math.min(30, Math.ceil(dataDuration / 3)))
      }
      
      // All devices and data types are now always shown - no need to set selections
      const devices = data.metadata.devices
      const dataTypes = data.metadata.data_types
      
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

  // Update timeRange when zoom or position changes
  useEffect(() => {
    if (optimizedData && (zoomLevel !== 1 || currentTimePosition !== 0)) {
      const effectiveWindow = getEffectiveTimeWindow()
      setTimeRange(effectiveWindow)
      console.log(`Time range updated: ${effectiveWindow.start.toFixed(2)}s - ${effectiveWindow.end.toFixed(2)}s (zoom: ${zoomLevel}x)`)
    } else if (zoomLevel === 1 && currentTimePosition === 0) {
      setTimeRange(null) // Show all data when not zoomed
    }
  }, [zoomLevel, currentTimePosition, optimizedData, getEffectiveTimeWindow])

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
      // Show all devices - no device filtering
      
      for (const [dataType, points] of Object.entries(deviceData)) {
        // Show all data types - no data type filtering
        
        for (const point of points) {
          // Convert timestamp to relative seconds for consistent gait analysis
          const convertedTimestamp = getChartTimestamp(point.x)
          
          // Apply time range filtering on converted timestamps if timeRange exists
          // timeRange.start and timeRange.end are already in chart timestamp format (relative seconds)
          const timeMatch = !timeRange || (
            convertedTimestamp >= timeRange.start && 
            convertedTimestamp <= timeRange.end
          )
          
          if (timeMatch) {
            filtered.push({
              device_id: device,
              data_type: dataType,
              timestamp: convertedTimestamp, // Store relative seconds for gait analysis
              value: point.y,
              unit: '' // Unit info not included in optimized format
            })
          }
        }
      }
    }
    
    // Debug logging for zoom filtering
    if (timeRange) {
      console.log(`🔍 Time filtering: range=[${timeRange.start.toFixed(2)}s, ${timeRange.end.toFixed(2)}s], filtered=${filtered.length} points`)
    } else {
      console.log(`📊 No time filtering: showing all ${filtered.length} points`)
    }
    
    return filtered
  }, [optimizedData, timeRange, getChartTimestamp])

  // Prepare chart data
  const chartData = useMemo(() => {
    // Don't render chart until device colors are initialized
    if (!optimizedData || deviceColors.size === 0) return null

    const datasets = []
    let totalDataPoints = 0
    
    for (const [device, deviceData] of Object.entries(optimizedData.datasets)) {
      // Show all devices - no device filtering
      
      for (const [dataType, points] of Object.entries(deviceData)) {
        // Show all data types - no data type filtering
        
        const deviceLabel = getDeviceLabel(device)
        
        // Convert timestamps to seconds first, then apply time range filtering
        const processedPoints = points.map((point: ChartPoint) => ({
          ...point,
          x: getChartTimestamp(point.x) // Convert milliseconds to relative seconds
        }))
        
        const filteredPoints = timeRange 
          ? processedPoints.filter((point: ChartPoint) => {
              const inRange = point.x >= timeRange.start && point.x <= timeRange.end
              return inRange
            })
          : processedPoints
        
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
          const deviceCount = Object.keys(optimizedData.datasets).length
          const dataTypeCount = Object.keys(deviceData).length
          if (useDownsampling && validDataPoints.length > maxDataPoints / deviceCount / dataTypeCount) {
            const targetPoints = Math.max(50, Math.floor(maxDataPoints / deviceCount / dataTypeCount))
            validDataPoints = downsampleData(validDataPoints, targetPoints)
            console.log(`Client-side downsampled ${device}-${dataType}: ${filteredPoints.length} → ${validDataPoints.length} points`)
          }
          
          if (validDataPoints.length > 0) {
            totalDataPoints += validDataPoints.length
            
            // Adjust visual styling based on dataset size for performance
            // Use more generous thresholds to show points when zoomed in
            const pointCount = validDataPoints.length
            const pointRadius = pointCount > 2000 ? 0 : (pointCount > 1000 ? 0.5 : 1)
            const borderWidth = pointCount > 3000 ? 1 : 2
            const hoverRadius = pointCount > 2000 ? 2 : 4
            const hitRadius = pointCount > 2000 ? 4 : 6
            
            datasets.push({
              label: `${deviceLabel} - ${dataType}`,
              data: validDataPoints,
              borderColor: getDeviceColor(device, dataType),
              backgroundColor: getDeviceColor(device, dataType, 0.1),
              borderWidth: borderWidth,
              pointRadius: pointRadius,
              tension: config.chartSmoothing,
              spanGaps: false, // Don't connect points across gaps
              pointHoverRadius: hoverRadius,
              pointHitRadius: hitRadius
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
    
    return { datasets, totalDataPoints }
  }, [optimizedData, getDeviceColor, deviceColors, timeRange, useDownsampling, maxDataPoints, downsampleData, getChartTimestamp])

  const reloadData = () => {
    loadSessionData()
  }

  const exportFilteredData = async () => {
    try {
      const csvContent = [
        ['Timestamp', 'Device', 'Data Type', 'Value', 'Unit'].join(','),
        ...filteredData.map((point: FilteredDataPoint) => {
          return [
            `${point.timestamp.toFixed(3)}s`, // Export as relative seconds with high precision
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
        {/* Header Section - Session Info & Close */}
        <header className="data-viewer-header">
          <div className="header-content">
            <div className="session-info">
              <h1 className="session-title">
                <span className="session-icon">📊</span>
                {sessionName}
              </h1>
              <div className="session-metadata">
                <span className="metadata-item">
                  <span className="metadata-icon">⏱️</span>
                  {Math.round(optimizedData.metadata.duration)}s
                </span>
                <span className="metadata-separator">•</span>
                <span className="metadata-item">
                  <span className="metadata-icon">📡</span>
                  {Math.round(optimizedData.metadata.sample_rate * 10) / 10}Hz
                </span>
                <span className="metadata-separator">•</span>
                <span className="metadata-item">
                  <span className="metadata-icon">📱</span>
                  {optimizedData.metadata.devices.length} device{optimizedData.metadata.devices.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
            <button 
              className="btn-close" 
              onClick={onClose}
              aria-label="Close data viewer"
              title="Close data viewer"
            >
              ✕
            </button>
          </div>
        </header>

        {/* Toolbar Section - View Mode & Actions */}
        <nav className="data-viewer-toolbar">
  

          <div className="toolbar-right">
            {/* Action Buttons */}
            <div className="action-buttons">
              <button 
                className="btn-action btn-export" 
                onClick={exportFilteredData}
                title="Export current data view"
                aria-label="Export data"
              >
                <span className="btn-icon">📥</span>
                <span className="btn-label">Export</span>
              </button>
              <button 
                className={`btn-action btn-settings ${showAdvancedSettings ? 'active' : ''}`}
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                title="Toggle advanced settings"
                aria-label={showAdvancedSettings ? 'Hide settings' : 'Show settings'}
              >
                <span className="btn-icon">⚙️</span>
                <span className="btn-label">Settings</span>
              </button>
            </div>
          </div>
        </nav>

        {/* Advanced Settings Panel */}
        {showAdvancedSettings && (
          <div className="settings-panel" role="region" aria-label="Advanced settings">
            <div className="settings-card">
              <h3 className="settings-title">Performance Options</h3>
              <div className="settings-grid">
                <div className="setting-item">
                  <label className="setting-label">
                    <input
                      type="checkbox"
                      className="setting-checkbox"
                      checked={useDownsampling}
                      onChange={(e) => setUseDownsampling(e.target.checked)}
                      aria-describedby="downsampling-help"
                    />
                    <span className="checkbox-custom"></span>
                    <span className="setting-text">Enable Data Downsampling</span>
                  </label>
                  <p id="downsampling-help" className="setting-help">
                    Reduces data points for better performance with large datasets
                  </p>
                </div>
                <div className="setting-item">
                  <label htmlFor="maxDataPoints" className="setting-label-text">
                    Maximum Data Points
                  </label>
                  <div className="number-input-group">
                    <input
                      id="maxDataPoints"
                      type="number"
                      min="100"
                      max="50000"
                      step="500"
                      value={maxDataPoints}
                      onChange={(e) => setMaxDataPoints(parseInt(e.target.value) || 5000)}
                      className="number-input"
                      aria-describedby="max-points-help"
                    />
                    <span className="input-unit">points</span>
                  </div>
                  <p id="max-points-help" className="setting-help">
                    Higher values show more detail but may reduce performance
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="data-viewer-content" role="main">
          {chartData && (
            <div id="chart-panel" role="tabpanel" aria-labelledby="chart-tab" className="chart-container">
              {(() => {
                try {
                  return (
                    <Line
                      key={`data-chart-${timeRange ? 'filtered' : 'all'}`}
                      data={{ datasets: chartData.datasets }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: enableAnimations ? {
                          duration: 300,
                          easing: 'easeInOutQuart'
                        } : false,
                        plugins: {
                          legend: {
                            position: 'top',
                            labels: {
                              boxWidth: 12,
                              padding: 15,
                              font: {
                                size: 12
                              },
                              // Improve label formatting for better readability
                              generateLabels: function(chart) {
                                const original = Chart.defaults.plugins.legend.labels.generateLabels(chart)
                                return original.map(item => {
                                  // Shorten long labels by using abbreviated device names
                                  if (item.text) {
                                    const match = item.text.match(/^Device (\w+) - (.+)$/)
                                    if (match) {
                                      const [, deviceId, dataType] = match
                                      // Use shorter device identifier
                                      item.text = `${deviceId.slice(-4)} ${dataType.toUpperCase()}`
                                    }
                                  }
                                  return item
                                })
                              }
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
                                  return `Time: ${context[0].parsed.x.toFixed(2)}s`
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
                              text: 'Time (seconds)'
                            },
                            min: timeRange?.start,
                            max: timeRange?.end,
                            ticks: {
                              callback: function(value) {
                                // Format relative time in seconds (matching LiveChart)
                                if (typeof value === 'number' && !isNaN(value)) {
                                  return `${value.toFixed(1)}s`
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
                            radius: chartData.totalDataPoints > 2000 ? 0 : (chartData.totalDataPoints > 1000 ? 0.5 : 1),
                            hoverRadius: 4,
                            hitRadius: 6
                          }
                        },
                        // Enhanced performance for large datasets
                        datasets: {
                          line: {
                            pointRadius: chartData.totalDataPoints > 3000 ? 0 : (chartData.totalDataPoints > 1500 ? 0.5 : 1),
                            borderWidth: chartData.totalDataPoints > 5000 ? 1 : 2
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

          {/* Time Navigation Controls - Compact and Responsive */}
          {chartData && optimizedData && (
            <div className="time-navigation-controls">
              {/* Main Controls Row */}
              <div className="navigation-main-row">
                {/* Zoom Controls */}
                <div className="zoom-section">
                  <label>Zoom:</label>
                  <div className="zoom-controls">
                    <button 
                      onClick={() => handleZoomChange('out')}
                      className="btn-secondary btn-sm"
                      disabled={zoomLevel <= 1.0}
                      title="Zoom out"
                    >
                      🔍-
                    </button>
                    <span className="zoom-display">{(zoomLevel).toFixed(1)}x</span>
                    <button 
                      onClick={() => handleZoomChange('in')}
                      className="btn-secondary btn-sm"
                      disabled={zoomLevel >= 10.0}
                      title="Zoom in"
                    >
                      🔍+
                    </button>
                    <button 
                      onClick={() => handleZoomChange('reset')}
                      className="btn-secondary btn-sm"
                      title="Reset view"
                    >
                      📊
                    </button>
                  </div>
                </div>

                {/* Time Info */}
                <div className="time-info">
                  <span>Viewing: {(() => {
                    const effectiveWindow = getEffectiveTimeWindow()
                    const viewingDuration = effectiveWindow.end - effectiveWindow.start
                    return `${viewingDuration.toFixed(1)}s of ${optimizedData.metadata.duration.toFixed(1)}s`
                  })()}</span>
                </div>
              </div>

              {/* Timeline Slider - Only show when zoomed in */}
              {isZoomedIn() && (
                <div className="timeline-slider-row">
                  <div className="slider-container">
                    <span className="time-marker">0s</span>
                    <input
                      type="range"
                      min="0"
                      max={(() => {
                        const effectiveWindow = getEffectiveTimeWindow()
                        const viewingDuration = effectiveWindow.end - effectiveWindow.start
                        return Math.max(0, optimizedData.metadata.duration - viewingDuration)
                      })()}
                      step="0.1"
                      value={currentTimePosition}
                      onChange={(e) => handleTimePositionDrag(parseFloat(e.target.value))}
                      className="main-timeline-slider"
                      title={`Position: ${currentTimePosition.toFixed(1)}s`}
                      aria-label="Timeline position"
                    />
                    <span className="time-marker">{optimizedData.metadata.duration.toFixed(1)}s</span>
                  </div>
                  <div className="current-range">
                    <span>📍 {(() => {
                      const effectiveWindow = getEffectiveTimeWindow()
                      return `${effectiveWindow.start.toFixed(1)}s - ${effectiveWindow.end.toFixed(1)}s`
                    })()}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {selectionBox && (
            <div className="selection-info">
              <span>Selection: {selectionBox.start.toFixed(2)}s - {selectionBox.end.toFixed(2)}s</span>
              <button onClick={clearSelection} className="btn-secondary btn-sm">Clear</button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
