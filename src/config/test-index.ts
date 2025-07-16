// Test-specific config file that doesn't use import.meta
// This is used only by config/__tests__ to avoid import.meta issues

// Define types locally to avoid import.meta issues
export interface BufferConfig {
  maxChartPoints: number           
  maxDeviceBufferPoints: number    
  maxDeviceDatasets: number        
  memoryThresholdMB: number        
  cleanupInterval: number          
  slidingWindowSeconds: number     
  enableCircularBuffers: boolean   
}

export interface AppConfig {
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

// Re-export the parsing functions and validation from the mock
export { 
  parseBoolean, 
  parseNumber, 
  parseString, 
  validateConfig,
  isDevelopment,
  isProduction,
  isDebugEnabled,
  shouldShowDeviceDebug,
  shouldShowChartDebug,
  loadConfig,
  config
} from '../test/mocks/config'
