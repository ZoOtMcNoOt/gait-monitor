import { BufferManager } from '../BufferManager'
import { createMockGaitData, createMockGaitDataArray, mockConfig } from '../../test/utils'

describe('BufferManager', () => {
  let bufferManager: BufferManager

  beforeEach(() => {
    bufferManager = new BufferManager(mockConfig.bufferConfig)
  })

  afterEach(() => {
    bufferManager.clear()
  })

  describe('addData', () => {
    it('should add data for a new device', () => {
      const data = createMockGaitData()
      bufferManager.addData(data)

      const deviceData = bufferManager.getDeviceData('test-device-1')
      expect(deviceData).toHaveLength(1)
      expect(deviceData[0]).toEqual(data)
    })

    it('should add multiple data points for the same device', () => {
      const dataArray = createMockGaitDataArray(5)
      
      dataArray.forEach(data => bufferManager.addData(data))

      const deviceData = bufferManager.getDeviceData('test-device-1')
      expect(deviceData).toHaveLength(5)
    })

    it('should maintain separate buffers for different devices', () => {
      const device1Data = createMockGaitData({ device_id: 'device-1' })
      const device2Data = createMockGaitData({ device_id: 'device-2' })

      bufferManager.addData(device1Data)
      bufferManager.addData(device2Data)

      expect(bufferManager.getDeviceData('device-1')).toHaveLength(1)
      expect(bufferManager.getDeviceData('device-2')).toHaveLength(1)
      expect(bufferManager.getTotalDevices()).toBe(2)
    })

    it('should enforce maximum buffer size', () => {
      // Create a buffer manager with small capacity for testing
      const smallBufferManager = new BufferManager({
        ...mockConfig.bufferConfig,
        maxDeviceBufferPoints: 3,
      })

      const dataArray = createMockGaitDataArray(5)
      dataArray.forEach(data => smallBufferManager.addData(data))

      const deviceData = smallBufferManager.getDeviceData('test-device-1')
      expect(deviceData).toHaveLength(3)
      
      // Should contain the last 3 items (circular buffer behavior)
      expect(deviceData[0]).toEqual(dataArray[2])
      expect(deviceData[1]).toEqual(dataArray[3])
      expect(deviceData[2]).toEqual(dataArray[4])
    })
  })

  describe('getDeviceData', () => {
    it('should return empty array for non-existent device', () => {
      const deviceData = bufferManager.getDeviceData('non-existent')
      expect(deviceData).toEqual([])
    })

    it('should return data within specified time range', () => {
      const baseTimestamp = Date.now()
      const dataArray = [
        createMockGaitData({ timestamp: baseTimestamp }),
        createMockGaitData({ timestamp: baseTimestamp + 1000 }),
        createMockGaitData({ timestamp: baseTimestamp + 2000 }),
        createMockGaitData({ timestamp: baseTimestamp + 3000 }),
      ]

      dataArray.forEach(data => bufferManager.addData(data))

      const filteredData = bufferManager.getDeviceData(
        'test-device-1',
        baseTimestamp + 500,
        baseTimestamp + 2500
      )

      expect(filteredData).toHaveLength(2)
      expect(filteredData[0].timestamp).toBe(baseTimestamp + 1000)
      expect(filteredData[1].timestamp).toBe(baseTimestamp + 2000)
    })
  })

  describe('getBufferStats', () => {
    it('should return correct statistics for empty buffer', () => {
      const stats = bufferManager.getBufferStats()
      
      expect(stats.totalDevices).toBe(0)
      expect(stats.totalDataPoints).toBe(0)
      expect(stats.memoryUsageMB).toBe(0)
      expect(stats.deviceStats.size).toBe(0)
    })

    it('should return correct statistics with data', () => {
      const dataArray = createMockGaitDataArray(10)
      dataArray.forEach(data => bufferManager.addData(data))

      const stats = bufferManager.getBufferStats()
      
      expect(stats.totalDevices).toBe(1)
      expect(stats.totalDataPoints).toBe(10)
      expect(stats.memoryUsageMB).toBeGreaterThan(0)
      expect(stats.deviceStats.has('test-device-1')).toBe(true)

      const deviceStats = stats.deviceStats.get('test-device-1')!
      expect(deviceStats.dataPoints).toBe(10)
      expect(deviceStats.deviceId).toBe('test-device-1')
    })
  })

  describe('clear', () => {
    it('should clear all data', () => {
      const dataArray = createMockGaitDataArray(5)
      dataArray.forEach(data => bufferManager.addData(data))

      expect(bufferManager.getTotalDevices()).toBe(1)
      
      bufferManager.clear()
      
      expect(bufferManager.getTotalDevices()).toBe(0)
      expect(bufferManager.getDeviceData('test-device-1')).toHaveLength(0)
    })

    it('should clear data for specific device', () => {
      const device1Data = createMockGaitData({ device_id: 'device-1' })
      const device2Data = createMockGaitData({ device_id: 'device-2' })

      bufferManager.addData(device1Data)
      bufferManager.addData(device2Data)

      bufferManager.clear('device-1')

      expect(bufferManager.getDeviceData('device-1')).toHaveLength(0)
      expect(bufferManager.getDeviceData('device-2')).toHaveLength(1)
      expect(bufferManager.getTotalDevices()).toBe(1)
    })
  })

  describe('performance', () => {
    it('should handle large number of data points efficiently', () => {
      // Create a buffer manager with larger capacity for this test
      const largeBufferManager = new BufferManager({
        ...mockConfig.bufferConfig,
        maxDeviceBufferPoints: 1500, // Ensure we can store 1000+ points
      })
      
      const startTime = performance.now()
      
      // Add 1000 data points
      for (let i = 0; i < 1000; i++) {
        largeBufferManager.addData(createMockGaitData({ timestamp: Date.now() + i }))
      }
      
      const endTime = performance.now()
      const duration = endTime - startTime
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(2000) // 2000ms threshold - more realistic for Jest CI environment
      
      const stats = largeBufferManager.getBufferStats()
      expect(stats.totalDataPoints).toBe(1000)
      
      // Clean up
      largeBufferManager.destroy()
    })
  })
})
