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
    const testData = createMockGaitData()

    hookResult!.addData(testData)
    expect(hookResult!.getTotalDevices()).toBe(1)

    hookResult!.clear()
    expect(hookResult!.getTotalDevices()).toBe(0)
  })

  it('should provide buffer statistics', async () => {
    await renderHook()
    const testData = createMockGaitData()

    hookResult!.addData(testData)

    const stats = hookResult!.getBufferStats()
    expect(stats?.totalDevices).toBe(1)
    expect(stats?.totalDataPoints).toBe(1)
    expect(stats?.memoryUsageMB).toBeGreaterThan(0)
  })

  it('should handle multiple devices', async () => {
    await renderHook()
    const device1Data = createMockGaitData({ device_id: 'device-1' })
    const device2Data = createMockGaitData({ device_id: 'device-2' })

    hookResult!.addData(device1Data)
    hookResult!.addData(device2Data)

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
})
