// Frontend hook for interacting with the Rust-based buffer manager
// This provides a React hook interface to the high-performance buffer management system

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Types from the backend buffer manager (must match Rust types exactly)
export interface GaitDataPoint {
  timestamp: string // ISO string from backend
  device_id: string
  acceleration_x: number
  acceleration_y: number
  acceleration_z: number
  gyroscope_x?: number
  gyroscope_y?: number
  gyroscope_z?: number
  magnetometer_x?: number
  magnetometer_y?: number
  magnetometer_z?: number
  sequence_number: number
  signal_strength?: number
  battery_level?: number
}

export interface BufferMetrics {
  buffer_id: string
  device_id: string
  current_size: number
  max_size: number
  utilization_percent: number
  data_rate_hz: number
  last_updated: string
  memory_usage_bytes: number
  dropped_samples: number
  total_samples: number
  oldest_sample_age_ms: number
  newest_sample_age_ms: number
}

export interface GlobalBufferMetrics {
  total_devices: number
  total_memory_usage: number
  total_data_points: number
  average_utilization: number
  highest_utilization_device?: string
  total_dropped_samples: number
  cleanup_runs: number
  last_cleanup: string
}

export interface ConnectionMetrics {
  connection_id: string
  device_id: string
  connected_at: string
  last_data_received: string
  packets_received: number
  packets_lost: number
  average_latency_ms: number
  signal_quality: number
  reconnection_count: number
}

export interface StreamingConfig {
  max_subscribers: number
  backpressure_threshold: number
  chunk_size: number
  compression_enabled: boolean
  rate_limit_per_second: number
  heartbeat_interval_ms: number
}

export interface BufferStats {
  totalDevices: number
  totalDataPoints: number
  memoryUsageMB: number
  oldestTimestamp: number
  newestTimestamp: number
  deviceStats: Map<string, DeviceBufferStats>
}

export interface DeviceBufferStats {
  deviceId: string
  dataPoints: number
  memoryUsageMB: number
  oldestTimestamp: number
  newestTimestamp: number
  sampleRate: number
}

export interface BufferManagerState {
  devices: string[]
  metrics: Record<string, BufferMetrics>
  globalMetrics: GlobalBufferMetrics | null
  connectionMetrics: Record<string, ConnectionMetrics>
  streamingConfig: StreamingConfig | null
  isLoading: boolean
  error: string | null
}

export interface BufferManagerActions {
  registerDevice: (deviceId: string, bufferCapacity?: number) => Promise<void>
  unregisterDevice: (deviceId: string) => Promise<void>
  addDataPoint: (deviceId: string, dataPoint: GaitDataPoint) => Promise<void>
  getDeviceData: (deviceId: string, count: number) => Promise<GaitDataPoint[]>
  getDeviceDataRange: (deviceId: string, startTime: Date, endTime: Date) => Promise<GaitDataPoint[]>
  resizeBuffer: (deviceId: string, newCapacity: number) => Promise<void>
  clearBuffer: (deviceId: string) => Promise<void>
  cleanupOldData: () => Promise<number>
  forceMemoryCleanup: () => Promise<void>
  updateStreamingConfig: (config: StreamingConfig) => Promise<void>
  refreshMetrics: () => Promise<void>
}

export interface UseBufferManagerOptions {
  defaultBufferCapacity?: number
  autoRegisterDevices?: boolean
  metricsRefreshInterval?: number
  enablePerformanceMonitoring?: boolean
}

export interface UseBufferManagerReturn {
  state: BufferManagerState
  actions: BufferManagerActions
}



