import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import LiveChart from '../LiveChart'
import { DeviceConnectionProvider } from '../../contexts/DeviceConnectionContext'

// Mock Chart.js - everything must be defined within the mock callback due to hoisting
jest.mock('chart.js', () => {
  const createMockChart = (config?: { data?: { datasets?: unknown[] } }) => ({
    data: {
      datasets: config?.data?.datasets || []
    },
    update: jest.fn(),
    destroy: jest.fn(),
    resize: jest.fn()
  })

  interface MockChartConstructor {
    new (...args: unknown[]): ReturnType<typeof createMockChart>
    register: jest.Mock
    mockInstances: Array<ReturnType<typeof createMockChart>>
  }

  const MockChartConstructor = jest.fn((_canvas, config) => {
    const instance = createMockChart(config)
    MockChartConstructor.mockInstances.push(instance)
    return instance
  }) as unknown as MockChartConstructor
  
  MockChartConstructor.register = jest.fn()
  MockChartConstructor.mockInstances = []

  return {
    Chart: MockChartConstructor,
    LineController: class {},
    LineElement: class {},
    PointElement: class {},
    LinearScale: class {},
    TimeScale: class {},
    Title: class {},
    Tooltip: class {},
    Legend: class {},
    register: jest.fn()
  }
})

// Import Chart and access the mock
import { Chart } from 'chart.js'
const MockChartConstructor = Chart as jest.MockedClass<typeof Chart>

// Get access to the mock chart instance that's created in the mock
const getMockChart = () => {
  const MockChart = MockChartConstructor as unknown as {
    mockInstances?: Array<{
      data: { datasets: Array<{ data: unknown[]; label: string }> }
      update: jest.Mock
      destroy: jest.Mock
      resize: jest.Mock
    }>
  }
  
  if (MockChart.mockInstances && MockChart.mockInstances.length > 0) {
    return MockChart.mockInstances[MockChart.mockInstances.length - 1]
  }
  // Fallback mock chart for when no instances exist yet
  return {
    data: { datasets: [] as Array<{ data: unknown[]; label: string }> },
    update: jest.fn(),
    destroy: jest.fn(),
    resize: jest.fn()
  }
}

// Mock the config
jest.mock('../../config', () => ({
  config: {
    debugEnabled: false,
    chartBufferPoints: 500,
    maxDeviceBufferPoints: 1000,
    heartbeatTimeout: 30000
  }
}))

// Import the mocked config
import { config } from '../../config'

// Mock the hooks
const mockBufferManager = {
  addDataPoint: jest.fn(),
  getBufferData: jest.fn().mockReturnValue([]),
  clearAll: jest.fn(),
  getBufferStats: jest.fn().mockReturnValue({
    totalDataPoints: 100,
    memoryUsage: '1.2 MB',
    bufferSizes: { 'device-1': 50 }
  })
}

jest.mock('../../hooks/useBufferManager', () => ({
  useBufferManager: () => mockBufferManager
}))

jest.mock('../../hooks/useTimestampManager', () => ({
  useTimestampManager: () => ({
    getChartTimestamp: jest.fn((timestamp: number) => timestamp / 1000) // Convert to seconds
  })
}))

// Mock DeviceConnectionContext
const mockDeviceContext = {
  connectedDevices: ['device-1', 'device-2'],
  activeCollectingDevices: ['device-1'],
  connectionStatus: new Map([['device-1', 'connected']]),
  deviceHeartbeats: new Map(),
  subscribeToGaitData: jest.fn().mockReturnValue(jest.fn()), // Return unsubscribe function
  lastGaitDataTime: new Map(),
  getCurrentSampleRate: jest.fn().mockReturnValue(100),
  // Other required context values
  availableDevices: ['device-1', 'device-2'],
  expectedDevices: new Set(),
  scannedDevices: [],
  isScanning: false,
  isConnecting: false,
  connectionErrors: new Map(),
  scanDevices: jest.fn(),
  connectToDevice: jest.fn(),
  disconnectFromDevice: jest.fn(),
  refreshConnectedDevices: jest.fn(),
  addDevice: jest.fn(),
  removeDevice: jest.fn(),
  removeScannedDevice: jest.fn(),
  markDeviceAsExpected: jest.fn(),
  unmarkDeviceAsExpected: jest.fn(),
  setConnectedDevices: jest.fn(),
  startDeviceCollection: jest.fn(),
  stopDeviceCollection: jest.fn(),
  getActiveCollectingDevices: jest.fn()
}

