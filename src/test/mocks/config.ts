// Mock config module for testing - simplified to match backend structure
import type { AppConfig } from '../../config'

export const mockConfig = {
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
    slidingWindowSeconds: 60,
    enableCircularBuffers: true,
  },
  defaultTheme: 'auto' as const,
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
  hotReload: true,
  debugEnabled: true,
  debugDevices: true,
  debugCharts: false,
  mode: 'development'
}

export const mockAppConfig: AppConfig = {
  app: {
    app_name: 'Test App',
    version: '1.0.0',
    environment: 'Development',
    debug_mode: true,
    log_level: 'Debug',
    auto_save_interval_ms: 30000,
    max_session_duration_hours: 8
  },
  device: {
    scan_timeout_ms: 10000,
    connection_timeout_ms: 30000,
    max_concurrent_devices: 4,
    auto_reconnect: true,
    reconnect_attempts: 3,
    notification_timeout_ms: 5000,
    rssi_threshold: -80,
    preferred_devices: []
  },
  data: {
    max_buffer_size: 10000,
    sample_rate_hz: 100,
    data_retention_days: 30,
    compression_enabled: true,
    validation_strict: false,
    backup_enabled: true,
    backup_interval_hours: 24
  },
  ui: {
    theme: 'Dark',
    language: 'en',
    chart_refresh_rate_ms: 100,
    show_debug_info: true,
    auto_scroll_charts: true,
    default_chart_type: 'line',
    max_chart_points: 1000,
    keyboard_shortcuts_enabled: true
  },
  security: {
    csrf_protection_enabled: true,
    rate_limiting_enabled: true,
    session_timeout_minutes: 60,
    max_login_attempts: 3,
    audit_logging_enabled: true,
    encryption_enabled: true
  },
  export: {
    default_format: 'csv',
    include_headers: true,
    decimal_precision: 3,
    date_format: 'ISO8601',
    chunk_size: 1000,
    compression_level: 6
  }
}

export default mockConfig
