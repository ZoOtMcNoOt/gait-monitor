#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

// Module declarations
mod path_manager;
mod security;
mod data_processing;
mod device_management;
mod file_operations;
mod validation;
mod analytics;
mod config;
mod buffer_manager;
mod monitoring;
mod cache;
mod batch_processing;
mod backup_system;

use security::{CSRFTokenState, SecurityEvent, RateLimitingState, CustomRateLimiter, get_csrf_token, refresh_csrf_token, get_security_events, validate_csrf_token};
use path_manager::PathConfig;
use validation::{Validator, ValidationError, ValidatedSessionMetadata};
use analytics::{AnalyticsEngine, SessionStatistics, DataSummary, DevicePerformanceAnalysis};
use config::{ConfigurationState, AppConfig, ConfigValidationError, ConfigurationHistory};
use buffer_manager::{BufferManagerState, GaitDataPoint, BufferMetrics, GlobalBufferMetrics, ConnectionMetrics, StreamingConfig};
use monitoring::{
    PerformanceMonitor, PerformanceMetrics, HealthStatus, SystemMetrics, AlertConfig, AlertNotification, HistoricalMetrics,
    get_performance_metrics, get_health_status, get_system_metrics, get_historical_metrics,
    get_active_alerts, update_alert_config, get_alert_config, record_performance_measurement
};
use cache::{CacheManager, CacheConfig, CacheStats, CacheKey};
use batch_processing::{BatchProcessor, BatchProcessorConfig, BatchJob, JobType, JobPriority, JobStatus, QueueStats};
use backup_system::{BackupManager, BackupConfig, BackupType, BackupMetadata, BackupStats, RecoveryOptions};
use data_processing::{
    SampleRateState, GaitData, GaitDataWithRate,
    parse_gait_data, validate_gait_data, filter_by_time_range, filter_by_devices,
    extract_field_values, convert_units, normalize_data, DataField, UnitConversion, 
    NormalizationMethod, ExportFormat, CSVStreamer
};
use device_management::{
    ConnectedDevicesState, DiscoveredDevicesState, BluetoothManagerState, ActiveNotificationsState,
    scan_devices, connect_device, disconnect_device, get_connected_devices, is_device_connected,
    start_gait_notifications, stop_gait_notifications, get_sample_rate
};
use file_operations::{
    SessionMetadata, SaveResult, PathConfigState,
};

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::path::Path;
use async_std::sync::Mutex;
use uuid::Uuid;
use futures::StreamExt;
use tauri::Emitter;
use std::time::{Duration, Instant};
use dashmap::DashMap;
use tracing::{info, warn, error};

// Global validator state
#[derive(Clone)]
pub struct ValidatorState(pub Validator);

// Global analytics engine state
#[derive(Clone)]
pub struct AnalyticsState(pub AnalyticsEngine);

#[tauri::command]
async fn scan_devices_cmd(
  discovered_devices: tauri::State<'_, DiscoveredDevicesState>,
  bt_manager: tauri::State<'_, BluetoothManagerState>,
  rate_limiting: tauri::State<'_, RateLimitingState>
) -> Result<Vec<device_management::BluetoothDeviceInfo>, String> {
  scan_devices(&discovered_devices, &bt_manager, &rate_limiting).await
}

#[tauri::command]
async fn connect_device_cmd(
  device_id: String, 
  connected_devices: tauri::State<'_, ConnectedDevicesState>,
  discovered_devices: tauri::State<'_, DiscoveredDevicesState>,
  rate_limiting: tauri::State<'_, RateLimitingState>
) -> Result<String, String> {
  connect_device(&device_id, &connected_devices, &discovered_devices, &rate_limiting).await
}

#[tauri::command]
async fn disconnect_device_cmd(device_id: String, connected_devices: tauri::State<'_, ConnectedDevicesState>) -> Result<String, String> {
  disconnect_device(&device_id, &connected_devices).await
}

#[tauri::command]
async fn get_connected_devices_cmd(connected_devices: tauri::State<'_, ConnectedDevicesState>) -> Result<Vec<String>, String> {
  get_connected_devices(&connected_devices).await
}

#[tauri::command]
async fn is_device_connected_cmd(device_id: String, connected_devices: tauri::State<'_, ConnectedDevicesState>) -> Result<bool, String> {
  is_device_connected(&device_id, &connected_devices).await
}

#[tauri::command]
async fn start_gait_notifications_cmd(
  device_id: String,
  connected_devices: tauri::State<'_, ConnectedDevicesState>,
  active_notifications: tauri::State<'_, ActiveNotificationsState>,
  sample_rate_state: tauri::State<'_, SampleRateState>,
  app_handle: tauri::AppHandle,
) -> Result<String, String> {
  start_gait_notifications(&device_id, &connected_devices, &active_notifications, &sample_rate_state, app_handle).await
}

#[tauri::command]
async fn get_sample_rate_cmd(
  device_id: String,
  sample_rate_state: tauri::State<'_, SampleRateState>,
) -> Result<Option<f64>, String> {
  get_sample_rate(&device_id, &sample_rate_state).await
}

