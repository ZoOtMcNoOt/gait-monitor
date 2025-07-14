// Environment configuration management for Gait Monitor
// This module centralizes all environment variable access and provides type safety

// Buffer management configuration
export interface BufferConfig {
  maxChartPoints: number           // Maximum points in chart datasets
  maxDeviceBufferPoints: number    // Maximum points in device data buffers  
  maxDeviceDatasets: number        // Maximum datasets per chart (6 channels × multiple devices)
  memoryThresholdMB: number        // Trigger cleanup when memory usage exceeds this (MB)
  cleanupInterval: number          // Periodic cleanup interval (ms)
  slidingWindowSeconds: number     // Seconds of data to retain in sliding window
  enableCircularBuffers: boolean   // Use efficient circular buffers vs arrays
}

export interface AppConfig {
  // Application settings
  mode: 'development' | 'production'
  debugEnabled: boolean
  debugDevices: boolean
  debugCharts: boolean
  
  // Data collection settings
  maxChartPoints: number
  dataUpdateInterval: number
  heartbeatTimeout: number
  connectionTimeout: number
  
  // Buffer management settings
  bufferConfig: BufferConfig
  
  // UI settings
  defaultTheme: 'light' | 'dark' | 'auto'
  animationsEnabled: boolean
  chartSmoothing: number
  toastDuration: number
  
  // Storage settings
  dataRetentionDays: number
  autoSaveEnabled: boolean
  autoSaveInterval: number
  maxExportSize: number
  
  // Performance settings
  performanceMonitoring: boolean
  maxConcurrentDevices: number
  chartRenderThrottle: number
  
  // Development settings
  enableMockData: boolean
  mockDeviceCount: number
  reactDevTools: boolean
  hotReload: boolean
}

// Helper function to parse boolean environment variables
export const parseBoolean = (value: string | undefined, defaultValue: boolean = false): boolean => {
  if (!value) return defaultValue
  return value.toLowerCase() === 'true'
}

// Helper function to parse number environment variables
export const parseNumber = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue
  const parsed = Number(value)
  return isNaN(parsed) ? defaultValue : parsed
}

// Helper function to parse string environment variables with validation
export const parseString = <T extends string>(
  value: string | undefined, 
  validValues: T[], 
  defaultValue: T
): T => {
  if (!value || !validValues.includes(value as T)) return defaultValue
  return value as T
}

// Load and validate configuration from environment variables
export const loadConfig = (): AppConfig => {
  return {
    // Application settings
    mode: parseString(
      import.meta.env.VITE_APP_MODE, 
      ['development', 'production'], 
      'development'
    ),
    debugEnabled: parseBoolean(import.meta.env.VITE_DEBUG_ENABLED, true),
    debugDevices: parseBoolean(import.meta.env.VITE_DEBUG_DEVICES, true),
    debugCharts: parseBoolean(import.meta.env.VITE_DEBUG_CHARTS, false),
    
    // Data collection settings
    maxChartPoints: parseNumber(import.meta.env.VITE_MAX_CHART_POINTS, 1000),
    dataUpdateInterval: parseNumber(import.meta.env.VITE_DATA_UPDATE_INTERVAL, 100),
    heartbeatTimeout: parseNumber(import.meta.env.VITE_HEARTBEAT_TIMEOUT, 10000),
    connectionTimeout: parseNumber(import.meta.env.VITE_CONNECTION_TIMEOUT, 30000),
    
    // Buffer management settings
    bufferConfig: {
      maxChartPoints: parseNumber(import.meta.env.VITE_MAX_CHART_POINTS, 1000),
      maxDeviceBufferPoints: parseNumber(import.meta.env.VITE_MAX_DEVICE_BUFFER_POINTS, 500),
      maxDeviceDatasets: parseNumber(import.meta.env.VITE_MAX_DEVICE_DATASETS, 12),
      memoryThresholdMB: parseNumber(import.meta.env.VITE_MEMORY_THRESHOLD_MB, 50),
      cleanupInterval: parseNumber(import.meta.env.VITE_BUFFER_CLEANUP_INTERVAL, 5000),
      slidingWindowSeconds: parseNumber(import.meta.env.VITE_SLIDING_WINDOW_SECONDS, 10),
      enableCircularBuffers: parseBoolean(import.meta.env.VITE_ENABLE_CIRCULAR_BUFFERS, true),
    },
    
    // UI settings
    defaultTheme: parseString(
      import.meta.env.VITE_DEFAULT_THEME,
      ['light', 'dark', 'auto'],
      'auto'
    ),
    animationsEnabled: parseBoolean(import.meta.env.VITE_ANIMATIONS_ENABLED, true),
    chartSmoothing: parseNumber(import.meta.env.VITE_CHART_SMOOTHING, 0.3),
    toastDuration: parseNumber(import.meta.env.VITE_TOAST_DURATION, 5000),
    
    // Storage settings
    dataRetentionDays: parseNumber(import.meta.env.VITE_DATA_RETENTION_DAYS, 30),
    autoSaveEnabled: parseBoolean(import.meta.env.VITE_AUTO_SAVE_ENABLED, true),
    autoSaveInterval: parseNumber(import.meta.env.VITE_AUTO_SAVE_INTERVAL, 300),
    maxExportSize: parseNumber(import.meta.env.VITE_MAX_EXPORT_SIZE, 100),
    
    // Performance settings
    performanceMonitoring: parseBoolean(import.meta.env.VITE_PERFORMANCE_MONITORING, true),
    maxConcurrentDevices: parseNumber(import.meta.env.VITE_MAX_CONCURRENT_DEVICES, 4),
    chartRenderThrottle: parseNumber(import.meta.env.VITE_CHART_RENDER_THROTTLE, 16),
    
    // Development settings
    enableMockData: parseBoolean(import.meta.env.VITE_ENABLE_MOCK_DATA, false),
    mockDeviceCount: parseNumber(import.meta.env.VITE_MOCK_DEVICE_COUNT, 2),
    reactDevTools: parseBoolean(import.meta.env.VITE_REACT_DEVTOOLS, true),
    hotReload: parseBoolean(import.meta.env.VITE_HOT_RELOAD, true)
  }
}

// Global configuration instance
export const config = loadConfig()

// Utility functions for common configuration checks
export const isDevelopment = () => config.mode === 'development'
export const isProduction = () => config.mode === 'production'
export const isDebugEnabled = () => config.debugEnabled
export const shouldShowDeviceDebug = () => config.debugDevices
export const shouldShowChartDebug = () => config.debugCharts

// Configuration validation
export const validateConfig = (cfg: AppConfig): string[] => {
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

// Log configuration on startup (development only)
if (isDevelopment()) {
  console.log('🔧 Gait Monitor Configuration:', config)
  
  const configErrors = validateConfig(config)
  if (configErrors.length > 0) {
    console.error('❌ Configuration errors:', configErrors)
  } else {
    console.log('✅ Configuration is valid')
  }
}