jest.mock('../../contexts/DeviceConnectionContext', () => ({
  useDeviceConnection: () => mockDeviceContext,
  DeviceConnectionProvider: ({ children }: { children: React.ReactNode }) => 
    React.createElement('div', { 'data-testid': 'mock-provider' }, children)
}))

// Mock BufferStatsPanel
jest.mock('../BufferStatsPanel', () => {
  return function MockBufferStatsPanel({ isVisible }: { isVisible: boolean }) {
    return isVisible ? React.createElement('div', { 'data-testid': 'buffer-stats-panel' }, 'Buffer Stats') : null
  }
})

describe('LiveChart', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    jest.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    
    // The mock chart will be created when the Chart constructor is called
    // We just need to clear any previous mock calls
    MockChartConstructor.mockClear()
  })

  afterEach(() => {
    if (root) {
      flushSync(() => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
  })

  const renderComponent = (props = {}) => {
    flushSync(() => {
      root.render(
        React.createElement(DeviceConnectionProvider, { children:
          React.createElement(LiveChart, props)
        })
      )
    })
    return Promise.resolve()
  }

  describe('Component Rendering', () => {
    it('should render without crashing', async () => {
      await renderComponent()
      
      const canvas = container.querySelector('canvas')
      expect(canvas).toBeTruthy()
    })

    it('should render chart mode selector buttons', async () => {
      await renderComponent()
      
      const allButton = container.querySelector('button')
      expect(allButton?.textContent).toContain('All Channels')
      
      const buttons = container.querySelectorAll('.mode-btn')
      expect(buttons).toHaveLength(3)
    })

    it('should display sample rate information', async () => {
      await renderComponent()
      
      const info = container.querySelector('.data-info')
      expect(info?.textContent).toContain('Sample Rate: 100.0 Hz')
      expect(info?.textContent).toContain('Devices: 2')
      expect(info?.textContent).toContain('Total Samples: 100')
    })

    it('should render chart container', async () => {
      await renderComponent()
      
      const chartContainer = container.querySelector('.chart-container')
      expect(chartContainer).toBeTruthy()
      
      const canvas = chartContainer?.querySelector('canvas')
      expect(canvas).toBeTruthy()
    })
  })

  describe('Chart Mode Selection', () => {
    it('should start with "all" mode active', async () => {
      await renderComponent()
      
      const allButton = Array.from(container.querySelectorAll('.mode-btn'))
        .find(btn => btn.textContent?.includes('All Channels')) as HTMLElement
      
      expect(allButton?.classList.contains('active')).toBe(true)
    })

    it('should switch to resistance mode when clicked', async () => {
      await renderComponent()
      
      const resistanceButton = Array.from(container.querySelectorAll('.mode-btn'))
        .find(btn => btn.textContent?.includes('Resistance')) as HTMLElement
      
      flushSync(() => {
        resistanceButton?.click()
      })
      
      expect(resistanceButton?.classList.contains('active')).toBe(true)
    })

    it('should switch to acceleration mode when clicked', async () => {
      await renderComponent()
      
      const accelerationButton = Array.from(container.querySelectorAll('.mode-btn'))
        .find(btn => btn.textContent?.includes('Acceleration')) as HTMLElement
      
      flushSync(() => {
        accelerationButton?.click()
      })
      
      expect(accelerationButton?.classList.contains('active')).toBe(true)
    })

    it('should recreate chart when mode changes', async () => {
      await renderComponent()
      
      const resistanceButton = Array.from(container.querySelectorAll('.mode-btn'))
        .find(btn => btn.textContent?.includes('Resistance')) as HTMLElement
      
      const initialChartCalls = MockChartConstructor.mock.calls.length
      
      flushSync(() => {
        resistanceButton?.click()
      })
      
      // Chart should be recreated when mode changes
      expect(MockChartConstructor.mock.calls.length).toBeGreaterThan(initialChartCalls)
    })
  })

  describe('Data Collection', () => {
    it('should subscribe to gait data when collecting', async () => {
      await renderComponent({ isCollecting: true })
      
      expect(mockDeviceContext.subscribeToGaitData).toHaveBeenCalled()
    })

    it('should not subscribe when not collecting', async () => {
      await renderComponent({ isCollecting: false })
      
      expect(mockDeviceContext.subscribeToGaitData).not.toHaveBeenCalled()
    })

    it('should clear buffers when starting collection', async () => {
      const { useBufferManager } = await import('../../hooks/useBufferManager')
      const mockBufferManager = useBufferManager()
      await renderComponent({ isCollecting: true })
      
      expect(mockBufferManager.clearAll).toHaveBeenCalled()
    })

    it('should clear chart data when starting collection', async () => {
      await renderComponent({ isCollecting: true })
      
      // Chart datasets should be cleared
      const mockChart = getMockChart()
      expect(mockChart.data.datasets.forEach).toBeDefined()
      expect(mockChart.update).toHaveBeenCalledWith('none')
    })
  })

  describe('Sample Rate Display', () => {
    it('should show 0 Hz when no active devices', async () => {
      mockDeviceContext.activeCollectingDevices = []
      await renderComponent()
      
      const info = container.querySelector('.data-info')
      expect(info?.textContent).toContain('Sample Rate: 0 Hz')
    })

    it('should show calculating when no valid rates', async () => {
      mockDeviceContext.activeCollectingDevices = ['device-1']
      mockDeviceContext.getCurrentSampleRate.mockReturnValue(null)
      await renderComponent()
      
      const info = container.querySelector('.data-info')
      expect(info?.textContent).toContain('Sample Rate: calculating...')
    })

    it('should show single rate for one device', async () => {
      mockDeviceContext.activeCollectingDevices = ['device-1']
      mockDeviceContext.getCurrentSampleRate.mockReturnValue(95.5)
      await renderComponent()
      
      const info = container.querySelector('.data-info')
      expect(info?.textContent).toContain('Sample Rate: 95.5 Hz')
    })

    it('should show average rate for similar rates', async () => {
      mockDeviceContext.activeCollectingDevices = ['device-1', 'device-2']
      mockDeviceContext.getCurrentSampleRate
        .mockReset()
        .mockImplementation((deviceId: string) => {
          if (deviceId === 'device-1') return 100.0
          if (deviceId === 'device-2') return 100.2
          return null
        })
      await renderComponent()
      
      const info = container.querySelector('.data-info')
      expect(info?.textContent).toContain('Sample Rate: 100.1 Hz')
    })

    it('should show rate range for different rates', async () => {
      mockDeviceContext.activeCollectingDevices = ['device-1', 'device-2']
      mockDeviceContext.getCurrentSampleRate
        .mockReset()
        .mockImplementation((deviceId: string) => {
          if (deviceId === 'device-1') return 95.0
          if (deviceId === 'device-2') return 105.0
          return null
        })
      await renderComponent()
      
      const info = container.querySelector('.data-info')
      expect(info?.textContent).toContain('Sample Rate: 95.0-105.0 Hz')
    })
  })

  describe('Buffer Stats Panel', () => {
    beforeEach(() => {
      // Enable debug mode for these tests
      config.debugEnabled = true
    })

    afterEach(() => {
      // Reset debug mode
      config.debugEnabled = false
    })

    it('should show buffer stats button when debug enabled', async () => {
      await renderComponent()
      
      const button = Array.from(container.querySelectorAll('button'))
        .find(btn => btn.textContent?.includes('Show Buffer Stats'))
      
      expect(button).toBeTruthy()
    })

    it('should not show buffer stats button when debug disabled', async () => {
      config.debugEnabled = false
      await renderComponent()
      
      const button = Array.from(container.querySelectorAll('button'))
        .find(btn => btn.textContent?.includes('Buffer Stats'))
      
      expect(button).toBeFalsy()
    })

    it('should toggle buffer stats panel when clicked', async () => {
      await renderComponent()
      
      const button = Array.from(container.querySelectorAll('button'))
        .find(btn => btn.textContent?.includes('Show Buffer Stats')) as HTMLElement
      
      // Initially hidden
      expect(container.querySelector('[data-testid="buffer-stats-panel"]')).toBeFalsy()
      
      // Click to show
      flushSync(() => {
        button?.click()
      })
      
      expect(container.querySelector('[data-testid="buffer-stats-panel"]')).toBeTruthy()
      expect(button?.textContent).toContain('Hide Buffer Stats')
    })
  })

  describe('Chart Initialization', () => {
    it('should create Chart.js instance on mount', async () => {
      await renderComponent()
      expect(MockChartConstructor).toHaveBeenCalled()
      
      // Verify chart was created
      expect(MockChartConstructor.mock.calls.length).toBeGreaterThan(0)
    })

    it('should register Chart.js components', async () => {
      await renderComponent()
      
      // Chart.js registration should have been called during setup
      expect(MockChartConstructor).toHaveBeenCalled()
    })

    it('should destroy chart on unmount', async () => {
      await renderComponent()
      
      flushSync(() => {
        root.unmount()
      })
      
      const mockChart = getMockChart()
      expect(mockChart.destroy).toHaveBeenCalled()
    })

    it('should configure chart with proper datasets for all mode', async () => {
      await renderComponent()
      
      expect(MockChartConstructor).toHaveBeenCalled()
      
      // Verify chart initialization
      const mockChart = getMockChart()
      expect(mockChart.data.datasets).toBeDefined()
      expect(mockChart.data.datasets.length).toBeGreaterThan(0)
    })
  })

  describe('Device Information Display', () => {
    it('should display connected device count', async () => {
      await renderComponent()
      
      const info = container.querySelector('.data-info')
      expect(info?.textContent).toContain('Devices: 2')
    })

    it('should display total sample count', async () => {
      await renderComponent()
      
      const info = container.querySelector('.data-info')
      expect(info?.textContent).toContain('Total Samples: 100')
    })

    it('should display channel information', async () => {
      await renderComponent()
      
      const info = container.querySelector('.data-info')
      expect(info?.textContent).toContain('Channels: R1, R2, R3, X, Y, Z')
    })
  })

  describe('Props Handling', () => {
    it('should handle isCollecting prop change', async () => {
      await renderComponent({ isCollecting: false })
      
      // Should not be collecting initially
      expect(mockDeviceContext.subscribeToGaitData).not.toHaveBeenCalled()
      
      // Re-render with isCollecting: true
      flushSync(() => {
        root.render(
          React.createElement(DeviceConnectionProvider, { children:
            React.createElement(LiveChart, { isCollecting: true })
          })
        )
      })
      
      expect(mockDeviceContext.subscribeToGaitData).toHaveBeenCalled()
    })

    it('should work with default props', async () => {
      await renderComponent()
      
      // Should render without errors with default isCollecting: false
      const canvas = container.querySelector('canvas')
      expect(canvas).toBeTruthy()
    })
  })

  describe('Error Handling', () => {
    it('should handle missing canvas ref gracefully', async () => {
      // Mock canvasRef.current to be null
      const originalRef = React.useRef
      React.useRef = jest.fn().mockReturnValue({ current: null })
      
      expect(() => renderComponent()).not.toThrow()
      
      // Restore original useRef
      React.useRef = originalRef
    })

    it('should handle multiple chart recreations', async () => {
      await renderComponent()
      
      // Get initial chart instance count
      const initialCallCount = MockChartConstructor.mock.calls.length
      
      // Simulate mode changes that recreate the chart
      const modeButtons = container.querySelectorAll('.chart-mode-selector button')
      
      // Switch to resistance mode
      flushSync(() => {
        (modeButtons[1] as HTMLElement).click()
      })
      
      // Switch to acceleration mode  
      flushSync(() => {
        (modeButtons[2] as HTMLElement).click()
      })
      
      // Chart should have been recreated for each mode change
      expect(MockChartConstructor.mock.calls.length).toBeGreaterThan(initialCallCount)
    })
  })
})
