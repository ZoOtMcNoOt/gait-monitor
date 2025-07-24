// Legacy BufferManager utility - DEPRECATED
// This file exists only for backward compatibility during the migration to Rust backend
// New code should use useBufferManager hook instead

export interface GaitDataPoint {
  device_id: string
  timestamp: number
  R1: number
  R2: number
  R3: number
  X: number
  Y: number
  Z: number
  sequence_number: number
  signal_strength?: number
  battery_level?: number
}

export interface DeviceBufferStats {
  dataPoints: number
  memoryUsageMB: number
  oldestTimestamp: number
  newestTimestamp: number
  sampleRate: number
}

export interface BufferStats {
  totalDevices: number
  totalDataPoints: number
  memoryUsageMB: number
  oldestTimestamp: number
  newestTimestamp: number
  deviceStats: Map<string, DeviceBufferStats>
}

// Legacy BufferManager class - DO NOT USE IN NEW CODE
// This exists only to prevent import errors during migration
export class BufferManager {
  constructor() {
    console.warn('BufferManager is deprecated. Use useBufferManager hook instead.')
  }

  addDataPoint(_deviceId: string, _dataPoint: GaitDataPoint): void {
    console.warn('BufferManager.addDataPoint is deprecated. Use useBufferManager hook instead.')
  }

  getBufferStats(): BufferStats {
    console.warn('BufferManager.getBufferStats is deprecated. Use useBufferManager hook instead.')
    return {
      totalDevices: 0,
      totalDataPoints: 0,
      memoryUsageMB: 0,
      oldestTimestamp: 0,
      newestTimestamp: 0,
      deviceStats: new Map()
    }
  }

  getDeviceData(_deviceId: string, _startTime?: number, _endTime?: number): GaitDataPoint[] {
    console.warn('BufferManager.getDeviceData is deprecated. Use useBufferManager hook instead.')
    return []
  }

  getDeviceTimeWindow(_deviceId: string, _windowSeconds?: number): GaitDataPoint[] {
    console.warn('BufferManager.getDeviceTimeWindow is deprecated. Use useBufferManager hook instead.')
    return []
  }

  getDeviceRecent(_deviceId: string, _count: number): GaitDataPoint[] {
    console.warn('BufferManager.getDeviceRecent is deprecated. Use useBufferManager hook instead.')
    return []
  }

  removeDevice(_deviceId: string): void {
    console.warn('BufferManager.removeDevice is deprecated. Use useBufferManager hook instead.')
  }

  clearAll(): void {
    console.warn('BufferManager.clearAll is deprecated. Use useBufferManager hook instead.')
  }

  getMemoryUsage(): number {
    console.warn('BufferManager.getMemoryUsage is deprecated. Use useBufferManager hook instead.')
    return 0
  }

  destroy(): void {
    console.warn('BufferManager.destroy is deprecated. Use useBufferManager hook instead.')
  }
}

export default BufferManager
