// Test utilities for creating mock data
import type { GaitDataPoint } from '../types'

export function createMockGaitData(overrides: Partial<GaitDataPoint> = {}): GaitDataPoint {
  return {
    device_id: 'test-device-1',
    r1: 1000,
    r2: 1500,
    r3: 2000,
    x: 0.1,
    y: 0.2,
    z: 0.3,
    timestamp: Date.now(),
    sequence: 1,
    ...overrides,
  }
}

export function createMockGaitDataArray(count: number, deviceId = 'test-device-1'): GaitDataPoint[] {
  const baseTimestamp = Date.now()
  return Array.from({ length: count }, (_, index) => 
    createMockGaitData({
      device_id: deviceId,
      timestamp: baseTimestamp + index * 100, // 100ms intervals to avoid time-based cleanup
      r1: 1000 + Math.random() * 100,
      r2: 1500 + Math.random() * 100,
      r3: 2000 + Math.random() * 100,
      x: Math.random() * 0.5,
      y: Math.random() * 0.5,
      z: Math.random() * 0.5,
      sequence: index + 1,
    })
  )
}

export function createMockDevice(overrides: Partial<{ id: string; name: string; rssi: number }> = {}) {
  return {
    id: 'test-device-1',
    name: 'Test Gait Device',
    rssi: -50,
    ...overrides,
  }
}

// Mock environment configuration
export const mockConfig = {
  maxChartPoints: 1000,
  dataUpdateInterval: 100,
  heartbeatTimeout: 10000,
  bufferConfig: {
    maxChartPoints: 1000,
    maxDeviceBufferPoints: 500,
    maxDeviceDatasets: 12,
    memoryThresholdMB: 50,
    cleanupInterval: 5000,
    slidingWindowSeconds: 3600, // 1 hour window for tests to avoid cleanup
    enableCircularBuffers: true,
  },
}

// Helper to wait for async operations in tests
export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Helper to mock console methods
export function mockConsole() {
  const originalConsole = global.console
  const mockConsole = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  }
  
  beforeEach(() => {
    global.console = { ...originalConsole, ...mockConsole }
  })
  
  afterEach(() => {
    global.console = originalConsole
    Object.values(mockConsole).forEach(mock => mock.mockClear())
  })
  
  return mockConsole
}
