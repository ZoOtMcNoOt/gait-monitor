import type { BufferConfig } from '../config'

export interface GaitDataPoint {
  device_id: string
  R1: number
  R2: number
  R3: number
  X: number
  Y: number
  Z: number
  timestamp: number
}

export interface BufferStats {
  totalDevices: number
  totalDataPoints: number
  memoryUsageMB: number
  oldestTimestamp: number
  newestTimestamp: number
  deviceStats: Map<string, DeviceBufferStats>
}

export interface DeviceBufferStats {
  deviceId: string
  dataPoints: number
  memoryUsageMB: number
  oldestTimestamp: number
  newestTimestamp: number
  sampleRate: number
}

/**
 * Efficient circular buffer implementation for time-series data
 */
class CircularBuffer {
  private buffer: GaitDataPoint[]
  private head: number = 0
  private tail: number = 0
  private size: number = 0
  private capacity: number
  private windowDuration: number // seconds

  constructor(capacity: number, windowDuration: number = 10) {
    this.capacity = capacity
    this.buffer = new Array(capacity)
    this.windowDuration = windowDuration
  }

  /**
   * Add a new data point to the buffer
   */
  push(data: GaitDataPoint): void {
    // Add to current head position
    this.buffer[this.head] = data
    
    // Update head pointer
    this.head = (this.head + 1) % this.capacity
    
    // Update size and tail
    if (this.size < this.capacity) {
      this.size++
    } else {
      // Buffer is full, move tail forward
      this.tail = (this.tail + 1) % this.capacity
    }
    
    // Time-based cleanup: remove data older than window
    this.cleanupOldData(data.timestamp)
  }

  /**
   * Get all data points within the time window
   */
  getTimeWindow(currentTimestamp: number, windowSeconds?: number): GaitDataPoint[] {
    const window = windowSeconds || this.windowDuration
    const cutoffTime = currentTimestamp - window
    
    const result: GaitDataPoint[] = []
    
    if (this.size === 0) return result
    
    // Iterate from tail to head
    let current = this.tail
    for (let i = 0; i < this.size; i++) {
      const point = this.buffer[current]
      if (point && point.timestamp >= cutoffTime) {
        result.push(point)
      }
      current = (current + 1) % this.capacity
    }
    
    return result.sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get the most recent N data points
   */
  getRecent(count: number): GaitDataPoint[] {
    const result: GaitDataPoint[] = []
    
    if (this.size === 0) return result
    
    const actualCount = Math.min(count, this.size)
    
    // Get most recent points (work backwards from head)
    let current = (this.head - 1 + this.capacity) % this.capacity
    for (let i = 0; i < actualCount; i++) {
      const point = this.buffer[current]
      if (point) {
        result.unshift(point) // Add to front to maintain chronological order
      }
      current = (current - 1 + this.capacity) % this.capacity
    }
    
    return result
  }

  /**
   * Remove data older than the specified timestamp
   */
  private cleanupOldData(currentTimestamp: number): void {
    const cutoffTime = currentTimestamp - this.windowDuration
    
    // Remove old data points from tail
    while (this.size > 0) {
      const tailPoint = this.buffer[this.tail]
      if (tailPoint && tailPoint.timestamp < cutoffTime) {
        // Remove from tail
        delete this.buffer[this.tail]
        this.tail = (this.tail + 1) % this.capacity
        this.size--
      } else {
        break
      }
    }
  }

  /**
   * Get buffer statistics
   */
  getStats(): { size: number; capacity: number; memoryUsageMB: number; oldestTimestamp: number; newestTimestamp: number } {
    if (this.size === 0) {
      return {
        size: 0,
        capacity: this.capacity,
        memoryUsageMB: 0,
        oldestTimestamp: 0,
        newestTimestamp: 0
      }
    }

    // Estimate memory usage (each data point is roughly 64 bytes)
    const memoryUsageMB = (this.size * 64) / (1024 * 1024)
    
    // Find oldest and newest timestamps
    let oldest = Infinity
    let newest = -Infinity
    
    let current = this.tail
    for (let i = 0; i < this.size; i++) {
      const point = this.buffer[current]
      if (point) {
        oldest = Math.min(oldest, point.timestamp)
        newest = Math.max(newest, point.timestamp)
      }
      current = (current + 1) % this.capacity
    }

    return {
      size: this.size,
      capacity: this.capacity,
      memoryUsageMB,
      oldestTimestamp: oldest === Infinity ? 0 : oldest,
      newestTimestamp: newest === -Infinity ? 0 : newest
    }
  }

  /**
   * Clear all data from the buffer
   */
  clear(): void {
    this.head = 0
    this.tail = 0
    this.size = 0
    // Clear references to help garbage collection
    for (let i = 0; i < this.capacity; i++) {
      delete this.buffer[i]
    }
  }

  /**
   * Get current size
   */
  getCurrentSize(): number {
    return this.size
  }
}

/**
 * Unified buffer management system for gait data
 */
export class BufferManager {
  private deviceBuffers: Map<string, CircularBuffer> = new Map()
  private config: BufferConfig
  private memoryUsage: number = 0
  private cleanupTimer: NodeJS.Timeout | null = null
  private lastCleanupTime: number = 0

