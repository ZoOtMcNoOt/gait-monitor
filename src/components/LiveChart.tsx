import { useEffect, useRef, useState, useCallback } from 'react'
import '../styles/chart.css'
import '../styles/collect.css'
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import { Icon } from './icons'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'
import { useBufferManager } from '../hooks/useBufferManager'
import { config } from '../config'
import { useTimestampManager } from '../hooks/useTimestampManager'
import {
  generateMultiDeviceColors,
  generateDeviceColorPalette,
  getDeviceLabel,
  type ChannelType,
} from '../utils/colorGeneration'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Title,
  Tooltip,
  Legend,
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
  device_id: string
  r1: number
  r2: number
  r3: number
  x: number
  y: number
  z: number
  timestamp: number          // legacy ms timestamp
  timestamp_us?: number      // high-res absolute microseconds
  monotonic_s?: number       // high-res relative seconds (preferred)
  sample_rate?: number
}

export default function LiveChart({ isCollecting = false }: Props) {
  // Chart state
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [chartMode, setChartMode] = useState<'all' | 'resistance' | 'acceleration'>('all')
  const [announcementText, setAnnouncementText] = useState('')

  const [allDataPoints, setAllDataPoints] = useState<
    Map<
      string,
      Array<{
        timestamp: number
        R1: number
        R2: number
        R3: number
        X: number
        Y: number
        Z: number
      }>
    >
  >(new Map())

  const [deviceColors, setDeviceColors] = useState<
    Map<
      string,
      Record<ChannelType, { primary: string; light: string; dark: string; background: string }>
    >
  >(new Map())

  const chartUpdateBatchRef = useRef<NodeJS.Timeout | null>(null)
  const pendingUpdatesRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    return () => {
      if (chartUpdateBatchRef.current) {
        clearTimeout(chartUpdateBatchRef.current)
      }
    }
  }, [])

  const { connectedDevices, activeCollectingDevices, subscribeToGaitData, getCurrentSampleRate } =
    useDeviceConnection()

  const bufferManager = useBufferManager()

  const { getChartTimestamp } = useTimestampManager({
    useRelativeTime: true,
    autoSetBase: true,
    cacheExpiration: 1000, // 1 second cache for high-frequency data
  })

  // Update device colors when connected devices change
  useEffect(() => {
    if (connectedDevices.length > 0) {
      const newColors = generateMultiDeviceColors(connectedDevices)
      setDeviceColors(newColors)
    }
  }, [connectedDevices])

  const getCurrentSampleRateDisplay = useCallback((): string => {
    if (activeCollectingDevices.length === 0) {
      return '0 Hz'
    }

    const rates = activeCollectingDevices
      .map((deviceId) => getCurrentSampleRate(deviceId))
      .filter((rate): rate is number => rate !== null && rate > 0)

    if (rates.length === 0) {
      return 'calculating...'
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

  const convertPayloadToGaitData = useCallback((payload: GaitDataPayload): GaitData => {
    // Prefer provided high-res relative seconds; fallback to legacy timestamp via timestamp manager
    let tsSeconds: number
    if (typeof payload.monotonic_s === 'number') {
      tsSeconds = payload.monotonic_s
    } else if (typeof payload.timestamp_us === 'number') {
      // convert microseconds absolute to milliseconds then let manager derive relative base
      tsSeconds = getChartTimestamp(Math.floor(payload.timestamp_us / 1000))
    } else {
      tsSeconds = getChartTimestamp(payload.timestamp)
    }
    return {
      device_id: payload.device_id,
      R1: payload.r1,
      R2: payload.r2,
      R3: payload.r3,
      X: payload.x,
      Y: payload.y,
      Z: payload.z,
      timestamp: tsSeconds, // store relative/high-res seconds for chart
    }
  }, [getChartTimestamp])

  const updateChartForDevice = useCallback((deviceId: string, gaitData: GaitData) => {
    // Optimize state updates by batching them - use callback form to avoid excessive re-renders
    setAllDataPoints((prev) => {
      const deviceData = prev.get(deviceId) || []

      // Add new point
      const newPoint = {
        timestamp: gaitData.timestamp,
        R1: gaitData.R1,
        R2: gaitData.R2,
        R3: gaitData.R3,
        X: gaitData.X,
        Y: gaitData.Y,
        Z: gaitData.Z,
      }

      // Performance optimization: only create new Map if data actually changes
      const updatedData = [...deviceData, newPoint]

      // Apply time-based filtering to keep only recent data
      const cutoffTime = gaitData.timestamp - config.bufferConfig.slidingWindowSeconds
      const filteredData = updatedData.filter((point) => point.timestamp >= cutoffTime)

      // Apply maximum points limit
      const maxPoints = config.bufferConfig.maxChartPoints
      const finalData =
        filteredData.length > maxPoints ? filteredData.slice(-maxPoints) : filteredData

      // Only update state if data actually changed
      if (
        finalData.length === deviceData.length &&
        finalData.every(
          (point, index) => deviceData[index] && point.timestamp === deviceData[index].timestamp,
        )
      ) {
        return prev // No change needed
      }

      const newMap = new Map(prev)
      newMap.set(deviceId, finalData)
      return newMap
    })

    if (!chartRef.current) return

    const chart = chartRef.current
    const currentTime = gaitData.timestamp
    const windowSize = config.bufferConfig.slidingWindowSeconds
    const xScale = chart.options.scales?.x
    if (xScale && typeof xScale === 'object') {
      if (currentTime <= windowSize) {
        xScale.min = 0
        xScale.max = Math.max(windowSize, currentTime + 1)
      } else {
        xScale.min = currentTime - windowSize
        xScale.max = currentTime + 1
      }
    }
    // chart.update() batched elsewhere for perf
  }, [])

  const addBLEDataToChart = useCallback(
    (gaitData: GaitData) => {
      const deviceId = gaitData.device_id

      // Buffer manager expects ms-like increasing numbers; derive from seconds
      const syntheticMs = Math.floor(gaitData.timestamp * 1000)
      bufferManager.addDataPoint(deviceId, {
        device_id: deviceId,
        R1: gaitData.R1,
        R2: gaitData.R2,
        R3: gaitData.R3,
        X: gaitData.X,
        Y: gaitData.Y,
        Z: gaitData.Z,
        timestamp: syntheticMs,
      })

      const chartPoint: GaitData = gaitData // already in seconds

      if (chartRef.current) {
        updateChartForDevice(deviceId, chartPoint)

        pendingUpdatesRef.current.add(deviceId)

        if (chartUpdateBatchRef.current) {
          clearTimeout(chartUpdateBatchRef.current)
        }

        chartUpdateBatchRef.current = setTimeout(() => {
          if (chartRef.current && pendingUpdatesRef.current.size > 0) {
            chartRef.current.update('none')
            pendingUpdatesRef.current.clear()
          }
          chartUpdateBatchRef.current = null
        }, 50)

        const bufferStats = bufferManager.getBufferStats()
        if (bufferStats && bufferStats.totalDataPoints % 250 === 0) {
          console.log(
            `[Buffer] ${bufferStats.totalDataPoints} points / ${bufferStats.totalDevices} devices, mem: ${bufferStats.memoryUsageMB.toFixed(2)}MB`,
          )
        }
      }
    },
    [updateChartForDevice, bufferManager, getChartTimestamp],
  )

  useEffect(() => {
    if (!chartRef.current) return

    const chart = chartRef.current
    console.log(`[LiveChart] Chart mode changed to: ${chartMode}`)

    if (allDataPoints.size === 0) {
      chart.data.datasets = []
      chart.update('none')
      return
    }

    chart.data.datasets = []

    const channelConfigs = {
      all: [
        { key: 'R1' as const, label: 'R1 (Resistance)', colorKey: 'R1' as const },
        { key: 'R2' as const, label: 'R2 (Resistance)', colorKey: 'R2' as const },
        { key: 'R3' as const, label: 'R3 (Resistance)', colorKey: 'R3' as const },
        { key: 'X' as const, label: 'X (Accel)', colorKey: 'X' as const },
        { key: 'Y' as const, label: 'Y (Accel)', colorKey: 'Y' as const },
        { key: 'Z' as const, label: 'Z (Accel)', colorKey: 'Z' as const },
      ],
      resistance: [
        { key: 'R1' as const, label: 'R1 (Resistance)', colorKey: 'R1' as const },
        { key: 'R2' as const, label: 'R2 (Resistance)', colorKey: 'R2' as const },
        { key: 'R3' as const, label: 'R3 (Resistance)', colorKey: 'R3' as const },
      ],
      acceleration: [
        { key: 'X' as const, label: 'X (Accel)', colorKey: 'X' as const },
        { key: 'Y' as const, label: 'Y (Accel)', colorKey: 'Y' as const },
        { key: 'Z' as const, label: 'Z (Accel)', colorKey: 'Z' as const },
      ],
    }

    const channelsToShow = channelConfigs[chartMode] || channelConfigs.all

    allDataPoints.forEach((deviceData, deviceId) => {
      if (deviceData.length === 0) return

      const deviceLabel = getDeviceLabel(deviceId)
      let deviceColorPalette = deviceColors.get(deviceId)

      if (!deviceColorPalette) {
        console.warn(`[LiveChart] Missing color palette for ${deviceId} – generating fallback.`)
        const fallbackPalette = generateDeviceColorPalette(deviceId, 0)
        setDeviceColors((prev) => {
          const next = new Map(prev)
          next.set(deviceId, fallbackPalette)
          return next
        })
        deviceColorPalette = fallbackPalette
      }

      channelsToShow.forEach(({ key, label, colorKey }) => {
        const colors = deviceColorPalette[colorKey]
        const datasetLabel = `${deviceLabel} - ${label}`

        const channelData = deviceData.map((point) => ({
          x: point.timestamp,
          y: point[key] as number,
        }))

        const dataset = {
          label: datasetLabel,
          data: channelData,
          borderColor: colors.primary,
          backgroundColor: colors.background,
          tension: 0.1,
          pointRadius: 0,
          borderWidth: 2,
        }

        chart.data.datasets.push(dataset)
      })
    })

    const yScale = chart.options.scales?.y
    if (yScale && typeof yScale === 'object' && 'title' in yScale && yScale.title) {
      yScale.title.text =
        chartMode === 'resistance'
          ? 'Resistance Values'
          : chartMode === 'acceleration'
            ? 'Acceleration (m/s²)'
            : 'Sensor Values'
    }

    console.log(
      `[LiveChart] Created ${chart.data.datasets.length} datasets for ${allDataPoints.size} devices`,
    )
    chart.update('none')
  }, [chartMode, allDataPoints, deviceColors])

  // Chart initialization effect - create empty chart once
  useEffect(() => {
    if (!canvasRef.current || chartRef.current) return

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        scales: {
          x: {
            type: 'linear',
            title: {
              display: true,
              text: 'Time (seconds)',
            },
            grid: {
              color: 'rgba(0,0,0,0.1)',
            },
            min: 0,
            max: config.bufferConfig.slidingWindowSeconds,
            ticks: {
              stepSize: 2,
            },
          },
          y: {
            title: {
              display: true,
              text: 'Sensor Values',
            },
            grid: {
              color: 'rgba(0,0,0,0.1)',
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              usePointStyle: true,
              pointStyle: 'line',
              padding: 15,
              font: {
                size: 12,
              },
            },
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function (context) {
                const label = context.dataset.label || ''
                const value =
                  typeof context.parsed.y === 'number'
                    ? context.parsed.y.toFixed(2)
                    : context.parsed.y
                return `${label}: ${value}`
              },
            },
          },
        },
      },
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [])

  // Subscribe to gait data from context and handle simulation
  const prevCollectingRef = useRef<boolean>(false)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const simulationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const simulationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const prev = prevCollectingRef.current
    // START (rising edge)
    if (isCollecting && !prev) {
      console.log('[LiveChart] Collection START detected')
      // Clear buffers only on true transition
      bufferManager.clearAll()
      setAllDataPoints(new Map())
      console.log('[LiveChart] Buffers cleared for new session')

      // Subscribe to real BLE data
      unsubscribeRef.current = subscribeToGaitData((payload: GaitDataPayload) => {
  const gaitData = convertPayloadToGaitData(payload)
  addBLEDataToChart(gaitData)
      })

      // Schedule simulation fallback (cancelled if real devices stream first)
      simulationTimeoutRef.current = setTimeout(() => {
        if (activeCollectingDevices.length === 0 && isCollecting) {
          console.log('[LiveChart] Starting simulation mode (no active devices)')
          const simStartTime = Date.now()
          simulationIntervalRef.current = setInterval(() => {
            const now = Date.now()
            const timeSeconds = (now - simStartTime) / 1000
            const walkCycle = Math.sin(timeSeconds * 2 * Math.PI)
            const noise = () => (Math.random() - 0.5) * 2
            addBLEDataToChart({
              device_id: 'simulation',
              R1: 10.0 + walkCycle * 5 + noise(),
              R2: 11.0 + walkCycle * 4 + noise(),
              R3: 12.0 + walkCycle * 3 + noise(),
              X: walkCycle * 2 + noise(),
              Y: Math.cos(timeSeconds * 2 * Math.PI) * 1.5 + noise(),
              Z: 9.8 + walkCycle * 0.5 + noise(),
              timestamp: now,
            })
          }, 10)
        }
      }, 2000)
    }

    // STOP (falling edge)
    if (!isCollecting && prev) {
      console.log('[LiveChart] Collection STOP detected')
      if (simulationTimeoutRef.current) {
        clearTimeout(simulationTimeoutRef.current)
        simulationTimeoutRef.current = null
      }
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current)
        simulationIntervalRef.current = null
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
    }

    // Update previous flag
    prevCollectingRef.current = isCollecting
  }, [
    isCollecting,
    subscribeToGaitData,
    convertPayloadToGaitData,
    addBLEDataToChart,
    activeCollectingDevices,
    bufferManager,
  ])

  // Accessibility helpers
  const getChartSummary = useCallback((): string => {
    const stats = bufferManager.getBufferStats()
    const totalSamples = stats ? stats.totalDataPoints : 0
    const deviceCount = connectedDevices.length
    const currentMode =
      chartMode === 'all'
        ? 'all channels'
        : chartMode === 'resistance'
          ? 'resistance channels (R1, R2, R3)'
          : 'acceleration channels (X, Y, Z)'

    if (totalSamples === 0) {
      return `Gait monitoring chart showing ${currentMode}. No data collected yet. ${deviceCount} device${deviceCount !== 1 ? 's' : ''} connected.`
    }

    return `Gait monitoring chart showing ${currentMode}. ${totalSamples} data points collected from ${deviceCount} device${deviceCount !== 1 ? 's' : ''}. Current sample rate: ${getCurrentSampleRateDisplay()}.`
  }, [bufferManager, connectedDevices.length, chartMode, getCurrentSampleRateDisplay])

  const getLatestDataSummary = useCallback(() => {
    const chart = chartRef.current
    if (!chart || !chart.data.datasets.length) {
      return 'No data available'
    }

    const summaries: string[] = []
    chart.data.datasets.forEach((dataset) => {
      const data = dataset.data as { x: number; y: number }[]
      if (data.length > 0) {
        const latest = data[data.length - 1]
        const value = latest.y.toFixed(2)
        summaries.push(`${dataset.label}: ${value}`)
      }
    })

    return summaries.length > 0 ? summaries.join(', ') : 'No current readings'
  }, [])

  const handleKeyboardNavigation = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case '1':
          setChartMode('all')
          setAnnouncementText('Switched to all channels view')
          break
        case '2':
          setChartMode('resistance')
          setAnnouncementText('Switched to resistance channels view')
          break
        case '3':
          setChartMode('acceleration')
          setAnnouncementText('Switched to acceleration channels view')
          break
        case 's':
        case 'S':
          setAnnouncementText(getChartSummary())
          break
        case 'd':
        case 'D':
          setAnnouncementText(`Latest readings: ${getLatestDataSummary()}`)
          break
      }
    },
    [getChartSummary, getLatestDataSummary],
  )

  return (
    <section
      className="card"
      role="region"
      aria-labelledby="chart-title"
      onKeyDown={handleKeyboardNavigation}
    >
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {announcementText}
      </div>

      <header className="chart-header">
        <div className="chart-header-row">
          <div className="chart-title-area">
            <h2 id="chart-title">Live Gait Data</h2>
            <div className="chart-meta">
              <span className="data-count">
                {(() => {
                  const stats = bufferManager.getBufferStats()
                  return stats ? `${stats.totalDataPoints.toLocaleString()} samples` : '0 samples'
                })()}
              </span>
              <span className="sample-rate">{getCurrentSampleRateDisplay()}</span>
            </div>
          </div>

          <div className="chart-controls-area">
            <div className="view-controls">
              <div className="button-group" role="group" aria-label="Chart view modes">
                <button
                  type="button"
                  className={`view-btn ${chartMode === 'all' ? 'active' : ''}`}
                  onClick={() => setChartMode('all')}
                  data-state={chartMode === 'all' ? 'pressed' : 'unpressed'}
                  title="Show all channels (keyboard: 1)"
                >
                  All
                </button>
                <button
                  type="button"
                  className={`view-btn ${chartMode === 'resistance' ? 'active' : ''}`}
                  onClick={() => setChartMode('resistance')}
                  data-state={chartMode === 'resistance' ? 'pressed' : 'unpressed'}
                  title="Show resistance channels only (keyboard: 2)"
                >
                  Resistance
                </button>
                <button
                  type="button"
                  className={`view-btn ${chartMode === 'acceleration' ? 'active' : ''}`}
                  onClick={() => setChartMode('acceleration')}
                  data-state={chartMode === 'acceleration' ? 'pressed' : 'unpressed'}
                  title="Show acceleration channels only (keyboard: 3)"
                >
                  Acceleration
                </button>
              </div>
            </div>

            <div className="chart-status-area">
              <div className={`recording-badge ${isCollecting ? 'recording' : 'idle'}`}>
                <div className="status-indicator">
                  {isCollecting ? <Icon.Radio title="Recording" /> : <Icon.Pause title="Idle" />}
                </div>
                <span className="status-label">{isCollecting ? 'Recording' : 'Ready'}</span>
              </div>
            </div>
          </div>
        </div>

        <p className="chart-description sr-only">{getChartSummary()}</p>
      </header>
      <div className="chart-container">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={getChartSummary()}
          aria-describedby="chart-data-summary"
          tabIndex={-1}
        />
        <div id="chart-data-summary" className="sr-only">
          Latest readings: {getLatestDataSummary()}
        </div>
      </div>

      {/* Omitted debug buffer stats panel to reduce UI clutter */}
    </section>
  )
}
