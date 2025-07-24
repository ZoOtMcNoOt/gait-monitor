import { useEffect, useState } from 'react'
import { useBufferManager } from '../hooks/useBufferManager'

interface Props {
  isVisible?: boolean
}

// Convert new BufferMetrics to legacy BufferStats format for display
interface BufferStats {
  totalDevices: number
  totalDataPoints: number
  memoryUsageMB: number
  oldestTimestamp: number
  newestTimestamp: number
  deviceStats: Map<string, {
    dataPoints: number
    memoryUsageMB: number
    oldestTimestamp: number
    newestTimestamp: number
    sampleRate: number
  }>
}

export default function BufferStatsPanel({ isVisible = false }: Props) {
  const { state: { globalMetrics, metrics }, actions: { cleanupOldData, forceMemoryCleanup } } = useBufferManager()
  const [stats, setStats] = useState<BufferStats | null>(null)
  const [refreshInterval, setRefreshInterval] = useState(1000) // ms

  useEffect(() => {
    if (!isVisible) return

    const updateStats = () => {
      try {
        if (!globalMetrics || !metrics) {
          setStats(null)
          return
        }

        // Convert new metrics format to legacy stats format
        const deviceStats = new Map()
        let totalDataPoints = 0
        let oldestTimestamp = Date.now()
        let newestTimestamp = 0

        Object.entries(metrics).forEach(([deviceId, deviceMetrics]) => {
          totalDataPoints += deviceMetrics.total_samples
          
          // Calculate approximate timestamps from age
          const now = Date.now()
          const oldest = deviceMetrics.oldest_sample_age_ms > 0 ? now - deviceMetrics.oldest_sample_age_ms : 0
          const newest = deviceMetrics.newest_sample_age_ms > 0 ? now - deviceMetrics.newest_sample_age_ms : now

          if (oldest > 0 && oldest < oldestTimestamp) {
            oldestTimestamp = oldest
          }
          if (newest > newestTimestamp) {
            newestTimestamp = newest
          }

          deviceStats.set(deviceId, {
            dataPoints: deviceMetrics.total_samples,
            memoryUsageMB: deviceMetrics.memory_usage_bytes / (1024 * 1024),
            oldestTimestamp: oldest,
            newestTimestamp: newest,
            sampleRate: deviceMetrics.data_rate_hz
          })
        })

        const currentStats: BufferStats = {
          totalDevices: globalMetrics.total_devices,
          totalDataPoints,
          memoryUsageMB: globalMetrics.total_memory_usage / (1024 * 1024),
          oldestTimestamp: oldestTimestamp === Date.now() ? 0 : oldestTimestamp,
          newestTimestamp,
          deviceStats
        }

        setStats(currentStats)
      } catch (error) {
        console.error('Error processing buffer stats:', error)
        setStats(null)
      }
    }

    // Update immediately
    updateStats()

    // Set up periodic updates
    const interval = setInterval(updateStats, refreshInterval)

    return () => {
      clearInterval(interval)
    }
  }, [isVisible, refreshInterval, globalMetrics, metrics])

  if (!isVisible || !stats) {
    return null
  }

  const formatBytes = (mb: number): string => {
    if (mb < 1) {
      return `${(mb * 1024).toFixed(1)} KB`
    }
    return `${mb.toFixed(2)} MB`
  }

  const formatTimestamp = (timestamp: number): string => {
    if (timestamp === 0) return 'N/A'
    return new Date(timestamp).toLocaleTimeString() // Timestamps are already in milliseconds
  }

  const getMemoryStatus = (usage: number): 'good' | 'warning' | 'critical' => {
    // Use a reasonable default memory threshold (128MB)
    const threshold = 128
    if (usage < threshold * 0.7) return 'good'
    if (usage < threshold * 0.9) return 'warning'
    return 'critical'
  }

  const memoryStatus = getMemoryStatus(stats.memoryUsageMB)

  return (
    <div className="buffer-stats-panel bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Buffer Statistics</h3>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">
            Refresh:
            <select 
              value={refreshInterval} 
              onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="ml-1 text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value={500}>0.5s</option>
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
            </select>
          </label>
        </div>
      </div>

      {/* Overall Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-3 rounded">
          <div className="text-sm text-blue-600 font-medium">Total Devices</div>
          <div className="text-xl font-bold text-blue-800">{stats.totalDevices}</div>
        </div>
        
        <div className="bg-green-50 p-3 rounded">
          <div className="text-sm text-green-600 font-medium">Total Data Points</div>
          <div className="text-xl font-bold text-green-800">{stats.totalDataPoints.toLocaleString()}</div>
        </div>
        
        <div className={`p-3 rounded ${
          memoryStatus === 'good' ? 'bg-green-50' : 
          memoryStatus === 'warning' ? 'bg-yellow-50' : 'bg-red-50'
        }`}>
          <div className={`text-sm font-medium ${
            memoryStatus === 'good' ? 'text-green-600' : 
            memoryStatus === 'warning' ? 'text-yellow-600' : 'text-red-600'
          }`}>
            Memory Usage
          </div>
          <div className={`text-xl font-bold ${
            memoryStatus === 'good' ? 'text-green-800' : 
            memoryStatus === 'warning' ? 'text-yellow-800' : 'text-red-800'
          }`}>
            {formatBytes(stats.memoryUsageMB)}
          </div>
          <div className="text-xs text-gray-500">
            Limit: {formatBytes(128)} {/* Default 128MB threshold */}
          </div>
        </div>
        
        <div className="bg-purple-50 p-3 rounded">
          <div className="text-sm text-purple-600 font-medium">Time Span</div>
          <div className="text-lg font-bold text-purple-800">
            {stats.newestTimestamp - stats.oldestTimestamp > 0 
              ? `${(stats.newestTimestamp - stats.oldestTimestamp).toFixed(1)}s`
              : 'N/A'
            }
          </div>
        </div>
      </div>

      {/* Configuration Display */}
      <div className="mb-6">
        <h4 className="text-md font-semibold text-gray-700 mb-2">Streaming Configuration</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div>
            <span className="text-gray-600">Max Subscribers:</span>
            <span className="font-mono ml-2">{globalMetrics?.total_devices || 0}</span>
          </div>
          <div>
            <span className="text-gray-600">Total Memory:</span>
            <span className="font-mono ml-2">{formatBytes((globalMetrics?.total_memory_usage || 0) / (1024 * 1024))}</span>
          </div>
          <div>
            <span className="text-gray-600">Cleanup Runs:</span>
            <span className="font-mono ml-2">{globalMetrics?.cleanup_runs || 0}</span>
          </div>
          <div>
            <span className="text-gray-600">Dropped Samples:</span>
            <span className="font-mono ml-2">{globalMetrics?.total_dropped_samples || 0}</span>
          </div>
          <div>
            <span className="text-gray-600">Average Utilization:</span>
            <span className="font-mono ml-2">{(globalMetrics?.average_utilization || 0).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Per-Device Statistics */}
      {stats.deviceStats.size > 0 && (
        <div>
          <h4 className="text-md font-semibold text-gray-700 mb-3">Device Statistics</h4>
          <div className="space-y-3">
            {Array.from(stats.deviceStats.entries()).map(([deviceId, deviceStats]) => (
              <div key={deviceId} className="bg-gray-50 p-3 rounded border">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-medium text-gray-800">
                    Device {deviceId.slice(-4)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {deviceStats.sampleRate > 0 ? `${deviceStats.sampleRate.toFixed(1)} Hz` : 'No rate'}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <span className="text-gray-600">Points:</span>
                    <span className="font-mono ml-1">{deviceStats.dataPoints}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Memory:</span>
                    <span className="font-mono ml-1">{formatBytes(deviceStats.memoryUsageMB)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Oldest:</span>
                    <span className="font-mono ml-1">{formatTimestamp(deviceStats.oldestTimestamp)}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Newest:</span>
                    <span className="font-mono ml-1">{formatTimestamp(deviceStats.newestTimestamp)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex gap-2">
          <button
            onClick={() => cleanupOldData()}
            className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
          >
            Cleanup Old Data
          </button>
          <button
            onClick={() => forceMemoryCleanup()}
            className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600 transition-colors"
          >
            Force Memory Cleanup
          </button>
        </div>
      </div>
    </div>
  )
}
