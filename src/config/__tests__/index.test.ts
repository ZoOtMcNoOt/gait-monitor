import { 
  config, 
  validateConfig, 
  isDevelopment, 
  isProduction, 
  isDebugEnabled,
  shouldShowDeviceDebug,
  shouldShowChartDebug,
  parseBoolean,
  parseNumber,
  parseString,
  loadConfig,
  type AppConfig
} from '../index'

describe('Config Module', () => {
  // Mock console to prevent log spam during tests
  beforeAll(() => {
    // Set up test environment variables
    process.env.VITE_APP_MODE = 'development'
    process.env.VITE_DEBUG_ENABLED = 'true'
    process.env.VITE_DEBUG_DEVICES = 'true'
    process.env.VITE_DEBUG_CHARTS = 'false'
    process.env.VITE_MAX_CHART_POINTS = '1000'
    process.env.VITE_DATA_UPDATE_INTERVAL = '100'
    process.env.VITE_HEARTBEAT_TIMEOUT = '10000'
    process.env.VITE_CONNECTION_TIMEOUT = '30000'
    process.env.VITE_MAX_DEVICE_BUFFER_POINTS = '500'
    process.env.VITE_MAX_DEVICE_DATASETS = '12'
    process.env.VITE_MEMORY_THRESHOLD_MB = '50'
    process.env.VITE_BUFFER_CLEANUP_INTERVAL = '5000'
    process.env.VITE_SLIDING_WINDOW_SECONDS = '10'
    process.env.VITE_ENABLE_CIRCULAR_BUFFERS = 'true'
    process.env.VITE_DEFAULT_THEME = 'auto'
    process.env.VITE_ANIMATIONS_ENABLED = 'true'
    process.env.VITE_CHART_SMOOTHING = '0.3'
    process.env.VITE_TOAST_DURATION = '5000'
    process.env.VITE_DATA_RETENTION_DAYS = '30'
    process.env.VITE_AUTO_SAVE_ENABLED = 'true'
    process.env.VITE_AUTO_SAVE_INTERVAL = '300'
    process.env.VITE_MAX_EXPORT_SIZE = '100'
    process.env.VITE_PERFORMANCE_MONITORING = 'true'
    process.env.VITE_MAX_CONCURRENT_DEVICES = '4'
    process.env.VITE_CHART_RENDER_THROTTLE = '16'
    process.env.VITE_ENABLE_MOCK_DATA = 'false'
    process.env.VITE_MOCK_DEVICE_COUNT = '2'
    process.env.VITE_REACT_DEVTOOLS = 'true'
    process.env.VITE_HOT_RELOAD = 'true'
    
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

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

  describe('parsing functions', () => {
    describe('parseBoolean', () => {
      it('should parse true values correctly', () => {
        expect(parseBoolean('true')).toBe(true)
        expect(parseBoolean('TRUE')).toBe(true)
        expect(parseBoolean('True')).toBe(true)
      })

      it('should parse false values correctly', () => {
        expect(parseBoolean('false')).toBe(false)
        expect(parseBoolean('FALSE')).toBe(false)
        expect(parseBoolean('anything')).toBe(false)
        expect(parseBoolean('0')).toBe(false)
      })

      it('should use default value for undefined input', () => {
        expect(parseBoolean(undefined)).toBe(false)
        expect(parseBoolean(undefined, true)).toBe(true)
      })

      it('should use default value for empty string', () => {
        expect(parseBoolean('')).toBe(false)
        expect(parseBoolean('', true)).toBe(true)
      })
    })

    describe('parseNumber', () => {
      it('should parse valid numbers correctly', () => {
        expect(parseNumber('42', 0)).toBe(42)
        expect(parseNumber('3.14', 0)).toBe(3.14)
        expect(parseNumber('-10', 0)).toBe(-10)
        expect(parseNumber('0', 100)).toBe(0)
      })

      it('should use default value for invalid numbers', () => {
        expect(parseNumber('not-a-number', 100)).toBe(100)
        expect(parseNumber('', 100)).toBe(100)
        expect(parseNumber('NaN', 100)).toBe(100)
        expect(parseNumber('Infinity', 100)).toBe(100)
      })

      it('should use default value for undefined input', () => {
        expect(parseNumber(undefined, 50)).toBe(50)
      })
    })

    describe('parseString', () => {
      const validValues = ['option1', 'option2', 'option3']

      it('should parse valid string values correctly', () => {
        expect(parseString('option1', validValues, 'option1')).toBe('option1')
        expect(parseString('option2', validValues, 'option1')).toBe('option2')
        expect(parseString('option3', validValues, 'option1')).toBe('option3')
      })

      it('should use default value for invalid strings', () => {
        expect(parseString('invalid', validValues, 'option1')).toBe('option1')
        expect(parseString('', validValues, 'option2')).toBe('option2')
      })

      it('should use default value for undefined input', () => {
        expect(parseString(undefined, validValues, 'option2')).toBe('option2')
      })
    })
  })

  describe('utility functions', () => {
    it('should correctly identify development mode', () => {
      expect(typeof isDevelopment()).toBe('boolean')
    })

    it('should correctly identify production mode', () => {
      expect(typeof isProduction()).toBe('boolean')
      expect(isDevelopment()).toBe(!isProduction())
    })

    it('should correctly check debug settings', () => {
      expect(typeof isDebugEnabled()).toBe('boolean')
      expect(typeof shouldShowDeviceDebug()).toBe('boolean')
      expect(typeof shouldShowChartDebug()).toBe('boolean')
    })
  })

  describe('loadConfig function', () => {
    it('should load configuration successfully', () => {
      const loadedConfig = loadConfig()
      expect(loadedConfig).toBeDefined()
      expect(loadedConfig.mode).toBeDefined()
      expect(loadedConfig.bufferConfig).toBeDefined()
    })

    it('should return consistent configuration', () => {
      const config1 = loadConfig()
      const config2 = loadConfig()
      expect(config1.mode).toBe(config2.mode)
      expect(config1.maxChartPoints).toBe(config2.maxChartPoints)
    })
  })

  describe('validateConfig comprehensive tests', () => {
    let validConfig: AppConfig

    beforeEach(() => {
      validConfig = { ...config } // Use current config as base
    })

    it('should validate all numeric constraints', () => {
      // Test each numeric field that should be > 0
      const numericFields = [
        'maxChartPoints',
        'dataUpdateInterval', 
        'heartbeatTimeout',
        'dataRetentionDays',
        'autoSaveInterval',
        'maxExportSize',
        'maxConcurrentDevices',
        'chartRenderThrottle'
      ] as const

      numericFields.forEach(field => {
        const testConfig = { ...validConfig }
        testConfig[field] = 0
        const errors = validateConfig(testConfig)
        expect(errors.some(error => error.includes(field))).toBe(true)
      })
    })

    it('should validate buffer config numeric constraints', () => {
      const bufferFields = [
        'maxChartPoints',
        'maxDeviceBufferPoints',
        'maxDeviceDatasets',
        'memoryThresholdMB',
        'cleanupInterval',
        'slidingWindowSeconds'
      ] as const

      bufferFields.forEach(field => {
        const testConfig = { ...validConfig }
        testConfig.bufferConfig = { ...validConfig.bufferConfig }
        testConfig.bufferConfig[field] = 0
        const errors = validateConfig(testConfig)
        expect(errors.some(error => error.includes(`bufferConfig.${field}`))).toBe(true)
      })
    })

    it('should validate chartSmoothing range', () => {
      // Test below range
      validConfig.chartSmoothing = -0.1
      let errors = validateConfig(validConfig)
      expect(errors).toContain('chartSmoothing must be between 0 and 1')

      // Test above range
      validConfig.chartSmoothing = 1.1
      errors = validateConfig(validConfig)
      expect(errors).toContain('chartSmoothing must be between 0 and 1')

      // Test valid range
      validConfig.chartSmoothing = 0.5
      errors = validateConfig(validConfig)
      expect(errors.filter(e => e.includes('chartSmoothing'))).toHaveLength(0)
    })

    it('should validate connectionTimeout vs heartbeatTimeout relationship', () => {
      validConfig.connectionTimeout = 5000
      validConfig.heartbeatTimeout = 10000
      const errors = validateConfig(validConfig)
      expect(errors).toContain('connectionTimeout must be greater than heartbeatTimeout')
    })

    it('should collect multiple errors', () => {
      validConfig.maxChartPoints = 0
      validConfig.dataUpdateInterval = -1
      validConfig.chartSmoothing = 2
      validConfig.bufferConfig.maxChartPoints = 0
      
      const errors = validateConfig(validConfig)
      expect(errors.length).toBeGreaterThanOrEqual(4)
    })
  })
})
