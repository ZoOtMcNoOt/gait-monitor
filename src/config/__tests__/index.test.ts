import ConfigurationService, { 
  config, 
  FRONTEND_CONFIG,
  isDevelopment, 
  isProduction, 
  isDebugEnabled,
  shouldShowDeviceDebug,
  shouldShowChartDebug,
  type AppConfig
} from '../index'

// Mock Tauri's invoke function for testing
const mockInvoke = jest.fn()
jest.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}))

describe('Config Module', () => {
  beforeEach(() => {
    mockInvoke.mockClear()
  })

  describe('Legacy config object', () => {
    it('should provide legacy config values', () => {
      expect(config.maxChartPoints).toBe(1000)
      expect(config.dataUpdateInterval).toBe(100)
      expect(config.heartbeatTimeout).toBe(10000)
      expect(config.connectionTimeout).toBe(30000)
      expect(config.bufferConfig).toBeDefined()
      expect(config.bufferConfig.maxChartPoints).toBe(1000)
      expect(config.bufferConfig.maxDeviceBufferPoints).toBe(500)
    })

    it('should provide development mode flags', () => {
      expect(typeof config.debugEnabled).toBe('boolean')
      expect(typeof config.enableMockData).toBe('boolean')
    })
  })

  describe('Frontend config', () => {
    it('should provide frontend-specific configuration', () => {
      expect(FRONTEND_CONFIG.defaultChartType).toBe('line')
      expect(FRONTEND_CONFIG.animationDuration).toBe(300)
      expect(FRONTEND_CONFIG.toastTimeout).toBe(5000)
      expect(FRONTEND_CONFIG.storageKeys).toBeDefined()
      expect(FRONTEND_CONFIG.chartDefaults).toBeDefined()
      expect(FRONTEND_CONFIG.mockData).toBeDefined()
    })
  })

  describe('Environment helpers', () => {
    it('should provide environment check functions', () => {
      expect(typeof isDevelopment()).toBe('boolean')
      expect(typeof isProduction()).toBe('boolean')
      expect(typeof isDebugEnabled()).toBe('boolean')
      expect(typeof shouldShowDeviceDebug()).toBe('boolean')
      expect(typeof shouldShowChartDebug()).toBe('boolean')
    })
  })

  describe('ConfigurationService', () => {
    const mockAppConfig: AppConfig = {
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

    it('should get configuration from backend', async () => {
      mockInvoke.mockResolvedValue(mockAppConfig)
      
      const config = await ConfigurationService.getConfig()
      
      expect(mockInvoke).toHaveBeenCalledWith('get_app_config_cmd')
      expect(config).toEqual(mockAppConfig)
    })

    it('should update configuration', async () => {
      mockInvoke.mockResolvedValue(undefined)
      mockInvoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce(mockAppConfig)
      
      await ConfigurationService.updateConfig({ 'ui.theme': 'Light' })
      
      expect(mockInvoke).toHaveBeenCalledWith('update_config_cmd', { updates: { 'ui.theme': 'Light' } })
    })

    it('should validate configuration', async () => {
      mockInvoke.mockResolvedValue(undefined)
      
      await ConfigurationService.validateConfig(mockAppConfig)
      
      expect(mockInvoke).toHaveBeenCalledWith('validate_config_cmd', { config: mockAppConfig })
    })

    it('should get theme helper', async () => {
      mockInvoke.mockResolvedValue(mockAppConfig)
      
      const theme = await ConfigurationService.getTheme()
      
      expect(theme).toBe('Dark')
    })

    it('should get max buffer size helper', async () => {
      mockInvoke.mockResolvedValue(mockAppConfig)
      
      const maxBufferSize = await ConfigurationService.getMaxBufferSize()
      
      expect(maxBufferSize).toBe(10000)
    })
  })
})
