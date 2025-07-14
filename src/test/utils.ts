// Test utilities for creating mock data
import type { GaitDataPoint } from '../utils/BufferManager'

export function createMockGaitData(overrides: Partial<GaitDataPoint> = {}): GaitDataPoint {
  return {
    device_id: 'test-device-1',
    R1: 1000,
    R2: 1500,
    R3: 2000,
    X: 0.1,
    Y: 0.2,
    Z: 0.3,
    timestamp: Date.now(),
    ...overrides,
  }
}

export function createMockGaitDataArray(count: number, deviceId = 'test-device-1'): GaitDataPoint[] {
  const baseTimestamp = Date.now()
  return Array.from({ length: count }, (_, index) => 
    createMockGaitData({
      device_id: deviceId,
      timestamp: baseTimestamp + index * 100, // 100ms intervals to avoid time-based cleanup
      R1: 1000 + Math.random() * 100,
      R2: 1500 + Math.random() * 100,
      R3: 2000 + Math.random() * 100,
      X: Math.random() * 0.5,
      Y: Math.random() * 0.5,
      Z: Math.random() * 0.5,
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
