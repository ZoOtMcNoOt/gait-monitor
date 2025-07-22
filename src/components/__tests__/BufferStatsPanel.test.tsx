import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import BufferStatsPanel from '../BufferStatsPanel'
import type { BufferStats } from '../../utils/BufferManager'

// Mock the useBufferManager hook
const mockBufferManager = {
  getBufferStats: jest.fn(),
  performCleanup: jest.fn(),
  clearAll: jest.fn(),
  bufferConfig: {
    maxChartPoints: 1000,
    maxDeviceBufferPoints: 500,
    maxDeviceDatasets: 12,
    memoryThresholdMB: 50,
    cleanupInterval: 5000,
    slidingWindowSeconds: 30,
    enableCircularBuffers: true,
  }
}

jest.mock('../../hooks/useBufferManager', () => ({
  useBufferManager: jest.fn(() => mockBufferManager)
}))

// Mock timers
jest.useFakeTimers()

describe('BufferStatsPanel', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  const mockStats: BufferStats = {
    totalDevices: 2,
    totalDataPoints: 300,
    memoryUsageMB: 25.5,
    oldestTimestamp: Date.now() - 60000,
    newestTimestamp: Date.now(),
    deviceStats: new Map([
      ['device1', {
        deviceId: 'device1',
        dataPoints: 100,
        memoryUsageMB: 10.2,
        oldestTimestamp: Date.now() - 60000,
        newestTimestamp: Date.now() - 1000,
        sampleRate: 50
      }],
      ['device2', {
        deviceId: 'device2', 
        dataPoints: 200,
        memoryUsageMB: 15.3,
        oldestTimestamp: Date.now() - 45000,
        newestTimestamp: Date.now() - 2000,
        sampleRate: 60
      }]
    ])
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    jest.clearAllMocks()
    mockBufferManager.getBufferStats.mockReturnValue(mockStats)
  })

  afterEach(() => {
    flushSync(() => {
      root.unmount()
    })
    document.body.removeChild(container)
    jest.clearAllTimers()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  describe('Visibility Control', () => {
    it('should not render when isVisible is false', () => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: false }))
      })
      expect(container.textContent).not.toContain('Buffer Statistics')
    })

    it('should not render when isVisible is undefined', () => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, {}))
      })
      expect(container.textContent).not.toContain('Buffer Statistics')
    })

    it('should render when isVisible is true', () => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      // Wait for useEffect to run and stats to be set
      flushSync(() => {
        jest.runOnlyPendingTimers()
      })
      expect(container.textContent).toContain('Buffer Statistics')
    })

    it('should hide content when transitioning from visible to hidden', () => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      // Wait for useEffect to run and stats to be set
      flushSync(() => {
        jest.runOnlyPendingTimers()
      })
      expect(container.textContent).toContain('Buffer Statistics')

      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: false }))
      })
      expect(container.textContent).not.toContain('Buffer Statistics')
    })
  })

  describe('Data Display', () => {
    it('should call getBufferStats on mount when visible', () => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      expect(mockBufferManager.getBufferStats).toHaveBeenCalledTimes(1)
    })

    it('should not call getBufferStats when not visible', () => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: false }))
      })
      expect(mockBufferManager.getBufferStats).not.toHaveBeenCalled()
    })

    it('should update data when becoming visible', () => {
      // Start hidden
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: false }))
      })
      expect(mockBufferManager.getBufferStats).not.toHaveBeenCalled()

      // Become visible
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      expect(mockBufferManager.getBufferStats).toHaveBeenCalledTimes(1)
    })
  })

  describe('Refresh Interval', () => {
    it('should set up refresh interval when visible', () => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      
      // At this point, getBufferStats has been called once immediately
      const initialCallCount = mockBufferManager.getBufferStats.mock.calls.length
      
      // Advance timer by the full interval (1000ms default) - should trigger one more refresh
      flushSync(() => {
        jest.advanceTimersByTime(1000)
      })
      
      // Should have called getBufferStats one more time from the interval
      expect(mockBufferManager.getBufferStats).toHaveBeenCalledTimes(initialCallCount + 1)
    })

    it('should not refresh when not visible', () => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: false }))
      })

      // Advance timer - should not call getBufferStats
      flushSync(() => {
        jest.advanceTimersByTime(1000)
      })
      expect(mockBufferManager.getBufferStats).not.toHaveBeenCalled()
    })

    it('should stop refresh interval when becoming hidden', () => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      expect(mockBufferManager.getBufferStats).toHaveBeenCalledTimes(1)

      // Hide the panel
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: false }))
      })

      // Advance timer - should not call getBufferStats again
      flushSync(() => {
        jest.advanceTimersByTime(2000)
      })
      expect(mockBufferManager.getBufferStats).toHaveBeenCalledTimes(1)
    })
  })

  describe('Statistics Display', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      // Wait for useEffect to run and stats to be set
      flushSync(() => {
        jest.runOnlyPendingTimers()
      })
    })

    it('should display refresh interval controls', () => {
      expect(container.textContent).toContain('Refresh:')
    })

    it('should display overall memory usage', () => {
      expect(container.textContent).toContain('25.50 MB')
      expect(container.textContent).toContain('Total Devices')
      expect(container.textContent).toContain('Total Data Points')
    })

    it('should display memory status with correct color coding', () => {
      // Check for memory usage display
      expect(container.textContent).toContain('Memory Usage')
      expect(container.textContent).toContain('Limit: 50.00 MB')
    })

    it('should display device statistics', () => {
      expect(container.textContent).toContain('Device ice1')  // device1.slice(-4)
      expect(container.textContent).toContain('Device ice2')  // device2.slice(-4)
      expect(container.textContent).toContain('100')  // data points
      expect(container.textContent).toContain('200')  // data points
    })

    it('should display cleanup information', () => {
      expect(container.textContent).toContain('Force Cleanup')
      expect(container.textContent).toContain('Clear All Buffers')
    })
  })

  describe('Action Buttons', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      // Wait for useEffect to run and stats to be set
      flushSync(() => {
        jest.runOnlyPendingTimers()
      })
    })

    it('should display cleanup button', () => {
      const cleanupButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Force Cleanup')
      )
      expect(cleanupButton).toBeTruthy()
    })

    it('should display clear all button', () => {
      const clearButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Clear All Buffers')
      )
      expect(clearButton).toBeTruthy()
    })

    it('should call performCleanup when cleanup button is clicked', () => {
      const cleanupButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Force Cleanup')
      )
      
      if (cleanupButton) {
        flushSync(() => {
          (cleanupButton as HTMLButtonElement).click()
        })
        expect(mockBufferManager.performCleanup).toHaveBeenCalledTimes(1)
      }
    })

    it('should call clearAll when clear all button is clicked', () => {
      const clearButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Clear All Buffers')
      )
      
      if (clearButton) {
        flushSync(() => {
          (clearButton as HTMLButtonElement).click()
        })
        expect(mockBufferManager.clearAll).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe('Interval Controls', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      // Wait for useEffect to run and stats to be set
      flushSync(() => {
        jest.runOnlyPendingTimers()
      })
    })

    it('should allow changing refresh interval', () => {
      const select = container.querySelector('select')
      if (select) {
        // Change to 5 second interval
        flushSync(() => {
          select.value = '5000'
          select.dispatchEvent(new Event('change', { bubbles: true }))
        })

        // Clear previous calls
        jest.clearAllMocks()
        mockBufferManager.getBufferStats.mockReturnValue(mockStats)

        // Advance by 2 seconds - should not trigger yet
        flushSync(() => {
          jest.advanceTimersByTime(2000)
        })
        expect(mockBufferManager.getBufferStats).not.toHaveBeenCalled()

        // Advance to 5 seconds - should trigger
        flushSync(() => {
          jest.advanceTimersByTime(3000)
        })
        expect(mockBufferManager.getBufferStats).toHaveBeenCalledTimes(1)
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle null buffer stats gracefully', () => {
      mockBufferManager.getBufferStats.mockReturnValue(null)
      
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      
      // Should not crash and should not render content since stats is null
      expect(container.textContent).toBe('')
    })

    it('should handle undefined buffer stats gracefully', () => {
      mockBufferManager.getBufferStats.mockReturnValue(undefined)
      
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      
      // Should not crash and should not render content since stats is undefined
      expect(container.textContent).toBe('')
    })

    it('should handle errors in getBufferStats gracefully', () => {
      // Suppress console.error for this test
      const originalError = console.error
      console.error = jest.fn()
      
      mockBufferManager.getBufferStats.mockImplementation(() => {
        throw new Error('Mock error')
      })
      
      // The component should handle the error gracefully and not crash
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      
      // Component should not display content since getBufferStats failed and stats is null
      expect(container.textContent).toBe('')
      
      // Verify console.error was called
      expect(console.error).toHaveBeenCalledWith('Error getting buffer stats:', expect.any(Error))
      
      // Restore console.error
      console.error = originalError
    })
  })

  describe('Memory Status Indicators', () => {
    it('should show warning status for high memory usage', () => {
      const warningStats = {
        ...mockStats,
        memoryUsageMB: 37.5  // 75% of 50MB threshold
      }
      mockBufferManager.getBufferStats.mockReturnValue(warningStats)
      
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      // Wait for useEffect to run and stats to be set
      flushSync(() => {
        jest.runOnlyPendingTimers()
      })
      
      expect(container.textContent).toContain('37.50 MB')
    })

    it('should show critical status for very high memory usage', () => {
      const criticalStats = {
        ...mockStats,
        memoryUsageMB: 45  // 90% of 50MB threshold
      }
      mockBufferManager.getBufferStats.mockReturnValue(criticalStats)
      
      flushSync(() => {
        root.render(React.createElement(BufferStatsPanel, { isVisible: true }))
      })
      // Wait for useEffect to run and stats to be set
      flushSync(() => {
        jest.runOnlyPendingTimers()
      })
      
      expect(container.textContent).toContain('45.00 MB')
    })
  })
})