#[tauri::command]
async fn stop_gait_notifications_cmd(
  device_id: String,
  connected_devices: tauri::State<'_, ConnectedDevicesState>,
  active_notifications: tauri::State<'_, ActiveNotificationsState>,
) -> Result<String, String> {
  stop_gait_notifications(&device_id, &connected_devices, &active_notifications).await
}

#[tauri::command]
async fn get_active_notifications(active_notifications: tauri::State<'_, ActiveNotificationsState>) -> Result<Vec<String>, String> {
  let active = active_notifications.0.lock().await;
  let active_device_ids: Vec<String> = active.iter()
    .filter_map(|(device_id, is_active)| if *is_active { Some(device_id.clone()) } else { None })
    .collect();
  Ok(active_device_ids)
}

#[tauri::command]
async fn is_device_collecting(
  device_id: String, 
  active_notifications: tauri::State<'_, ActiveNotificationsState>
) -> Result<bool, String> {
  let active = active_notifications.0.lock().await;
  Ok(active.get(&device_id).copied().unwrap_or(false))
}

#[tauri::command]
async fn debug_device_services(
  device_id: String,
  connected_devices: tauri::State<'_, ConnectedDevicesState>,
) -> Result<Vec<String>, String> {
  use btleplug::api::Peripheral;
  
  println!("Debug: Listing services for device: {}", device_id);
  
  let peripheral = {
    let connected = connected_devices.0.lock().await;
    match connected.get(&device_id) {
      Some(peripheral) => peripheral.clone(),
      None => return Err(format!("Device not connected: {}", device_id)),
    }
  };
  
  // Verify connection state
  if !peripheral.is_connected().await.unwrap_or(false) {
    return Err(format!("Device {} is not connected", device_id));
  }
  
  // Discover services
  println!("Debug: Starting service discovery for device: {}", device_id);
  peripheral.discover_services().await
    .map_err(|e| format!("Failed to discover services: {}", e))?;
  
  // Wait for discovery to complete
  async_std::task::sleep(std::time::Duration::from_millis(1000)).await;
  
  // List all services
  let services = peripheral.services();
  let mut service_info = Vec::new();
  
  println!("Debug: Found {} services on device {}:", services.len(), device_id);
  for (i, service) in services.iter().enumerate() {
    let service_str = format!("Service {}: {} (characteristics: {})", i, service.uuid, service.characteristics.len());
    println!("  {}", service_str);
    service_info.push(service_str);
    
    for (j, char) in service.characteristics.iter().enumerate() {
      let char_str = format!("    Characteristic {}: {}", j, char.uuid);
      println!("  {}", char_str);
      service_info.push(char_str);
    }
  }
  
  Ok(service_info)
}

#[tauri::command]
async fn check_connection_status(
  connected_devices: tauri::State<'_, ConnectedDevicesState>,
  app_handle: tauri::AppHandle,
) -> Result<Vec<String>, String> {
  use btleplug::api::Peripheral;
  
  let mut actually_connected = Vec::new();
  let mut devices_to_remove = Vec::new();
  
  {
    let mut connected = connected_devices.0.lock().await;
    
    // Check each device's actual connection status
    for (device_id, peripheral) in connected.iter() {
      match peripheral.is_connected().await {
        Ok(true) => {
          actually_connected.push(device_id.clone());
        }
        Ok(false) => {
          println!("🔌 Device {} is no longer connected", device_id);
          devices_to_remove.push(device_id.clone());
        }
        Err(e) => {
          println!("❌ Error checking connection status for {}: {}", device_id, e);
          devices_to_remove.push(device_id.clone());
        }
      }
    }
    
    // Remove disconnected devices
    for device_id in &devices_to_remove {
      connected.remove(device_id);
    }
  }
  
  // Emit connection status update to frontend
  if !devices_to_remove.is_empty() {
    let _ = app_handle.emit("connection-status-update", &actually_connected);
  }
  
  Ok(actually_connected)
}

// Validation commands

