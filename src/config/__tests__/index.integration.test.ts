// Integration test for the actual config/index.ts file
// This test bypasses the Jest module mapper to test the real implementation

import * as path from 'path'

// Dynamically import the actual config file to bypass Jest module mapping
const getActualConfig = async () => {
  const configPath = path.resolve(__dirname, '../index.ts')
  // Clear module cache to ensure fresh import
  delete require.cache[configPath]
  return await import('../index')
}

interface ActualConfigModule {
  parseBoolean: (value: string | undefined, defaultValue?: boolean) => boolean
  parseNumber: (value: string | undefined, defaultValue: number) => number
  parseString: <T extends string>(value: string | undefined, validValues: T[], defaultValue: T) => T
  loadConfig: () => any
  config: any
  isDevelopment: () => boolean
  isProduction: () => boolean
  isDebugEnabled: () => boolean
  shouldShowDeviceDebug: () => boolean
  shouldShowChartDebug: () => boolean
  validateConfig: (config: any) => string[]
}

describe('Config Module - Integration Tests (Real Implementation)', () => {
  let actualConfig: ActualConfigModule

  beforeAll(async () => {
    // Mock import.meta.env for testing
    (globalThis as any).import = {
      meta: {
        env: {
          VITE_APP_MODE: 'development',
          VITE_DEBUG_ENABLED: 'true',
          VITE_DEBUG_DEVICES: 'true',
          VITE_DEBUG_CHARTS: 'false',
          VITE_MAX_CHART_POINTS: '1000',
          VITE_DATA_UPDATE_INTERVAL: '100',
          VITE_HEARTBEAT_TIMEOUT: '10000',
          VITE_CONNECTION_TIMEOUT: '30000',
          VITE_MAX_DEVICE_BUFFER_POINTS: '500',
          VITE_MAX_DEVICE_DATASETS: '12',
          VITE_MEMORY_THRESHOLD_MB: '50',
          VITE_BUFFER_CLEANUP_INTERVAL: '5000',
          VITE_SLIDING_WINDOW_SECONDS: '10',
          VITE_ENABLE_CIRCULAR_BUFFERS: 'true',
          VITE_DEFAULT_THEME: 'auto',
          VITE_ANIMATIONS_ENABLED: 'true',
          VITE_CHART_SMOOTHING: '0.3',
          VITE_TOAST_DURATION: '5000',
          VITE_DATA_RETENTION_DAYS: '30',
          VITE_AUTO_SAVE_ENABLED: 'true',
          VITE_AUTO_SAVE_INTERVAL: '300',
          VITE_MAX_EXPORT_SIZE: '100',
          VITE_PERFORMANCE_MONITORING: 'true',
          VITE_MAX_CONCURRENT_DEVICES: '4',
          VITE_CHART_RENDER_THROTTLE: '16',
          VITE_ENABLE_MOCK_DATA: 'false',
          VITE_MOCK_DEVICE_COUNT: '2',
          VITE_REACT_DEVTOOLS: 'true',
          VITE_HOT_RELOAD: 'true'
        }
      }
    }

    // Mock console to prevent log spam
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})

    try {
      actualConfig = await getActualConfig()
    } catch (error) {
      console.error('Failed to import actual config:', error)
    }
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  describe('Helper Functions', () => {
    it('should export parseBoolean function', () => {
      expect(actualConfig.parseBoolean).toBeDefined()
      expect(typeof actualConfig.parseBoolean).toBe('function')
    })

    it('parseBoolean should work correctly', () => {
      expect(actualConfig.parseBoolean('true')).toBe(true)
      expect(actualConfig.parseBoolean('false')).toBe(false)
      expect(actualConfig.parseBoolean('invalid')).toBe(false)
      expect(actualConfig.parseBoolean(undefined)).toBe(false)
      expect(actualConfig.parseBoolean(undefined, true)).toBe(true)
    })

    it('should export parseNumber function', () => {
      expect(actualConfig.parseNumber).toBeDefined()
      expect(typeof actualConfig.parseNumber).toBe('function')
    })

    it('parseNumber should work correctly', () => {
      expect(actualConfig.parseNumber('42', 0)).toBe(42)
      expect(actualConfig.parseNumber('invalid', 100)).toBe(100)
      expect(actualConfig.parseNumber(undefined, 50)).toBe(50)
    })

    it('should export parseString function', () => {
      expect(actualConfig.parseString).toBeDefined()
      expect(typeof actualConfig.parseString).toBe('function')
    })

    it('parseString should work correctly', () => {
      const validValues = ['a', 'b', 'c']
      expect(actualConfig.parseString('a', validValues, 'b')).toBe('a')
      expect(actualConfig.parseString('invalid', validValues, 'b')).toBe('b')
      expect(actualConfig.parseString(undefined, validValues, 'c')).toBe('c')
    })
  })

  describe('Config Loading', () => {
    it('should export loadConfig function', () => {
      expect(actualConfig.loadConfig).toBeDefined()
      expect(typeof actualConfig.loadConfig).toBe('function')
    })

    it('loadConfig should return valid configuration', () => {
      const config = actualConfig.loadConfig()
      expect(config).toBeDefined()
      expect(config.mode).toBeDefined()
      expect(config.bufferConfig).toBeDefined()
      expect(config.maxChartPoints).toBeGreaterThan(0)
    })

    it('should export config instance', () => {
      expect(actualConfig.config).toBeDefined()
      expect(actualConfig.config.mode).toBeDefined()
    })
  })

  describe('Utility Functions', () => {
    it('should export utility functions', () => {
      expect(actualConfig.isDevelopment).toBeDefined()
      expect(actualConfig.isProduction).toBeDefined()
      expect(actualConfig.isDebugEnabled).toBeDefined()
      expect(actualConfig.shouldShowDeviceDebug).toBeDefined()
      expect(actualConfig.shouldShowChartDebug).toBeDefined()
    })

    it('utility functions should return booleans', () => {
      expect(typeof actualConfig.isDevelopment()).toBe('boolean')
      expect(typeof actualConfig.isProduction()).toBe('boolean')
      expect(typeof actualConfig.isDebugEnabled()).toBe('boolean')
      expect(typeof actualConfig.shouldShowDeviceDebug()).toBe('boolean')
      expect(typeof actualConfig.shouldShowChartDebug()).toBe('boolean')
    })

    it('development and production should be mutually exclusive', () => {
      expect(actualConfig.isDevelopment()).toBe(!actualConfig.isProduction())
    })
  })

  describe('Configuration Validation', () => {
    it('should export validateConfig function', () => {
      expect(actualConfig.validateConfig).toBeDefined()
      expect(typeof actualConfig.validateConfig).toBe('function')
    })

    it('validateConfig should validate current config without errors', () => {
      const errors = actualConfig.validateConfig(actualConfig.config)
      expect(Array.isArray(errors)).toBe(true)
      expect(errors).toHaveLength(0)
    })

    it('validateConfig should detect invalid configurations', () => {
      const invalidConfig = {
        ...actualConfig.config,
        maxChartPoints: -1
      }
      const errors = actualConfig.validateConfig(invalidConfig)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors.some((error: string) => error.includes('maxChartPoints'))).toBe(true)
    })
  })

  describe('Configuration Structure', () => {
    it('should have all required configuration properties', () => {
      const config = actualConfig.config
      
      // Application settings
      expect(config.mode).toBeDefined()
      expect(config.debugEnabled).toBeDefined()
      expect(config.debugDevices).toBeDefined()
      expect(config.debugCharts).toBeDefined()
      
      // Data collection settings
      expect(config.maxChartPoints).toBeDefined()
      expect(config.dataUpdateInterval).toBeDefined()
      expect(config.heartbeatTimeout).toBeDefined()
      expect(config.connectionTimeout).toBeDefined()
      
      // Buffer configuration
      expect(config.bufferConfig).toBeDefined()
      expect(config.bufferConfig.maxChartPoints).toBeDefined()
      expect(config.bufferConfig.maxDeviceBufferPoints).toBeDefined()
      expect(config.bufferConfig.maxDeviceDatasets).toBeDefined()
      expect(config.bufferConfig.memoryThresholdMB).toBeDefined()
      expect(config.bufferConfig.cleanupInterval).toBeDefined()
      expect(config.bufferConfig.slidingWindowSeconds).toBeDefined()
      expect(config.bufferConfig.enableCircularBuffers).toBeDefined()
      
      // UI settings
      expect(config.defaultTheme).toBeDefined()
      expect(config.animationsEnabled).toBeDefined()
      expect(config.chartSmoothing).toBeDefined()
      expect(config.toastDuration).toBeDefined()
      
      // Storage settings
      expect(config.dataRetentionDays).toBeDefined()
      expect(config.autoSaveEnabled).toBeDefined()
      expect(config.autoSaveInterval).toBeDefined()
      expect(config.maxExportSize).toBeDefined()
      
      // Performance settings
      expect(config.performanceMonitoring).toBeDefined()
      expect(config.maxConcurrentDevices).toBeDefined()
      expect(config.chartRenderThrottle).toBeDefined()
      
      // Development settings
      expect(config.enableMockData).toBeDefined()
      expect(config.mockDeviceCount).toBeDefined()
      expect(config.reactDevTools).toBeDefined()
      expect(config.hotReload).toBeDefined()
    })

    it('should have sensible default values', () => {
      const config = actualConfig.config
      
      expect(config.maxChartPoints).toBeGreaterThan(0)
      expect(config.dataUpdateInterval).toBeGreaterThan(0)
      expect(config.heartbeatTimeout).toBeGreaterThan(0)
      expect(config.connectionTimeout).toBeGreaterThan(config.heartbeatTimeout)
      expect(config.chartSmoothing).toBeGreaterThanOrEqual(0)
      expect(config.chartSmoothing).toBeLessThanOrEqual(1)
      expect(['light', 'dark', 'auto']).toContain(config.defaultTheme)
      expect(['development', 'production']).toContain(config.mode)
    })
  })
})
