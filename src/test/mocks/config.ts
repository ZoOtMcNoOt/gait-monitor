// Mock config module to avoid import.meta issues in Jest
import type { AppConfig, BufferConfig } from '../../config'

const mockBufferConfig: BufferConfig = {
  maxChartPoints: 1000,
  maxDeviceBufferPoints: 500,
  maxDeviceDatasets: 12,
  memoryThresholdMB: 50,
  cleanupInterval: 5000,
  slidingWindowSeconds: 60, // Longer window for tests
  enableCircularBuffers: true,
}

const mockConfig: AppConfig = {
  mode: 'development',
  debugEnabled: true,
  debugDevices: true,
  debugCharts: false,
  maxChartPoints: 1000,
  dataUpdateInterval: 100,
  heartbeatTimeout: 10000,
  connectionTimeout: 30000,
  bufferConfig: mockBufferConfig,
  defaultTheme: 'auto',
  animationsEnabled: true,
  chartSmoothing: 0.3,
  toastDuration: 5000,
  dataRetentionDays: 30,
  autoSaveEnabled: true,
  autoSaveInterval: 60000,
  maxExportSize: 100,
  performanceMonitoring: true,
  maxConcurrentDevices: 10,
  chartRenderThrottle: 16,
  enableMockData: false,
  mockDeviceCount: 2,
  reactDevTools: true,
  hotReload: true,
}

export const config = mockConfig
export const validateConfig = jest.fn((cfg: AppConfig): string[] => {
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
})

// Export the parsing functions
export const parseBoolean = (value: string | undefined, defaultValue: boolean = false): boolean => {
  if (!value) return defaultValue
  return value.toLowerCase() === 'true'
}

export const parseNumber = (value: string | undefined, defaultValue: number): number => {
  if (!value) return defaultValue
  const parsed = Number(value)
  return (isNaN(parsed) || !isFinite(parsed)) ? defaultValue : parsed
}

export const parseString = <T extends string>(
  value: string | undefined, 
  validValues: T[], 
  defaultValue: T
): T => {
  if (!value || !validValues.includes(value as T)) return defaultValue
  return value as T
}

export const isDevelopment = jest.fn(() => true)
export const isProduction = jest.fn(() => false) 
export const isDebugEnabled = jest.fn(() => true)
export const shouldShowDeviceDebug = jest.fn(() => true)
export const shouldShowChartDebug = jest.fn(() => false)
export const loadConfig = jest.fn(() => mockConfig)
