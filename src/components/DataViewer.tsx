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

// Inline SVG icons for consistent visuals
const Icons = {
  chart: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M10 19V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M16 19V13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M22 19H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  timer: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="2"/>
      <path d="M12 13V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M9 3h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  antenna: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
      <path d="M5 12a7 7 0 0 1 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M19 12a7 7 0 0 0-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M3 12a9 9 0 0 1 9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  device: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="2"/>
      <circle cx="12" cy="19" r="1" fill="currentColor"/>
    </svg>
  ),
  close: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  refresh: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2l10 18H2L12 2z" stroke="currentColor" strokeWidth="2" fill="none"/>
      <path d="M12 8v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="17" r="1" fill="currentColor"/>
    </svg>
  ),
  export: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 14v4a3 3 0 003 3h10a3 3 0 003-3v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  zoom: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" strokeWidth="2"/>
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.11a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.11a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.11a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c0 .66.39 1.26 1 1.51.16.07.34.11.51.11H21a2 2 0 110 4h-.11a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/>
    </svg>
  ),
  chevronDown: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  fit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 9V5a2 2 0 012-2h4M15 3h4a2 2 0 012 2v4M21 15v4a2 2 0 01-2 2h-4M9 21H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  home: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 11l9-7 9 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M5 10v10h14V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  stepBack: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  stepForward: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  statusGood: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="#10b981"/></svg>
  ),
  statusWarning: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="#f59e0b"/></svg>
  ),
  statusDanger: (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="5" fill="#ef4444"/></svg>
  ),
}

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

  // Enhanced time slider with proper bounds checking
  const handleTimePositionDrag = useCallback((value: number) => {
    if (!optimizedData) return
    
    const totalDuration = optimizedData.metadata.duration
    const viewingDuration = timeWindowSize / zoomLevel
    
    // Constrain the position so the viewing window doesn't exceed the total duration
    const maxPosition = Math.max(0, totalDuration - viewingDuration)
    const constrainedPosition = Math.max(0, Math.min(maxPosition, value))
    
    setCurrentTimePosition(constrainedPosition)
  }, [optimizedData, timeWindowSize, zoomLevel])

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

  // Update timeline slider visual range - always show what's visible in chart
  useEffect(() => {
    if (optimizedData) {
      const effectiveWindow = getEffectiveTimeWindow()
      const viewingDuration = effectiveWindow.end - effectiveWindow.start
      const totalDuration = optimizedData.metadata.duration
      
      // Calculate position and width percentages for the visible range
      const positionPercent = (effectiveWindow.start / totalDuration) * 100
      const widthPercent = Math.min(100, (viewingDuration / totalDuration) * 100) // Cap at 100%
      
      // Update CSS custom properties on timeline container
      const timelineContainer = document.querySelector('.timeline-container') as HTMLElement
      if (timelineContainer) {
        timelineContainer.style.setProperty('--timeline-position', `${positionPercent}%`)
        timelineContainer.style.setProperty('--timeline-width', `${widthPercent}%`)
      }
      
      // Debug logging
      console.log('Timeline range update:', {
        effectiveWindow,
        positionPercent: positionPercent.toFixed(1),
        widthPercent: widthPercent.toFixed(1),
        zoomLevel,
        currentTimePosition
      })
    }
  }, [currentTimePosition, zoomLevel, optimizedData, getEffectiveTimeWindow])

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

  const exportFilteredData = useCallback(async () => {
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
  }, [filteredData, sessionName, showSuccess, showError, showInfo])

  // Enhanced keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when DataViewer is open and not in input fields
      if (event.target && (event.target as HTMLElement).tagName === 'INPUT') return

      const step = (timeWindowSize / zoomLevel) * 0.1
      const totalDuration = optimizedData?.metadata.duration || 30

      switch (event.key) {
        case 'Escape':
          onClose()
          break
        case 'ArrowLeft':
          event.preventDefault()
          setCurrentTimePosition(prev => Math.max(0, prev - step))
          break
        case 'ArrowRight': {
          event.preventDefault()
          const maxPos = Math.max(0, totalDuration - (timeWindowSize / zoomLevel))
          setCurrentTimePosition(prev => Math.min(maxPos, prev + step))
          break
        }
        case '+':
        case '=':
          event.preventDefault()
          setZoomLevel(prev => Math.min(10, prev * 1.5))
          break
        case '-':
          event.preventDefault()
          setZoomLevel(prev => Math.max(1, prev / 1.5))
          break
        case '0':
          event.preventDefault()
          setZoomLevel(1)
          setCurrentTimePosition(0)
          break
        case '1':
          event.preventDefault()
          // View all data
          setZoomLevel(1)
          setCurrentTimePosition(0)
          break
        case '2':
          event.preventDefault()
          // 30 second view
          if (totalDuration >= 30) {
            setZoomLevel(totalDuration / 30)
            setCurrentTimePosition(0)
          }
          break
        case '3':
          event.preventDefault()
          // 10 second view
          if (totalDuration >= 10) {
            setZoomLevel(totalDuration / 10)
            setCurrentTimePosition(0)
          }
          break
        case '4':
          event.preventDefault()
          // 5 second view
          if (totalDuration >= 5) {
            setZoomLevel(totalDuration / 5)
            setCurrentTimePosition(0)
          }
          break
        case '5':
          event.preventDefault()
          // 2 second view
          if (totalDuration >= 2) {
            setZoomLevel(totalDuration / 2)
            setCurrentTimePosition(0)
          }
          break
        case 's':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            exportFilteredData()
          }
          break
        case 'f':
          event.preventDefault()
          setZoomLevel(1)
          setCurrentTimePosition(0)
          setTimeRange(null)
          break
        case '?':
          event.preventDefault()
          showInfo('Keyboard Shortcuts:\n\n' +
            '1: View all data\n' +
            '2: 30 second view\n' +
            '3: 10 second view\n' +
            '4: 5 second view\n' +
            '5: 2 second view\n' +
            '← → Arrow keys: Navigate timeline\n' +
            '+ - : Zoom in/out\n' +
            '0 : Reset view\n' +
            'F : Fit all data\n' +
            'Ctrl+S : Export data\n' +
            'Esc : Close viewer')
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, optimizedData, timeWindowSize, zoomLevel, exportFilteredData, showInfo])

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
            <button className="btn-close" onClick={onClose} aria-label="Close data viewer" title="Close">{Icons.close}</button>
          </div>
          <div className="data-viewer-content">
            <div className="data-viewer-error">
              <h3><span aria-hidden="true">{Icons.error}</span> No Data Available</h3>
              <p>Session data could not be loaded.</p>
              <p className="error-details">{error}</p>
              <div className="button-group">
                <button onClick={reloadData} className="btn-primary"><span aria-hidden="true">{Icons.refresh}</span> Retry</button>
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
            <h3><span aria-hidden="true">{Icons.error}</span> No Data Available</h3>
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
        {/* Close button positioned at top right of modal */}
        <button className="btn-close" onClick={onClose} aria-label="Close data viewer" title="Close">{Icons.close}</button>
        
        {/* Header Section - Session Info */}
        <header className="data-viewer-header">
          <div className="header-content">
            <div className="session-info">
              <h1 className="session-title">
                <span className="session-icon" aria-hidden="true">{Icons.chart}</span>
                {sessionName}
              </h1>
              <div className="session-metadata">
                <span className="metadata-item">
                  <span className="metadata-icon" aria-hidden="true">{Icons.timer}</span>
                  {Math.round(optimizedData.metadata.duration)}s
                </span>
                <span className="metadata-separator">•</span>
                <span className="metadata-item">
                  <span className="metadata-icon" aria-hidden="true">{Icons.antenna}</span>
                  {Math.round(optimizedData.metadata.sample_rate * 10) / 10}Hz
                </span>
                <span className="metadata-separator">•</span>
                <span className="metadata-item">
                  <span className="metadata-icon" aria-hidden="true">{Icons.device}</span>
                  {optimizedData.metadata.devices.length} device{optimizedData.metadata.devices.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Toolbar Section - Actions & Controls */}
        <nav className="data-viewer-toolbar">
          <div className="toolbar-left">
            {/* Data Summary */}
            <div className="data-summary">
              <span className="summary-item">
                <span className="summary-label">Data Points:</span>
                <span className="summary-value">{chartData ? chartData.totalDataPoints.toLocaleString() : '0'}</span>
              </span>
              <span className="summary-separator">•</span>
              <span className="summary-item">
                <span className="summary-label">Data Types:</span>
                <span className="summary-value">{optimizedData ? optimizedData.metadata.data_types.length : 0}</span>
              </span>
            </div>
          </div>

          <div className="toolbar-right">
            {/* Enhanced Action Buttons */}
            <div className="action-buttons">
              {/* Quick Actions */}
              <div className="quick-actions">
                <button 
                  className="btn-action btn-fit" 
                  onClick={() => {
                    setZoomLevel(1)
                    setCurrentTimePosition(0)
                    setTimeRange(null)
                  }}
                  title="Fit all data to view"
                  aria-label="Fit all data"
                >
                  <span className="btn-icon" aria-hidden="true">{Icons.fit}</span>
                  <span className="btn-label">Fit All</span>
                </button>
                
                {selectionBox && (
                  <button 
                    className="btn-action btn-zoom-selection" 
                    onClick={() => {
                      if (selectionBox) {
                        const duration = selectionBox.end - selectionBox.start
                        const newZoom = Math.min(10, Math.max(1, (optimizedData?.metadata.duration || 10) / duration))
                        setZoomLevel(newZoom)
                        setCurrentTimePosition(selectionBox.start)
                      }
                    }}
                    title="Zoom to selected area"
                    aria-label="Zoom to selection"
                  >
                    <span className="btn-icon" aria-hidden="true">{Icons.chart}</span>
                    <span className="btn-label">Zoom to Selection</span>
                  </button>
                )}
              </div>

              {/* Primary Actions */}
              <div className="primary-actions">
                <button 
                  className="btn-action btn-export" 
                  onClick={exportFilteredData}
                  title="Export current data view to CSV"
                  aria-label="Export data"
                >
                  <span className="btn-icon" aria-hidden="true">{Icons.export}</span>
                  <span className="btn-label">Export Data</span>
                </button>
                
                <button 
                  className={`btn-action btn-settings ${showAdvancedSettings ? 'active' : ''}`}
                  onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                  title={showAdvancedSettings ? 'Hide performance settings' : 'Show performance settings'}
                  aria-label={showAdvancedSettings ? 'Hide settings' : 'Show settings'}
                >
                  <span className="btn-icon" aria-hidden="true">{Icons.settings}</span>
                  <span className="btn-label">Settings</span>
                  <span className={`settings-chevron ${showAdvancedSettings ? 'expanded' : ''}`} aria-hidden="true">{Icons.chevronDown}</span>
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Enhanced Advanced Settings Panel */}
        {showAdvancedSettings && (
          <section className="settings-panel enhanced" role="region" aria-label="Advanced settings">
            <div className="settings-container">
              {/* Performance Settings */}
              <div className="settings-card">
                <h3 className="settings-title">
                  <span className="settings-icon" aria-hidden="true">{Icons.chart}</span>
                  Performance & Rendering
                  <div className="performance-indicator">
                    <div className={`performance-status ${chartData && chartData.totalDataPoints > 5000 ? 'warning' : 'good'}`}>
                      {chartData && chartData.totalDataPoints > 10000 ? '🔴' : 
                       chartData && chartData.totalDataPoints > 5000 ? '🟡' : '🟢'}
                      <span className="performance-text">
                        {chartData && chartData.totalDataPoints > 10000 ? 'High Load' : 
                         chartData && chartData.totalDataPoints > 5000 ? 'Moderate Load' : 'Optimal'}
                      </span>
                    </div>
                  </div>
                </h3>
                <div className="settings-grid">
                  <div className="setting-group">
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
                        <span className="setting-text">Smart Data Downsampling</span>
                        <span className="setting-badge">Recommended</span>
                      </label>
                      <p id="downsampling-help" className="setting-help">
                        📈 Automatically reduces data points for better performance while preserving important features
                      </p>
                    </div>
                  </div>
                  
                  <div className="setting-group">
                    <div className="setting-item">
                      <label htmlFor="maxDataPoints" className="setting-label-text">
                        Data Point Limit
                        <span className="current-count">
                          ({chartData ? chartData.totalDataPoints.toLocaleString() : '0'} current)
                        </span>
                      </label>
                      <div className="range-input-group">
                        <input
                          id="maxDataPoints"
                          type="range"
                          min="1000"
                          max="50000"
                          step="1000"
                          value={maxDataPoints}
                          onChange={(e) => setMaxDataPoints(parseInt(e.target.value))}
                          className="range-input"
                          aria-describedby="max-points-help"
                        />
                        <div className="range-labels">
                          <span>1K</span>
                          <span className="range-current">{(maxDataPoints / 1000).toFixed(0)}K</span>
                          <span>50K</span>
                        </div>
                      </div>
                      <p id="max-points-help" className="setting-help">
                        🎯 Balance between detail and performance. Higher values show more detail but may reduce responsiveness.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Display Settings */}
              <div className="settings-card">
                <h3 className="settings-title">
                  <span className="settings-icon" aria-hidden="true">{Icons.settings}</span>
                  Display Options
                </h3>
                <div className="settings-grid">
                  <div className="setting-group">
                    <div className="setting-item">
                      <label className="setting-label">
                        <input
                          type="checkbox"
                          className="setting-checkbox"
                          checked={!enableAnimations}
                          onChange={() => {
                            // Note: enableAnimations is currently read-only, but we can show the UI
                          }}
                          disabled
                          aria-describedby="animations-help"
                        />
                        <span className="checkbox-custom"></span>
                        <span className="setting-text">Disable Animations</span>
                        <span className="setting-badge disabled">Auto</span>
                      </label>
                      <p id="animations-help" className="setting-help">
                        🚀 Animations are automatically disabled for better performance with large datasets
                      </p>
                    </div>
                  </div>

                  <div className="setting-group">
                    <div className="setting-item">
                      <label htmlFor="timeWindowSize" className="setting-label-text">
                        Default Time Window
                      </label>
                      <div className="range-input-group">
                        <input
                          id="timeWindowSize"
                          type="range"
                          min="1"
                          max="60"
                          step="1"
                          value={timeWindowSize}
                          onChange={(e) => setTimeWindowSize(parseInt(e.target.value))}
                          className="range-input"
                          aria-describedby="time-window-help"
                        />
                        <div className="range-labels">
                          <span>1s</span>
                          <span className="range-current">{timeWindowSize}s</span>
                          <span>60s</span>
                        </div>
                      </div>
                      <p id="time-window-help" className="setting-help">
                        <span aria-hidden="true">{Icons.timer}</span> Default viewing window when zooming. Smaller values show more detail.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Main Content Area */}
        <main className="data-viewer-content" role="main">
          <div className="chart-section">
            {chartData ? (
              <div className="chart-wrapper">
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
                          <p><span aria-hidden="true">{Icons.error}</span> Error rendering chart. Please try refreshing the data.</p>
                          <button onClick={reloadData} className="btn-secondary">
                            <span aria-hidden="true">{Icons.refresh}</span> Reload Data
                          </button>
                        </div>
                      )
                    }
                  })()}
                </div>

                {/* Simplified Chart Controls */}
                {optimizedData && (
                  <div className="chart-controls">
                    {/* Timeline Slider - Redesigned for better functionality */}
                    <div className="timeline-row" onWheel={(e) => {
                      // Hold Shift to pan horizontally; or use horizontal wheel deltaX
                      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0)
                      if (!delta || !optimizedData) return
                      e.preventDefault()
                      const view = timeWindowSize / zoomLevel
                      const step = Math.max(0.1, view * 0.02)
                      const dir = delta > 0 ? 1 : -1
                      const total = optimizedData.metadata.duration
                      const maxPos = Math.max(0, total - view)
                      setCurrentTimePosition(prev => Math.max(0, Math.min(maxPos, prev + dir * step)))
                    }}>
                      <span className="time-marker start">0s</span>
                      <div className="timeline-container">
                        <div className="timeline-background" />
                        <div className="timeline-visible-range" />
                        <input
                          type="range"
                          min="0"
                          max={optimizedData?.metadata.duration || 100}
                          step="0.01"
                          value={currentTimePosition}
                          onChange={(e) => {
                            const newValue = parseFloat(e.target.value)
                            handleTimePositionDrag(newValue)
                          }}
                          onInput={(e) => {
                            const newValue = parseFloat((e.target as HTMLInputElement).value)
                            handleTimePositionDrag(newValue)
                          }}
                          className="timeline-slider"
                          aria-label="Timeline position"
                          onKeyDown={(e) => {
                            if (!optimizedData) return
                            const view = timeWindowSize / zoomLevel
                            const step = Math.max(0.1, view * 0.02)
                            if (e.key === 'ArrowLeft') {
                              e.preventDefault()
                              setCurrentTimePosition(prev => Math.max(0, prev - step))
                            } else if (e.key === 'ArrowRight') {
                              e.preventDefault()
                              const maxPos = Math.max(0, optimizedData.metadata.duration - view)
                              setCurrentTimePosition(prev => Math.min(maxPos, prev + step))
                            }
                          }}
                        />
                      </div>
                      <span className="time-marker end">{optimizedData?.metadata.duration.toFixed(1) || '0.0'}s</span>
                      <div className="range-info">
                        {(() => {
                          const effectiveWindow = getEffectiveTimeWindow()
                          return `${effectiveWindow.start.toFixed(1)}s - ${effectiveWindow.end.toFixed(1)}s`
                        })()}
                      </div>
                    </div>

                    {/* Enhanced Main Controls */}
                    <div className="controls-row">
                      {/* Enhanced Zoom Controls with Presets */}
                      <div className="zoom-group">
                        <span className="control-label"><span aria-hidden="true">{Icons.zoom}</span> Zoom</span>
                        
                        {/* Time Span Presets */}
                        <div className="zoom-presets">
                          { [
                            { span: null, label: 'All', isAll: true },
                            { span: 30, label: '30s' },
                            { span: 10, label: '10s' },
                            { span: 5, label: '5s' },
                            { span: 2, label: '2s' }
                          ].map(preset => {
                            const totalDuration = optimizedData?.metadata.duration || 30
                            let isActive: boolean
                            let requiredZoom: number

                            if (preset.isAll) {
                              // 'All' corresponds to a zoom level of 1, showing the base `timeWindowSize`
                              requiredZoom = 1
                              isActive = Math.abs(zoomLevel - requiredZoom) < 0.01
                            } else if (preset.span != null) {
                              // The required zoom to achieve the target span
                              requiredZoom = timeWindowSize / preset.span
                              isActive = Math.abs(zoomLevel - requiredZoom) < 0.01
                            } else {
                              requiredZoom = 1
                              isActive = Math.abs(zoomLevel - 1) < 0.01
                            }
                            
                            const spanValue = preset.span ?? undefined
                            return (
                              <button
                                key={preset.label}
                                onClick={() => {
                                  if (preset.isAll) {
                                    setZoomLevel(1)
                                    setCurrentTimePosition(0)
                                  } else if (spanValue) {
                                    // Calculate zoom based on the desired span vs the base window size
                                    const newZoom = timeWindowSize / spanValue
                                    setZoomLevel(Math.min(10, Math.max(1, newZoom)))
                                    setCurrentTimePosition(0)
                                  }
                                }}
                                className={`btn-zoom-preset ${isActive ? 'active' : ''} ${preset.isAll ? 'all-data' : ''}`}
                                disabled={!preset.isAll && !!spanValue && spanValue > totalDuration}
                                title={preset.isAll ? 'View all data' : spanValue ? `View ${spanValue} second window` : 'View all data'}
                                aria-label={preset.isAll ? 'Fit all data' : spanValue ? `Set view to ${spanValue} seconds` : 'Fit all data'}
                              >
                                {preset.label}
                              </button>
                            )
                          })}
                        </div>

                        {/* Fine Zoom Controls */}
                        <div className="zoom-fine-controls">
                          <button 
                            onClick={() => handleZoomChange('out')}
                            className="btn-zoom btn-zoom-out"
                            disabled={zoomLevel <= 1.0}
                            title="Zoom out (-)"
                            aria-label="Zoom out"
                          >
                            <span className="zoom-icon">−</span>
                          </button>
                          <div className="zoom-display-enhanced">
                            <span className="zoom-current">{(zoomLevel).toFixed(1)}×</span>
                            <div className="zoom-indicator">
                              <div 
                                className="zoom-level-bar" 
                                data-zoom-level={Math.min((zoomLevel / 10) * 100, 100)}
                              />
                            </div>
                          </div>
                          <button 
                            onClick={() => handleZoomChange('in')}
                            className="btn-zoom btn-zoom-in"
                            disabled={zoomLevel >= 10.0}
                            title="Zoom in (+)"
                            aria-label="Zoom in"
                          >
                            <span className="zoom-icon">+</span>
                          </button>
                          <button 
                            onClick={() => handleZoomChange('reset')}
                            className="btn-zoom btn-reset"
                            title="Reset view (Fit all data)"
                            aria-label="Reset zoom and position"
                          >
                            <span className="reset-icon" aria-hidden="true">{Icons.home}</span>
                          </button>
                        </div>
                      </div>

                      {/* Enhanced Time Info with Navigation */}
                      <div className="time-info-enhanced">
                        <div className="time-navigation">
                          <button
                            onClick={() => {
                              const step = (timeWindowSize / zoomLevel) * 0.1
                              setCurrentTimePosition(Math.max(0, currentTimePosition - step))
                            }}
                            className="btn-time-nav"
                            disabled={currentTimePosition <= 0}
                            title="Jump backward"
                          >
                            <span aria-hidden="true">{Icons.stepBack}</span>
                          </button>
                          <button
                            onClick={() => {
                              const step = (timeWindowSize / zoomLevel) * 0.1
                              const maxPos = Math.max(0, (optimizedData?.metadata.duration || 0) - (timeWindowSize / zoomLevel))
                              setCurrentTimePosition(Math.min(maxPos, currentTimePosition + step))
                            }}
                            className="btn-time-nav"
                            disabled={(() => {
                              const maxPos = Math.max(0, (optimizedData?.metadata.duration || 0) - (timeWindowSize / zoomLevel))
                              return currentTimePosition >= maxPos
                            })()}
                            title="Jump forward"
                          >
                            <span aria-hidden="true">{Icons.stepForward}</span>
                          </button>
                        </div>
                        
                        <div className="time-display">
                          <span className="info-label" aria-hidden="true">{Icons.chart}</span>
                          <span className="info-value">{(() => {
                            const effectiveWindow = getEffectiveTimeWindow()
                            const viewingDuration = effectiveWindow.end - effectiveWindow.start
                            const percentage = ((viewingDuration / optimizedData.metadata.duration) * 100).toFixed(1)
                            return `${viewingDuration.toFixed(1)}s (${percentage}%)`
                          })()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Selection Info */}
                    {selectionBox && (
                      <div className="selection-info">
                        <span className="selection-text">
                          Selection: {selectionBox.start.toFixed(2)}s - {selectionBox.end.toFixed(2)}s
                        </span>
                        <button onClick={clearSelection} className="btn-clear-selection">
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="empty-chart-state">
                  <div className="empty-state-icon">📊</div>
                  <h3 className="empty-state-title">No Chart Data Available</h3>
                  <p className="empty-state-message">Unable to display chart visualization for this session.</p>
                </div>
                
                {/* Show controls even when chart data isn't ready */}
                {optimizedData && (
                  <div className="chart-controls">
                  {/* Timeline Slider - Redesigned for better functionality */}
                  <div className="timeline-row" onWheel={(e) => {
                    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : (e.shiftKey ? e.deltaY : 0)
                    if (!delta || !optimizedData) return
                    e.preventDefault()
                    const view = timeWindowSize / zoomLevel
                    const step = Math.max(0.1, view * 0.02)
                    const dir = delta > 0 ? 1 : -1
                    const total = optimizedData.metadata.duration
                    const maxPos = Math.max(0, total - view)
                    setCurrentTimePosition(prev => Math.max(0, Math.min(maxPos, prev + dir * step)))
                  }}>
                    <span className="time-marker start">0s</span>
                    <div className="timeline-container">
                      <div className="timeline-background" />
                      <div className="timeline-visible-range" />
                      <input
                        type="range"
                        min="0"
                        max={optimizedData?.metadata.duration || 100}
                        step="0.01"
                        value={currentTimePosition}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value)
                          handleTimePositionDrag(newValue)
                        }}
                        onInput={(e) => {
                          const newValue = parseFloat((e.target as HTMLInputElement).value)
                          handleTimePositionDrag(newValue)
                        }}
                        className="timeline-slider"
                        aria-label="Timeline position"
                        onKeyDown={(e) => {
                          if (!optimizedData) return
                          const view = timeWindowSize / zoomLevel
                          const step = Math.max(0.1, view * 0.02)
                          if (e.key === 'ArrowLeft') {
                            e.preventDefault()
                            setCurrentTimePosition(prev => Math.max(0, prev - step))
                          } else if (e.key === 'ArrowRight') {
                            e.preventDefault()
                            const maxPos = Math.max(0, optimizedData.metadata.duration - view)
                            setCurrentTimePosition(prev => Math.min(maxPos, prev + step))
                          }
                        }}
                      />
                    </div>
                    <span className="time-marker end">{optimizedData?.metadata.duration.toFixed(1) || '0.0'}s</span>
                    <div className="range-info">
                      {(() => {
                        const effectiveWindow = getEffectiveTimeWindow()
                        return `${effectiveWindow.start.toFixed(1)}s - ${effectiveWindow.end.toFixed(1)}s`
                      })()}
                    </div>
                  </div>

                  {/* Enhanced Main Controls */}
                  <div className="controls-row">
                    {/* Enhanced Zoom Controls with Presets */}
                    <div className="zoom-group">
                      <span className="control-label"><span aria-hidden="true">{Icons.zoom}</span> Zoom</span>
                      <div className="zoom-presets">
                        { [
                          { span: null, label: 'All', isAll: true },
                          { span: 30, label: '30s' },
                          { span: 10, label: '10s' },
                          { span: 5, label: '5s' },
                          { span: 2, label: '2s' }
                        ].map(preset => {
                          const totalDuration = optimizedData?.metadata.duration || 30
                          let isActive: boolean
                          let requiredZoom: number
                          if (preset.isAll) {
                            isActive = Math.abs(zoomLevel - 1) < 0.1
                            requiredZoom = 1
                          } else if (preset.span != null) {
                            requiredZoom = totalDuration / preset.span
                            isActive = Math.abs(zoomLevel - requiredZoom) < 0.1
                          } else {
                            requiredZoom = 1
                            isActive = Math.abs(zoomLevel - 1) < 0.1
                          }
                          const spanValue = preset.span ?? undefined
                          return (
                            <button
                              key={preset.label}
                              onClick={() => {
                                if (preset.isAll) {
                                  setZoomLevel(1)
                                  setCurrentTimePosition(0)
                                } else if (spanValue) {
                                  const newZoom = Math.min(10, Math.max(1, totalDuration / spanValue))
                                  setZoomLevel(newZoom)
                                  setCurrentTimePosition(0)
                                }
                              }}
                              className={`btn-zoom-preset ${isActive ? 'active' : ''} ${preset.isAll ? 'all-data' : ''}`}
                              disabled={!preset.isAll && !!spanValue && spanValue > totalDuration}
                              title={preset.isAll ? 'View all data' : spanValue ? `View ${spanValue} second window` : 'View all data'}
                              aria-label={preset.isAll ? 'Fit all data' : spanValue ? `Set view to ${spanValue} seconds` : 'Fit all data'}
                            >
                              {preset.label}
                            </button>
                          )
                        })}
                      </div>

                      {/* Fine Zoom Controls */}
                      <div className="zoom-fine-controls">
                        <button 
                          onClick={() => handleZoomChange('out')}
                          className="btn-zoom btn-zoom-out"
                          disabled={zoomLevel <= 1.0}
                          title="Zoom out (-)"
                          aria-label="Zoom out"
                        >
                          <span className="zoom-icon">−</span>
                        </button>
                        <div className="zoom-display-enhanced">
                          <span className="zoom-current">{(zoomLevel).toFixed(1)}×</span>
                          <div className="zoom-indicator">
                            <div 
                              className="zoom-level-bar" 
                              data-zoom-level={Math.min((zoomLevel / 10) * 100, 100)}
                            />
                          </div>
                        </div>
                        <button 
                          onClick={() => handleZoomChange('in')}
                          className="btn-zoom btn-zoom-in"
                          disabled={zoomLevel >= 10.0}
                          title="Zoom in (+)"
                          aria-label="Zoom in"
                        >
                          <span className="zoom-icon">+</span>
                        </button>
                        <button 
                          onClick={() => handleZoomChange('reset')}
                          className="btn-zoom btn-reset"
                          title="Reset view (Fit all data)"
                          aria-label="Reset zoom and position"
                        >
                          <span className="reset-icon" aria-hidden="true">{Icons.home}</span>
                        </button>
                      </div>
                    </div>

                    {/* Enhanced Time Info with Navigation */}
                    <div className="time-info-enhanced">
                      <div className="time-navigation">
                        <button
                          onClick={() => {
                            const step = (timeWindowSize / zoomLevel) * 0.1
                            setCurrentTimePosition(Math.max(0, currentTimePosition - step))
                          }}
                          className="btn-time-nav"
                          disabled={currentTimePosition <= 0}
                          title="Jump backward"
                        >
                          <span aria-hidden="true">{Icons.stepBack}</span>
                        </button>
                        <button
                          onClick={() => {
                            const step = (timeWindowSize / zoomLevel) * 0.1
                            const maxPos = Math.max(0, (optimizedData?.metadata.duration || 0) - (timeWindowSize / zoomLevel))
                            setCurrentTimePosition(Math.min(maxPos, currentTimePosition + step))
                          }}
                          className="btn-time-nav"
                          disabled={(() => {
                            const maxPos = Math.max(0, (optimizedData?.metadata.duration || 0) - (timeWindowSize / zoomLevel))
                            return currentTimePosition >= maxPos
                          })()}
                          title="Jump forward"
                        >
                          <span aria-hidden="true">{Icons.stepForward}</span>
                        </button>
                      </div>
                      
                      <div className="time-display">
                        <span className="info-label" aria-hidden="true">{Icons.chart}</span>
                        <span className="info-value">{(() => {
                          const effectiveWindow = getEffectiveTimeWindow()
                          const viewingDuration = effectiveWindow.end - effectiveWindow.start
                          const percentage = ((viewingDuration / optimizedData.metadata.duration) * 100).toFixed(1)
                          return `${viewingDuration.toFixed(1)}s (${percentage}%)`
                        })()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Selection Info */}
                  {selectionBox && (
                    <div className="selection-info">
                      <span className="selection-text">
                        Selection: {selectionBox.start.toFixed(2)}s - {selectionBox.end.toFixed(2)}s
                      </span>
                      <button onClick={clearSelection} className="btn-clear-selection">
                        Clear
                      </button>
                    </div>
                  )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