  constructor(config: BufferConfig) {
    this.config = config
    this.startPeriodicCleanup()
  }

  /**
   * Add a data point for a specific device
   */
  addDataPoint(deviceId: string, data: GaitDataPoint): void {
    // Get or create device buffer
    if (!this.deviceBuffers.has(deviceId)) {
      const buffer = new CircularBuffer(
        this.config.maxDeviceBufferPoints,
        this.config.slidingWindowSeconds
      )
      this.deviceBuffers.set(deviceId, buffer)
      console.log(`📊 BufferManager: Created new buffer for device ${deviceId}`)
    }

    const buffer = this.deviceBuffers.get(deviceId)!
    buffer.push(data)

    // Update memory usage estimate
    this.updateMemoryUsage()

    // Check for overflow protection
    if (this.memoryUsage > this.config.memoryThresholdMB) {
      console.warn(`⚠️ BufferManager: Memory threshold exceeded (${this.memoryUsage.toFixed(1)}MB), triggering cleanup`)
      this.performEmergencyCleanup()
    }
  }

  /**
   * Get time window data for a device
   */
  getDeviceTimeWindow(deviceId: string, windowSeconds?: number): GaitDataPoint[] {
    const buffer = this.deviceBuffers.get(deviceId)
    if (!buffer) return []

    const currentTime = Date.now() / 1000 // Convert to seconds
    return buffer.getTimeWindow(currentTime, windowSeconds || this.config.slidingWindowSeconds)
  }

  /**
   * Get recent data points for a device
   */
  getDeviceRecent(deviceId: string, count: number): GaitDataPoint[] {
    const buffer = this.deviceBuffers.get(deviceId)
    if (!buffer) return []

    return buffer.getRecent(count)
  }

  /**
   * Get buffer statistics for monitoring
   */
  getBufferStats(): BufferStats {
    let totalDataPoints = 0
    let oldestTimestamp = Infinity
    let newestTimestamp = -Infinity
    const deviceStats = new Map<string, DeviceBufferStats>()

    for (const [deviceId, buffer] of this.deviceBuffers) {
      const stats = buffer.getStats()
      totalDataPoints += stats.size

      if (stats.oldestTimestamp > 0) {
        oldestTimestamp = Math.min(oldestTimestamp, stats.oldestTimestamp)
        newestTimestamp = Math.max(newestTimestamp, stats.newestTimestamp)
      }

      // Calculate sample rate (points per second over the data span)
      const timeSpan = stats.newestTimestamp - stats.oldestTimestamp
      const sampleRate = timeSpan > 0 ? stats.size / timeSpan : 0

      deviceStats.set(deviceId, {
        deviceId,
        dataPoints: stats.size,
        memoryUsageMB: stats.memoryUsageMB,
        oldestTimestamp: stats.oldestTimestamp,
        newestTimestamp: stats.newestTimestamp,
        sampleRate
      })
    }

    return {
      totalDevices: this.deviceBuffers.size,
      totalDataPoints,
      memoryUsageMB: this.memoryUsage,
      oldestTimestamp: oldestTimestamp === Infinity ? 0 : oldestTimestamp,
      newestTimestamp: newestTimestamp === -Infinity ? 0 : newestTimestamp,
      deviceStats
    }
  }

