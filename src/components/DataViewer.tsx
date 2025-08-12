import { useState, useEffect, useCallback, useMemo } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Line } from 'react-chartjs-2'
import { Chart } from 'chart.js'
import { registerChartComponents } from '../utils/chartSetup'
import { Icon } from './icons'
import { config } from '../config'
import {
  generateMultiDeviceColors,
  getDeviceLabel,
  type ChannelType,
} from '../utils/colorGeneration'
import { useTimestampManager } from '../hooks/useTimestampManager'
import { useToast } from '../contexts/ToastContext'
import { protectedOperations } from '../services/csrfProtection'

// Chart.js components registration
registerChartComponents()

interface DataViewerProps {
  sessionId: string
  sessionName: string
  onClose: () => void
}

interface ChartPoint {
  x: number
  y: number
}

interface OptimizedChartData {
  datasets: Record<string, Record<string, ChartPoint[]>> // device -> dataType -> points
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

  const [timeWindowSize, setTimeWindowSize] = useState<number>(10) // seconds - base window size
  const [currentTimePosition, setCurrentTimePosition] = useState<number>(0) // start position in seconds
  const [zoomLevel, setZoomLevel] = useState<number>(1) // 1x to 10x zoom
  const [selectionBox, setSelectionBox] = useState<{ start: number; end: number } | null>(null)

