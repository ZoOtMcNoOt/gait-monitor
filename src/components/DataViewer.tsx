import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react'
import type { Chart as ChartJS, ChartDataset } from 'chart.js'
import { invoke } from '@tauri-apps/api/core'
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
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'

interface DataViewerProps {
  sessionId: string
  sessionName: string
  onClose: () => void
}

interface ChartPoint {
  x: number
  y: number
}

type ChartTuple = [number, number]

interface OptimizedChartData {
  datasets: Record<string, Record<string, ChartPoint[]>> // device -> dataType -> points
  metadata: {
    devices: string[]
    data_types: string[]
    sample_rate: number
    duration: number
    device_sample_rates?: Record<string, number>
    start_timestamp_ms?: number // absolute start (ms since epoch)
    normalized?: boolean // true if backend sent relative timestamps
  }
}

// Preprocessed typed-array representation for efficient slicing
interface ProcessedDatasetPointArrays {
  xs: Float32Array // relative seconds
  ys: Float32Array
}

type ProcessedDatasets = Record<string, Record<string, ProcessedDatasetPointArrays>>

export default function DataViewer({ sessionId, sessionName, onClose }: DataViewerProps) {
  const [optimizedData, setOptimizedData] = useState<OptimizedChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fullDataLoading, setFullDataLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<{ start: number; end: number } | null>(null)

  // Dynamically loaded chart libraries (Chart.js + react-chartjs-2 Line component)
  interface ChartLib {
    Line: React.ComponentType<any>
    Chart: typeof ChartJS
  }
  const [chartLib, setChartLib] = useState<ChartLib | null>(null)

  const [timeWindowSize, setTimeWindowSize] = useState<number>(10) // seconds - base window size
  const [currentTimePosition, setCurrentTimePosition] = useState<number>(0) // start position in seconds
  const [zoomLevel, setZoomLevel] = useState<number>(1) // 1x to 10x zoom
  const [selectionBox, setSelectionBox] = useState<{ start: number; end: number } | null>(null)

  const [maxDataPoints, setMaxDataPoints] = useState<number>(10000) // Default max points per dataset
  const [useDownsampling, setUseDownsampling] = useState<boolean>(true)
  const [enableAnimations] = useState<boolean>(false) // Disabled by default for performance
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false)

  // Track chart width for adaptive decimation / thinning
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const [chartWidth, setChartWidth] = useState<number>(800)
  const [isCompact, setIsCompact] = useState<boolean>(false)
  const [isTabletCondensed, setIsTabletCondensed] = useState<boolean>(false)

  useLayoutEffect(() => {
    const update = () => {
      if (chartContainerRef.current) {
        const w = chartContainerRef.current.clientWidth
        if (w && Math.abs(w - chartWidth) > 10) setChartWidth(w)
      }
      const ww = window.innerWidth
      const compact = ww < 600
      const tabletCondensed = ww >= 600 && ww < 950
      setIsCompact(compact)
      setIsTabletCondensed(tabletCondensed)
      // Auto-collapse advanced settings on compact screens / tablet condensed
      if ((compact || tabletCondensed) && showAdvancedSettings) setShowAdvancedSettings(false)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [chartWidth, showAdvancedSettings])

  const [deviceColors, setDeviceColors] = useState<
    Map<
      string,
      Record<string, { primary: string; light: string; dark: string; background: string }>
    >
  >(new Map())

  // Ref holding preprocessed typed arrays (rebuilt when full datasets loaded)
  const processedRef = useRef<ProcessedDatasets | null>(null)
  // Track a simple version to know when to rebuild (use dataset object identity)
  const processedVersionRef = useRef<number>(0)
  // Reusable object pools per device/dataType to avoid per-render point allocations
  // Removed object pool in favor of tuple reuse logic (future optimization placeholder)

  const { getChartTimestamp } = useTimestampManager({
    useRelativeTime: true, // Match LiveChart configuration
  })
  const { showError, showInfo, showSuccess } = useToast()
  const { deviceSides } = useDeviceConnection()

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

  const loadSessionData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      console.log(`[DataViewer] Loading session metadata for ${sessionId}`)
      const metaOnly: OptimizedChartData = await invoke('load_optimized_chart_data', {
        sessionId,
        selectedDevices: [],
        selectedDataTypes: [],
        startTime: null,
        endTime: null,
        maxPointsPerDataset: null,
        metadata_only: true,
        normalize_timestamps: true,
      })
      // Skeleton (no datasets yet)
      setOptimizedData({ ...metaOnly, datasets: {} as OptimizedChartData['datasets'] })
      // Kick off dynamic import of chart libraries immediately after metadata is known.
      // This allows UI (metadata header, etc.) to paint before heavy libs parse.
      if (!chartLib) {
        ;(async () => {
          try {
            const [{ Line }, chartJsModule, setup] = await Promise.all([
              import('react-chartjs-2'),
              import('chart.js'),
              import('../utils/chartSetup'),
            ])
            setup.registerChartComponents()
            setChartLib({ Line, Chart: chartJsModule.Chart })
          } catch (e) {
            console.warn('Failed to lazy-load chart libraries:', e)
          }
        })()
      }
      const dataDuration = metaOnly.metadata.duration
      const presets = [30, 10, 5, 2]
      const baseWindow = presets.find((p) => dataDuration >= p) || dataDuration
      setTimeWindowSize(baseWindow)
      setLoading(false) // reveal UI quickly
      setFullDataLoading(true)

      // Progressive per-device loading: load first device immediately, queue rest
      ;(async () => {
        try {
          const allDevices = metaOnly.metadata.devices
          if (!allDevices.length) {
            setFullDataLoading(false)
            return
          }
          const remaining = [...allDevices]
          const first = remaining.shift()!
          console.log(`[DataViewer] Progressive load: initial device ${first}`)
          const firstData: OptimizedChartData = await invoke('load_optimized_chart_data', {
            sessionId,
            selectedDevices: [first],
            selectedDataTypes: [],
            startTime: null,
            endTime: null,
            maxPointsPerDataset: null,
            metadata_only: false,
            normalize_timestamps: true,
          })
          // Merge first device datasets into existing optimizedData skeleton
          setOptimizedData((prev) => {
            if (!prev) return firstData
            return { ...prev, datasets: { ...prev.datasets, ...firstData.datasets } }
          })
          // Prepare colors (all devices known from metadata)
          if (allDevices.length > 0) {
            const deviceColorPalettes = generateMultiDeviceColors(allDevices)
            const colorMap = new Map<
              string,
              Record<string, { primary: string; light: string; dark: string; background: string }>
            >()
            const dataTypes = metaOnly.metadata.data_types
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
            allDevices.forEach((device) => {
              const palette = deviceColorPalettes.get(device)!
              const dataTypeColors: Record<
                string,
                { primary: string; light: string; dark: string; background: string }
              > = {}
              dataTypes.forEach((dt, idx) => {
                const ch =
                  channelMapping[dt] ||
                  (['R1', 'R2', 'R3', 'X', 'Y', 'Z'] as ChannelType[])[idx % 6]
                dataTypeColors[dt] = palette[ch]
              })
              colorMap.set(device, dataTypeColors)
            })
            setDeviceColors(colorMap)
          }
          // Sequentially load remaining devices without blocking UI
          for (const dev of remaining) {
            try {
              const devData: OptimizedChartData = await invoke('load_optimized_chart_data', {
                sessionId,
                selectedDevices: [dev],
                selectedDataTypes: [],
                startTime: null,
                endTime: null,
                maxPointsPerDataset: null,
                metadata_only: false,
                normalize_timestamps: true,
              })
              setOptimizedData((prev) => {
                if (!prev) return devData
                // do not overwrite existing devices
                return { ...prev, datasets: { ...prev.datasets, ...devData.datasets } }
              })
            } catch (e) {
              console.warn(`[DataViewer] Failed loading device ${dev}:`, e)
            }
          }
        } catch (e) {
          console.error('Progressive load error:', e)
          showError('Data Load Error', `Progressive load failed: ${e}`)
        } finally {
          setFullDataLoading(false)
        }
      })()
    } catch (err) {
      console.error('Failed to load session metadata:', err)
      setError(err instanceof Error ? err.message : 'Failed to load session data')
      showError('Data Load Error', `Failed to load session data: ${err}`)
      setLoading(false)
    }
  }, [sessionId, showError, chartLib])

  useEffect(() => {
    loadSessionData()
  }, [loadSessionData])

  useEffect(() => {
    if (!optimizedData) return
    const effectiveWindow = getEffectiveTimeWindow()

    setTimeRange(effectiveWindow)
    console.log(
      `Time range updated: ${effectiveWindow.start.toFixed(2)}s - ${effectiveWindow.end.toFixed(2)}s (zoom: ${zoomLevel}x)`,
    )
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
      // Clean up any chart instances when component unmounts (after dynamic load).
      try {
        if (!chartLib) return
        const container = document.getElementById('data-viewer-chart')
        if (container) {
          const canvases = container.querySelectorAll('canvas')
          canvases.forEach((canvas) => {
            const chart = chartLib.Chart.getChart(canvas as HTMLCanvasElement)
            if (chart) chart.destroy()
          })
        }
      } catch (error) {
        console.warn('Error cleaning up DataViewer charts:', error)
      }
    }
  }, [chartLib])

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

  // Unified computation for chartData (single traversal & slicing)
  const unifiedView = useMemo(() => {
    if (!optimizedData || !processedRef.current || deviceColors.size === 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { chartData: null as any }
    }
    const rangeStart = timeRange?.start ?? 0
    const rangeEnd = timeRange?.end ?? optimizedData.metadata.duration
    const lowerBound = (arr: Float32Array, target: number) => {
      // tight loop binary search
      let lo = 0,
        hi = arr.length
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (arr[mid] < target) lo = mid + 1
        else hi = mid
      }
      return lo
    }
    const upperBound = (arr: Float32Array, target: number) => {
      let lo = 0,
        hi = arr.length
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (arr[mid] <= target) lo = mid + 1
        else hi = mid
      }
      return lo
    }

    // --- Precompute loop constants (perf improvement #6) ---
    // Total series count (sum of data types per device) so we can derive a single per-series target.
    let totalSeries = 0
    for (const deviceData of Object.values(processedRef.current)) {
      totalSeries += Object.keys(deviceData).length
    }
    if (totalSeries === 0) {
      return { chartData: { datasets: [], totalDataPoints: 0 } }
    }
    const perSeriesBaseTarget = Math.max(100, Math.floor(maxDataPoints / totalSeries))
    const pixelCap = Math.max(300, chartWidth || 800) // approximate distinguishable points per series

    const datasets: ChartDataset<'line', ChartTuple[]>[] = []
    let totalDataPoints = 0

    for (const [device, deviceData] of Object.entries(processedRef.current)) {
      const baseLabel = getDeviceLabel(device)
      const side = deviceSides.get(device)
      const deviceLabel = side ? `${side}:${baseLabel}` : baseLabel
      for (const [dataType, arrays] of Object.entries(deviceData)) {
        const xs = arrays.xs
        const ys = arrays.ys
        if (!xs.length) continue
        const startIdx = lowerBound(xs, rangeStart)
        const endExclusive = upperBound(xs, rangeEnd)
        const sliceLen = endExclusive - startIdx
        if (sliceLen <= 0) continue
        // (Export rows no longer accumulated each render; export builds on demand.)
        // Direct allocate tuple slice (fast path). Potential future: reuse preallocated shared buffers.
        let pointCount = sliceLen
        let tuplePoints: ChartTuple[] = new Array(sliceLen)
        for (let i = 0; i < sliceLen; i++) {
          const idx = startIdx + i
          tuplePoints[i] = [xs[idx], ys[idx]]
        }
        // Adaptive thinning strategy (mutually aware of Chart.js decimation):
        // If extremely large relative to pixel capacity, first stride-thin down to ~pixelCap*2 to reduce pre-decimation load.
        if (useDownsampling && sliceLen > pixelCap * 3) {
          const target = Math.min(perSeriesBaseTarget, pixelCap * 2)
          const stride = Math.max(1, Math.floor(sliceLen / target))
          if (stride > 1) {
            const thinned: ChartTuple[] = []
            for (let i = 0; i < sliceLen; i += stride) thinned.push(tuplePoints[i])
            tuplePoints = thinned
            pointCount = tuplePoints.length
          }
        }
        totalDataPoints += pointCount
        const pointRadius = pointCount > 2000 ? 0 : pointCount > 1000 ? 0.5 : 1
        const borderWidth = pointCount > 3000 ? 1 : 2
        const hoverRadius = pointCount > 2000 ? 2 : 4
        const hitRadius = pointCount > 2000 ? 4 : 6
        datasets.push({
          label: `${deviceLabel} - ${dataType}`,
          data: tuplePoints, // tuples [x,y]
          borderColor: getDeviceColor(device, dataType),
          backgroundColor: getDeviceColor(device, dataType, 0.1),
          borderWidth,
          pointRadius,
          tension: config.chartSmoothing,
          spanGaps: false,
          pointHoverRadius: hoverRadius,
          pointHitRadius: hitRadius,
        })
      }
    }
    // Logging suppressed for performance
    return { chartData: { datasets, totalDataPoints } }
  }, [
    optimizedData,
    processedRef,
    deviceColors,
    timeRange,
    useDownsampling,
    maxDataPoints,
    getDeviceColor,
    deviceSides,
    chartWidth,
  ])

  const chartData = unifiedView.chartData

  // Incremental / lazy typed-array preprocessing: only build for newly loaded devices/dataTypes.
  useEffect(() => {
    if (!optimizedData) return
    const datasetEntries = Object.entries(optimizedData.datasets || {})
    if (!datasetEntries.length) return // metadata-only stage

    if (!processedRef.current) processedRef.current = {}
    const normalized = optimizedData.metadata.normalized
    let newPoints = 0
    let newSeries = 0
    const start = performance.now()

    for (const [device, deviceData] of datasetEntries) {
      if (!processedRef.current[device]) processedRef.current[device] = {}
      for (const [dataType, points] of Object.entries(deviceData)) {
        const existing = processedRef.current[device][dataType]
        // Skip if already processed with matching length (assumes append-only datasets)
        if (existing && existing.xs.length === points.length) continue
        const len = points.length
        const xs = new Float32Array(len)
        const ys = new Float32Array(len)
        for (let i = 0; i < len; i++) {
          xs[i] = normalized ? points[i].x / 1000 : getChartTimestamp(points[i].x)
          ys[i] = points[i].y
        }
        processedRef.current[device][dataType] = { xs, ys }
        newPoints += len
        newSeries++
      }
    }
    if (newSeries > 0) {
      processedVersionRef.current++
      const elapsed = performance.now() - start
      console.log(
        `[Preprocess] Added ${newSeries} new series (${newPoints.toLocaleString()} pts) in ${elapsed.toFixed(1)}ms (total devices: ${Object.keys(processedRef.current).length})`,
      )
    }
  }, [optimizedData, getChartTimestamp])

  const reloadData = () => {
    loadSessionData()
  }

  const exportFilteredData = useCallback(async () => {
    try {
      if (!optimizedData || !processedRef.current) {
        showError('Export Failed', 'Data not ready for export')
        return
      }
      const duration = optimizedData.metadata.duration
      const rangeStart = timeRange?.start ?? 0
      const rangeEnd = timeRange?.end ?? duration
      const lowerBound = (arr: Float32Array, target: number) => {
        let lo = 0,
          hi = arr.length
        while (lo < hi) {
          const mid = (lo + hi) >>> 1
          if (arr[mid] < target) lo = mid + 1
          else hi = mid
        }
        return lo
      }
      const upperBound = (arr: Float32Array, target: number) => {
        let lo = 0,
          hi = arr.length
        while (lo < hi) {
          const mid = (lo + hi) >>> 1
          if (arr[mid] <= target) lo = mid + 1
          else hi = mid
        }
        return lo
      }
      const lines: string[] = [['Timestamp', 'Device', 'Data Type', 'Value', 'Unit'].join(',')]
      let rowCount = 0
      for (const [device, deviceData] of Object.entries(processedRef.current)) {
        for (const [dataType, arrays] of Object.entries(deviceData)) {
          const xs = arrays.xs
          const ys = arrays.ys
          if (!xs.length) continue
          const startIdx = lowerBound(xs, rangeStart)
          const endEx = upperBound(xs, rangeEnd)
          for (let i = startIdx; i < endEx; i++) {
            lines.push(`${xs[i].toFixed(3)}s,${device},${dataType},${ys[i]},`)
            rowCount++
          }
        }
      }
      const csvContent = lines.join('\n')
      const fileName = `${sessionName}_slice_${new Date().toISOString().split('T')[0]}.csv`
      const savedPath = (await protectedOperations.saveFilteredData(fileName, csvContent)) as string
      try {
        const result = await protectedOperations.copyFileToDownloads(savedPath, fileName)
        showSuccess('File Exported Successfully', `Exported ${rowCount} rows: ${result}`)
      } catch {
        showInfo(
          'Export Completed - Manual Copy Available',
          `Exported ${rowCount} rows to: ${savedPath}`,
        )
      }
    } catch (err) {
      console.error('Failed to export data slice:', err)
      showError('Export Failed', `Failed to export data: ${err}`)
    }
  }, [optimizedData, timeRange, sessionName, showSuccess, showError, showInfo])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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
          setTimeRange(null)
          break
        case '1':
          event.preventDefault()
          setZoomLevel(1)
          setCurrentTimePosition(0)
          break
        case '2':
          event.preventDefault()
          if (totalDuration >= 30) {
            setZoomLevel(totalDuration / 30)
            setCurrentTimePosition(0)
          }
          break
        case '3':
          event.preventDefault()
          if (totalDuration >= 10) {
            setZoomLevel(totalDuration / 10)
            setCurrentTimePosition(0)
          }
          break
        case '4':
          event.preventDefault()
          if (totalDuration >= 5) {
            setZoomLevel(totalDuration / 5)
            setCurrentTimePosition(0)
          }
          break
        case '5':
          event.preventDefault()
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
      <div
        className="data-viewer-modal"
        data-compact={isCompact || undefined}
        data-tablet-condensed={isTabletCondensed || undefined}
      >
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
                <span className="metadata-separator" aria-hidden="true">
                  •
                </span>
                <span className="metadata-item" title="Total data points in current view">
                  <span className="metadata-icon" aria-hidden="true">
                    <Icon.Chart />
                  </span>
                  {chartData ? chartData.totalDataPoints.toLocaleString() : '0'} pts
                </span>
                <span className="metadata-separator" aria-hidden="true">
                  •
                </span>
                <span className="metadata-item" title="Number of data types">
                  <span className="metadata-icon" aria-hidden="true">
                    <Icon.Gear />
                  </span>
                  {optimizedData.metadata.data_types.length} types
                </span>
                {fullDataLoading && (
                  <>
                    <span className="metadata-separator" aria-hidden="true">
                      •
                    </span>
                    <span className="metadata-item" title="Loading full datasets">
                      Loading full data…
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </header>

        <nav className="data-viewer-toolbar">
          <div
            className="dv-toolbar-grid"
            data-condensed={isCompact || isTabletCondensed || undefined}
          >
            {!isCompact && (
              <div className="dv-zoom-group" aria-label="Zoom controls">
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
                    // Currently preset is a number; keep loose for potential future object form.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const spanValue: any = preset
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
                      <Icon.Fit />
                    </span>
                  </button>
                </div>
              </div>
            )}
            {!isCompact && (
              <div className="dv-time-group" aria-label="Time navigation">
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
                        (optimizedData?.metadata.duration || 0) - timeWindowSize / zoomLevel,
                      )
                      setCurrentTimePosition(Math.min(maxPos, currentTimePosition + step))
                    }}
                    className="btn-time-nav"
                    disabled={(() => {
                      const maxPos = Math.max(
                        0,
                        (optimizedData?.metadata.duration || 0) - timeWindowSize / zoomLevel,
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
                {/* time-display removed as requested */}
              </div>
            )}
            <div className="dv-actions" aria-label="Viewer actions">
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
                  <span className="btn-label">Sel</span>
                </button>
              )}
              <button
                className="btn-action btn-export"
                onClick={exportFilteredData}
                title="Export current data view to CSV"
                aria-label="Export data"
              >
                <span className="btn-icon" aria-hidden="true">
                  <Icon.Export />
                </span>
                <span className="btn-label">Export</span>
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
                  ref={chartContainerRef}
                >
                  {(() => {
                    try {
                      if (!chartLib) {
                        return (
                          <div className="chart-loading">
                            <div className="loading-spinner small">
                              <div className="spinner" />
                            </div>
                            <p>Loading chart engine…</p>
                          </div>
                        )
                      }
                      const Line = chartLib.Line
                      const ChartJS = chartLib.Chart
                      return (
                        <Line
                          key={`data-chart-${timeRange ? 'filtered' : 'all'}`}
                          data={{ datasets: chartData.datasets }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            parsing: { xAxisKey: '0', yAxisKey: '1' },
                            animation: enableAnimations
                              ? {
                                  duration: 300,
                                  easing: 'easeInOutQuart',
                                }
                              : false,
                            plugins: {
                              decimation: {
                                enabled: true,
                                algorithm: 'lttb',
                                // Dynamic sample target based on current chart width & user cap
                                samples: Math.min(
                                  maxDataPoints,
                                  Math.floor((chartWidth || 800) * 1.25),
                                ),
                              },
                              legend: {
                                position: 'top',
                                labels: {
                                  boxWidth: 12,
                                  padding: 15,
                                  font: {
                                    size: 12,
                                  },
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  generateLabels: function (chart: any) {
                                    const baseGen =
                                      ChartJS?.defaults?.plugins?.legend?.labels?.generateLabels
                                    const original = baseGen ? baseGen(chart) : []
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    return original.map((item: any) => {
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
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                filter: function (tooltipItem: any) {
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
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  title: function (context: any) {
                                    if (context && context[0] && context[0].parsed) {
                                      return `Time: ${context[0].parsed.x.toFixed(2)}s`
                                    }
                                    return 'Data Point'
                                  },
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  label: function (context: any) {
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
                                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                  callback: function (value: any) {
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

                    {/* duplicate zoom controls row removed */}

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
                {isCompact && (
                  <nav className="mobile-toolbar" aria-label="Mobile chart controls">
                    <button
                      className="mt-btn"
                      onClick={() => handleZoomChange('out')}
                      disabled={zoomLevel <= 1}
                      aria-label="Zoom out"
                      title="Zoom out"
                    >
                      <span className="mt-icon">−</span>
                      <span className="mt-label">Out</span>
                    </button>
                    <button
                      className="mt-btn"
                      onClick={() => handleZoomChange('in')}
                      disabled={zoomLevel >= 10}
                      aria-label="Zoom in"
                      title="Zoom in"
                    >
                      <span className="mt-icon">+</span>
                      <span className="mt-label">In</span>
                    </button>
                    <button
                      className="mt-btn"
                      onClick={exportFilteredData}
                      aria-label="Export data"
                      title="Export"
                    >
                      <span className="mt-icon">
                        <Icon.Export />
                      </span>
                      <span className="mt-label">Export</span>
                    </button>
                    <button
                      className={`mt-btn ${showAdvancedSettings ? 'active' : ''}`}
                      onClick={handleSettingsToggle}
                      aria-label="Toggle settings"
                      title="Settings"
                    >
                      <span className="mt-icon">
                        <Icon.Gear />
                      </span>
                      <span className="mt-label">Settings</span>
                    </button>
                  </nav>
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

                    {/* duplicate zoom controls row removed */}

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
