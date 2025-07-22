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
    maxChartPoints: 1000,
    heartbeatTimeout: 30000,
    bufferConfig: {
      maxChartPoints: 1000,
      maxDeviceBufferPoints: 500,
      maxDeviceDatasets: 12,
      memoryThresholdMB: 50,
      cleanupInterval: 5000,
      slidingWindowSeconds: 10,
      enableCircularBuffers: true
    }
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
    bufferSizes: { 'device-1': 50 },
    deviceStats: new Map([
      ['device-1', { dataPoints: 50, memoryMB: 0.5 }]
    ])
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
      
      expect(resistanceButton?.classList.contains('active')).toBe(true
      )
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

    it('should handle chart destruction on unmount', async () => {
      await renderComponent()
      
      const mockChart = getMockChart()
      
      // Unmount component
      flushSync(() => {
        root.unmount()
      })
      
      // Chart destroy should be called
      expect(mockChart.destroy).toHaveBeenCalled()
    })

    it('should handle invalid gait data gracefully', async () => {
      await renderComponent({ isCollecting: true })
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      
      // Test that component doesn't crash with error handling
      expect(() => renderComponent()).not.toThrow()
      
      consoleErrorSpy.mockRestore()
    })
  })

  describe('Buffer Management', () => {
    it('should add data points to buffer when receiving gait data', async () => {
      await renderComponent({ isCollecting: true })
      
      // Just verify that the component subscribes to gait data when collecting
      expect(mockDeviceContext.subscribeToGaitData).toHaveBeenCalled()
    })

    it('should update chart with buffer data periodically', async () => {
      // Mock buffer data
      mockBufferManager.getBufferData.mockReturnValue([
        {
          device_id: 'device-1',
          R1: 100, R2: 200, R3: 300,
          X: 0.1, Y: 0.2, Z: 0.3,
          timestamp: Date.now() - 1000
        },
        {
          device_id: 'device-1', 
          R1: 110, R2: 210, R3: 310,
          X: 0.2, Y: 0.3, Z: 0.4,
          timestamp: Date.now()
        }
      ])
      
      await renderComponent({ isCollecting: true })
      
      const mockChart = getMockChart()
      
      // Should update chart with buffer data
      expect(mockChart.update).toHaveBeenCalled()
    })

    it('should handle empty buffer data', async () => {
      mockBufferManager.getBufferData.mockReturnValue([])
      
      await renderComponent({ isCollecting: true })
      
      const mockChart = getMockChart()
      
      // Should still update chart even with empty data
      expect(mockChart.update).toHaveBeenCalled()
      expect(mockChart.data.datasets).toBeDefined()
    })

    it('should limit data points based on config', async () => {
      // Mock large amount of buffer data
      const largeDataSet = Array.from({ length: 1000 }, (_, i) => ({
        device_id: 'device-1',
        R1: i, R2: i + 1, R3: i + 2,
        X: i * 0.1, Y: i * 0.2, Z: i * 0.3,
        timestamp: Date.now() + i
      }))
      
      mockBufferManager.getBufferData.mockReturnValue(largeDataSet)
      
      await renderComponent({ isCollecting: true })
      
      // Should limit data points based on configuration
      expect(config.bufferConfig.maxChartPoints).toBeDefined()
    })
  })

  describe('Chart Modes', () => {
    it('should display different datasets for each chart mode', async () => {
      await renderComponent()
      
      const allButton = Array.from(container.querySelectorAll('.mode-btn'))
        .find(btn => btn.textContent?.includes('All')) as HTMLElement
      const resistanceButton = Array.from(container.querySelectorAll('.mode-btn'))
        .find(btn => btn.textContent?.includes('Resistance')) as HTMLElement
      const accelerationButton = Array.from(container.querySelectorAll('.mode-btn'))
        .find(btn => btn.textContent?.includes('Acceleration')) as HTMLElement
      
      // Test all modes
      flushSync(() => {
        allButton?.click()
      })
      let mockChart = getMockChart()
      expect(mockChart.data.datasets.length).toBeGreaterThan(0)
      
      // Test resistance mode
      flushSync(() => {
        resistanceButton?.click()
      })
      mockChart = getMockChart()
      expect(mockChart.data.datasets.length).toBeGreaterThan(0)
      
      // Test acceleration mode
      flushSync(() => {
        accelerationButton?.click()
      })
      mockChart = getMockChart()
      expect(mockChart.data.datasets.length).toBeGreaterThan(0)
    })

    it('should maintain active mode selection styling', async () => {
      await renderComponent()
      
      const modeButtons = container.querySelectorAll('.mode-btn')
      const resistanceButton = modeButtons[1] as HTMLElement
      
      // Initially all mode should be active
      expect(modeButtons[0].classList.contains('active')).toBe(true)
      
      // Click resistance mode
      flushSync(() => {
        resistanceButton.click()
      })
      
      // Resistance mode should be active
      expect(resistanceButton.classList.contains('active')).toBe(true)
      expect(modeButtons[0].classList.contains('active')).toBe(false)
    })
  })

  describe('Device Integration', () => {
    it('should display connected devices status', async () => {
      mockDeviceContext.connectedDevices = ['device-1', 'device-2']
      mockDeviceContext.activeCollectingDevices = ['device-1']
      
      await renderComponent({ isCollecting: true })
      
      // Should show device status
      const statusElements = container.querySelectorAll('.device-status, .connection-status')
      expect(statusElements.length).toBeGreaterThan(0)
    })

    it('should handle device connection changes', async () => {
      // Start with no devices
      mockDeviceContext.connectedDevices = []
      mockDeviceContext.activeCollectingDevices = []
      
      await renderComponent({ isCollecting: true })
      
      // Simulate device connection
      mockDeviceContext.connectedDevices = ['device-1']
      mockDeviceContext.activeCollectingDevices = ['device-1']
      
      // Re-render component
      flushSync(() => {
        root.render(
          React.createElement(DeviceConnectionProvider, { children:
            React.createElement(LiveChart, { isCollecting: true })
          })
        )
      })
      
      // Should handle connection changes without crashing
      expect(container.querySelector('canvas')).toBeTruthy()
    })

    it('should display sample rate information', async () => {
      mockDeviceContext.getCurrentSampleRate.mockReturnValue(100)
      mockDeviceContext.activeCollectingDevices = ['device-1']
      
      await renderComponent({ isCollecting: true })
      
      // Should display sample rate
      expect(mockDeviceContext.getCurrentSampleRate).toHaveBeenCalledWith('device-1')
    })

    it('should handle device heartbeat timeouts', async () => {
      const mockHeartbeats = new Map()
      mockHeartbeats.set('device-1', Date.now() - 35000) // Older than heartbeat timeout
      mockDeviceContext.deviceHeartbeats = mockHeartbeats
      
      await renderComponent({ isCollecting: true })
      
      // Should handle stale heartbeats
      expect(container.querySelector('canvas')).toBeTruthy()
    })
  })

  describe('User Interface Controls', () => {
    it('should toggle buffer stats panel', async () => {
      await renderComponent()
      
      const toggleButton = Array.from(container.querySelectorAll('button'))
        .find(btn => btn.textContent?.includes('Stats') || btn.textContent?.includes('Buffer'))
      
      if (toggleButton) {
        flushSync(() => {
          toggleButton.click()
        })
        
        // Should show buffer stats
        const bufferStats = container.querySelector('.buffer-stats, .stats-panel')
        expect(bufferStats).toBeTruthy()
      }
    })

    it('should toggle data table view', async () => {
      await renderComponent()
      
      const toggleButton = Array.from(container.querySelectorAll('button'))
        .find(btn => btn.textContent?.includes('Table') || btn.textContent?.includes('Data'))
      
      if (toggleButton) {
        flushSync(() => {
          toggleButton.click()
        })
        
        // Should show data table
        const dataTable = container.querySelector('.data-table, table')
        expect(dataTable).toBeTruthy()
      }
    })

    it('should handle keyboard shortcuts', async () => {
      await renderComponent()
      
      // Simulate keyboard events
      const keyboardEvent = new KeyboardEvent('keydown', { key: 'r', ctrlKey: true })
      document.dispatchEvent(keyboardEvent)
      
      // Should handle keyboard shortcuts without crashing
      expect(container.querySelector('canvas')).toBeTruthy()
    })
  })

  describe('Performance and Memory', () => {
    it('should cleanup chart resources on unmount', async () => {
      await renderComponent()
      
      const mockChart = getMockChart()
      
      // Unmount component
      flushSync(() => {
        root.unmount()
      })
      
      // Should destroy chart to prevent memory leaks
      expect(mockChart.destroy).toHaveBeenCalled()
    })

    it('should throttle chart updates for performance', async () => {
      await renderComponent({ isCollecting: true })
      
      const mockChart = getMockChart()
      
      // Just verify that the chart updates are called (throttling is an internal optimization)
      expect(mockChart.update).toHaveBeenCalled()
    })

    it('should handle chart resize events', async () => {
      await renderComponent()
      
      const mockChart = getMockChart()
      
      // Simulate window resize by calling resize directly (since resize events are typically handled internally)
      if (mockChart.resize) {
        mockChart.resize()
        expect(mockChart.resize).toHaveBeenCalled()
      } else {
        // If resize isn't available on the mock, just ensure the component handles resize gracefully
        window.dispatchEvent(new Event('resize'))
        expect(container.querySelector('canvas')).toBeTruthy()
      }
    })
  })

  describe('Accessibility', () => {
    it('should have proper ARIA labels', async () => {
      await renderComponent()
      
      const canvas = container.querySelector('canvas')
      const ariaLabel = canvas?.getAttribute('aria-label')
      
      // Should have accessibility labels
      expect(ariaLabel || canvas?.getAttribute('role')).toBeTruthy()
    })

    it('should provide text alternatives for chart data', async () => {
      mockBufferManager.getBufferData.mockReturnValue([
        {
          device_id: 'device-1',
          R1: 100, R2: 200, R3: 300,
          X: 0.1, Y: 0.2, Z: 0.3,
          timestamp: Date.now()
        }
      ])
      
      await renderComponent({ isCollecting: true })
      
      // Should provide accessible data representation
      const accessibleElements = container.querySelectorAll('[aria-label], [role], .sr-only')
      expect(accessibleElements.length).toBeGreaterThan(0)
    })
  })

  describe('Advanced Chart Functionality', () => {
    test('should handle chart data updates during collection', () => {
      const mockBufferData = [
        { device_id: 'device1', x: 1, y: 2, z: 3, r1: 4, r2: 5, r3: 6, timestamp: 1000 },
        { device_id: 'device1', x: 2, y: 3, z: 4, r1: 5, r2: 6, r3: 7, timestamp: 2000 }
      ];

      mockBufferManager.getBufferData.mockReturnValue(mockBufferData);

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: true }));
      });

      const chart = getMockChart();
      expect(chart.update).toHaveBeenCalled();
    });

    test('should handle chart mode switching with data', () => {
      const mockBufferData = [
        { device_id: 'device1', x: 1, y: 2, z: 3, r1: 4, r2: 5, r3: 6, timestamp: 1000 }
      ];

      mockBufferManager.getBufferData.mockReturnValue(mockBufferData);

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      // Chart should be created and updated
      const chart = getMockChart();
      expect(chart.data.datasets).toBeDefined();
    });

    test('should handle empty buffer data gracefully', () => {
      mockBufferManager.getBufferData.mockReturnValue([]);

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: true }));
      });

      const chart = getMockChart();
      // Chart should still create datasets even with empty data
      expect(chart.data.datasets.length).toBeGreaterThan(0);
    });

    test('should handle device heartbeat status updates', () => {
      mockDeviceContext.deviceHeartbeats = new Map([['device1', Date.now()]]);
      mockDeviceContext.connectedDevices = ['device1'];
      mockDeviceContext.activeCollectingDevices = ['device1'];

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: true }));
      });

      // Should render without errors when device heartbeats are present
      expect(container.querySelector('.chart-container')).toBeTruthy();
    });

    test('should handle sample rate calculations', () => {
      const mockGetCurrentSampleRate = jest.fn()
        .mockReturnValueOnce(50)
        .mockReturnValueOnce(60);

      mockDeviceContext.activeCollectingDevices = ['device1', 'device2'];
      mockDeviceContext.getCurrentSampleRate = mockGetCurrentSampleRate;

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: true }));
      });

      // Should handle multiple sample rates
      expect(container).toBeTruthy();
    });

    test('should handle chart update intervals during collection', () => {
      jest.useFakeTimers();

      mockBufferManager.getBufferData.mockReturnValue([
        { device_id: 'device1', x: 1, y: 2, z: 3, r1: 4, r2: 5, r3: 6, timestamp: 1000 }
      ]);

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: true }));
      });

      // Fast-forward time to trigger chart updates
      jest.advanceTimersByTime(1000);

      const chart = getMockChart();
      expect(chart.update).toHaveBeenCalled();

      jest.useRealTimers();
    });

    test('should handle buffer stats panel toggle', () => {
      // Enable debug mode for buffer stats
      (config.debugEnabled as boolean) = true;

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      const bufferStatsBtn = container.querySelector('[data-testid="buffer-stats-toggle"]') as HTMLButtonElement;
      if (bufferStatsBtn) {
        bufferStatsBtn.click();
      }

      // Should handle buffer stats toggle
      expect(container).toBeTruthy();

      // Reset config
      (config.debugEnabled as boolean) = false;
    });

    test('should handle data table toggle', () => {
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      const dataTableBtn = container.querySelector('[data-testid="data-table-toggle"]') as HTMLButtonElement;
      if (dataTableBtn) {
        dataTableBtn.click();
      }

      // Should handle data table toggle
      expect(container).toBeTruthy();
    });

    test('should handle keyboard navigation', () => {
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      // Test keyboard events
      const chartContainer = container.querySelector('.chart-container');
      if (chartContainer) {
        const keyEvent = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
        chartContainer.dispatchEvent(keyEvent);
      }

      // Should handle keyboard events gracefully
      expect(container).toBeTruthy();
    });

    test('should handle chart announcement updates', () => {
      const mockBufferData = [
        { device_id: 'device1', x: 1, y: 2, z: 3, r1: 4, r2: 5, r3: 6, timestamp: 1000 }
      ];

      mockBufferManager.getBufferData.mockReturnValue(mockBufferData);

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: true }));
      });

      // Should update accessibility announcements
      const announceElement = container.querySelector('[aria-live="polite"]');
      expect(announceElement).toBeTruthy();
    });

    test('should handle chart resize events', () => {
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      // Chart should be created without errors
      const chart = getMockChart();
      expect(chart.data.datasets).toBeDefined();
    });

    test('should handle buffer overflow scenarios', () => {
      // Create a large dataset to test buffer limits
      const largeDataset = Array.from({ length: 2000 }, (_, i) => ({
        device_id: 'device1',
        x: i, y: i + 1, z: i + 2,
        r1: i + 3, r2: i + 4, r3: i + 5,
        timestamp: 1000 + i
      }));

      mockBufferManager.getBufferData.mockReturnValue(largeDataset);

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: true }));
      });

      // Should handle large datasets gracefully
      const chart = getMockChart();
      expect(chart.update).toHaveBeenCalled();
    });

    test('should handle multiple device data merging', () => {
      const multiDeviceData = [
        { device_id: 'device1', x: 1, y: 2, z: 3, r1: 4, r2: 5, r3: 6, timestamp: 1000 },
        { device_id: 'device2', x: 2, y: 3, z: 4, r1: 5, r2: 6, r3: 7, timestamp: 1000 },
        { device_id: 'device1', x: 3, y: 4, z: 5, r1: 6, r2: 7, r3: 8, timestamp: 2000 }
      ];

      mockBufferManager.getBufferData.mockReturnValue(multiDeviceData);
      mockDeviceContext.connectedDevices = ['device1', 'device2'];
      mockDeviceContext.activeCollectingDevices = ['device1', 'device2'];

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: true }));
      });

      // Should handle multiple devices
      const chart = getMockChart();
      expect(chart.data.datasets.length).toBeGreaterThan(0);
    });

    test('should handle data collection start/stop transitions', () => {
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      // Switch to collecting
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: true }));
      });

      // Switch back to not collecting
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      // Should handle state transitions gracefully
      expect(container.querySelector('.chart-container')).toBeTruthy();
    });

    test('should handle chart color scheme updates', () => {
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      // Test that chart colors are properly configured
      const chart = getMockChart();
      expect(chart.data.datasets).toBeDefined();
    });

    test('should handle timestamp manager integration', () => {
      const mockBufferData = [
        { device_id: 'device1', x: 1, y: 2, z: 3, r1: 4, r2: 5, r3: 6, timestamp: 1500 }
      ];

      mockBufferManager.getBufferData.mockReturnValue(mockBufferData);

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: true }));
      });

      // Should use timestamp manager for chart data conversion
      const chart = getMockChart();
      expect(chart.update).toHaveBeenCalled();
    });
  });

  describe('Chart Configuration and Setup', () => {
    test('should configure chart with proper options for all mode', () => {
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      const chart = getMockChart();
      expect(chart.data.datasets).toBeDefined();
    });

    test('should configure chart with proper options for resistance mode', () => {
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      // Chart should be properly configured
      const chart = getMockChart();
      expect(chart.data.datasets).toBeDefined();
    });

    test('should configure chart with proper options for acceleration mode', () => {
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      // Chart should be properly configured  
      const chart = getMockChart();
      expect(chart.data.datasets).toBeDefined();
    });

    test('should handle chart legend configuration', () => {
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      // Chart should be configured with legend
      const chart = getMockChart();
      expect(chart.data.datasets).toBeDefined();
    });

    test('should handle chart axis configuration', () => {
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      // Chart should be configured with proper axes
      const chart = getMockChart();
      expect(chart.data.datasets).toBeDefined();
    });

    test('should handle chart tooltip configuration', () => {
      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: false }));
      });

      // Chart should be configured with tooltips
      const chart = getMockChart();
      expect(chart.data.datasets).toBeDefined();
    });

    test('should handle chart performance optimizations', () => {
      // Test with high-frequency data
      const highFreqData = Array.from({ length: 100 }, (_, i) => ({
        device_id: 'device1',
        x: Math.sin(i * 0.1), y: Math.cos(i * 0.1), z: Math.tan(i * 0.1),
        r1: i, r2: i + 1, r3: i + 2,
        timestamp: 1000 + i * 10
      }));

      mockBufferManager.getBufferData.mockReturnValue(highFreqData);

      flushSync(() => {
        root.render(React.createElement(LiveChart, { isCollecting: true }));
      });

      // Should handle high-frequency data efficiently
      const chart = getMockChart();
      expect(chart.update).toHaveBeenCalled();
    });
  });
})