#[tauri::command]
async fn validate_session_metadata_cmd(
  session_name: String,
  subject_id: String,
  notes: String,
  timestamp: String,
  devices: Vec<String>,
  validator: tauri::State<'_, ValidatorState>,
) -> Result<ValidatedSessionMetadata, String> {
  validator.0.validate_session_metadata(&session_name, &subject_id, &notes, &timestamp, &devices)
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn validate_session_name_cmd(
  session_name: String,
  validator: tauri::State<'_, ValidatorState>,
) -> Result<String, String> {
  validator.0.validate_session_name(&session_name)
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn validate_subject_id_cmd(
  subject_id: String,
  validator: tauri::State<'_, ValidatorState>,
) -> Result<String, String> {
  validator.0.validate_subject_id(&subject_id)
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn validate_notes_cmd(
  notes: String,
  validator: tauri::State<'_, ValidatorState>,
) -> Result<String, String> {
  validator.0.validate_notes(&notes)
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn validate_device_id_cmd(
  device_id: String,
  validator: tauri::State<'_, ValidatorState>,
) -> Result<String, String> {
  validator.0.validate_device_id(&device_id)
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_session_uniqueness_cmd(
  session_name: String,
  existing_sessions: Vec<String>,
  validator: tauri::State<'_, ValidatorState>,
) -> Result<(), String> {
  validator.0.check_session_uniqueness(&session_name, &existing_sessions)
    .map_err(|e| e.to_string())
}

// Analytics commands

#[tauri::command]
async fn calculate_session_statistics_cmd(
  data: Vec<GaitData>,
  analytics: tauri::State<'_, AnalyticsState>,
) -> Result<SessionStatistics, String> {
  analytics.0.calculate_session_statistics(&data)
}

#[tauri::command]
async fn get_data_summary_cmd(
  data: Vec<GaitData>,
  start_time: Option<u64>,
  end_time: Option<u64>,
  analytics: tauri::State<'_, AnalyticsState>,
) -> Result<DataSummary, String> {
  analytics.0.get_data_summary(&data, start_time, end_time)
}

#[tauri::command]
async fn analyze_device_performance_cmd(
  device_id: String,
  data: Vec<GaitData>,
  analytics: tauri::State<'_, AnalyticsState>,
) -> Result<DevicePerformanceAnalysis, String> {
  analytics.0.analyze_device_performance(&device_id, &data)
}

// Data filtering and transformation commands

#[tauri::command]
async fn filter_data_by_time_range_cmd(
  data: Vec<GaitData>,
  start_time: u64,
  end_time: u64,
) -> Result<Vec<GaitData>, String> {
  Ok(filter_by_time_range(&data, start_time, end_time))
}

#[tauri::command]
async fn filter_data_by_devices_cmd(
  data: Vec<GaitData>,
  device_ids: Vec<String>,
) -> Result<Vec<GaitData>, String> {
  Ok(filter_by_devices(&data, &device_ids))
}

#[tauri::command]
async fn extract_field_values_cmd(
  data: Vec<GaitData>,
  field: DataField,
) -> Result<Vec<f32>, String> {
  Ok(extract_field_values(&data, field))
}

#[tauri::command]
async fn convert_units_cmd(
  values: Vec<f32>,
  conversion: UnitConversion,
) -> Result<Vec<f32>, String> {
  Ok(convert_units(&values, conversion))
}

#[tauri::command]
async fn normalize_data_cmd(
  values: Vec<f32>,
  method: NormalizationMethod,
) -> Result<Vec<f32>, String> {
  Ok(normalize_data(&values, method))
}

#[tauri::command]
async fn generate_csv_header_cmd(
  format: ExportFormat,
) -> Result<String, String> {
  let streamer = CSVStreamer::new(format);
  Ok(streamer.generate_header())
}

// Configuration management commands

#[tauri::command]
async fn get_app_config_cmd(
  config_state: tauri::State<'_, ConfigurationState>,
) -> Result<AppConfig, String> {
  Ok(config_state.0.get_config().await)
}

#[tauri::command]
async fn update_config_cmd(
  updates: HashMap<String, serde_json::Value>,
  config_state: tauri::State<'_, ConfigurationState>,
) -> Result<(), String> {
  config_state.0.update_config(updates).await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn validate_config_cmd(
  config: AppConfig,
  config_state: tauri::State<'_, ConfigurationState>,
) -> Result<(), String> {
  config_state.0.validate_config(&config).await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn reset_config_to_defaults_cmd(
  config_state: tauri::State<'_, ConfigurationState>,
) -> Result<(), String> {
  config_state.0.reset_to_defaults().await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_configuration_history_cmd(
  config_state: tauri::State<'_, ConfigurationState>,
) -> Result<Vec<ConfigurationHistory>, String> {
  Ok(config_state.0.get_configuration_history().await)
}

#[tauri::command]
async fn export_config_cmd(
  export_path: String,
  config_state: tauri::State<'_, ConfigurationState>,
) -> Result<(), String> {
  let path = std::path::PathBuf::from(export_path);
  config_state.0.export_config(&path).await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn import_config_cmd(
  import_path: String,
  config_state: tauri::State<'_, ConfigurationState>,
) -> Result<(), String> {
  let path = std::path::PathBuf::from(import_path);
  config_state.0.import_config(&path).await
    .map_err(|e| e.to_string())
}

// Buffer management commands

/// Registers a new device buffer for real-time data collection.
/// 
/// This command creates a circular buffer for a specific device that can store
/// gait data points in real-time. The buffer automatically manages memory and
/// prevents overflow by dropping oldest data when capacity is reached.
/// 
/// # Arguments
/// 
/// * `device_id` - Unique identifier for the device (UUID or MAC address format)
/// * `buffer_capacity` - Maximum number of data points to store in the buffer
/// * `buffer_manager` - Tauri state containing the buffer manager instance
/// 
/// # Returns
/// 
/// * `Ok(())` - Device buffer registered successfully
/// * `Err(String)` - Error message if registration fails (e.g., device already registered)
/// 
/// # Example
/// 
/// ```javascript
/// await invoke('register_device_buffer_cmd', {
///   deviceId: 'left_foot_sensor',
///   bufferCapacity: 1000
/// });
/// ```
#[tauri::command]
async fn register_device_buffer_cmd(
  device_id: String,
  buffer_capacity: usize,
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<(), String> {
  buffer_manager.0.register_device(device_id, buffer_capacity).await
}

/// Unregisters a device buffer and cleans up associated resources.
/// 
/// This command removes a device buffer from the system, freeing up memory
/// and cleaning up any associated connection metrics or background tasks.
/// 
/// # Arguments
/// 
/// * `device_id` - Unique identifier for the device to unregister
/// * `buffer_manager` - Tauri state containing the buffer manager instance
/// 
/// # Returns
/// 
/// * `Ok(())` - Device buffer unregistered successfully
/// * `Err(String)` - Error message if unregistration fails (e.g., device not found)
#[tauri::command]
async fn unregister_device_buffer_cmd(
  device_id: String,
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<(), String> {
  buffer_manager.0.unregister_device(&device_id).await
}

/// Adds a new data point to a device buffer.
/// 
/// This command adds a gait data point to the specified device's circular buffer.
/// The buffer automatically manages overflow and updates connection metrics.
/// 
/// # Arguments
/// 
/// * `device_id` - Device identifier (must be previously registered)
/// * `data_point` - Gait data point containing sensor measurements
/// * `buffer_manager` - Tauri state containing the buffer manager instance
/// 
/// # Returns
/// 
/// * `Ok(())` - Data point added successfully
/// * `Err(String)` - Error message if addition fails (e.g., device not registered)
/// 
/// # Example
/// 
/// ```javascript
/// await invoke('add_data_point_cmd', {
///   deviceId: 'left_foot_sensor',
///   dataPoint: {
///     timestamp: new Date().toISOString(),
///     device_id: 'left_foot_sensor',
///     acceleration_x: 0.5,
///     acceleration_y: 1.2,
///     acceleration_z: 9.8,
///     gyroscope_x: 0.1,
///     gyroscope_y: 0.2,
///     gyroscope_z: 0.3
///   }
/// });
/// ```
#[tauri::command]
async fn add_data_point_cmd(
  device_id: String,
  data_point: GaitDataPoint,
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<(), String> {
  buffer_manager.0.add_data_point(&device_id, data_point).await
}

#[tauri::command]
async fn get_device_buffer_data_cmd(
  device_id: String,
  count: usize,
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<Vec<GaitDataPoint>, String> {
  buffer_manager.0.get_device_data(&device_id, count).await
}

#[tauri::command]
async fn get_device_buffer_data_range_cmd(
  device_id: String,
  start_time: u64,
  end_time: u64,
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<Vec<GaitDataPoint>, String> {
  let start_time = chrono::DateTime::from_timestamp(start_time as i64 / 1000, 0)
    .unwrap_or_default()
    .with_timezone(&chrono::Utc);
  let end_time = chrono::DateTime::from_timestamp(end_time as i64 / 1000, 0)
    .unwrap_or_default()
    .with_timezone(&chrono::Utc);
  
  buffer_manager.0.get_device_data_range(&device_id, start_time, end_time).await
}

#[tauri::command]
async fn get_buffer_metrics_cmd(
  device_id: String,
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<BufferMetrics, String> {
  buffer_manager.0.get_buffer_metrics(&device_id).await
}

// Data processing and validation commands

/// Validates a batch of gait data points according to predefined validation rules.
/// 
/// This command performs comprehensive validation of multiple gait sensor data points
/// to ensure data quality and identify any invalid measurements that could corrupt
/// analysis results. It processes data in batches for optimal performance.
/// 
/// # Arguments
/// 
/// * `data` - Vector of GaitData structs to validate
/// 
/// # Returns
/// 
/// * `Ok(Vec<String>)` - Vector of validation error messages (empty if all data is valid)
/// * `Err(String)` - System error if validation process fails
/// 
/// # Validation Rules
/// 
/// Each data point is validated against:
/// * Device ID must not be empty and should follow UUID/MAC format
/// * Timestamp must be positive (non-zero)  
/// * Force values (r1, r2, r3) must be within ±1000.0 range
/// * Acceleration values (x, y, z) must be within ±50.0 g-force range
/// * All numeric values must be finite (no NaN or infinite values)
/// 
/// # Example
/// 
/// ```javascript
/// const validationErrors = await invoke('validate_gait_data_batch_cmd', {
///   data: [
///     {
///       device_id: "12345678-1234-1234-1234-123456789012",
///       r1: 250.0, r2: 300.0, r3: 275.0,
///       x: 0.5, y: 1.2, z: 9.8,
///       timestamp: 1642784400000
///     }
///   ]
/// });
/// 
/// if (validationErrors.length === 0) {
///   console.log("All data is valid!");
/// } else {
///   console.error("Validation errors:", validationErrors);
/// }
/// ```
/// 
/// # Performance
/// 
/// This command can validate 10,000+ data points per second and is optimized
/// for high-throughput batch processing scenarios.
#[tauri::command]
async fn validate_gait_data_batch_cmd(data: Vec<GaitData>) -> Result<Vec<String>, String> {
    let mut errors = Vec::new();
    
    for (index, data_point) in data.iter().enumerate() {
        if let Err(error) = validate_gait_data(data_point) {
            errors.push(format!("Data point {}: {}", index, error));
        }
    }
    
    Ok(errors)
}

#[tauri::command]
async fn get_all_buffer_metrics_cmd(
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<Vec<BufferMetrics>, String> {
  Ok(buffer_manager.0.get_all_metrics().await)
}

#[tauri::command]
async fn get_global_buffer_metrics_cmd(
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<GlobalBufferMetrics, String> {
  Ok(buffer_manager.0.get_global_metrics().await)
}

#[tauri::command]
async fn get_connection_metrics_cmd(
  device_id: String,
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<ConnectionMetrics, String> {
  buffer_manager.0.get_connection_metrics(&device_id).await
}

#[tauri::command]
async fn get_all_connection_metrics_cmd(
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<Vec<ConnectionMetrics>, String> {
  Ok(buffer_manager.0.get_all_connection_metrics().await)
}

#[tauri::command]
async fn resize_device_buffer_cmd(
  device_id: String,
  new_capacity: usize,
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<(), String> {
  buffer_manager.0.resize_device_buffer(&device_id, new_capacity).await
}

#[tauri::command]
async fn clear_device_buffer_cmd(
  device_id: String,
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<(), String> {
  buffer_manager.0.clear_device_buffer(&device_id).await
}

#[tauri::command]
async fn cleanup_old_data_cmd(
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<u64, String> {
  buffer_manager.0.cleanup_old_data().await
}

#[tauri::command]
async fn force_memory_cleanup_cmd(
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<(), String> {
  buffer_manager.0.force_memory_cleanup().await
}

#[tauri::command]
async fn get_streaming_config_cmd(
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<StreamingConfig, String> {
  Ok(buffer_manager.0.get_streaming_config().await)
}

#[tauri::command]
async fn update_streaming_config_cmd(
  config: StreamingConfig,
  buffer_manager: tauri::State<'_, BufferManagerState>,
) -> Result<(), String> {
  buffer_manager.0.update_streaming_config(config).await
}

// File system and data management commands

#[tauri::command]
async fn save_session_data(
  session_name: String,
  subject_id: String,
  notes: String,
  data: Vec<GaitData>,
  storage_path: Option<String>,
  csrf_token: String,
  csrf_state: tauri::State<'_, CSRFTokenState>,
  path_config: tauri::State<'_, PathConfigState>,
  validator: tauri::State<'_, ValidatorState>
) -> Result<String, String> {
  // Validate the session metadata first
  let timestamp = chrono::Utc::now().to_rfc3339();
  let device_ids: Vec<String> = data.iter()
    .map(|d| d.device_id.clone())
    .collect::<std::collections::HashSet<_>>()
    .into_iter()
    .collect();
  
  let _validated_metadata = validator.0.validate_session_metadata(
    &session_name,
    &subject_id,
    &notes,
    &timestamp,
    &device_ids
  ).map_err(|e| format!("Validation failed: {}", e))?;
  
  let result = file_operations::save_session_data(
    &session_name,
    &subject_id,
    &notes,
    &data,
    storage_path.as_deref(),
    &csrf_token,
    &*csrf_state,
    &*path_config
  ).await?;
  
  Ok(result.file_path)
}

#[tauri::command]
async fn get_sessions(
  path_config: tauri::State<'_, PathConfigState>
) -> Result<Vec<SessionMetadata>, String> {
  file_operations::get_sessions(&*path_config).await
}

#[tauri::command]
async fn delete_session(
  session_id: String,
  csrf_token: String,
  csrf_state: tauri::State<'_, CSRFTokenState>,
  path_config: tauri::State<'_, PathConfigState>,
  validator: tauri::State<'_, ValidatorState>
) -> Result<(), String> {
  // Validate the session ID to prevent path traversal and ensure proper format
  let _validated_session_id = validator.0.validate_session_name(&session_id)
    .map_err(|e| format!("Invalid session ID: {}", e))?;
  
  let _result = file_operations::delete_session(&session_id, &csrf_token, &*csrf_state, &*path_config).await?;
  Ok(())
}

#[tauri::command]
async fn choose_storage_directory(
  _app_handle: tauri::AppHandle,
  _csrf_token: String,
  _csrf_state: tauri::State<'_, CSRFTokenState>,
  _path_config: tauri::State<'_, PathConfigState>
) -> Result<Option<String>, String> {
  // For now, this calls the simplified version from the module
  // In the future, you might want to pass the app_handle to the module for dialog support
  file_operations::choose_storage_directory().await
}

#[tauri::command]
async fn copy_file_to_downloads(
  file_path: String,
  _file_name: String,
  csrf_token: String,
  csrf_state: tauri::State<'_, CSRFTokenState>,
  _path_config: tauri::State<'_, PathConfigState>
) -> Result<String, String> {
  file_operations::copy_file_to_downloads(&file_path, &csrf_token, &*csrf_state).await
}

// Path Configuration Commands
#[tauri::command]
async fn get_path_config(
  path_config: tauri::State<'_, PathConfigState>
) -> Result<path_manager::PathConfig, String> {
  let config = path_config.0.lock().await;
  Ok(config.clone())
}

#[tauri::command]
async fn validate_path(
  path_str: String,
  path_config: tauri::State<'_, PathConfigState>
) -> Result<bool, String> {
  let config = path_config.0.lock().await;
  let path = std::path::Path::new(&path_str);
  Ok(config.is_path_allowed(path))
}

// Data structures for session data parsing
#[derive(Serialize, Clone)]
struct DataPoint {
    timestamp: u64,
    device_id: String,
    data_type: String,
    value: f64,
    unit: String,
}

#[derive(Serialize)]
struct SessionData {
    session_name: String,
    subject_id: String,
    start_time: u64,
    end_time: u64,
    data: Vec<DataPoint>,
    metadata: SessionDataMetadata,
}

#[derive(Serialize)]
struct SessionDataMetadata {
    devices: Vec<String>,
    data_types: Vec<String>,
    sample_rate: f64,
    duration: f64,
}

#[tauri::command]
async fn load_session_data(
  session_id: String,
  path_config: tauri::State<'_, PathConfigState>
) -> Result<SessionData, String> {
  // Get the session metadata first
  let sessions = get_sessions(path_config.clone()).await?;
  let session_metadata = sessions.iter()
    .find(|s| s.id == session_id)
    .ok_or("Session not found")?;

  // Read the file directly since this is an internal operation
  let file_path = &session_metadata.file_path;
  if !std::path::Path::new(file_path).exists() {
    return Err("Data file not found".to_string());
  }

  let content = tokio::fs::read_to_string(file_path).await
    .map_err(|e| format!("Failed to read data file: {}", e))?;

  // Parse CSV content manually
  let mut data_points = Vec::new();
  let mut devices = std::collections::HashSet::new();
  let mut min_timestamp = u64::MAX;
  let mut max_timestamp = 0u64;

  for line in content.lines() {
    let line = line.trim();
    
    // Skip comment lines and empty lines
    if line.starts_with('#') || line.is_empty() {
      continue;
    }
    
    // Skip header line
    if line.starts_with("timestamp") || line.starts_with("device_id") {
      continue;
    }
    
    let parts: Vec<&str> = line.split(',').collect();
    if parts.len() >= 8 {
      // Parse based on our expected format: timestamp,device_id,r1,r2,r3,x,y,z
      if let Ok(timestamp) = parts[0].parse::<u64>() {
        let device_id = parts[1].to_string();
        devices.insert(device_id.clone());
        min_timestamp = min_timestamp.min(timestamp);
        max_timestamp = max_timestamp.max(timestamp);

        // Parse each sensor value as a separate data point
        let sensor_data = [
          ("r1", parts[2], "Ω"),
          ("r2", parts[3], "Ω"), 
          ("r3", parts[4], "Ω"),
          ("x", parts[5], "g"),
          ("y", parts[6], "g"),
          ("z", parts[7], "g"),
        ];

        for (data_type, value_str, unit) in sensor_data {
          if let Ok(value) = value_str.parse::<f64>() {
            data_points.push(DataPoint {
              timestamp,
              device_id: device_id.clone(),
              data_type: data_type.to_string(),
              value,
              unit: unit.to_string(),
            });
          }
        }
      }
    }
  }

  if data_points.is_empty() {
    return Err("No valid data points found in session".to_string());
  }

  // Calculate metadata
  let duration = if max_timestamp > min_timestamp {
    (max_timestamp - min_timestamp) as f64 / 1_000.0 // Convert milliseconds to seconds
  } else {
    0.0
  };

  // Calculate sample rate based on unique timestamps
  let unique_timestamps: std::collections::HashSet<u64> = data_points.iter().map(|p| p.timestamp).collect();
  let actual_sample_count = unique_timestamps.len() as f64;
  
  let sample_rate = if duration > 0.0 {
    actual_sample_count / duration
  } else {
    0.0
  };

  let data_types = vec!["r1".to_string(), "r2".to_string(), "r3".to_string(), "x".to_string(), "y".to_string(), "z".to_string()];

  let session_data = SessionData {
    session_name: session_metadata.session_name.clone(),
    subject_id: session_metadata.subject_id.clone(),
    start_time: min_timestamp,
    end_time: max_timestamp,
    data: data_points,
    metadata: SessionDataMetadata {
      devices: devices.into_iter().collect(),
      data_types,
      sample_rate,
      duration,
    },
  };

  Ok(session_data)
}

#[tauri::command]
async fn save_filtered_data(
  file_name: String,
  content: String,
  csrf_token: String,
  csrf_state: tauri::State<'_, CSRFTokenState>,
  path_config: tauri::State<'_, PathConfigState>,
  validator: tauri::State<'_, ValidatorState>
) -> Result<String, String> {
  // CSRF Protection with rate limiting
  validate_file_operation!(csrf_state, &csrf_token, "save_filtered_data");
  
  // Validate the file name to prevent path traversal and ensure safe naming
  let _validated_file_name = validator.0.validate_file_path(&file_name)
    .map_err(|e| format!("Invalid file name: {}", e))?;
  
  let config = path_config.0.lock().await;
  
  // Use sessions subdirectory within app data directory for consistency
  let sessions_dir = config.get_default_storage_path();

  // Write the file directly
  let file_path = sessions_dir.join(&file_name);
  
  // Validate the file path
  if !config.is_path_allowed(&file_path) {
    return Err(format!("File path is not allowed: {:?}", file_path));
  }

  // Ensure the sessions directory exists
  tokio::fs::create_dir_all(&sessions_dir).await
    .map_err(|e| format!("Failed to create sessions directory: {}", e))?;

  // Write the file asynchronously
  tokio::fs::write(&file_path, content).await
    .map_err(|e| format!("Failed to save file: {}", e))?;

  Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn get_storage_path(
  path_config: tauri::State<'_, PathConfigState>
) -> Result<String, String> {
  file_operations::get_storage_path(&*path_config).await
}

// Phase 4.2 Advanced Features - Cache Management Commands

#[tauri::command]
async fn get_cache_stats(
    cache_manager: tauri::State<'_, Arc<CacheManager>>,
) -> Result<CacheStats, String> {
    Ok(cache_manager.get_stats())
}

#[tauri::command]
async fn clear_cache(
    cache_manager: tauri::State<'_, Arc<CacheManager>>,
) -> Result<(), String> {
    cache_manager.clear();
    Ok(())
}

#[tauri::command]
async fn cleanup_cache(
    cache_manager: tauri::State<'_, Arc<CacheManager>>,
) -> Result<(), String> {
    cache_manager.cleanup()
}

#[tauri::command]
async fn invalidate_cache_pattern(
    cache_manager: tauri::State<'_, Arc<CacheManager>>,
    pattern: String,
) -> Result<usize, String> {
    Ok(cache_manager.invalidate_by_pattern(&pattern))
}

// Phase 4.2 Advanced Features - Batch Processing Commands

#[tauri::command]
async fn submit_batch_job(
    batch_processor: tauri::State<'_, Arc<BatchProcessor>>,
    job_type: JobType,
    priority: JobPriority,
) -> Result<String, String> {
    let job = BatchJob::new(job_type, priority);
    batch_processor.submit_job(job)
}

#[tauri::command]
async fn get_batch_job_status(
    batch_processor: tauri::State<'_, Arc<BatchProcessor>>,
    job_id: String,
) -> Result<Option<BatchJob>, String> {
    Ok(batch_processor.get_job_status(&job_id))
}

#[tauri::command]
async fn cancel_batch_job(
    batch_processor: tauri::State<'_, Arc<BatchProcessor>>,
    job_id: String,
) -> Result<(), String> {
    batch_processor.cancel_job(&job_id)
}

#[tauri::command]
async fn get_batch_queue_stats(
    batch_processor: tauri::State<'_, Arc<BatchProcessor>>,
) -> Result<QueueStats, String> {
    Ok(batch_processor.get_stats())
}

#[tauri::command]
async fn get_all_batch_jobs(
    batch_processor: tauri::State<'_, Arc<BatchProcessor>>,
    status_filter: Option<JobStatus>,
) -> Result<Vec<BatchJob>, String> {
    Ok(batch_processor.get_jobs(status_filter))
}

#[tauri::command]
async fn cleanup_completed_jobs(
    batch_processor: tauri::State<'_, Arc<BatchProcessor>>,
) -> Result<usize, String> {
    Ok(batch_processor.cleanup_completed_jobs())
}

// Phase 4.2 Advanced Features - Backup System Commands

#[tauri::command]
async fn create_backup(
    backup_manager: tauri::State<'_, Arc<BackupManager>>,
    backup_type: BackupType,
) -> Result<String, String> {
    backup_manager.create_backup(backup_type).await
}

#[tauri::command]
async fn restore_backup(
    backup_manager: tauri::State<'_, Arc<BackupManager>>,
    options: RecoveryOptions,
) -> Result<(), String> {
    backup_manager.restore_backup(options).await
}

#[tauri::command]
async fn list_backups(
    backup_manager: tauri::State<'_, Arc<BackupManager>>,
) -> Result<Vec<BackupMetadata>, String> {
    Ok(backup_manager.list_backups())
}

#[tauri::command]
async fn get_backup_stats(
    backup_manager: tauri::State<'_, Arc<BackupManager>>,
) -> Result<BackupStats, String> {
    Ok(backup_manager.get_stats())
}

#[tauri::command]
async fn delete_backup(
    backup_manager: tauri::State<'_, Arc<BackupManager>>,
    backup_id: String,
) -> Result<(), String> {
    backup_manager.delete_backup(&backup_id).await
}

#[tauri::command]
async fn update_backup_config(
    backup_manager: tauri::State<'_, Arc<BackupManager>>,
    config: BackupConfig,
) -> Result<(), String> {
    backup_manager.update_config(config).await
}

#[tauri::command]
async fn get_backup_config(
    backup_manager: tauri::State<'_, Arc<BackupManager>>,
) -> Result<BackupConfig, String> {
    Ok(backup_manager.get_config())
}

#[tauri::command]
async fn start_backup_scheduler(
    backup_manager: tauri::State<'_, Arc<BackupManager>>,
) -> Result<(), String> {
    backup_manager.start_scheduler().await
}

fn main() {
  // Initialize structured logging
  tracing_subscriber::fmt()
    .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
    .with_target(false)
    .with_thread_ids(true)
    .with_file(true)
    .with_line_number(true)
    .init();

  info!("Starting Gait Monitor application with enhanced CSRF protection");

  let connected_devices = ConnectedDevicesState(Arc::new(Mutex::new(HashMap::new())));
  let discovered_devices = DiscoveredDevicesState(Arc::new(Mutex::new(HashMap::new())));
  let bt_manager = BluetoothManagerState(Arc::new(Mutex::new(None)));
  let active_notifications = ActiveNotificationsState(Arc::new(Mutex::new(HashMap::new())));
  let rate_limiting_state = RateLimitingState::new();
  let csrf_token_state = CSRFTokenState::new();
  let path_config_state = PathConfigState::new().expect("Failed to initialize path config");
  let sample_rate_state = SampleRateState::new();
  let validator_state = ValidatorState(Validator::new());
  let analytics_state = AnalyticsState(AnalyticsEngine::new());
  let config_state = ConfigurationState::new(None).expect("Failed to initialize configuration");
  let buffer_manager_state = BufferManagerState::new(64 * 1024 * 1024); // 64MB buffer limit
  let performance_monitor = Arc::new(PerformanceMonitor::new());

  // Initialize advanced Phase 4.2 systems
  let cache_config = CacheConfig::default();
  let cache_manager = Arc::new(CacheManager::new(cache_config));
  
  let batch_config = BatchProcessorConfig::default();
  let batch_processor = Arc::new(BatchProcessor::new(batch_config));
  
  let backup_config = BackupConfig::default();
  let backup_manager = Arc::new(BackupManager::new(backup_config));

  info!("All application states initialized successfully");
  
  // Start background task for performance monitoring
  let monitor_clone = performance_monitor.clone();
  tauri::async_runtime::spawn(async move {
    let mut interval = tokio::time::interval(Duration::from_secs(60)); // Every minute
    loop {
      interval.tick().await;
      if let Err(e) = monitor_clone.record_historical_metrics() {
        error!("Failed to record historical metrics: {}", e);
      }
      if let Err(e) = monitor_clone.check_alerts() {
        error!("Failed to check alerts: {}", e);
      }
    }
  });
  
  // Start background task for CSRF token cleanup
  let csrf_cleanup_state = csrf_token_state.clone();
  tauri::async_runtime::spawn(async move {
    let mut interval = tokio::time::interval(Duration::from_secs(3600)); // Every hour
    loop {
      interval.tick().await;
      csrf_cleanup_state.cleanup_expired_attack_attempts().await;
      info!("Completed CSRF attack attempts cleanup");
    }
  });
  
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .manage(connected_devices)
    .manage(discovered_devices)
    .manage(bt_manager)
    .manage(active_notifications)
    .manage(rate_limiting_state)
    .manage(csrf_token_state)
    .manage(path_config_state)
    .manage(sample_rate_state)
    .manage(validator_state)
    .manage(analytics_state)
    .manage(config_state)
    .manage(buffer_manager_state)
    .manage(performance_monitor)
    .manage(cache_manager)
    .manage(batch_processor)
    .manage(backup_manager)
    .invoke_handler(tauri::generate_handler![
      scan_devices_cmd, 
      connect_device_cmd, 
      disconnect_device_cmd, 
      get_connected_devices_cmd, 
      is_device_connected_cmd, 
      start_gait_notifications_cmd, 
      stop_gait_notifications_cmd, 
      get_active_notifications, 
      is_device_collecting, 
      debug_device_services, 
      check_connection_status,
      validate_session_metadata_cmd,
      validate_session_name_cmd,
      validate_subject_id_cmd,
      validate_notes_cmd,
      validate_device_id_cmd,
      check_session_uniqueness_cmd,
      calculate_session_statistics_cmd,
      get_data_summary_cmd,
      analyze_device_performance_cmd,
      filter_data_by_time_range_cmd,
      filter_data_by_devices_cmd,
      extract_field_values_cmd,
      convert_units_cmd,
      normalize_data_cmd,
      generate_csv_header_cmd,
      save_session_data, 
      get_sessions, 
      delete_session, 
      choose_storage_directory, 
      copy_file_to_downloads, 
      get_csrf_token, 
      refresh_csrf_token, 
      get_security_events,
      validate_csrf_token,
      get_path_config, 
      validate_path, 
      load_session_data, 
      save_filtered_data, 
      get_storage_path, 
      get_sample_rate_cmd,
      get_app_config_cmd,
      update_config_cmd,
      validate_config_cmd,
      reset_config_to_defaults_cmd,
      get_configuration_history_cmd,
      export_config_cmd,
      import_config_cmd,
      register_device_buffer_cmd,
      unregister_device_buffer_cmd,
      add_data_point_cmd,
      get_device_buffer_data_cmd,
      get_device_buffer_data_range_cmd,
      get_buffer_metrics_cmd,
      get_all_buffer_metrics_cmd,
      get_global_buffer_metrics_cmd,
      get_connection_metrics_cmd,
      get_all_connection_metrics_cmd,
      resize_device_buffer_cmd,
      clear_device_buffer_cmd,
      cleanup_old_data_cmd,
      force_memory_cleanup_cmd,
      validate_gait_data_batch_cmd,
      get_streaming_config_cmd,
      update_streaming_config_cmd,
      get_performance_metrics,
      get_health_status,
      get_system_metrics,
      get_historical_metrics,
      get_active_alerts,
      update_alert_config,
      get_alert_config,
      record_performance_measurement,
      // Phase 4.2 Advanced Features Commands
      get_cache_stats,
      clear_cache,
      cleanup_cache,
      invalidate_cache_pattern,
      submit_batch_job,
      get_batch_job_status,
      cancel_batch_job,
      get_batch_queue_stats,
      get_all_batch_jobs,
      cleanup_completed_jobs,
      create_backup,
      restore_backup,
      list_backups,
      get_backup_stats,
      delete_backup,
      update_backup_config,
      get_backup_config,
      start_backup_scheduler
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
