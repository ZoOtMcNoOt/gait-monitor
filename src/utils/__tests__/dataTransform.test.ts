import type { GaitDataPoint } from '../../types'
import {
  transformGaitDataToChart,
  groupDataByDevice,
  formatDeviceId,
  validateDeviceId,
  getDeviceColor,
  filterDataByTimeRange,
  calculateDataStatistics,
} from '../dataTransform'

describe('dataTransform utilities', () => {
  // Mock data for testing
  const mockGaitData: GaitDataPoint[] = [
    {
      timestamp: 1000,
      device_id: 'device-001',
      r1: 1.0,
      r2: 2.0,
      r3: 3.0,
      x: 10.5,
      y: 20.5,
      z: 30.5,
    },
    {
      timestamp: 2000,
      device_id: 'device-001',
      r1: 1.1,
      r2: 2.1,
      r3: 3.1,
      x: 11.5,
      y: 21.5,
      z: 31.5,
    },
    {
      timestamp: 3000,
      device_id: 'device-002',
      r1: 2.0,
      r2: 3.0,
      r3: 4.0,
      x: 12.5,
      y: 22.5,
      z: 32.5,
    },
  ]

  describe('transformGaitDataToChart', () => {
    it('should transform gait data to chart format using x values by default', () => {
      const result = transformGaitDataToChart(mockGaitData)

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ x: 1000, y: 10.5 })
      expect(result[1]).toEqual({ x: 2000, y: 11.5 })
      expect(result[2]).toEqual({ x: 3000, y: 12.5 })
    })

    it('should transform gait data using specified value key', () => {
      const result = transformGaitDataToChart(mockGaitData, 'y')

      expect(result).toHaveLength(3)
      expect(result[0]).toEqual({ x: 1000, y: 20.5 })
      expect(result[1]).toEqual({ x: 2000, y: 21.5 })
      expect(result[2]).toEqual({ x: 3000, y: 22.5 })
    })

    it('should handle different sensor values', () => {
      const r1Result = transformGaitDataToChart(mockGaitData, 'r1')
      const zResult = transformGaitDataToChart(mockGaitData, 'z')

      expect(r1Result[0]).toEqual({ x: 1000, y: 1.0 })
      expect(zResult[0]).toEqual({ x: 1000, y: 30.5 })
    })

    it('should handle empty data array', () => {
      const result = transformGaitDataToChart([])
      expect(result).toEqual([])
    })
  })

  describe('groupDataByDevice', () => {
    it('should group data by device ID', () => {
      const result = groupDataByDevice(mockGaitData)

      expect(result.size).toBe(2)
      expect(result.get('device-001')).toHaveLength(2)
      expect(result.get('device-002')).toHaveLength(1)

      const device001Data = result.get('device-001')!
      expect(device001Data[0].timestamp).toBe(1000)
      expect(device001Data[1].timestamp).toBe(2000)

      const device002Data = result.get('device-002')!
      expect(device002Data[0].timestamp).toBe(3000)
    })

    it('should handle empty data array', () => {
      const result = groupDataByDevice([])
      expect(result.size).toBe(0)
    })

    it('should handle single device', () => {
      const singleDeviceData = mockGaitData.slice(0, 2) // Only device-001 data
      const result = groupDataByDevice(singleDeviceData)

      expect(result.size).toBe(1)
      expect(result.get('device-001')).toHaveLength(2)
    })
  })

  describe('formatDeviceId', () => {
    it('should preserve properly formatted device IDs', () => {
      expect(formatDeviceId('device-123')).toBe('device-123')
      expect(formatDeviceId('dev-456')).toBe('dev-456')
    })

    it('should add device prefix to numeric IDs', () => {
      expect(formatDeviceId('123')).toBe('device-123')
      expect(formatDeviceId('456')).toBe('device-456')
    })

    it('should normalize case and trim whitespace', () => {
      expect(formatDeviceId('  DEVICE-ABC  ')).toBe('device-abc')
      expect(formatDeviceId('\tDEV-XYZ\n')).toBe('dev-xyz')
    })

    it('should preserve alphanumeric IDs without prefixes', () => {
      expect(formatDeviceId('sensor_01')).toBe('sensor_01')
      expect(formatDeviceId('imu-left-foot')).toBe('imu-left-foot')
    })

    it('should handle edge cases', () => {
      expect(formatDeviceId('')).toBe('')
      expect(formatDeviceId('   ')).toBe('')
      expect(formatDeviceId('0')).toBe('device-0')
    })
  })

  describe('validateDeviceId', () => {
    it('should validate properly formatted device IDs', () => {
      expect(validateDeviceId('device-123')).toBe(true)
      expect(validateDeviceId('sensor_01')).toBe(true)
      expect(validateDeviceId('imu-left-foot')).toBe(true)
      expect(validateDeviceId('ABC123_xyz')).toBe(true)
    })

    it('should reject invalid device IDs', () => {
      expect(validateDeviceId('')).toBe(false)
      expect(validateDeviceId('   ')).toBe(false)
      expect(validateDeviceId('device with spaces')).toBe(false)
      expect(validateDeviceId('device@123')).toBe(false)
      expect(validateDeviceId('device#123')).toBe(false)
    })

    it('should reject overly long device IDs', () => {
      const longId = 'a'.repeat(51)
      expect(validateDeviceId(longId)).toBe(false)

      const maxId = 'a'.repeat(50)
      expect(validateDeviceId(maxId)).toBe(true)
    })

    it('should handle special characters correctly', () => {
      expect(validateDeviceId('device-123')).toBe(true)
      expect(validateDeviceId('device_123')).toBe(true)
      expect(validateDeviceId('device.123')).toBe(false)
      expect(validateDeviceId('device+123')).toBe(false)
    })
  })

  describe('getDeviceColor', () => {
    it('should generate consistent colors for same device/type combinations', () => {
      const color1 = getDeviceColor('device-001', 'accelerometer')
      const color2 = getDeviceColor('device-001', 'accelerometer')

      expect(color1).toBe(color2)
    })

    it('should generate different colors for different devices', () => {
      const color1 = getDeviceColor('device-001', 'accelerometer')
      const color2 = getDeviceColor('device-002', 'accelerometer')

      expect(color1).not.toBe(color2)
    })

    it('should generate different colors for different data types', () => {
      const color1 = getDeviceColor('device-001', 'accelerometer')
      const color2 = getDeviceColor('device-001', 'gyroscope')

      expect(color1).not.toBe(color2)
    })

    it('should respect alpha parameter', () => {
      const color1 = getDeviceColor('device-001', 'accelerometer', 0.5)
      const color2 = getDeviceColor('device-001', 'accelerometer', 1.0)

      expect(color1).toMatch(/rgba\(\d+, \d+, \d+, 0\.5\)/)
      expect(color2).toMatch(/rgba\(\d+, \d+, \d+, 1\)/)
    })

    it('should default to alpha 1 when not specified', () => {
      const color = getDeviceColor('device-001', 'accelerometer')
      expect(color).toMatch(/rgba\(\d+, \d+, \d+, 1\)/)
    })

    it('should generate valid RGBA color strings', () => {
      const color = getDeviceColor('test', 'type')
      const rgbaPattern = /^rgba\((\d{1,3}), (\d{1,3}), (\d{1,3}), ([\d.]+)\)$/

      expect(color).toMatch(rgbaPattern)

      const matches = color.match(rgbaPattern)
      expect(matches).not.toBeNull()

      if (matches && matches.length >= 4) {
        const r = parseInt(matches[1], 10)
        const g = parseInt(matches[2], 10)
        const b = parseInt(matches[3], 10)
        const a = parseFloat(matches[4])

        expect(r).toBeGreaterThanOrEqual(0)
        expect(r).toBeLessThanOrEqual(255)
        expect(g).toBeGreaterThanOrEqual(0)
        expect(g).toBeLessThanOrEqual(255)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThanOrEqual(255)
        expect(a).toBeGreaterThanOrEqual(0)
        expect(a).toBeLessThanOrEqual(1)
      }
    })
  })

  describe('filterDataByTimeRange', () => {
    it('should filter data within time range', () => {
      const result = filterDataByTimeRange(mockGaitData, 1500, 2500)

      expect(result).toHaveLength(1)
      expect(result[0].timestamp).toBe(2000)
    })

    it('should include boundary values', () => {
      const result = filterDataByTimeRange(mockGaitData, 1000, 3000)

      expect(result).toHaveLength(3)
      expect(result.map((d) => d.timestamp)).toEqual([1000, 2000, 3000])
    })

    it('should handle empty result', () => {
      const result = filterDataByTimeRange(mockGaitData, 500, 800)
      expect(result).toHaveLength(0)
    })

    it('should handle empty input data', () => {
      const result = filterDataByTimeRange([], 1000, 2000)
      expect(result).toEqual([])
    })

    it('should handle invalid time ranges', () => {
      // Start time after end time
      const result = filterDataByTimeRange(mockGaitData, 3000, 1000)
      expect(result).toHaveLength(0)
    })
  })

  describe('calculateDataStatistics', () => {
    it('should calculate statistics for x values by default', () => {
      const stats = calculateDataStatistics(mockGaitData)

      expect(stats.count).toBe(3)
      expect(stats.min).toBe(10.5)
      expect(stats.max).toBe(12.5)
      expect(stats.mean).toBe(11.5)
      expect(stats.std).toBeCloseTo(0.816, 3)
    })

    it('should calculate statistics for specified value key', () => {
      const yStats = calculateDataStatistics(mockGaitData, 'y')

      expect(yStats.count).toBe(3)
      expect(yStats.min).toBe(20.5)
      expect(yStats.max).toBe(22.5)
      expect(yStats.mean).toBe(21.5)
    })

    it('should calculate statistics for sensor values', () => {
      const r1Stats = calculateDataStatistics(mockGaitData, 'r1')

      expect(r1Stats.count).toBe(3)
      expect(r1Stats.min).toBe(1.0)
      expect(r1Stats.max).toBe(2.0)
      expect(r1Stats.mean).toBeCloseTo(1.367, 3)
    })

    it('should handle empty data array', () => {
      const stats = calculateDataStatistics([])

      expect(stats.count).toBe(0)
      expect(stats.min).toBe(0)
      expect(stats.max).toBe(0)
      expect(stats.mean).toBe(0)
      expect(stats.std).toBe(0)
    })

    it('should handle single data point', () => {
      const singlePoint = [mockGaitData[0]]
      const stats = calculateDataStatistics(singlePoint)

      expect(stats.count).toBe(1)
      expect(stats.min).toBe(10.5)
      expect(stats.max).toBe(10.5)
      expect(stats.mean).toBe(10.5)
      expect(stats.std).toBe(0)
    })

    it('should calculate correct standard deviation', () => {
      // Simple test case: [0, 1, 2] should have std dev of sqrt(2/3) ≈ 0.816
      const simpleData: GaitDataPoint[] = [
        { timestamp: 1, device_id: 'test', r1: 0, r2: 0, r3: 0, x: 0, y: 0, z: 0 },
        { timestamp: 2, device_id: 'test', r1: 0, r2: 0, r3: 0, x: 1, y: 0, z: 0 },
        { timestamp: 3, device_id: 'test', r1: 0, r2: 0, r3: 0, x: 2, y: 0, z: 0 },
      ]

      const stats = calculateDataStatistics(simpleData, 'x')
      expect(stats.mean).toBe(1)
      expect(stats.std).toBeCloseTo(Math.sqrt(2 / 3), 5)
    })
  })
})