  const [maxDataPoints, setMaxDataPoints] = useState<number>(10000) // Default max points per dataset
  const [useDownsampling, setUseDownsampling] = useState<boolean>(true)
  const [enableAnimations] = useState<boolean>(false) // Disabled by default for performance
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false)

  const [deviceColors, setDeviceColors] = useState<
    Map<
      string,
      Record<string, { primary: string; light: string; dark: string; background: string }>
    >
  >(new Map())

  const { getChartTimestamp } = useTimestampManager({
    useRelativeTime: true, // Match LiveChart configuration
  })
  const { showError, showInfo, showSuccess } = useToast()

  const getEffectiveTimeWindow = useCallback(() => {
    if (!optimizedData) return { start: 0, end: timeWindowSize }

    const dataDuration = optimizedData.metadata.duration
    const adjustedWindowSize = Math.min(timeWindowSize / zoomLevel, dataDuration)
    const maxStartPosition = Math.max(0, dataDuration - adjustedWindowSize)
    const safeStartPosition = Math.min(currentTimePosition, maxStartPosition)

    return {
      start: safeStartPosition,
      end: Math.min(safeStartPosition + adjustedWindowSize, dataDuration),
    }
  }, [currentTimePosition, timeWindowSize, zoomLevel, optimizedData])

  const handleTimePositionDrag = useCallback(
    (value: number) => {
      if (!optimizedData) return

      const totalDuration = optimizedData.metadata.duration
      const viewingDuration = timeWindowSize / zoomLevel

      // Constrain the position so the viewing window doesn't exceed the total duration
      const maxPosition = Math.max(0, totalDuration - viewingDuration)
      const constrainedPosition = Math.max(0, Math.min(maxPosition, value))

      setCurrentTimePosition(constrainedPosition)
    },
    [optimizedData, timeWindowSize, zoomLevel],
  )

  const handleZoomChange = useCallback(
    (direction: 'in' | 'out' | 'reset') => {
      if (direction === 'reset') {
        setZoomLevel(1)
        setCurrentTimePosition(0)
        setTimeRange(null)
      } else if (direction === 'in') {
        const newZoom = Math.min(10.0, zoomLevel * 1.5)
        setZoomLevel(newZoom)
        // Adjust position to keep current view centered
        if (optimizedData) {
          const currentViewCenter = currentTimePosition + timeWindowSize / zoomLevel / 2
          const newViewDuration = timeWindowSize / newZoom
          const newPosition = Math.max(
            0,
            Math.min(
              optimizedData.metadata.duration - newViewDuration,
              currentViewCenter - newViewDuration / 2,
            ),
          )
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
    },
    [zoomLevel, currentTimePosition, timeWindowSize, optimizedData],
  )

  const clearSelection = useCallback(() => {
    setSelectionBox(null)
    setTimeRange(null)
    setCurrentTimePosition(0)
    setZoomLevel(1)
  }, [])

  const handleDownsamplingChange = useCallback((enabled: boolean) => {
    setUseDownsampling(enabled)
    console.log(`Downsampling ${enabled ? 'enabled' : 'disabled'}`)
  }, [])

  const handleMaxDataPointsChange = useCallback((value: number) => {
    setMaxDataPoints(value)
    console.log(`Max data points changed to: ${value}`)
  }, [])

  const handleSettingsToggle = useCallback(() => {
    setShowAdvancedSettings((prev) => !prev)
  }, [])

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
      const nextBucketPoint =
        i < maxPoints - 2 ? points[Math.floor((i + 1) * bucketSize + 1)] : points[points.length - 1]

      for (let j = bucketStart; j < Math.min(bucketEnd, points.length - 1); j++) {
        const area = Math.abs(
          (prevPoint.x - nextBucketPoint.x) * (points[j].y - prevPoint.y) -
            (prevPoint.x - points[j].x) * (nextBucketPoint.y - prevPoint.y),
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

      // Always load full data initially; apply downsampling client-side
      console.log(`[DataViewer] Loading session data for ${sessionId}`)

      // Load all data, filter client side
      const data: OptimizedChartData = await invoke('load_optimized_chart_data', {
        sessionId,
        selectedDevices: [], // Load all devices (empty array = all devices)
        selectedDataTypes: [], // Load all data types (empty array = all data types)
        startTime: null,
        endTime: null,
        maxPointsPerDataset: null, // Load full data, apply downsampling in chartData memoization
      })

      setOptimizedData(data)

      // Initialize window size based on data duration
      const dataDuration = data.metadata.duration
      if (dataDuration <= 30) {
        // For short sessions, show all data by default
        setTimeWindowSize(Math.ceil(dataDuration))
      } else {
        // For longer sessions, start with a reasonable window
        setTimeWindowSize(Math.min(30, Math.ceil(dataDuration / 3)))
      }

      const devices = data.metadata.devices
      const dataTypes = data.metadata.data_types

      const totalPoints = Object.values(data.datasets)
        .flatMap((deviceData) => Object.values(deviceData))
        .reduce((sum, points) => sum + points.length, 0)

      console.log(
        `[DataViewer] Loaded ${totalPoints.toLocaleString()} total data points across ${devices.length} devices and ${dataTypes.length} data types`,
      )

      // Generate device colors
      if (devices.length > 0) {
        const deviceColorPalettes = generateMultiDeviceColors(devices)
        const colorMap = new Map<
          string,
          Record<string, { primary: string; light: string; dark: string; background: string }>
        >()

        devices.forEach((device) => {
          const palette = deviceColorPalettes.get(device)!
          const dataTypeColors: Record<
            string,
            { primary: string; light: string; dark: string; background: string }
          > = {}

          dataTypes.forEach((dataType, index) => {
            const channelMapping: Record<string, ChannelType> = {
              r1: 'R1',
              r2: 'R2',
              r3: 'R3',
              x: 'X',
              y: 'Y',
              z: 'Z',
              R1: 'R1',
              R2: 'R2',
              R3: 'R3',
              X: 'X',
              Y: 'Y',
              Z: 'Z',
            }

            const channel =
              channelMapping[dataType] ||
              (['R1', 'R2', 'R3', 'X', 'Y', 'Z'] as ChannelType[])[index % 6]
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
  }, [sessionId, showError]) // Only essential dependencies to prevent unnecessary reloads

  useEffect(() => {
    loadSessionData()
  }, [loadSessionData])

  useEffect(() => {
    if (optimizedData && (zoomLevel !== 1 || currentTimePosition !== 0)) {
      const effectiveWindow = getEffectiveTimeWindow()
      setTimeRange(effectiveWindow)
      console.log(
        `Time range updated: ${effectiveWindow.start.toFixed(2)}s - ${effectiveWindow.end.toFixed(2)}s (zoom: ${zoomLevel}x)`,
      )
    } else if (zoomLevel === 1 && currentTimePosition === 0) {
      setTimeRange(null) // Show all data when not zoomed
    }
  }, [zoomLevel, currentTimePosition, optimizedData, getEffectiveTimeWindow])

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
        currentTimePosition,
      })
    }
  }, [currentTimePosition, zoomLevel, optimizedData, getEffectiveTimeWindow])

  useEffect(() => {
    return () => {
      // Clean up any chart instances when component unmounts
      try {
        const container = document.getElementById('data-viewer-chart')
        if (container) {
          const canvases = container.querySelectorAll('canvas')
          canvases.forEach((canvas) => {
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

  const getDeviceColor = useCallback(
    (device: string, dataType: string, alpha: number = 1): string => {
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
        a = (a << 5) - a + b.charCodeAt(0)
        return a & a
      }, 0)

      const lightness = 40 + (Math.abs(hash) % 30) // 40-70% lightness for variety
      return `hsl(0, 0%, ${lightness}%, ${alpha})` // Neutral gray
    },
    [deviceColors],
  )

  const filteredData = useMemo((): FilteredDataPoint[] => {
    if (!optimizedData) return []

    const filtered: FilteredDataPoint[] = []

    for (const [device, deviceData] of Object.entries(optimizedData.datasets)) {
      for (const [dataType, points] of Object.entries(deviceData)) {
        for (const point of points) {
          const convertedTimestamp = getChartTimestamp(point.x)
          const timeMatch =
            !timeRange ||
            (convertedTimestamp >= timeRange.start && convertedTimestamp <= timeRange.end)

          if (timeMatch) {
            filtered.push({
              device_id: device,
              data_type: dataType,
              timestamp: convertedTimestamp,
              value: point.y,
              unit: '',
            })
          }
        }
      }
    }
    if (timeRange) {
      console.log(
        `[Filter] Time filtering: range=[${timeRange.start.toFixed(2)}s, ${timeRange.end.toFixed(2)}s], filtered=${filtered.length} points`,
      )
    } else {
      console.log(`[Filter] No time filtering: showing all ${filtered.length} points`)
    }

    return filtered
  }, [optimizedData, timeRange, getChartTimestamp])

  const chartData = useMemo(() => {
    console.log('[Chart] Data recalculation triggered')

    if (!optimizedData || deviceColors.size === 0) return null

    const datasets = []
    let totalDataPoints = 0

    for (const [device, deviceData] of Object.entries(optimizedData.datasets)) {
      for (const [dataType, points] of Object.entries(deviceData)) {
        const deviceLabel = getDeviceLabel(device)

        const processedPoints = points.map((point: ChartPoint) => ({
          ...point,
          x: getChartTimestamp(point.x), // Convert milliseconds to relative seconds
        }))

        const filteredPoints = timeRange
          ? processedPoints.filter((point: ChartPoint) => {
              const inRange = point.x >= timeRange.start && point.x <= timeRange.end
              return inRange
            })
          : processedPoints

  if (filteredPoints.length > 0) {
          
          let validDataPoints = filteredPoints.filter(
            (point) =>
              point &&
              typeof point.x === 'number' &&
              typeof point.y === 'number' &&
              !isNaN(point.x) &&
              !isNaN(point.y),
          )
          
          const deviceCount = Object.keys(optimizedData.datasets).length
          const dataTypeCount = Object.keys(deviceData).length
          if (
            useDownsampling &&
            validDataPoints.length > maxDataPoints / deviceCount / dataTypeCount
          ) {
            const targetPoints = Math.max(
              50,
              Math.floor(maxDataPoints / deviceCount / dataTypeCount),
            )
            validDataPoints = downsampleData(validDataPoints, targetPoints)
            console.log(
              `Client-side downsampled ${device}-${dataType}: ${filteredPoints.length} → ${validDataPoints.length} points`,
            )
          }

          if (validDataPoints.length > 0) {
            totalDataPoints += validDataPoints.length
            
            const pointCount = validDataPoints.length
            const pointRadius = pointCount > 2000 ? 0 : pointCount > 1000 ? 0.5 : 1
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
              spanGaps: false,
              pointHoverRadius: hoverRadius,
              pointHitRadius: hitRadius,
            })
          }
        }
      }
    }

    if (totalDataPoints > 0) {
      console.log(`Chart prepared with ${totalDataPoints} total data points across ${datasets.length} datasets`)
      if (totalDataPoints > maxDataPoints) {
        console.warn(
          `High data point count (${totalDataPoints}) may impact performance. Consider enabling downsampling.`,
        )
      }
    }

    return { datasets, totalDataPoints }
  }, [
    optimizedData,
    getDeviceColor,
    deviceColors,
    timeRange,
    useDownsampling,
    maxDataPoints,
    downsampleData,
    getChartTimestamp,
  ])

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
            point.unit,
          ].join(',')
        }),
      ].join('\n')

      const fileName = `${sessionName}_filtered_${new Date().toISOString().split('T')[0]}.csv`

      // Save filtered data to app data directory using CSRF protection
      const savedPath = (await protectedOperations.saveFilteredData(fileName, csvContent)) as string

      // Then copy it to Downloads folder using CSRF protection
      try {
        const result = await protectedOperations.copyFileToDownloads(savedPath, fileName)

        showSuccess(
          'File Exported Successfully',
          `Filtered data exported to Downloads folder: ${result}`,
        )
      } catch {
        // If copy fails, at least show where the file was saved
        showInfo(
          'Export Completed - Manual Copy Available',
          `Filtered data saved to: ${savedPath}\n\nNote: You can manually copy this file to your desired location.`,
        )
      }
    } catch (err) {
      console.error('Failed to export filtered data:', err)
      showError('Export Failed', `Failed to export filtered data: ${err}`)
    }
  }, [filteredData, sessionName, showSuccess, showError, showInfo])

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
          setCurrentTimePosition((prev) => Math.max(0, prev - step))
          break
        case 'ArrowRight': {
          event.preventDefault()
          const maxPos = Math.max(0, totalDuration - timeWindowSize / zoomLevel)
          setCurrentTimePosition((prev) => Math.min(maxPos, prev + step))
          break
        }
        case '+':
        case '=':
          event.preventDefault()
          setZoomLevel((prev) => Math.min(10, prev * 1.5))
          break
        case '-':
          event.preventDefault()
          setZoomLevel((prev) => Math.max(1, prev / 1.5))
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
          showInfo(
            'Keyboard Shortcuts:\n\n' +
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
              'Esc : Close viewer',
          )
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
            <button
              className="btn-close"
              onClick={onClose}
              aria-label="Close data viewer"
              title="Close"
            >
              <Icon.Close />
            </button>
          </div>
          <div className="data-viewer-content">
            <div className="data-viewer-error">
              <h3>
                <span aria-hidden="true">
                  <Icon.Warning />
                </span>{' '}
                No Data Available
              </h3>
              <p>Session data could not be loaded.</p>
              <p className="error-details">{error}</p>
              <div className="button-group">
                <button onClick={reloadData} className="btn-primary">
                  <span aria-hidden="true">
                    <Icon.Refresh />
                  </span>{' '}
                  Retry
                </button>
                <button onClick={onClose} className="btn-secondary">
                  Close
                </button>
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
            <h3>
              <span aria-hidden="true">
                <Icon.Warning />
              </span>{' '}
              No Data Available
            </h3>
            <p>Session data could not be loaded.</p>
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="data-viewer-overlay">
      <div className="data-viewer-modal">
        {/* Close button */}
        <button
          className="btn-close"
          onClick={onClose}
          aria-label="Close data viewer"
          title="Close"
        >
          <Icon.Close />
        </button>

        <header className="data-viewer-header">
          <div className="header-content">
            <div className="session-info">
              <h1 className="session-title">
                <span className="session-icon" aria-hidden="true">
                  <Icon.Chart />
                </span>
                {sessionName}
              </h1>
              <div className="session-metadata">
                <span className="metadata-item">
                  <span className="metadata-icon" aria-hidden="true">
                    <Icon.Clock />
                  </span>
                  {Math.round(optimizedData.metadata.duration)}s
                </span>
                <span className="metadata-separator" aria-hidden="true">
                  •
                </span>
                <span className="metadata-item">
                  <span className="metadata-icon" aria-hidden="true">
                    <Icon.Antenna />
                  </span>
                  {Math.round(optimizedData.metadata.sample_rate * 10) / 10}Hz
                </span>
                <span className="metadata-separator" aria-hidden="true">
                  •
                </span>
                <span className="metadata-item">
                  <span className="metadata-icon" aria-hidden="true">
                    <Icon.Device />
                  </span>
                  {optimizedData.metadata.devices.length} device
                  {optimizedData.metadata.devices.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </header>

        <nav className="data-viewer-toolbar">
          <div className="toolbar-left">
            <div className="data-summary">
              <span className="summary-item">
                <span className="summary-label">Data Points:</span>
                <span className="summary-value">
                  {chartData ? chartData.totalDataPoints.toLocaleString() : '0'}
                </span>
              </span>
              <span className="summary-separator">•</span>
              <span className="summary-item">
                <span className="summary-label">Data Types:</span>
                <span className="summary-value">
                  {optimizedData ? optimizedData.metadata.data_types.length : 0}
                </span>
              </span>
            </div>
          </div>

          <div className="toolbar-right">
            <div className="action-buttons">
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
                  <span className="btn-icon" aria-hidden="true">
                    <Icon.Fit />
                  </span>
                  <span className="btn-label">Fit All</span>
                </button>

                {selectionBox && (
                  <button
                    className="btn-action btn-zoom-selection"
                    onClick={() => {
                      if (selectionBox) {
                        const duration = selectionBox.end - selectionBox.start
                        const newZoom = Math.min(
                          10,
                          Math.max(1, (optimizedData?.metadata.duration || 10) / duration),
                        )
                        setZoomLevel(newZoom)
                        setCurrentTimePosition(selectionBox.start)
                      }
                    }}
                    title="Zoom to selected area"
                    aria-label="Zoom to selection"
                  >
                    <span className="btn-icon" aria-hidden="true">
                      <Icon.Chart />
                    </span>
                    <span className="btn-label">Zoom to Selection</span>
                  </button>
                )}
              </div>

              <div className="primary-actions">
                <button
                  className="btn-action btn-export"
                  onClick={exportFilteredData}
                  title="Export current data view to CSV"
                  aria-label="Export data"
                >
                  <span className="btn-icon" aria-hidden="true">
                    <Icon.Export />
                  </span>
                  <span className="btn-label">Export Data</span>
                </button>

                <button
                  className={`btn-action btn-settings ${showAdvancedSettings ? 'active' : ''}`}
                  onClick={handleSettingsToggle}
                  title={
                    showAdvancedSettings ? 'Hide performance settings' : 'Show performance settings'
                  }
                  aria-label={showAdvancedSettings ? 'Hide settings' : 'Show settings'}
                >
                  <span className="btn-icon" aria-hidden="true">
                    <Icon.Gear />
                  </span>
                  <span className="btn-label">Settings</span>
                  <span
                    className={`settings-chevron ${showAdvancedSettings ? 'expanded' : ''}`}
                    aria-hidden="true"
                  >
                    <Icon.ChevronDown />
                  </span>
                </button>
              </div>
            </div>
          </div>
        </nav>

        {showAdvancedSettings && (
          <section className="settings-panel enhanced" role="region" aria-label="Advanced settings">
            <div className="settings-container">
              <div className="settings-card">
                <h3 className="settings-title">
                  <span className="settings-icon" aria-hidden="true">
                    <Icon.Chart />
                  </span>
                  Performance & Rendering
                  <div className="performance-indicator">
                    <div
                      className={`performance-status ${chartData && chartData.totalDataPoints > 5000 ? 'warning' : 'good'}`}
                    >
                      {chartData && chartData.totalDataPoints > 10000 ? (
                        <Icon.StatusDanger />
                      ) : chartData && chartData.totalDataPoints > 5000 ? (
                        <Icon.StatusWarning />
                      ) : (
                        <Icon.StatusGood />
                      )}
                      <span className="performance-text">
                        {chartData && chartData.totalDataPoints > 10000
                          ? 'High Load'
                          : chartData && chartData.totalDataPoints > 5000
                            ? 'Moderate Load'
                            : 'Optimal'}
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
                          onChange={(e) => handleDownsamplingChange(e.target.checked)}
                          aria-describedby="downsampling-help"
                        />
                        <span className="checkbox-custom"></span>
                        <span className="setting-text">Smart Data Downsampling</span>
                        <span className="setting-badge">Recommended</span>
                      </label>
                      <p id="downsampling-help" className="setting-help">
                        <span aria-hidden="true" className="setting-help-icon">
                          <Icon.Chart />
                        </span>{' '}
                        Automatically reduces data points for better performance while preserving
                        important features
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
                          onChange={(e) => handleMaxDataPointsChange(parseInt(e.target.value))}
                          className="range-input"
                          aria-describedby="max-points-help"
                        />
                        <div className="range-labels">
                          <span>1K</span>
                          <span className="range-current">
                            {(maxDataPoints / 1000).toFixed(0)}K
                          </span>
                          <span>50K</span>
                        </div>
                      </div>
                      <p id="max-points-help" className="setting-help">
                        <span aria-hidden="true" className="setting-help-icon">
                          <Icon.Gear />
                        </span>{' '}
                        Balance between detail and performance. Higher values show more detail but
                        may reduce responsiveness.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <h3 className="settings-title">
                  <span className="settings-icon" aria-hidden="true">
                    <Icon.Gear />
                  </span>
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
                        <span aria-hidden="true" className="setting-help-icon">
                          <Icon.Clock />
                        </span>{' '}
                        Animations are automatically disabled for better performance with large
                        datasets
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
                        <span aria-hidden="true">
                          <Icon.Clock />
                        </span>{' '}
                        Default viewing window when zooming. Smaller values show more detail.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        <main className="data-viewer-content" role="main">
          <div className="chart-section">
            {chartData ? (
              <div className="chart-wrapper">
                <div
                  id="chart-panel"
                  role="tabpanel"
                  aria-labelledby="chart-tab"
                  className="chart-container"
                >
                  {(() => {
                    try {
                      return (
                        <Line
                          key={`data-chart-${timeRange ? 'filtered' : 'all'}`}
                          data={{ datasets: chartData.datasets }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            animation: enableAnimations
                              ? {
                                  duration: 300,
                                  easing: 'easeInOutQuart',
                                }
                              : false,
                            plugins: {
                              legend: {
                                position: 'top',
                                labels: {
                                  boxWidth: 12,
                                  padding: 15,
                                  font: {
                                    size: 12,
                                  },
                                  generateLabels: function (chart) {
                                    const original =
                                      Chart.defaults.plugins.legend.labels.generateLabels(chart)
                                    return original.map((item) => {
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
                                  },
                                },
                              },
                              title: {
                                display: true,
                                text: `${sessionName} - Data Visualization`,
                              },
                              tooltip: {
                                enabled: true,
                                mode: 'index',
                                intersect: false,
                                filter: function (tooltipItem) {
                                  // Filter out null/undefined values from tooltips
                                  return (
                                    tooltipItem &&
                                    tooltipItem.parsed &&
                                    typeof tooltipItem.parsed.x === 'number' &&
                                    typeof tooltipItem.parsed.y === 'number' &&
                                    !isNaN(tooltipItem.parsed.x) &&
                                    !isNaN(tooltipItem.parsed.y)
                                  )
                                },
                                callbacks: {
                                  title: function (context) {
                                    if (context && context[0] && context[0].parsed) {
                                      return `Time: ${context[0].parsed.x.toFixed(2)}s`
                                    }
                                    return 'Data Point'
                                  },
                                  label: function (context) {
                                    if (
                                      context &&
                                      context.parsed &&
                                      typeof context.parsed.y === 'number'
                                    ) {
                                      return `${context.dataset.label}: ${context.parsed.y.toFixed(3)}`
                                    }
                                    return `${context.dataset.label}: N/A`
                                  },
                                },
                              },
                            },
                            scales: {
                              x: {
                                type: 'linear',
                                position: 'bottom',
                                title: {
                                  display: true,
                                  text: 'Time (seconds)',
                                },
                                min: timeRange?.start,
                                max: timeRange?.end,
                                ticks: {
                                  callback: function (value) {
                                    // Format relative time in seconds (matching LiveChart)
                                    if (typeof value === 'number' && !isNaN(value)) {
                                      return `${value.toFixed(1)}s`
                                    }
                                    return value
                                  },
                                },
                              },
                              y: {
                                title: {
                                  display: true,
                                  text: 'Value',
                                },
                              },
                            },
                            interaction: {
                              intersect: false,
                              mode: 'index',
                            },
                            elements: {
                              point: {
                                radius:
                                  chartData.totalDataPoints > 2000
                                    ? 0
                                    : chartData.totalDataPoints > 1000
                                      ? 0.5
                                      : 1,
                                hoverRadius: 4,
                                hitRadius: 6,
                              },
                            },
                            datasets: {
                              line: {
                                pointRadius:
                                  chartData.totalDataPoints > 3000
                                    ? 0
                                    : chartData.totalDataPoints > 1500
                                      ? 0.5
                                      : 1,
                                borderWidth: chartData.totalDataPoints > 5000 ? 1 : 2,
                              },
                            },
                          }}
                        />
                      )
                    } catch (error) {
                      console.error('Chart rendering error:', error)
                      return (
                        <div className="chart-error">
                          <p>
                            <span aria-hidden="true">
                              <Icon.Warning />
                            </span>{' '}
                            Error rendering chart. Please try refreshing the data.
                          </p>
                          <button onClick={reloadData} className="btn-secondary">
                            <span aria-hidden="true">
                              <Icon.Refresh />
                            </span>{' '}
                            Reload Data
                          </button>
                        </div>
                      )
                    }
                  })()}
                </div>

                {optimizedData && (
                  <div className="chart-controls">
                    <div
                      className="timeline-row"
                      onWheel={(e) => {
                        // Hold Shift to pan horizontally; or use horizontal wheel deltaX
                        const delta =
                          Math.abs(e.deltaX) > Math.abs(e.deltaY)
                            ? e.deltaX
                            : e.shiftKey
                              ? e.deltaY
                              : 0
                        if (!delta || !optimizedData) return
                        e.preventDefault()
                        const view = timeWindowSize / zoomLevel
                        const step = Math.max(0.1, view * 0.02)
                        const dir = delta > 0 ? 1 : -1
                        const total = optimizedData.metadata.duration
                        const maxPos = Math.max(0, total - view)
                        setCurrentTimePosition((prev) =>
                          Math.max(0, Math.min(maxPos, prev + dir * step)),
                        )
                      }}
                    >
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
                              setCurrentTimePosition((prev) => Math.max(0, prev - step))
                            } else if (e.key === 'ArrowRight') {
                              e.preventDefault()
                              const maxPos = Math.max(0, optimizedData.metadata.duration - view)
                              setCurrentTimePosition((prev) => Math.min(maxPos, prev + step))
                            }
                          }}
                        />
                      </div>
                      <span className="time-marker end">
                        {optimizedData?.metadata.duration.toFixed(1) || '0.0'}s
                      </span>
                      <div className="range-info">
                        {(() => {
                          const effectiveWindow = getEffectiveTimeWindow()
                          return `${effectiveWindow.start.toFixed(1)}s - ${effectiveWindow.end.toFixed(1)}s`
                        })()}
                      </div>
                    </div>

                    <div className="controls-row">
                      <div className="zoom-group">
                        <span className="control-label">
                          <span aria-hidden="true">
                            <Icon.Zoom />
                          </span>{' '}
                          Zoom
                        </span>

                        <div className="zoom-presets">
                          {[
                            { span: null, label: 'All', isAll: true },
                            { span: 30, label: '30s' },
                            { span: 10, label: '10s' },
                            { span: 5, label: '5s' },
                            { span: 2, label: '2s' },
                          ].map((preset) => {
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
                                title={
                                  preset.isAll
                                    ? 'View all data'
                                    : spanValue
                                      ? `View ${spanValue} second window`
                                      : 'View all data'
                                }
                                aria-label={
                                  preset.isAll
                                    ? 'Fit all data'
                                    : spanValue
                                      ? `Set view to ${spanValue} seconds`
                                      : 'Fit all data'
                                }
                              >
                                {preset.label}
                              </button>
                            )
                          })}
                        </div>

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
                            <span className="zoom-current">{zoomLevel.toFixed(1)}×</span>
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
                            <span className="reset-icon" aria-hidden="true">
                              <Icon.Home />
                            </span>
                          </button>
                        </div>
                      </div>

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
                            <span aria-hidden="true">
                              <Icon.StepBack />
                            </span>
                          </button>
                          <button
                            onClick={() => {
                              const step = (timeWindowSize / zoomLevel) * 0.1
                              const maxPos = Math.max(
                                0,
                                (optimizedData?.metadata.duration || 0) -
                                  timeWindowSize / zoomLevel,
                              )
                              setCurrentTimePosition(Math.min(maxPos, currentTimePosition + step))
                            }}
                            className="btn-time-nav"
                            disabled={(() => {
                              const maxPos = Math.max(
                                0,
                                (optimizedData?.metadata.duration || 0) -
                                  timeWindowSize / zoomLevel,
                              )
                              return currentTimePosition >= maxPos
                            })()}
                            title="Jump forward"
                          >
                            <span aria-hidden="true">
                              <Icon.StepForward />
                            </span>
                          </button>
                        </div>

                        <div className="time-display">
                          <span className="info-label" aria-hidden="true">
                            <Icon.Chart />
                          </span>
                          <span className="info-value">
                            {(() => {
                              const effectiveWindow = getEffectiveTimeWindow()
                              const viewingDuration = effectiveWindow.end - effectiveWindow.start
                              const percentage = (
                                (viewingDuration / optimizedData.metadata.duration) *
                                100
                              ).toFixed(1)
                              return `${viewingDuration.toFixed(1)}s (${percentage}%)`
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectionBox && (
                      <div className="selection-info">
                        <span className="selection-text">
                          Selection: {selectionBox.start.toFixed(2)}s -{' '}
                          {selectionBox.end.toFixed(2)}s
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
                  <div className="empty-state-icon" aria-hidden="true">
                    <Icon.Chart />
                  </div>
                  <h3 className="empty-state-title">No Chart Data Available</h3>
                  <p className="empty-state-message">
                    Unable to display chart visualization for this session.
                  </p>
                </div>

                {optimizedData && (
                  <div className="chart-controls">
                    <div
                      className="timeline-row"
                      onWheel={(e) => {
                        const delta =
                          Math.abs(e.deltaX) > Math.abs(e.deltaY)
                            ? e.deltaX
                            : e.shiftKey
                              ? e.deltaY
                              : 0
                        if (!delta || !optimizedData) return
                        e.preventDefault()
                        const view = timeWindowSize / zoomLevel
                        const step = Math.max(0.1, view * 0.02)
                        const dir = delta > 0 ? 1 : -1
                        const total = optimizedData.metadata.duration
                        const maxPos = Math.max(0, total - view)
                        setCurrentTimePosition((prev) =>
                          Math.max(0, Math.min(maxPos, prev + dir * step)),
                        )
                      }}
                    >
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
                              setCurrentTimePosition((prev) => Math.max(0, prev - step))
                            } else if (e.key === 'ArrowRight') {
                              e.preventDefault()
                              const maxPos = Math.max(0, optimizedData.metadata.duration - view)
                              setCurrentTimePosition((prev) => Math.min(maxPos, prev + step))
                            }
                          }}
                        />
                      </div>
                      <span className="time-marker end">
                        {optimizedData?.metadata.duration.toFixed(1) || '0.0'}s
                      </span>
                      <div className="range-info">
                        {(() => {
                          const effectiveWindow = getEffectiveTimeWindow()
                          return `${effectiveWindow.start.toFixed(1)}s - ${effectiveWindow.end.toFixed(1)}s`
                        })()}
                      </div>
                    </div>

                    <div className="controls-row">
                      <div className="zoom-group">
                        <span className="control-label">
                          <span aria-hidden="true">
                            <Icon.Zoom />
                          </span>{' '}
                          Zoom
                        </span>
                        <div className="zoom-presets">
                          {[
                            { span: null, label: 'All', isAll: true },
                            { span: 30, label: '30s' },
                            { span: 10, label: '10s' },
                            { span: 5, label: '5s' },
                            { span: 2, label: '2s' },
                          ].map((preset) => {
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
                                    const newZoom = Math.min(
                                      10,
                                      Math.max(1, totalDuration / spanValue),
                                    )
                                    setZoomLevel(newZoom)
                                    setCurrentTimePosition(0)
                                  }
                                }}
                                className={`btn-zoom-preset ${isActive ? 'active' : ''} ${preset.isAll ? 'all-data' : ''}`}
                                disabled={!preset.isAll && !!spanValue && spanValue > totalDuration}
                                title={
                                  preset.isAll
                                    ? 'View all data'
                                    : spanValue
                                      ? `View ${spanValue} second window`
                                      : 'View all data'
                                }
                                aria-label={
                                  preset.isAll
                                    ? 'Fit all data'
                                    : spanValue
                                      ? `Set view to ${spanValue} seconds`
                                      : 'Fit all data'
                                }
                              >
                                {preset.label}
                              </button>
                            )
                          })}
                        </div>

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
                            <span className="zoom-current">{zoomLevel.toFixed(1)}×</span>
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
                            <span className="reset-icon" aria-hidden="true">
                              <Icon.Home />
                            </span>
                          </button>
                        </div>
                      </div>

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
                            <span aria-hidden="true">
                              <Icon.StepBack />
                            </span>
                          </button>
                          <button
                            onClick={() => {
                              const step = (timeWindowSize / zoomLevel) * 0.1
                              const maxPos = Math.max(
                                0,
                                (optimizedData?.metadata.duration || 0) -
                                  timeWindowSize / zoomLevel,
                              )
                              setCurrentTimePosition(Math.min(maxPos, currentTimePosition + step))
                            }}
                            className="btn-time-nav"
                            disabled={(() => {
                              const maxPos = Math.max(
                                0,
                                (optimizedData?.metadata.duration || 0) -
                                  timeWindowSize / zoomLevel,
                              )
                              return currentTimePosition >= maxPos
                            })()}
                            title="Jump forward"
                          >
                            <span aria-hidden="true">
                              <Icon.StepForward />
                            </span>
                          </button>
                        </div>

                        <div className="time-display">
                          <span className="info-label" aria-hidden="true">
                            <Icon.Chart />
                          </span>
                          <span className="info-value">
                            {(() => {
                              const effectiveWindow = getEffectiveTimeWindow()
                              const viewingDuration = effectiveWindow.end - effectiveWindow.start
                              const percentage = (
                                (viewingDuration / optimizedData.metadata.duration) *
                                100
                              ).toFixed(1)
                              return `${viewingDuration.toFixed(1)}s (${percentage}%)`
                            })()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectionBox && (
                      <div className="selection-info">
                        <span className="selection-text">
                          Selection: {selectionBox.start.toFixed(2)}s -{' '}
                          {selectionBox.end.toFixed(2)}s
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