// Custom hook for backend-integrated buffer management
export function useBufferManager(options: UseBufferManagerOptions = {}): UseBufferManagerReturn {
  const {
    defaultBufferCapacity = 10000,
    metricsRefreshInterval = 5000,
    enablePerformanceMonitoring = true
  } = options;

  const [state, setState] = useState<BufferManagerState>({
    devices: [],
    metrics: {},
    globalMetrics: null,
    connectionMetrics: {},
    streamingConfig: null,
    isLoading: false,
    error: null
  });

  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const performanceMonitorRef = useRef<NodeJS.Timeout | null>(null);

  // Update state helper
  const updateState = useCallback((updates: Partial<BufferManagerState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  // Set error state
  const setError = useCallback((error: string | null) => {
    updateState({ error, isLoading: false });
  }, [updateState]);

  // Register a device for buffer management
  const registerDevice = useCallback(async (deviceId: string, bufferCapacity: number = defaultBufferCapacity): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });
      
      await invoke('register_device_buffer_cmd', {
        deviceId,
        bufferCapacity
      });

      // Update local state
      setState(prev => ({
        ...prev,
        devices: [...new Set([...prev.devices, deviceId])],
        isLoading: false
      }));

    } catch (error) {
      console.error('Failed to register device buffer:', error);
      setError(`Failed to register device ${deviceId}: ${error}`);
    }
  }, [defaultBufferCapacity, updateState, setError]);

  // Unregister a device
  const unregisterDevice = useCallback(async (deviceId: string): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });
      
      await invoke('unregister_device_buffer_cmd', { deviceId });

      // Update local state
      setState(prev => {
        const newMetrics = { ...prev.metrics };
        const newConnectionMetrics = { ...prev.connectionMetrics };
        delete newMetrics[deviceId];
        delete newConnectionMetrics[deviceId];

        return {
          ...prev,
          devices: prev.devices.filter(id => id !== deviceId),
          metrics: newMetrics,
          connectionMetrics: newConnectionMetrics,
          isLoading: false
        };
      });

    } catch (error) {
      console.error('Failed to unregister device buffer:', error);
      setError(`Failed to unregister device ${deviceId}: ${error}`);
    }
  }, [updateState, setError]);

  // Refresh all metrics
  const refreshMetrics = useCallback(async (): Promise<void> => {
    try {
      const [allMetrics, globalMetrics, allConnectionMetrics, streamingConfig] = await Promise.all([
        invoke<BufferMetrics[]>('get_all_buffer_metrics_cmd'),
        invoke<GlobalBufferMetrics>('get_global_buffer_metrics_cmd'),
        invoke<ConnectionMetrics[]>('get_all_connection_metrics_cmd'),
        invoke<StreamingConfig>('get_streaming_config_cmd')
      ]);

      // Convert arrays to records for easier access
      const metricsRecord: Record<string, BufferMetrics> = {};
      allMetrics.forEach(metric => {
        metricsRecord[metric.device_id] = metric;
      });

      const connectionMetricsRecord: Record<string, ConnectionMetrics> = {};
      allConnectionMetrics.forEach(metric => {
        connectionMetricsRecord[metric.device_id] = metric;
      });

      updateState({
        metrics: metricsRecord,
        globalMetrics,
        connectionMetrics: connectionMetricsRecord,
        streamingConfig,
        devices: Object.keys(metricsRecord),
        error: null
      });

    } catch (error) {
      console.error('Failed to refresh metrics:', error);
      setError(`Failed to refresh metrics: ${error}`);
    }
  }, [updateState, setError]);

  // Add a data point to a device buffer
  const addDataPoint = useCallback(async (deviceId: string, dataPoint: GaitDataPoint): Promise<void> => {
    try {
      await invoke('add_data_point_cmd', {
        deviceId,
        dataPoint
      });

      // Optionally refresh metrics after adding data
      if (enablePerformanceMonitoring) {
        // Debounced metrics refresh
        if (performanceMonitorRef.current) {
          clearTimeout(performanceMonitorRef.current);
        }
        performanceMonitorRef.current = setTimeout(() => {
          refreshMetrics();
        }, 100);
      }

    } catch (error) {
      console.error('Failed to add data point:', error);
      setError(`Failed to add data point for device ${deviceId}: ${error}`);
    }
  }, [enablePerformanceMonitoring, setError, refreshMetrics]);

  // Get recent data from a device buffer
  const getDeviceData = useCallback(async (deviceId: string, count: number): Promise<GaitDataPoint[]> => {
    try {
      const data = await invoke<GaitDataPoint[]>('get_device_buffer_data_cmd', {
        deviceId,
        count
      });
      return data;
    } catch (error) {
      console.error('Failed to get device data:', error);
      setError(`Failed to get data for device ${deviceId}: ${error}`);
      return [];
    }
  }, [setError]);

  // Get data from a device buffer within a time range
  const getDeviceDataRange = useCallback(async (deviceId: string, startTime: Date, endTime: Date): Promise<GaitDataPoint[]> => {
    try {
      const data = await invoke<GaitDataPoint[]>('get_device_buffer_data_range_cmd', {
        deviceId,
        startTime: startTime.getTime(),
        endTime: endTime.getTime()
      });
      return data;
    } catch (error) {
      console.error('Failed to get device data range:', error);
      setError(`Failed to get data range for device ${deviceId}: ${error}`);
      return [];
    }
  }, [setError]);

  // Resize a device buffer
  const resizeBuffer = useCallback(async (deviceId: string, newCapacity: number): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });
      
      await invoke('resize_device_buffer_cmd', {
        deviceId,
        newCapacity
      });

      updateState({ isLoading: false });
      
      // Refresh metrics to reflect new capacity
      await refreshMetrics();

    } catch (error) {
      console.error('Failed to resize buffer:', error);
      setError(`Failed to resize buffer for device ${deviceId}: ${error}`);
    }
  }, [updateState, setError, refreshMetrics]);

  // Clear a device buffer
  const clearBuffer = useCallback(async (deviceId: string): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });
      
      await invoke('clear_device_buffer_cmd', { deviceId });

      updateState({ isLoading: false });
      
      // Refresh metrics to reflect cleared buffer
      await refreshMetrics();

    } catch (error) {
      console.error('Failed to clear buffer:', error);
      setError(`Failed to clear buffer for device ${deviceId}: ${error}`);
    }
  }, [updateState, setError, refreshMetrics]);

  // Cleanup old data from all buffers
  const cleanupOldData = useCallback(async (): Promise<number> => {
    try {
      const cleanedCount = await invoke<number>('cleanup_old_data_cmd');
      
      // Refresh metrics after cleanup
      await refreshMetrics();
      
      return cleanedCount;
    } catch (error) {
      console.error('Failed to cleanup old data:', error);
      setError(`Failed to cleanup old data: ${error}`);
      return 0;
    }
  }, [setError, refreshMetrics]);

  // Force memory cleanup
  const forceMemoryCleanup = useCallback(async (): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });
      
      await invoke('force_memory_cleanup_cmd');

      updateState({ isLoading: false });
      
      // Refresh metrics after cleanup
      await refreshMetrics();

    } catch (error) {
      console.error('Failed to force memory cleanup:', error);
      setError(`Failed to force memory cleanup: ${error}`);
    }
  }, [updateState, setError, refreshMetrics]);

  // Update streaming configuration
  const updateStreamingConfig = useCallback(async (config: StreamingConfig): Promise<void> => {
    try {
      updateState({ isLoading: true, error: null });
      
      await invoke('update_streaming_config_cmd', { config });

      updateState({
        streamingConfig: config,
        isLoading: false
      });

    } catch (error) {
      console.error('Failed to update streaming config:', error);
      setError(`Failed to update streaming config: ${error}`);
    }
  }, [updateState, setError]);

  // Set up periodic metrics refresh
  useEffect(() => {
    if (metricsRefreshInterval > 0) {
      refreshIntervalRef.current = setInterval(refreshMetrics, metricsRefreshInterval);
    }

    // Initial metrics load
    refreshMetrics();

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (performanceMonitorRef.current) {
        clearTimeout(performanceMonitorRef.current);
      }
    };
  }, [metricsRefreshInterval, refreshMetrics]);

  const actions: BufferManagerActions = {
    registerDevice,
    unregisterDevice,
    addDataPoint,
    getDeviceData,
    getDeviceDataRange,
    resizeBuffer,
    clearBuffer,
    cleanupOldData,
    forceMemoryCleanup,
    updateStreamingConfig,
    refreshMetrics
  };

  return { state, actions };
}

