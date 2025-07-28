// Simplified frontend configuration that delegates to backend configuration system
// This module provides a lightweight interface for configuration values used by the frontend

import { invoke } from '@tauri-apps/api/core';

// Helper function to safely check if we're in development mode
// This works in both Vite (import.meta) and Jest (process.env) environments
const isDev = (): boolean => {
  // Check process.env first (works in Jest/Node environments)
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
    return process.env.NODE_ENV === 'development';
  }
  
  // Fallback to import.meta for Vite (wrapped in try-catch for Jest)
  try {
    // Use eval to avoid static analysis issues with Jest
    const importMeta = eval('import.meta');
    return importMeta?.env?.DEV === true;
  } catch {
    // Default to false in environments that don't support import.meta
    return false;
  }
};

// Basic frontend-specific configuration that doesn't need backend integration
export interface FrontendConfig {
  // UI settings that are purely frontend concerns
  defaultChartType: 'line' | 'area' | 'scatter'
  animationDuration: number
  toastTimeout: number
  
  // Local storage keys
  storageKeys: {
    theme: string
    chartPreferences: string
    uiLayout: string
  }
  
  // Chart rendering settings
  chartDefaults: {
    maxPoints: number
    refreshInterval: number
    smoothing: boolean
  }
  
  // Mock data settings for development
  mockData: {
    enabled: boolean
    deviceCount: number
    sampleRate: number
  }
}

// Static frontend configuration (does not change at runtime)
export const FRONTEND_CONFIG: FrontendConfig = {
  defaultChartType: 'line',
  animationDuration: 300,
  toastTimeout: 5000,
  
  storageKeys: {
    theme: 'gait-monitor-theme',
    chartPreferences: 'gait-monitor-chart-prefs',
    uiLayout: 'gait-monitor-layout'
  },
  
  chartDefaults: {
    maxPoints: 1000,
    refreshInterval: 100,
    smoothing: true
  },
  
  mockData: {
    enabled: isDev(),
    deviceCount: 2,
    sampleRate: 100
  }
};

// Backend configuration types (mirrors Rust types exactly)
export interface AppConfig {
  app: AppSettings
  device: DeviceSettings  
  data: DataSettings
  ui: UiSettings
  security: SecuritySettings
  export: ExportSettings
}

export interface AppSettings {
  app_name: string
  version: string
  environment: 'Development' | 'Testing' | 'Staging' | 'Production'
  debug_mode: boolean
  log_level: 'Trace' | 'Debug' | 'Info' | 'Warn' | 'Error' | 'Off'
  auto_save_interval_ms: number
  max_session_duration_hours: number
}

export interface DeviceSettings {
  scan_timeout_ms: number
  connection_timeout_ms: number
  max_concurrent_devices: number
  auto_reconnect: boolean
  reconnect_attempts: number
  notification_timeout_ms: number
  rssi_threshold: number
  preferred_devices: string[]
}

export interface DataSettings {
  max_buffer_size: number
  sample_rate_hz: number
  data_retention_days: number
  compression_enabled: boolean
  validation_strict: boolean
  backup_enabled: boolean
  backup_interval_hours: number
}

export interface UiSettings {
  theme: 'Light' | 'Dark' | 'Auto'
  language: string
  chart_refresh_rate_ms: number
  show_debug_info: boolean
  auto_scroll_charts: boolean
  default_chart_type: string
  max_chart_points: number
  keyboard_shortcuts_enabled: boolean
}

export interface SecuritySettings {
  csrf_protection_enabled: boolean
  rate_limiting_enabled: boolean
  session_timeout_minutes: number
  max_login_attempts: number
  audit_logging_enabled: boolean
  encryption_enabled: boolean
}

export interface ExportSettings {
  default_format: string
  include_headers: boolean
  decimal_precision: number
  date_format: string
  chunk_size: number
  compression_level: number
}

export interface ConfigValidationError {
  InvalidValue?: { field: string; value: string; reason: string }
  MissingField?: { field: string }
  InvalidRange?: { field: string; value: string; min: string; max: string }
  InvalidFormat?: { field: string; value: string; expected_format: string }
  EnvironmentMismatch?: { field: string; environment: string }
}

export interface ConfigurationHistory {
  timestamp: string
  operation: 'Create' | 'Update' | 'Delete' | 'Reset' | 'Import' | 'Export'
  field_path: string
  old_value?: string
  new_value?: string
  user_id?: string
  reason?: string
}

// Configuration service class
export class ConfigurationService {
  private static cachedConfig: AppConfig | null = null;
  private static configListeners: ((config: AppConfig) => void)[] = [];

  // Get current application configuration
  static async getConfig(): Promise<AppConfig> {
    try {
      const config = await invoke<AppConfig>('get_app_config_cmd');
      this.cachedConfig = config;
      return config;
    } catch (error) {
      console.error('Failed to get configuration:', error);
      throw error;
    }
  }