  /**
   * Remove a device and its buffer
   */
  removeDevice(deviceId: string): void {
    const buffer = this.deviceBuffers.get(deviceId)
    if (buffer) {
      buffer.clear()
      this.deviceBuffers.delete(deviceId)
      this.updateMemoryUsage()
      console.log(`📊 BufferManager: Removed buffer for device ${deviceId}`)
    }
  }

  /**
   * Clear all buffers
   */
  clearAll(): void {
    for (const [, buffer] of this.deviceBuffers) {
      buffer.clear()
    }
    this.deviceBuffers.clear()
    this.memoryUsage = 0
    console.log('📊 BufferManager: Cleared all buffers')
  }

  /**
   * Get current memory usage in MB
   */
  getMemoryUsage(): number {
    return this.memoryUsage
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: BufferConfig): void {
    this.config = newConfig
    
    // Restart cleanup timer with new interval
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
    this.startPeriodicCleanup()
    
    console.log('📊 BufferManager: Configuration updated')
  }

  /**
   * Cleanup old data based on time windows
   */
  performCleanup(): void {
    const now = Date.now()
    
    // Skip if cleanup was performed recently
    if (now - this.lastCleanupTime < this.config.cleanupInterval / 2) {
      return
    }

    let cleanedDevices = 0
    let cleanedPoints = 0

    for (const [, buffer] of this.deviceBuffers) {
      const beforeSize = buffer.getCurrentSize()
      
      // Circular buffer automatically manages time-based cleanup
      // but we can trigger explicit cleanup if needed
      
      const afterSize = buffer.getCurrentSize()
      const cleaned = beforeSize - afterSize
      
      if (cleaned > 0) {
        cleanedDevices++
        cleanedPoints += cleaned
      }
    }

    this.updateMemoryUsage()
    this.lastCleanupTime = now

    if (cleanedPoints > 0) {
      console.log(`🧹 BufferManager: Cleaned ${cleanedPoints} points from ${cleanedDevices} devices`)
    }
  }

  /**
   * Emergency cleanup when memory threshold is exceeded
   */
  private performEmergencyCleanup(): void {
    console.warn('🚨 BufferManager: Performing emergency cleanup')
    
    // Reduce buffer sizes to 50% of maximum
    const emergencyLimit = Math.floor(this.config.maxDeviceBufferPoints * 0.5)
    
    for (const [deviceId, buffer] of this.deviceBuffers) {
      // Get recent data and clear buffer
      const recentData = buffer.getRecent(emergencyLimit)
      buffer.clear()
      
      // Re-add recent data
      for (const point of recentData) {
        buffer.push(point)
      }
      
      console.log(`🚨 Emergency cleanup for device ${deviceId}: reduced to ${recentData.length} points`)
    }
    
    this.updateMemoryUsage()
    console.warn(`🚨 BufferManager: Emergency cleanup complete, memory usage: ${this.memoryUsage.toFixed(1)}MB`)
  }

  /**
   * Start periodic cleanup timer
   */
  private startPeriodicCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup()
    }, this.config.cleanupInterval)
  }

  /**
   * Update memory usage estimate
   */
  private updateMemoryUsage(): void {
    let totalMemory = 0
    
    for (const buffer of this.deviceBuffers.values()) {
      const stats = buffer.getStats()
      totalMemory += stats.memoryUsageMB
    }
    
    this.memoryUsage = totalMemory
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.clearAll()
  }
}
