import { useRef, useEffect, useCallback } from 'react'
import { BufferManager, type GaitDataPoint, type BufferStats } from '../utils/BufferManager'
import { config } from '../config'

/**
 * Hook for managing unified buffer system across the application
 */
export function useBufferManager() {
  const bufferManagerRef = useRef<BufferManager | null>(null)

  // Initialize buffer manager on first use
  useEffect(() => {
    if (!bufferManagerRef.current) {
      bufferManagerRef.current = new BufferManager(config.bufferConfig)
      console.log('🏗️ BufferManager initialized with config:', config.bufferConfig)
    }

    // Cleanup on unmount
    return () => {
      if (bufferManagerRef.current) {
        bufferManagerRef.current.destroy()
        bufferManagerRef.current = null
      }
    }
  }, [])

  /**
   * Add a data point to the buffer for a specific device
   */
  const addDataPoint = useCallback((deviceId: string, data: GaitDataPoint) => {
    if (bufferManagerRef.current) {
      bufferManagerRef.current.addDataPoint(deviceId, data)
    }
  }, [])

  /**
   * Get time window data for a device
   */
  const getDeviceTimeWindow = useCallback((deviceId: string, windowSeconds?: number): GaitDataPoint[] => {
    if (bufferManagerRef.current) {
      return bufferManagerRef.current.getDeviceTimeWindow(deviceId, windowSeconds)
    }
    return []
  }, [])

  /**
   * Get recent data points for a device
   */
  const getDeviceRecent = useCallback((deviceId: string, count: number): GaitDataPoint[] => {
    if (bufferManagerRef.current) {
      return bufferManagerRef.current.getDeviceRecent(deviceId, count)
    }
    return []
  }, [])

  /**
   * Remove a device from the buffer manager
   */
  const removeDevice = useCallback((deviceId: string) => {
    if (bufferManagerRef.current) {
      bufferManagerRef.current.removeDevice(deviceId)
    }
  }, [])

  /**
   * Clear all buffers
   */
  const clearAll = useCallback(() => {
    if (bufferManagerRef.current) {
      bufferManagerRef.current.clearAll()
    }
  }, [])

  /**
   * Get buffer statistics for monitoring
   */
  const getBufferStats = useCallback((): BufferStats | null => {
    if (bufferManagerRef.current) {
      return bufferManagerRef.current.getBufferStats()
    }
    return null
  }, [])

  /**
   * Get current memory usage
   */
  const getMemoryUsage = useCallback((): number => {
    if (bufferManagerRef.current) {
      return bufferManagerRef.current.getMemoryUsage()
    }
    return 0
  }, [])

  /**
   * Force cleanup operation
   */
  const performCleanup = useCallback(() => {
    if (bufferManagerRef.current) {
      bufferManagerRef.current.performCleanup()
    }
  }, [])

  return {
    addDataPoint,
    getDeviceTimeWindow,
    getDeviceRecent,
    removeDevice,
    clearAll,
    getBufferStats,
    getMemoryUsage,
    performCleanup,
    // Expose buffer configuration for debugging
    bufferConfig: config.bufferConfig
  }
}