  // Update configuration values
  static async updateConfig(updates: Record<string, unknown>): Promise<void> {
    try {
      await invoke('update_config_cmd', { updates });
      // Refresh cached config
      const newConfig = await this.getConfig();
      this.notifyListeners(newConfig);
    } catch (error) {
      console.error('Failed to update configuration:', error);  
      throw error;
    }
  }

  // Validate configuration
  static async validateConfig(config: AppConfig): Promise<void> {
    try {
      await invoke('validate_config_cmd', { config });
    } catch (error) {
      console.error('Configuration validation failed:', error);
      throw error;
    }
  }

  // Reset configuration to defaults
  static async resetToDefaults(): Promise<void> {
    try {
      await invoke('reset_config_to_defaults_cmd');
      const newConfig = await this.getConfig();
      this.notifyListeners(newConfig);
    } catch (error) {
      console.error('Failed to reset configuration:', error);
      throw error;
    }
  }

  // Get configuration history
  static async getConfigurationHistory(): Promise<ConfigurationHistory[]> {
    try {
      return await invoke<ConfigurationHistory[]>('get_configuration_history_cmd');
    } catch (error) {
      console.error('Failed to get configuration history:', error);
      throw error;
    }
  }

  // Export configuration
  static async exportConfig(exportPath: string): Promise<void> {
    try {
      await invoke('export_config_cmd', { exportPath });
    } catch (error) {
      console.error('Failed to export configuration:', error);
      throw error;
    }
  }

  // Import configuration  
  static async importConfig(importPath: string): Promise<void> {
    try {
      await invoke('import_config_cmd', { importPath });
      const newConfig = await this.getConfig();
      this.notifyListeners(newConfig);
    } catch (error) {
      console.error('Failed to import configuration:', error);
      throw error;
    }
  }

  // Get cached configuration (may be stale)
  static getCachedConfig(): AppConfig | null {
    return this.cachedConfig;
  }

  // Subscribe to configuration changes
  static onConfigChange(listener: (config: AppConfig) => void): () => void {
    this.configListeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.configListeners.indexOf(listener);
      if (index > -1) {
        this.configListeners.splice(index, 1);
      }
    };
  }

  // Notify all listeners of configuration changes
  private static notifyListeners(config: AppConfig): void {
    this.configListeners.forEach(listener => {
      try {
        listener(config);
      } catch (error) {
        console.error('Error in configuration change listener:', error);
      }
    });
  }

  // Helper methods for common configuration access patterns
  static async getTheme(): Promise<'Light' | 'Dark' | 'Auto'> {
    const config = await this.getConfig();
    return config.ui.theme;
  }

  static async getMaxBufferSize(): Promise<number> {
    const config = await this.getConfig();
    return config.data.max_buffer_size;
  }

  static async getChartRefreshRate(): Promise<number> {
    const config = await this.getConfig();
    return config.ui.chart_refresh_rate_ms;
  }

  static async getMaxConcurrentDevices(): Promise<number> {
    const config = await this.getConfig();
    return config.device.max_concurrent_devices;
  }

  static async isDebugMode(): Promise<boolean> {
    const config = await this.getConfig();
    return config.app.debug_mode;
  }

  // Update specific configuration sections
  static async updateAppSettings(settings: Partial<AppSettings>): Promise<void> {
    const updates: Record<string, unknown> = {};
    Object.entries(settings).forEach(([key, value]) => {
      updates[`app.${key}`] = value;
    });
    await this.updateConfig(updates);
  }

  static async updateDeviceSettings(settings: Partial<DeviceSettings>): Promise<void> {
    const updates: Record<string, unknown> = {};
    Object.entries(settings).forEach(([key, value]) => {
      updates[`device.${key}`] = value;
    });
    await this.updateConfig(updates);
  }

  static async updateDataSettings(settings: Partial<DataSettings>): Promise<void> {
    const updates: Record<string, unknown> = {};
    Object.entries(settings).forEach(([key, value]) => {
      updates[`data.${key}`] = value;
    });
    await this.updateConfig(updates);
  }

  static async updateUiSettings(settings: Partial<UiSettings>): Promise<void> {
    const updates: Record<string, unknown> = {};
    Object.entries(settings).forEach(([key, value]) => {
      updates[`ui.${key}`] = value;
    });
    await this.updateConfig(updates);
  }
}

// Legacy compatibility exports for existing code
export const config = {
  // Basic defaults for components that still use the old config format
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
  debugEnabled: isDev(),
  debugDevices: isDev(),
  debugCharts: false,
  mode: isDev() ? 'development' : 'production'
};

// Legacy helper functions for backward compatibility
export const isDevelopment = () => isDev();
export const isProduction = () => !isDev();
export const isDebugEnabled = () => isDev();
export const shouldShowDeviceDebug = () => isDev();
export const shouldShowChartDebug = () => false;

// Export the configuration service as default
export default ConfigurationService;