// Hook for device-specific buffer operations
export function useDeviceBuffer(deviceId: string, bufferCapacity: number = 10000) {
  const { state, actions } = useBufferManager({
    defaultBufferCapacity: bufferCapacity,
    autoRegisterDevices: true
  });

  const deviceMetrics = state.metrics[deviceId];
  const connectionMetrics = state.connectionMetrics[deviceId];
  const isRegistered = state.devices.includes(deviceId);

  // Auto-register device on mount
  useEffect(() => {
    if (!isRegistered) {
      actions.registerDevice(deviceId, bufferCapacity);
    }
  }, [deviceId, bufferCapacity, isRegistered, actions]);

  // Device-specific actions
  const deviceActions = {
    addData: (dataPoint: GaitDataPoint) => actions.addDataPoint(deviceId, dataPoint),
    getData: (count: number) => actions.getDeviceData(deviceId, count),
    getDataRange: (startTime: Date, endTime: Date) => actions.getDeviceDataRange(deviceId, startTime, endTime),
    resize: (newCapacity: number) => actions.resizeBuffer(deviceId, newCapacity),
    clear: () => actions.clearBuffer(deviceId),
    unregister: () => actions.unregisterDevice(deviceId)
  };

  return {
    deviceId,
    isRegistered,
    metrics: deviceMetrics,
    connectionMetrics,
    actions: deviceActions,
    globalState: state,
    globalActions: actions
  };
}

export default useBufferManager;
