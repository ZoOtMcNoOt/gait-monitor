import { TimestampManager, timestampUtils } from '../TimestampManager'

describe('TimestampManager', () => {
  let timestampManager: TimestampManager

  beforeEach(() => {
    timestampManager = new TimestampManager()
  })

  afterEach(() => {
    timestampManager.clearCache()
  })

  describe('getChartTimestamp', () => {
    it('should return relative time in seconds when base timestamp is set', () => {
      const baseTimestamp = Date.now()
      const laterTimestamp = baseTimestamp + 5000 // 5 seconds later

      // Set base timestamp
      timestampManager.setBaseTimestamp(baseTimestamp)

      // Get relative timestamp
      const chartTimestamp = timestampManager.getChartTimestamp(laterTimestamp)

      expect(chartTimestamp).toBe(5) // 5 seconds
    })

    it('should handle millisecond precision correctly', () => {
      const baseTimestamp = Date.now()
      const laterTimestamp = baseTimestamp + 1500 // 1.5 seconds later

      timestampManager.setBaseTimestamp(baseTimestamp)
      const chartTimestamp = timestampManager.getChartTimestamp(laterTimestamp)

      expect(chartTimestamp).toBe(1.5)
    })

    it('should return absolute timestamp when no base is set', () => {
      const timestamp = Date.now()
      const chartTimestamp = timestampManager.getChartTimestamp(timestamp)

      expect(chartTimestamp).toBe(timestamp)
    })
  })

  describe('formatTimestamp', () => {
    it('should format timestamp as relative time', () => {
      const baseTimestamp = Date.now()
      const testTimestamp = baseTimestamp + 2500 // 2.5 seconds later

      timestampManager.setBaseTimestamp(baseTimestamp)
      const formatted = timestampManager.formatTimestamp(testTimestamp, 'relative')

      expect(formatted).toBe('2.50s')
    })

    it('should format timestamp as duration', () => {
      const baseTimestamp = Date.now()
      const testTimestamp = baseTimestamp + 125000 // 125 seconds = 2m 5s

      timestampManager.setBaseTimestamp(baseTimestamp)
      const formatted = timestampManager.formatTimestamp(testTimestamp, 'duration')

      expect(formatted).toContain('2m')
      expect(formatted).toContain('5.0s')
    })

    it('should format timestamp as absolute time', () => {
      const timestamp = new Date('2025-07-14T10:30:00.000Z').getTime()
      const formatted = timestampManager.formatTimestamp(timestamp, 'absolute')

      // Should return a time string (format depends on locale)
      expect(formatted).toMatch(/\d{1,2}:\d{2}/)
    })

    it('should format timestamp as full datetime', () => {
      const timestamp = new Date('2025-07-14T10:30:00.000Z').getTime()
      const formatted = timestampManager.formatTimestamp(timestamp, 'full')

      expect(formatted).toContain('2025')
      expect(formatted).toContain('14')
    })
  })

  describe('normalizeTimestamp', () => {
    it('should return cached result for repeated calls', () => {
      const timestamp = Date.now()

      const first = timestampManager.normalizeTimestamp(timestamp)
      const second = timestampManager.normalizeTimestamp(timestamp)

      expect(first).toBe(second)
      expect(first.absolute).toBe(timestamp)
    })

    it('should calculate relative time correctly', () => {
      const baseTimestamp = Date.now()
      const testTimestamp = baseTimestamp + 3000

      timestampManager.setBaseTimestamp(baseTimestamp)
      const normalized = timestampManager.normalizeTimestamp(testTimestamp)

      expect(normalized.absolute).toBe(testTimestamp)
      expect(normalized.relative).toBe(3) // 3 seconds
    })
  })

  describe('getTimeDifference', () => {
    it('should calculate correct time difference', () => {
      const timestamp1 = Date.now()
      const timestamp2 = timestamp1 + 2500

      const difference = timestampManager.getTimeDifference(timestamp1, timestamp2)
      expect(difference).toBe(2500)
    })

    it('should return absolute difference regardless of order', () => {
      const timestamp1 = Date.now()
      const timestamp2 = timestamp1 + 2500

      const diff1 = timestampManager.getTimeDifference(timestamp1, timestamp2)
      const diff2 = timestampManager.getTimeDifference(timestamp2, timestamp1)

      expect(diff1).toBe(diff2)
      expect(diff1).toBe(2500)
    })
  })

  describe('setBaseTimestamp', () => {
    it('should set base timestamp and clear cache', () => {
      const timestamp = Date.now()
      timestampManager.normalizeTimestamp(timestamp) // Create cache entry

      const initialCacheSize = timestampManager.getCacheStats().size
      expect(initialCacheSize).toBeGreaterThan(0)

      timestampManager.setBaseTimestamp(timestamp)

      const finalCacheSize = timestampManager.getCacheStats().size
      expect(finalCacheSize).toBe(0) // Cache should be cleared
      expect(timestampManager.getCacheStats().baseTimestamp).toBe(timestamp)
    })
  })

  describe('cache management', () => {
    it('should use cache for repeated timestamp normalizations', () => {
      const timestamp = Date.now()

      // First call should create cache entry
      timestampManager.normalizeTimestamp(timestamp)
      expect(timestampManager.getCacheStats().size).toBe(1)

      // Second call should use cache
      timestampManager.normalizeTimestamp(timestamp)
      expect(timestampManager.getCacheStats().size).toBe(1)
    })

    it('should clear cache when requested', () => {
      const timestamp = Date.now()
      timestampManager.normalizeTimestamp(timestamp)

      expect(timestampManager.getCacheStats().size).toBe(1)

      timestampManager.clearCache()

      expect(timestampManager.getCacheStats().size).toBe(0)
    })
  })

  describe('singleton behavior', () => {
    it('should return the same instance', () => {
      const instance1 = TimestampManager.getInstance()
      const instance2 = TimestampManager.getInstance()

      expect(instance1).toBe(instance2)
    })

    it('should maintain state across getInstance calls', () => {
      const instance1 = TimestampManager.getInstance()
      const baseTimestamp = Date.now()

      instance1.setBaseTimestamp(baseTimestamp)

      const instance2 = TimestampManager.getInstance()
      const laterTimestamp = baseTimestamp + 1000
      const chartTimestamp = instance2.getChartTimestamp(laterTimestamp)

      expect(chartTimestamp).toBe(1) // Should use the same base timestamp
    })
  })

  describe('performance', () => {
    it('should handle rapid timestamp conversions efficiently', () => {
      const startTime = performance.now()
      const baseTimestamp = Date.now()

      // Convert 1000 timestamps
      for (let i = 0; i < 1000; i++) {
        timestampManager.getChartTimestamp(baseTimestamp + i)
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should complete within reasonable time (increased threshold for Windows/slower environments)
      expect(duration).toBeLessThan(500) // 500ms threshold to account for slower test environments
    })
  })
})

describe('timestampUtils', () => {
  describe('milliToSeconds', () => {
    it('should convert milliseconds to seconds', () => {
      expect(timestampUtils.milliToSeconds(1000)).toBe(1)
      expect(timestampUtils.milliToSeconds(1500)).toBe(1.5)
      expect(timestampUtils.milliToSeconds(0)).toBe(0)
    })
  })

  describe('getRelativeTime', () => {
    it('should calculate relative time in seconds', () => {
      const baseTime = Date.now()
      const laterTime = baseTime + 3500 // 3.5 seconds later

      const relativeTime = timestampUtils.getRelativeTime(laterTime, baseTime)
      expect(relativeTime).toBe(3.5)
    })
  })

  describe('createManager', () => {
    it('should create a new manager instance', () => {
      const manager = timestampUtils.createManager()
      expect(manager).toBeInstanceOf(TimestampManager)
    })

    it('should create manager with custom config', () => {
      const manager = timestampUtils.createManager({ useRelativeTime: false })
      expect(manager.getCacheStats().useRelativeTime).toBe(false)
    })
  })

  describe('getGlobalManager', () => {
    it('should return the singleton instance', () => {
      const global1 = timestampUtils.getGlobalManager()
      const global2 = timestampUtils.getGlobalManager()
      const singleton = TimestampManager.getInstance()

      expect(global1).toBe(global2)
      expect(global1).toBe(singleton)
    })
  })
})
