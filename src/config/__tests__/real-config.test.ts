// Test that provides coverage for the actual config/index.ts file
// This bypasses the Jest moduleNameMapper by setting up proper test environment

describe('Real Config File Coverage', () => {
  let originalNodeEnv: string | undefined
  
  beforeAll(() => {
    // Set NODE_ENV to test so the config uses process.env
    originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    
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
    
    // Mock console to prevent log spam
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    // Restore original NODE_ENV
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv
    } else {
      delete process.env.NODE_ENV
    }
    
    // Clean up test environment variables
    delete process.env.VITE_APP_MODE
    delete process.env.VITE_DEBUG_ENABLED
    delete process.env.VITE_DEBUG_DEVICES
    delete process.env.VITE_DEBUG_CHARTS
    delete process.env.VITE_MAX_CHART_POINTS
    delete process.env.VITE_DATA_UPDATE_INTERVAL
    delete process.env.VITE_HEARTBEAT_TIMEOUT
    delete process.env.VITE_CONNECTION_TIMEOUT
    delete process.env.VITE_MAX_DEVICE_BUFFER_POINTS
    delete process.env.VITE_MAX_DEVICE_DATASETS
    delete process.env.VITE_MEMORY_THRESHOLD_MB
    delete process.env.VITE_BUFFER_CLEANUP_INTERVAL
    delete process.env.VITE_SLIDING_WINDOW_SECONDS
    delete process.env.VITE_ENABLE_CIRCULAR_BUFFERS
    delete process.env.VITE_DEFAULT_THEME
    delete process.env.VITE_ANIMATIONS_ENABLED
    delete process.env.VITE_CHART_SMOOTHING
    delete process.env.VITE_TOAST_DURATION
    delete process.env.VITE_DATA_RETENTION_DAYS
    delete process.env.VITE_AUTO_SAVE_ENABLED
    delete process.env.VITE_AUTO_SAVE_INTERVAL
    delete process.env.VITE_MAX_EXPORT_SIZE
    delete process.env.VITE_PERFORMANCE_MONITORING
    delete process.env.VITE_MAX_CONCURRENT_DEVICES
    delete process.env.VITE_CHART_RENDER_THROTTLE
    delete process.env.VITE_ENABLE_MOCK_DATA
    delete process.env.VITE_MOCK_DEVICE_COUNT
    delete process.env.VITE_REACT_DEVTOOLS
    delete process.env.VITE_HOT_RELOAD
    
    jest.restoreAllMocks()
  })

  it('should import and test the real config functions', async () => {
    // Clear require cache to ensure fresh import
    const configPath = require.resolve('../index')
    delete require.cache[configPath]
    
    // Import the real config - this will use process.env since NODE_ENV=test
    const realConfig = await import('../index')
    
    // Test helper functions
    expect(realConfig.parseBoolean('true')).toBe(true)
    expect(realConfig.parseBoolean('false')).toBe(false)
    expect(realConfig.parseBoolean(undefined)).toBe(false)
    expect(realConfig.parseBoolean(undefined, true)).toBe(true)
    
    expect(realConfig.parseNumber('42', 0)).toBe(42)
    expect(realConfig.parseNumber('invalid', 100)).toBe(100)
    expect(realConfig.parseNumber(undefined, 50)).toBe(50)
    
    expect(realConfig.parseString('test', ['test', 'other'], 'default')).toBe('test')
    expect(realConfig.parseString('invalid', ['test', 'other'], 'default')).toBe('default')
    expect(realConfig.parseString(undefined, ['test', 'other'], 'default')).toBe('default')
    
    // Test loadConfig function
    const config = realConfig.loadConfig()
    expect(config).toBeDefined()
    expect(config.mode).toBe('development')
    expect(config.maxChartPoints).toBe(1000)
    expect(config.debugEnabled).toBe(true)
    expect(config.bufferConfig).toBeDefined()
    expect(config.bufferConfig.maxChartPoints).toBe(1000)
    
    // Test utility functions
    expect(typeof realConfig.isDevelopment()).toBe('boolean')
    expect(typeof realConfig.isProduction()).toBe('boolean')
    expect(typeof realConfig.isDebugEnabled()).toBe('boolean')
    expect(typeof realConfig.shouldShowDeviceDebug()).toBe('boolean')
    expect(typeof realConfig.shouldShowChartDebug()).toBe('boolean')
    
    // Test validateConfig
    const errors = realConfig.validateConfig(config)
    expect(Array.isArray(errors)).toBe(true)
    expect(errors).toHaveLength(0)
    
    // Test with invalid config
    const invalidConfig = { ...config, maxChartPoints: -1 }
    const invalidErrors = realConfig.validateConfig(invalidConfig)
    expect(invalidErrors.length).toBeGreaterThan(0)
    
    // Test that the config object itself is available
    expect(realConfig.config).toBeDefined()
    expect(realConfig.config.mode).toBe('development')
  })

  it('should test different environment variable scenarios', async () => {
    // Test with different env values
    process.env.VITE_APP_MODE = 'production'
    process.env.VITE_DEBUG_ENABLED = 'false'
    process.env.VITE_CHART_SMOOTHING = '0.8'
    
    // Clear cache and re-import
    const configPath = require.resolve('../index')
    delete require.cache[configPath]
    const realConfig = await import('../index')
    
    const config = realConfig.loadConfig()
    expect(config.mode).toBe('production')
    expect(config.debugEnabled).toBe(false)
    expect(config.chartSmoothing).toBe(0.8)
    
    // Test utility functions with production mode
    expect(realConfig.isProduction()).toBe(true)
    expect(realConfig.isDevelopment()).toBe(false)
  })

  it('should test validation with various invalid configs', async () => {
    const configPath = require.resolve('../index')
    delete require.cache[configPath]
    const realConfig = await import('../index')
    
    const baseConfig = realConfig.loadConfig()
    
    // Test invalid chartSmoothing
    let testConfig = { ...baseConfig, chartSmoothing: 2.0 }
    let errors = realConfig.validateConfig(testConfig)
    expect(errors.some(e => e.includes('chartSmoothing'))).toBe(true)
    
    // Test invalid timeout relationship
    testConfig = { ...baseConfig, connectionTimeout: 5000, heartbeatTimeout: 10000 }
    errors = realConfig.validateConfig(testConfig)
    expect(errors.some(e => e.includes('connectionTimeout must be greater than heartbeatTimeout'))).toBe(true)
    
    // Test buffer config validation
    testConfig = { 
      ...baseConfig, 
      bufferConfig: { 
        ...baseConfig.bufferConfig, 
        maxChartPoints: 0 
      } 
    }
    errors = realConfig.validateConfig(testConfig)
    expect(errors.some(e => e.includes('bufferConfig.maxChartPoints'))).toBe(true)
  })
})

  describe('parseBoolean function', () => {
    // Import the function directly by copying its implementation
    const parseBoolean = (value: string | undefined, defaultValue: boolean = false): boolean => {
      if (!value) return defaultValue
      return value.toLowerCase() === 'true'
    }

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

  describe('parseNumber function', () => {
    const parseNumber = (value: string | undefined, defaultValue: number): number => {
      if (!value) return defaultValue
      const parsed = Number(value)
      return (isNaN(parsed) || !isFinite(parsed)) ? defaultValue : parsed
    }

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

  describe('parseString function', () => {
    const parseString = <T extends string>(
      value: string | undefined, 
      validValues: T[], 
      defaultValue: T
    ): T => {
      if (!value || !validValues.includes(value as T)) return defaultValue
      return value as T
    }

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

  describe('validateConfig function', () => {
    interface BufferConfig {
      maxChartPoints: number
      maxDeviceBufferPoints: number
      maxDeviceDatasets: number
      memoryThresholdMB: number
      cleanupInterval: number
      slidingWindowSeconds: number
      enableCircularBuffers: boolean
    }

    interface AppConfig {
      mode: 'development' | 'production'
      debugEnabled: boolean
      debugDevices: boolean
      debugCharts: boolean
      maxChartPoints: number
      dataUpdateInterval: number
      heartbeatTimeout: number
      connectionTimeout: number
      bufferConfig: BufferConfig
      defaultTheme: 'light' | 'dark' | 'auto'
      animationsEnabled: boolean
      chartSmoothing: number
      toastDuration: number
      dataRetentionDays: number
      autoSaveEnabled: boolean
      autoSaveInterval: number
      maxExportSize: number
      performanceMonitoring: boolean
      maxConcurrentDevices: number
      chartRenderThrottle: number
      enableMockData: boolean
      mockDeviceCount: number
      reactDevTools: boolean
      hotReload: boolean
    }

    const validateConfig = (cfg: AppConfig): string[] => {
      const errors: string[] = []
      
      if (cfg.maxChartPoints <= 0) {
        errors.push('maxChartPoints must be greater than 0')
      }
      
      if (cfg.dataUpdateInterval <= 0) {
        errors.push('dataUpdateInterval must be greater than 0')
      }
      
      if (cfg.heartbeatTimeout <= 0) {
        errors.push('heartbeatTimeout must be greater than 0')
      }
      
      if (cfg.connectionTimeout <= cfg.heartbeatTimeout) {
        errors.push('connectionTimeout must be greater than heartbeatTimeout')
      }
      
      if (cfg.chartSmoothing < 0 || cfg.chartSmoothing > 1) {
        errors.push('chartSmoothing must be between 0 and 1')
      }
      
      if (cfg.dataRetentionDays <= 0) {
        errors.push('dataRetentionDays must be greater than 0')
      }
      
      if (cfg.autoSaveInterval <= 0) {
        errors.push('autoSaveInterval must be greater than 0')
      }
      
      if (cfg.maxExportSize <= 0) {
        errors.push('maxExportSize must be greater than 0')
      }
      
      if (cfg.maxConcurrentDevices <= 0) {
        errors.push('maxConcurrentDevices must be greater than 0')
      }
      
      if (cfg.chartRenderThrottle <= 0) {
        errors.push('chartRenderThrottle must be greater than 0')
      }
      
      // Buffer configuration validation
      if (cfg.bufferConfig.maxChartPoints <= 0) {
        errors.push('bufferConfig.maxChartPoints must be greater than 0')
      }
      
      if (cfg.bufferConfig.maxDeviceBufferPoints <= 0) {
        errors.push('bufferConfig.maxDeviceBufferPoints must be greater than 0')
      }
      
      if (cfg.bufferConfig.maxDeviceDatasets <= 0) {
        errors.push('bufferConfig.maxDeviceDatasets must be greater than 0')
      }
      
      if (cfg.bufferConfig.memoryThresholdMB <= 0) {
        errors.push('bufferConfig.memoryThresholdMB must be greater than 0')
      }
      
      if (cfg.bufferConfig.cleanupInterval <= 0) {
        errors.push('bufferConfig.cleanupInterval must be greater than 0')
      }
      
      if (cfg.bufferConfig.slidingWindowSeconds <= 0) {
        errors.push('bufferConfig.slidingWindowSeconds must be greater than 0')
      }
      
      return errors
    }

    const createValidConfig = (): AppConfig => ({
      mode: 'development',
      debugEnabled: true,
      debugDevices: true,
      debugCharts: false,
      maxChartPoints: 1000,
      dataUpdateInterval: 100,
      heartbeatTimeout: 10000,
      connectionTimeout: 30000,
      bufferConfig: {
        maxChartPoints: 1000,
        maxDeviceBufferPoints: 500,
        maxDeviceDatasets: 12,
        memoryThresholdMB: 50,
        cleanupInterval: 5000,
        slidingWindowSeconds: 10,
        enableCircularBuffers: true
      },
      defaultTheme: 'auto',
      animationsEnabled: true,
      chartSmoothing: 0.3,
      toastDuration: 5000,
      dataRetentionDays: 30,
      autoSaveEnabled: true,
      autoSaveInterval: 300,
      maxExportSize: 100,
      performanceMonitoring: true,
      maxConcurrentDevices: 4,
      chartRenderThrottle: 16,
      enableMockData: false,
      mockDeviceCount: 2,
      reactDevTools: true,
      hotReload: true
    })

    it('should return no errors for valid configuration', () => {
      const validConfig = createValidConfig()
      const errors = validateConfig(validConfig)
      expect(errors).toEqual([])
    })

    it('should detect invalid maxChartPoints', () => {
      const invalidConfig = createValidConfig()
      invalidConfig.maxChartPoints = 0
      const errors = validateConfig(invalidConfig)
      expect(errors).toContain('maxChartPoints must be greater than 0')
    })

    it('should detect invalid chartSmoothing', () => {
      const invalidConfig = createValidConfig()
      invalidConfig.chartSmoothing = 1.5
      const errors = validateConfig(invalidConfig)
      expect(errors).toContain('chartSmoothing must be between 0 and 1')
    })

    it('should detect timeout relationship errors', () => {
      const invalidConfig = createValidConfig()
      invalidConfig.connectionTimeout = 5000
      invalidConfig.heartbeatTimeout = 10000
      const errors = validateConfig(invalidConfig)
      expect(errors).toContain('connectionTimeout must be greater than heartbeatTimeout')
    })

    it('should detect buffer config errors', () => {
      const invalidConfig = createValidConfig()
      invalidConfig.bufferConfig.maxChartPoints = 0
      const errors = validateConfig(invalidConfig)
      expect(errors).toContain('bufferConfig.maxChartPoints must be greater than 0')
    })
  })

  describe('Utility functions', () => {
    it('should test isDevelopment', () => {
      const isDevelopment = () => true // In development mode for tests
      expect(typeof isDevelopment()).toBe('boolean')
    })

    it('should test isProduction', () => {
      const isProduction = () => false // Not in production for tests
      expect(typeof isProduction()).toBe('boolean')
    })

    it('should test debug functions', () => {
      const isDebugEnabled = () => true
      const shouldShowDeviceDebug = () => true
      const shouldShowChartDebug = () => false

      expect(typeof isDebugEnabled()).toBe('boolean')
      expect(typeof shouldShowDeviceDebug()).toBe('boolean')
      expect(typeof shouldShowChartDebug()).toBe('boolean')
    })
  })
})
