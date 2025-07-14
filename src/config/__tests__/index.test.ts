import { config, validateConfig, isDevelopment, isProduction, isDebugEnabled } from '../index'

describe('Config Module', () => {
  describe('config object', () => {
    it('should have valid default configuration', () => {
      expect(config).toBeDefined()
      expect(config.maxChartPoints).toBeGreaterThan(0)
      expect(config.bufferConfig).toBeDefined()
      expect(config.bufferConfig.maxChartPoints).toBeGreaterThan(0)
      expect(config.bufferConfig.maxDeviceBufferPoints).toBeGreaterThan(0)
    })

    it('should have buffer configuration', () => {
      const { bufferConfig } = config
      
      expect(bufferConfig.maxChartPoints).toBeGreaterThan(0)
      expect(bufferConfig.maxDeviceBufferPoints).toBeGreaterThan(0)
      expect(bufferConfig.maxDeviceDatasets).toBeGreaterThan(0)
      expect(bufferConfig.memoryThresholdMB).toBeGreaterThan(0)
      expect(bufferConfig.cleanupInterval).toBeGreaterThan(0)
      expect(bufferConfig.slidingWindowSeconds).toBeGreaterThan(0)
      expect(typeof bufferConfig.enableCircularBuffers).toBe('boolean')
    })

    it('should have performance settings', () => {
      expect(config.maxConcurrentDevices).toBeGreaterThan(0)
      expect(config.chartRenderThrottle).toBeGreaterThanOrEqual(0)
      expect(config.dataUpdateInterval).toBeGreaterThan(0)
    })

    it('should have timeout settings', () => {
      expect(config.heartbeatTimeout).toBeGreaterThan(0)
      expect(config.connectionTimeout).toBeGreaterThan(0)
    })

    it('should have valid mode setting', () => {
      expect(['development', 'production']).toContain(config.mode)
    })

    it('should have valid theme setting', () => {
      expect(['light', 'dark', 'auto']).toContain(config.defaultTheme)
    })
  })

  describe('validateConfig', () => {
    it('should return no errors for valid configuration', () => {
      const errors = validateConfig(config)
      expect(errors).toEqual([])
    })

    it('should return errors for invalid buffer configuration', () => {
      const invalidConfig = {
        ...config,
        bufferConfig: {
          ...config.bufferConfig,
          maxChartPoints: -1, // Invalid: negative value
        }
      }

      const errors = validateConfig(invalidConfig)
      expect(errors).toContain('bufferConfig.maxChartPoints must be greater than 0')
    })

    it('should return errors for invalid timeout values', () => {
      const invalidConfig = {
        ...config,
        heartbeatTimeout: -1000, // Invalid: negative timeout
      }

      const errors = validateConfig(invalidConfig)
      expect(errors).toContain('heartbeatTimeout must be greater than 0')
    })

    it('should return errors for invalid data update interval', () => {
      const invalidConfig = {
        ...config,
        dataUpdateInterval: 0, // Invalid: zero interval
      }

      const errors = validateConfig(invalidConfig)
      expect(errors).toContain('dataUpdateInterval must be greater than 0')
    })

    it('should validate chart smoothing range', () => {
      const invalidConfig = {
        ...config,
        chartSmoothing: 1.5, // Invalid: greater than 1
      }

      const errors = validateConfig(invalidConfig)
      expect(errors).toContain('chartSmoothing must be between 0 and 1')
    })
  })

  describe('utility functions', () => {
    it('should determine development mode correctly', () => {
      expect(typeof isDevelopment()).toBe('boolean')
    })

    it('should determine production mode correctly', () => {
      expect(typeof isProduction()).toBe('boolean')
      expect(isDevelopment()).toBe(!isProduction())
    })

    it('should check debug enabled status', () => {
      expect(typeof isDebugEnabled()).toBe('boolean')
    })
  })

  describe('buffer configuration validation', () => {
    it('should ensure buffer sizes are reasonable', () => {
      expect(config.bufferConfig.maxChartPoints).toBeGreaterThan(100)
      expect(config.bufferConfig.maxDeviceBufferPoints).toBeGreaterThan(50)
    })

    it('should have reasonable memory thresholds', () => {
      expect(config.bufferConfig.memoryThresholdMB).toBeGreaterThan(1)
      expect(config.bufferConfig.memoryThresholdMB).toBeLessThan(1000) // Reasonable upper limit
    })

    it('should have reasonable cleanup intervals', () => {
      expect(config.bufferConfig.cleanupInterval).toBeGreaterThan(1000) // At least 1 second
      expect(config.bufferConfig.cleanupInterval).toBeLessThan(60000) // Less than 1 minute
    })
  })

  describe('performance configuration', () => {
    it('should have reasonable render throttling', () => {
      expect(config.chartRenderThrottle).toBeGreaterThanOrEqual(16) // At least 60fps
      expect(config.chartRenderThrottle).toBeLessThan(1000) // Less than 1 second
    })

    it('should have reasonable device limits', () => {
      expect(config.maxConcurrentDevices).toBeGreaterThan(1)
      expect(config.maxConcurrentDevices).toBeLessThan(20) // Reasonable upper limit
    })

    it('should have reasonable data update interval', () => {
      expect(config.dataUpdateInterval).toBeGreaterThan(10) // At least 10ms
      expect(config.dataUpdateInterval).toBeLessThan(5000) // Less than 5 seconds
    })
  })

  describe('storage configuration', () => {
    it('should have reasonable data retention', () => {
      expect(config.dataRetentionDays).toBeGreaterThan(0)
      expect(config.dataRetentionDays).toBeLessThan(366) // Less than a year
    })

    it('should have reasonable auto-save settings', () => {
      expect(typeof config.autoSaveEnabled).toBe('boolean')
      expect(config.autoSaveInterval).toBeGreaterThan(60) // At least 1 minute
    })

    it('should have reasonable export size limits', () => {
      expect(config.maxExportSize).toBeGreaterThan(1) // At least 1MB
      expect(config.maxExportSize).toBeLessThan(1000) // Less than 1GB
    })
  })
})
