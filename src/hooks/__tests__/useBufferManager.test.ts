import React from 'react'
import { createRoot } from 'react-dom/client'
import { useBufferManager } from '../useBufferManager'
import { createMockGaitData } from '../../test/utils'

// Mock the config module
jest.mock('../../config', () => ({
  config: {
    bufferConfig: {
      maxChartPoints: 1000,
      maxDeviceBufferPoints: 500,
      maxDeviceDatasets: 12,
      memoryThresholdMB: 50,
      cleanupInterval: 5000,
      slidingWindowSeconds: 10,
      enableCircularBuffers: true,
    }
  }
}))

describe('useBufferManager', () => {
  let hookResult: ReturnType<typeof useBufferManager> | null = null
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  function TestComponent() {
    hookResult = useBufferManager()
    return null
  }

  const renderHook = async () => {
    container = document.createElement('div')
    root = createRoot(container)
    root.render(React.createElement(TestComponent))
    
    // Wait for React to initialize the hook
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  afterEach(() => {
    if (root) {
      root.unmount()
    }
    if (container) {
      container.remove()
    }
    hookResult = null
  })

  it('should initialize with empty buffer', async () => {
    await renderHook()

    expect(hookResult).toBeDefined()
    
    // Wait a tick for useEffect to complete
    await new Promise(resolve => setTimeout(resolve, 0))
    
    expect(hookResult!.getTotalDevices()).toBe(0)
  })

  it('should add data to buffer', async () => {
    await renderHook()
    
    // Wait a tick for useEffect to complete
    await new Promise(resolve => setTimeout(resolve, 0))
    
    const testData = createMockGaitData()
    hookResult!.addData(testData)

    expect(hookResult!.getTotalDevices()).toBe(1)
  })

  it('should clear buffer data', async () => {
    await renderHook()
    
    // Wait a tick for useEffect to complete
    await new Promise(resolve => setTimeout(resolve, 0))
    
    const testData = createMockGaitData()

    hookResult!.addData(testData)
    expect(hookResult!.getTotalDevices()).toBe(1)

    hookResult!.clear()
    expect(hookResult!.getTotalDevices()).toBe(0)
  })

  it('should provide buffer statistics', async () => {
    await renderHook()
    
    // Wait a bit more for the hook to fully initialize
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const testData = createMockGaitData()

    hookResult!.addData(testData)
    
    // Give the buffer manager time to process the data
    await new Promise(resolve => setTimeout(resolve, 10))

    const stats = hookResult!.getBufferStats()
    expect(stats).toBeTruthy()
    expect(stats?.totalDevices).toBe(1)
    expect(stats?.totalDataPoints).toBe(1)
    expect(stats?.memoryUsageMB).toBeGreaterThan(0)
  })

  it('should handle multiple devices', async () => {
    await renderHook()
    
    // Wait for the hook to fully initialize
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const device1Data = createMockGaitData({ device_id: 'device-1' })
    const device2Data = createMockGaitData({ device_id: 'device-2' })

    hookResult!.addData(device1Data)
    hookResult!.addData(device2Data)

    // Give the buffer manager time to process the data
    await new Promise(resolve => setTimeout(resolve, 10))

    expect(hookResult!.getTotalDevices()).toBe(2)
  })

  it('should maintain buffer manager instance across re-renders', async () => {
    await renderHook()
    const testData = createMockGaitData()

    hookResult!.addData(testData)
    const firstDeviceCount = hookResult!.getTotalDevices()

    // Re-render the component
    root.render(React.createElement(TestComponent))
    await new Promise(resolve => setTimeout(resolve, 10))

    // Should maintain the same data
    expect(hookResult!.getTotalDevices()).toBe(firstDeviceCount)
  })

  describe('new API methods', () => {
    beforeEach(async () => {
      await renderHook()
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 50))
    })

    it('should handle addDataPoint method', () => {
      const testData = createMockGaitData()
      hookResult!.addDataPoint(testData.device_id, testData)
      
      expect(hookResult!.getTotalDevices()).toBe(1)
    })

    it('should handle getDeviceTimeWindow method', () => {
      const testData = createMockGaitData()
      hookResult!.addDataPoint(testData.device_id, testData)
      
      const windowData = hookResult!.getDeviceTimeWindow(testData.device_id, 10)
      expect(windowData).toHaveLength(1)
      expect(windowData[0]).toEqual(testData)
    })

    it('should handle getDeviceRecent method', () => {
      const testData = createMockGaitData()
      hookResult!.addDataPoint(testData.device_id, testData)
      
      const recentData = hookResult!.getDeviceRecent(testData.device_id, 5)
      expect(recentData).toHaveLength(1)
      expect(recentData[0]).toEqual(testData)
    })

    it('should handle removeDevice method', () => {
      const testData = createMockGaitData()
      hookResult!.addDataPoint(testData.device_id, testData)
      expect(hookResult!.getTotalDevices()).toBe(1)
      
      hookResult!.removeDevice(testData.device_id)
      expect(hookResult!.getTotalDevices()).toBe(0)
    })

    it('should handle clearAll method', () => {
      const testData = createMockGaitData()
      hookResult!.addDataPoint(testData.device_id, testData)
      expect(hookResult!.getTotalDevices()).toBe(1)
      
      hookResult!.clearAll()
      expect(hookResult!.getTotalDevices()).toBe(0)
    })

    it('should handle getMemoryUsage method', () => {
      const testData = createMockGaitData()
      hookResult!.addDataPoint(testData.device_id, testData)
      
      const memoryUsage = hookResult!.getMemoryUsage()
      expect(typeof memoryUsage).toBe('number')
      expect(memoryUsage).toBeGreaterThanOrEqual(0)
    })

    it('should handle performCleanup method', () => {
      const testData = createMockGaitData()
      hookResult!.addDataPoint(testData.device_id, testData)
      
      // Should not throw an error
      expect(() => hookResult!.performCleanup()).not.toThrow()
    })

    it('should handle getDeviceData with time range', async () => {
      // Use second-based timestamps to work with BufferManager's expectations
      const baseTime = Math.floor(Date.now() / 1000) // Convert to seconds
      const testData1 = createMockGaitData({ timestamp: baseTime })
      const testData2 = createMockGaitData({ timestamp: baseTime + 2 })
      const testData3 = createMockGaitData({ timestamp: baseTime + 4 })
      
      hookResult!.addDataPoint(testData1.device_id, testData1)
      hookResult!.addDataPoint(testData1.device_id, testData2)
      hookResult!.addDataPoint(testData1.device_id, testData3)
      
      // Wait a bit for the data to be processed
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Test time range filtering
      const rangeData = hookResult!.getDeviceData(testData1.device_id, baseTime, baseTime + 2.5)
      expect(rangeData).toHaveLength(2)
      expect(rangeData[0].timestamp).toBe(baseTime)
      expect(rangeData[1].timestamp).toBe(baseTime + 2)
    })

    it('should handle clear with specific deviceId', () => {
      const testData1 = createMockGaitData({ device_id: 'device-1' })
      const testData2 = createMockGaitData({ device_id: 'device-2' })
      
      hookResult!.addDataPoint(testData1.device_id, testData1)
      hookResult!.addDataPoint(testData2.device_id, testData2)
      expect(hookResult!.getTotalDevices()).toBe(2)
      
      hookResult!.clear('device-1')
      expect(hookResult!.getTotalDevices()).toBe(1)
    })
  })

  describe('error conditions and null states', () => {
    it('should handle methods gracefully when called immediately', async () => {
      // Create a fresh hook instance
      function TestComponentImmediate() {
        const hook = useBufferManager()
        // Test methods immediately on render, before useEffect runs
        
        // These should handle null gracefully since useEffect hasn't run yet
        expect(hook.getBufferStats()).toBeNull()
        expect(hook.getMemoryUsage()).toBe(0)
        expect(() => hook.performCleanup()).not.toThrow()
        expect(hook.getDeviceData('test')).toEqual([])
        expect(hook.getTotalDevices()).toBe(0)
        expect(hook.getDeviceTimeWindow('test')).toEqual([])
        expect(hook.getDeviceRecent('test', 5)).toEqual([])
        expect(() => hook.addDataPoint('test', createMockGaitData())).not.toThrow()
        expect(() => hook.removeDevice('test')).not.toThrow()
        expect(() => hook.clearAll()).not.toThrow()
        expect(() => hook.addData(createMockGaitData())).not.toThrow()
        expect(() => hook.clear()).not.toThrow()
        
        hookResult = hook
        return null
      }

      container = document.createElement('div')
      root = createRoot(container)
      root.render(React.createElement(TestComponentImmediate))

      // Wait for the render to complete
      await new Promise(resolve => setTimeout(resolve, 1))
    })
  })

  describe('buffer configuration', () => {
    it('should expose buffer configuration', async () => {
      await renderHook()
      
      expect(hookResult!.bufferConfig).toBeDefined()
      expect(hookResult!.bufferConfig.maxChartPoints).toBe(1000)
      expect(hookResult!.bufferConfig.maxDeviceBufferPoints).toBe(500)
      expect(hookResult!.bufferConfig.memoryThresholdMB).toBe(50)
    })
  })
})
