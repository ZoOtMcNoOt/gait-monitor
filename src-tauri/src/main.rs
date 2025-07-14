#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use std::path::Path;
use async_std::sync::Mutex;
use btleplug::platform::{Peripheral, Manager};
use uuid::Uuid;
use futures::stream::StreamExt;
use tauri::Emitter;
use std::time::{Duration, Instant};

// Sample rate calculation module
mod sample_rate_calculator {
    use std::collections::{HashMap, VecDeque};
    use std::time::{Duration, Instant};

    pub struct SampleRateCalculator {
        device_rates: HashMap<String, DeviceRateCalculator>,
    }

    struct DeviceRateCalculator {
        timestamps: VecDeque<Instant>,
        window_duration: Duration,
        last_rate: f64,
        last_calculation: Instant,
        calculation_interval: Duration,
    }

    impl SampleRateCalculator {
        pub fn new() -> Self {
            Self {
                device_rates: HashMap::new(),
            }
        }

        pub fn record_sample(&mut self, device_id: &str) -> Option<f64> {
            let now = Instant::now();
            
            let device_calculator = self.device_rates
                .entry(device_id.to_string())
                .or_insert_with(|| DeviceRateCalculator::new());
            
            device_calculator.record_sample(now)
        }

        pub fn get_current_rate(&self, device_id: &str) -> Option<f64> {
            self.device_rates
                .get(device_id)
                .map(|calc| calc.last_rate)
                .filter(|&rate| rate > 0.0)
        }
    }

    impl DeviceRateCalculator {
        fn new() -> Self {
            Self {
                timestamps: VecDeque::new(),
                window_duration: Duration::from_secs(5), // 5-second rolling window
                last_rate: 0.0,
                last_calculation: Instant::now(),
                calculation_interval: Duration::from_millis(500), // Calculate every 500ms
            }
        }

        fn record_sample(&mut self, timestamp: Instant) -> Option<f64> {
            // Add new timestamp
            self.timestamps.push_back(timestamp);
            
            // Remove old timestamps outside the window
            let cutoff = timestamp - self.window_duration;
            while let Some(&front) = self.timestamps.front() {
                if front < cutoff {
                    self.timestamps.pop_front();
                } else {
                    break;
                }
            }

            // Calculate rate if enough time has passed since last calculation
            if timestamp.duration_since(self.last_calculation) >= self.calculation_interval {
                self.last_calculation = timestamp;
                
                if self.timestamps.len() >= 2 {
                    let sample_count = self.timestamps.len() as f64;
                    let time_span = timestamp - self.timestamps[0];
                    
                    if time_span > Duration::from_millis(100) { // Avoid division by near-zero
                        self.last_rate = sample_count / time_span.as_secs_f64();
                        return Some(self.last_rate);
                    }
                }
            }
            
            // Return current rate even if not recalculated
            if self.last_rate > 0.0 {
                Some(self.last_rate)
            } else {
                None
            }
        }
    }
}

// Cross-platform path management module
mod path_manager {
    use std::path::{Path, PathBuf};
    use serde::{Serialize, Deserialize};

    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct PathConfig {
        pub app_data_dir: PathBuf,
        pub user_downloads_dir: Option<PathBuf>, // Keep for download functionality
        pub allowed_base_dirs: Vec<PathBuf>,
    }

    impl PathConfig {
        pub fn new() -> Result<Self, String> {
            let app_data_dir = Self::get_app_data_directory()?;
            let user_downloads_dir = dirs::download_dir();
            
            // Build list of allowed base directories - primarily app_data_dir
            let mut allowed_base_dirs = vec![app_data_dir.clone()];
            
            // Add downloads directory if it exists (for file export functionality)
            if let Some(downloads_dir) = &user_downloads_dir {
                if downloads_dir.exists() && Self::is_directory_writable(downloads_dir) {
                    allowed_base_dirs.push(downloads_dir.clone());
                }
            }

            Ok(PathConfig {
                app_data_dir,
                user_downloads_dir,
                allowed_base_dirs,
            })
        }

        fn get_app_data_directory() -> Result<PathBuf, String> {
            // Try to get platform-appropriate app data directory
            if let Some(config_dir) = dirs::config_dir() {
                let app_dir = config_dir.join("GaitMonitor");
                if Self::ensure_directory_exists(&app_dir) {
                    return Ok(app_dir);
                }
            }

            // Fallback to home directory
            if let Some(home_dir) = dirs::home_dir() {
                let app_dir = home_dir.join(".gait-monitor");
                if Self::ensure_directory_exists(&app_dir) {
                    return Ok(app_dir);
                }
            }

            // Last resort: current directory
            std::env::current_dir()
                .map(|cwd| cwd.join("gait_data"))
                .map_err(|e| format!("Cannot determine app data directory: {}", e))
        }

        fn ensure_directory_exists(path: &Path) -> bool {
            if path.exists() {
                path.is_dir() && Self::is_directory_writable(path)
            } else {
                std::fs::create_dir_all(path).is_ok() && Self::is_directory_writable(path)
            }
        }

        fn is_directory_writable(path: &Path) -> bool {
            if !path.exists() || !path.is_dir() {
                return false;
            }
            
            // Try to create a temporary file to test write permissions
            let test_file = path.join(format!(".write_test_{}", uuid::Uuid::new_v4()));
            match std::fs::write(&test_file, "") {
                Ok(_) => {
                    let _ = std::fs::remove_file(&test_file);
                    true
                }
                Err(_) => false,
            }
        }

        pub fn get_default_storage_path(&self) -> PathBuf {
            self.app_data_dir.join("sessions")
        }

        pub fn is_path_allowed(&self, path: &Path) -> bool {
            // For non-existent files, check if the parent directory is allowed
            let check_path = if path.exists() {
                match path.canonicalize() {
                    Ok(p) => p,
                    Err(_) => return false,
                }
            } else {
                // For non-existent files, check the parent directory
                let parent = match path.parent() {
                    Some(p) => p,
                    None => return false,
                };
                
                // If parent exists, canonicalize it and append the filename
                if parent.exists() {
                    match parent.canonicalize() {
                        Ok(canonical_parent) => canonical_parent.join(path.file_name().unwrap_or_default()),
                        Err(_) => path.to_path_buf(),
                    }
                } else {
                    // If parent doesn't exist either, use the path as-is
                    path.to_path_buf()
                }
            };

            // Check against allowed base directories
            self.allowed_base_dirs.iter().any(|base| {
                if let Ok(canonical_base) = base.canonicalize() {
                    check_path.starts_with(canonical_base)
                } else {
                    // Fallback: check if the paths are similar without canonicalization
                    check_path.starts_with(base)
                }
            })
        }

        pub fn sanitize_filename(filename: &str) -> String {
            // Remove or replace problematic characters
            filename
                .chars()
                .map(|c| match c {
                    // Replace path separators and dangerous chars
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
                    // Replace control characters
                    c if c.is_control() => '_',
                    // Keep safe characters
                    c => c,
                })
                .collect::<String>()
                .trim()
                .to_string()
        }

        pub fn get_safe_download_path(&self, filename: &str) -> Option<PathBuf> {
            let safe_filename = Self::sanitize_filename(filename);
            
            // Try downloads directory first
            if let Some(ref downloads) = self.user_downloads_dir {
                if downloads.exists() && Self::is_directory_writable(downloads) {
                    return Some(downloads.join(safe_filename));
                }
            }
            
            // Fallback to app data directory
            Some(self.app_data_dir.join("downloads").join(safe_filename))
        }
    }
}

// CSRF Protection - Simple token-based validation
#[derive(Clone)]
pub struct CSRFTokenState(Arc<Mutex<Option<String>>>);

impl CSRFTokenState {
  fn new() -> Self {
    // Generate initial CSRF token
    let token = uuid::Uuid::new_v4().to_string();
    Self(Arc::new(Mutex::new(Some(token))))
  }

  async fn validate_token(&self, provided_token: &str) -> bool {
    let token_guard = self.0.lock().await;
    if let Some(ref current_token) = *token_guard {
      current_token == provided_token
    } else {
      false
    }
  }

  async fn get_token(&self) -> Option<String> {
    let token_guard = self.0.lock().await;
    token_guard.clone()
  }

  async fn refresh_token(&self) -> String {
    let new_token = uuid::Uuid::new_v4().to_string();
    let mut token_guard = self.0.lock().await;
    *token_guard = Some(new_token.clone());
    new_token
  }
}

// Macro to validate CSRF token for protected commands
macro_rules! validate_csrf {
  ($csrf_state:expr, $token:expr) => {
    if !$csrf_state.validate_token($token).await {
      return Err("Invalid CSRF token".to_string());
    }
  };
}

// Add heartbeat data structure
#[derive(Debug, serde::Serialize)]
struct HeartbeatData {
  device_id: String,
  device_timestamp: u32,
  sequence: u32,
  received_timestamp: u64,
}

// Global state for devices and connections - using different wrapper structs to avoid type conflicts
#[derive(Clone)]
pub struct ConnectedDevicesState(Arc<Mutex<HashMap<String, Peripheral>>>);

#[derive(Clone)]
pub struct DiscoveredDevicesState(Arc<Mutex<HashMap<String, Peripheral>>>);

#[derive(Clone)]
pub struct BluetoothManagerState(Arc<Mutex<Option<Manager>>>);

// New state to track which devices are actively streaming data
#[derive(Clone)]
pub struct ActiveNotificationsState(Arc<Mutex<HashMap<String, bool>>>);

// Global state for sample rate calculation
#[derive(Clone)]
pub struct SampleRateState(Arc<Mutex<sample_rate_calculator::SampleRateCalculator>>);

impl SampleRateState {
    fn new() -> Self {
        Self(Arc::new(Mutex::new(sample_rate_calculator::SampleRateCalculator::new())))
    }
}

// Cross-platform path configuration state
#[derive(Clone)]
pub struct PathConfigState(Arc<Mutex<path_manager::PathConfig>>);

impl PathConfigState {
    pub fn new() -> Result<Self, String> {
        let config = path_manager::PathConfig::new()?;
        Ok(Self(Arc::new(Mutex::new(config))))
    }
}

// A simple serializable struct to send back to JS
#[derive(Serialize)]
struct BluetoothDeviceInfo {
  id: String,
  name: String,
  rssi: Option<i16>,
  connectable: bool,
  address_type: String,
  services: Vec<String>,
  manufacturer_data: Vec<String>,
  service_data: Vec<String>,
}

// Add BLE data streaming functionality
#[derive(Clone, Serialize, serde::Deserialize)]
struct GaitData {
  device_id: String,  // Add device identification
  r1: f32,
  r2: f32,
  r3: f32,
  x: f32,
  y: f32,
  z: f32,
  timestamp: u64,
}

// Enhanced GaitData to include sample rate for frontend
#[derive(Clone, Serialize, serde::Deserialize)]
struct GaitDataWithRate {
  device_id: String,
  r1: f32,
  r2: f32,
  r3: f32,
  x: f32,
  y: f32,
  z: f32,
  timestamp: u64,
  sample_rate: Option<f64>, // Add sample rate field
}

// Rate limiting structure
#[derive(Clone)]
struct RateLimiter {
  last_operation: Instant,
  min_interval: Duration,
}

impl RateLimiter {
  fn new(min_interval_ms: u64) -> Self {
    Self {
      last_operation: Instant::now() - Duration::from_millis(min_interval_ms + 1),
      min_interval: Duration::from_millis(min_interval_ms),
    }
  }

  fn can_proceed(&mut self) -> bool {
    let now = Instant::now();
    if now.duration_since(self.last_operation) >= self.min_interval {
      self.last_operation = now;
      true
    } else {
      false
    }
  }

  fn time_until_next(&self) -> Duration {
    let elapsed = Instant::now().duration_since(self.last_operation);
    if elapsed >= self.min_interval {
      Duration::from_millis(0)
    } else {
      self.min_interval - elapsed
    }
  }
}

// Rate limiting state for different operations
#[derive(Clone)]
pub struct RateLimitingState(Arc<Mutex<HashMap<String, RateLimiter>>>);

impl RateLimitingState {
  fn new() -> Self {
    Self(Arc::new(Mutex::new(HashMap::new())))
  }
}

#[tauri::command]
async fn scan_devices(
  discovered_devices: tauri::State<'_, DiscoveredDevicesState>,
  bt_manager: tauri::State<'_, BluetoothManagerState>,
  rate_limiting: tauri::State<'_, RateLimitingState>
) -> Result<Vec<BluetoothDeviceInfo>, String> {
  use btleplug::api::{Central, Manager as _, Peripheral, ScanFilter};
  
  // Rate limiting check for scan operations (minimum 2 seconds between scans)
  {
    let mut limiters = rate_limiting.0.lock().await;
    let limiter = limiters.entry("scan_devices".to_string())
      .or_insert_with(|| RateLimiter::new(2000)); // 2 second minimum interval
    
    if !limiter.can_proceed() {
      let wait_time = limiter.time_until_next();
      return Err(format!("Rate limited: Please wait {} ms before scanning again", wait_time.as_millis()));
    }
  }
  
  println!("Starting Bluetooth scan...");
  
  // Create or get existing manager
  let manager = {
    let mut mgr_guard = bt_manager.0.lock().await;
    if mgr_guard.is_none() {
      let new_manager = btleplug::platform::Manager::new()
        .await
        .map_err(|e| {
          println!("Failed to create manager: {}", e);
          e.to_string()
        })?;
      *mgr_guard = Some(new_manager);
    }
    mgr_guard.as_ref().unwrap().clone()
  };

  // Clear previously discovered devices
  {
    let mut discovered = discovered_devices.0.lock().await;
    discovered.clear();
  }

  // Grab all adapters (usually one)
  let adapters = manager.adapters().await.map_err(|e| {
    println!("Failed to get adapters: {}", e);
    e.to_string()
  })?;
  
  if adapters.is_empty() {
    return Err("No Bluetooth adapters found".to_string());
  }
  
  println!("Found {} Bluetooth adapter(s)", adapters.len());
  let mut devices = Vec::new();

  for adapter in adapters {
    println!("Using adapter: {:?}", adapter.adapter_info().await);
    
    // Stop any previous scan
    let _ = adapter.stop_scan().await;
    
    // Start scan with filter
    adapter
      .start_scan(ScanFilter::default())
      .await
      .map_err(|e| {
        println!("Failed to start scan: {}", e);
        e.to_string()
      })?;
    
    println!("Scan started, waiting for devices...");
    // Wait longer for devices to be discovered
    async_std::task::sleep(std::time::Duration::from_secs(5)).await;

    // Collect all peripherals seen so far
    let peripherals = adapter.peripherals().await.map_err(|e| {
      println!("Failed to get peripherals: {}", e);
      e.to_string()
    })?;
    
    println!("Found {} peripheral(s)", peripherals.len());
    
    // Store discovered peripherals for later connection
    let mut discovered = discovered_devices.0.lock().await;
    
    for p in peripherals {
      match p.properties().await {
        Ok(Some(props)) => {
          let id = props.address.to_string();
          let name = props
            .local_name
            .unwrap_or_else(|| "(unknown)".into());
          
          // Store the peripheral for later use
          discovered.insert(id.clone(), p.clone());
          
          // Extract additional information
          let rssi = props.rssi;
          // Note: connectable property is not directly available in btleplug 0.10
          // We'll assume devices found during scan are potentially connectable
          let connectable = true;
          let address_type = format!("{:?}", props.address_type);
          
          // Get service UUIDs
          let services: Vec<String> = props.services
            .iter()
            .map(|uuid| uuid.to_string())
            .collect();
          
          // Get manufacturer data
          let manufacturer_data: Vec<String> = props.manufacturer_data
            .iter()
            .map(|(company_id, data)| format!("Company: {}, Data: {:?}", company_id, data))
            .collect();
          
          // Get service data
          let service_data: Vec<String> = props.service_data
            .iter()
            .map(|(uuid, data)| format!("Service: {}, Data: {:?}", uuid, data))
            .collect();
          
          println!("Found device: {} - {} (RSSI: {:?}, Connectable: {})", 
                   id, name, rssi, connectable);
          
          devices.push(BluetoothDeviceInfo { 
            id, 
            name, 
            rssi,
            connectable,
            address_type,
            services,
            manufacturer_data,
            service_data,
          });
        }
        Ok(None) => {
          println!("Device found but no properties available");
        }
        Err(e) => {
          println!("Error getting device properties: {}", e);
        }
      }
    }
    
    // Stop the scan
    let _ = adapter.stop_scan().await;
  }

  println!("Scan completed, found {} devices", devices.len());
  Ok(devices)
}

#[tauri::command]
async fn connect_device(
  device_id: String, 
  connected_devices: tauri::State<'_, ConnectedDevicesState>,
  discovered_devices: tauri::State<'_, DiscoveredDevicesState>,
  rate_limiting: tauri::State<'_, RateLimitingState>
) -> Result<String, String> {
  use btleplug::api::Peripheral;
  
  // Rate limiting check for connect operations (minimum 1 second between connections)
  {
    let mut limiters = rate_limiting.0.lock().await;
    let limiter = limiters.entry(format!("connect_{}", device_id))
      .or_insert_with(|| RateLimiter::new(1000)); // 1 second minimum interval per device
    
    if !limiter.can_proceed() {
      let wait_time = limiter.time_until_next();
      return Err(format!("Rate limited: Please wait {} ms before connecting to this device again", wait_time.as_millis()));
    }
  }
  
  println!("Attempting to connect to device: {}", device_id);
  
  // Check if already connected
  {
    let connected = connected_devices.0.lock().await;
    if connected.contains_key(&device_id) {
      return Ok(format!("Already connected to device: {}", device_id));
    }
  }
  
  // Get the peripheral from discovered devices
  let peripheral = {
    let discovered = discovered_devices.0.lock().await;
    match discovered.get(&device_id) {
      Some(peripheral) => peripheral.clone(),
      None => {
        return Err(format!("Device not found in discovered devices. Please scan first: {}", device_id));
      }
    }
  };

  // Check if already connected to this peripheral
  if peripheral.is_connected().await.unwrap_or(false) {
    println!("Device is already connected at peripheral level");
    let mut connected = connected_devices.0.lock().await;
    connected.insert(device_id.clone(), peripheral);
    return Ok(format!("Device was already connected: {}", device_id));
  }
  
  // Get device name for logging
  let device_name = match peripheral.properties().await {
    Ok(Some(props)) => props.local_name.unwrap_or("Unknown".to_string()),
    _ => "Unknown".to_string()
  };
  
  println!("Attempting to connect to device: {} ({})", device_name, device_id);
  
  // Try to connect with retry logic
  let mut connection_attempts = 0;
  const MAX_ATTEMPTS: u32 = 3;
  
  while connection_attempts < MAX_ATTEMPTS {
    connection_attempts += 1;
    println!("Connection attempt {} of {}", connection_attempts, MAX_ATTEMPTS);
    
    match peripheral.connect().await {
      Ok(_) => {
        println!("Connection command sent successfully to device: {}", device_id);
        
        // Wait a moment for connection to stabilize
        async_std::task::sleep(std::time::Duration::from_millis(1000)).await;
        
        // Verify connection with multiple checks
        let mut connection_verified = false;
        for i in 0..5 {
          if peripheral.is_connected().await.unwrap_or(false) {
            connection_verified = true;
            break;
          }
          println!("Connection verification attempt {}/5", i + 1);
          async_std::task::sleep(std::time::Duration::from_millis(500)).await;
        }
        
        if connection_verified {
          // Store the connected device
          let mut connected = connected_devices.0.lock().await;
          connected.insert(device_id.clone(), peripheral);
          
          println!("Successfully connected and verified connection to device: {}", device_id);
          return Ok(format!("Successfully connected to device: {} ({})", device_name, device_id));
        } else {
          println!("Connection verification failed for device: {}", device_id);
          if connection_attempts < MAX_ATTEMPTS {
            println!("Retrying connection...");
            async_std::task::sleep(std::time::Duration::from_millis(2000)).await;
            continue;
          }
        }
      }
      Err(e) => {
        println!("Connection attempt {} failed: {}", connection_attempts, e);
        if connection_attempts < MAX_ATTEMPTS {
          println!("Retrying connection...");
          async_std::task::sleep(std::time::Duration::from_millis(2000)).await;
          continue;
        } else {
          return Err(format!("Failed to connect after {} attempts: {}", MAX_ATTEMPTS, e));
        }
      }
    }
  }
  
  Err(format!("Failed to connect to device after {} attempts", MAX_ATTEMPTS))
}

#[tauri::command]
async fn disconnect_device(device_id: String, connected_devices: tauri::State<'_, ConnectedDevicesState>) -> Result<String, String> {
  use btleplug::api::Peripheral;
  
  println!("Attempting to disconnect from device: {}", device_id);
  
  let mut connected = connected_devices.0.lock().await;
  
  if let Some(peripheral) = connected.remove(&device_id) {
    match peripheral.disconnect().await {
      Ok(_) => {
        println!("Successfully disconnected from device: {}", device_id);
        Ok(format!("Disconnected from device: {}", device_id))
      }
      Err(e) => {
        println!("Failed to disconnect from device: {}", e);
        // Re-insert the device since disconnect failed
        connected.insert(device_id.clone(), peripheral);
        Err(format!("Failed to disconnect: {}", e))
      }
    }
  } else {
    Err(format!("Device not connected: {}", device_id))
  }
}

#[tauri::command]
async fn get_connected_devices(connected_devices: tauri::State<'_, ConnectedDevicesState>) -> Result<Vec<String>, String> {
  let connected = connected_devices.0.lock().await;
  let device_ids: Vec<String> = connected.keys().cloned().collect();
  Ok(device_ids)
}

#[tauri::command]
async fn is_device_connected(device_id: String, connected_devices: tauri::State<'_, ConnectedDevicesState>) -> Result<bool, String> {
  let connected = connected_devices.0.lock().await;
  Ok(connected.contains_key(&device_id))
}

#[tauri::command]
async fn start_gait_notifications(
  device_id: String,
  connected_devices: tauri::State<'_, ConnectedDevicesState>,
  active_notifications: tauri::State<'_, ActiveNotificationsState>,
  sample_rate_state: tauri::State<'_, SampleRateState>,
  app_handle: tauri::AppHandle,
) -> Result<String, String> {
  use btleplug::api::Peripheral;
  
  println!("Starting gait notifications for device: {}", device_id);
  
  let peripheral = {
    let connected = connected_devices.0.lock().await;
    match connected.get(&device_id) {
      Some(peripheral) => peripheral.clone(),
      None => return Err(format!("Device not connected: {}", device_id)),
    }
  };
  
  // Verify connection state before proceeding
  if !peripheral.is_connected().await.unwrap_or(false) {
    return Err(format!("Device {} is not connected", device_id));
  }
  
  // Define the UUIDs from your Arduino code
  let service_uuid = Uuid::parse_str("48877734-d012-40c4-81de-3ab006f71189")
    .map_err(|e| format!("Invalid service UUID: {}", e))?;
  let characteristic_uuid = Uuid::parse_str("8c4711b4-571b-41ba-a240-73e6884a85eb")
    .map_err(|e| format!("Invalid characteristic UUID: {}", e))?;
  let heartbeat_uuid = Uuid::parse_str("a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    .map_err(|e| format!("Invalid heartbeat UUID: {}", e))?;
  
  println!("Discovering services for device: {}", device_id);
  
  // Discover services with retry logic
  let mut discovery_attempts = 0;
  const MAX_DISCOVERY_ATTEMPTS: u32 = 3;
  
  while discovery_attempts < MAX_DISCOVERY_ATTEMPTS {
    discovery_attempts += 1;
    
    match peripheral.discover_services().await {
      Ok(_) => {
        println!("Service discovery completed (attempt {})", discovery_attempts);
        break;
      }
      Err(e) => {
        println!("Service discovery attempt {} failed: {}", discovery_attempts, e);
        if discovery_attempts < MAX_DISCOVERY_ATTEMPTS {
          async_std::task::sleep(std::time::Duration::from_millis(1000)).await;
          continue;
        } else {
          return Err(format!("Failed to discover services after {} attempts: {}", MAX_DISCOVERY_ATTEMPTS, e));
        }
      }
    }
  }
  
  // Wait a bit more for services to be available
  async_std::task::sleep(std::time::Duration::from_millis(500)).await;
  
  // Get all services and log them for debugging
  let services = peripheral.services();
  println!("Found {} services on device {}:", services.len(), device_id);
  for (i, service) in services.iter().enumerate() {
    println!("  Service {}: {} (characteristics: {})", i, service.uuid, service.characteristics.len());
    for (j, char) in service.characteristics.iter().enumerate() {
      println!("    Characteristic {}: {}", j, char.uuid);
    }
  }
  
  // Find the gait service
  let gait_service = services.iter()
    .find(|s| s.uuid == service_uuid)
    .ok_or_else(|| {
      let service_uuids: Vec<String> = services.iter().map(|s| s.uuid.to_string()).collect();
      format!("Gait service {} not found on device {}. Available services: [{}]", 
        service_uuid, device_id, service_uuids.join(", "))
    })?;
  
  println!("Found gait service on device: {}", device_id);
  
  // Find the gait characteristic
  let gait_characteristic = gait_service.characteristics.iter()
    .find(|c| c.uuid == characteristic_uuid)
    .ok_or_else(|| {
      let char_uuids: Vec<String> = gait_service.characteristics.iter().map(|c| c.uuid.to_string()).collect();
      format!("Gait characteristic {} not found on device {}. Available characteristics: [{}]", 
        characteristic_uuid, device_id, char_uuids.join(", "))
    })?;
    
  println!("Found gait characteristic on device: {}", device_id);
  
  // Find the heartbeat characteristic
  let heartbeat_characteristic = gait_service.characteristics.iter()
    .find(|c| c.uuid == heartbeat_uuid)
    .ok_or_else(|| {
      let char_uuids: Vec<String> = gait_service.characteristics.iter().map(|c| c.uuid.to_string()).collect();
      format!("Heartbeat characteristic {} not found on device {}. Available characteristics: [{}]", 
        heartbeat_uuid, device_id, char_uuids.join(", "))
    })?;
    
  println!("Found heartbeat characteristic on device: {}", device_id);
  
  // Subscribe to notifications
  println!("Subscribing to gait notifications for device: {}", device_id);
  peripheral.subscribe(gait_characteristic).await
    .map_err(|e| format!("Failed to subscribe to gait notifications: {}", e))?;
  
  println!("Subscribing to heartbeat notifications for device: {}", device_id);
  peripheral.subscribe(heartbeat_characteristic).await
    .map_err(|e| format!("Failed to subscribe to heartbeat notifications: {}", e))?;
  
  println!("Successfully subscribed to all notifications for device: {}", device_id);
  
  // Mark device as actively collecting
  {
    let mut active = active_notifications.0.lock().await;
    active.insert(device_id.clone(), true);
  }

  // Set up notification handler
  let app_handle_clone = app_handle.clone();
  let device_id_clone = device_id.clone();
  let active_notifications_clone = active_notifications.inner().clone();
  let sample_rate_state_clone = sample_rate_state.inner().clone();
  let heartbeat_uuid_clone = heartbeat_uuid;
  
  // Start listening for notifications in a background task
  tauri::async_runtime::spawn(async move {
    let mut notification_stream = peripheral.notifications().await.unwrap();
    
    while let Some(data) = notification_stream.next().await {
      // Check if device is still active
      let is_active = {
        let active = active_notifications_clone.0.lock().await;
        active.get(&device_id_clone).copied().unwrap_or(false)
      };
      
      if !is_active {
        break; // Stop listening if device was deactivated
      }
      
      if data.uuid == characteristic_uuid && data.value.len() == 24 {
        let parse_start = std::time::Instant::now();
        
        // Debug: Log raw packet data to detect duplicates at BLE level
        let data_hash = format!("{:02x}{:02x}{:02x}{:02x}", 
          data.value[0], data.value[1], data.value[2], data.value[3]);
        
        // Parse the 24-byte packet (6 floats)
        if let Ok(gait_data) = parse_gait_data(&data.value, &device_id_clone) {
          let parse_duration = parse_start.elapsed();
          
          // Calculate sample rate
          let sample_rate = {
            let mut rate_calc = sample_rate_state_clone.0.lock().await;
            rate_calc.record_sample(&device_id_clone)
          };
          
          // Create enhanced data with sample rate
          let gait_data_with_rate = GaitDataWithRate {
            device_id: gait_data.device_id,
            r1: gait_data.r1,
            r2: gait_data.r2,
            r3: gait_data.r3,
            x: gait_data.x,
            y: gait_data.y,
            z: gait_data.z,
            timestamp: gait_data.timestamp,
            sample_rate,
          };
          
          let emit_start = std::time::Instant::now();
          // Emit enhanced data to frontend with device ID and sample rate
          let _ = app_handle_clone.emit("gait-data", &gait_data_with_rate);
          let emit_duration = emit_start.elapsed();
          
          // Log timing every 100th packet to avoid spam (thread-safe)
          use std::sync::atomic::{AtomicU32, Ordering};
          static PACKET_COUNT: AtomicU32 = AtomicU32::new(0);
          
          let count = PACKET_COUNT.fetch_add(1, Ordering::Relaxed);
          if count % 5 == 0 {  // More frequent logging to catch duplicates
            let rate_info = sample_rate.map(|r| format!("{:.1} Hz", r)).unwrap_or_else(|| "calculating...".to_string());
            println!("🕐 BLE Packet [{}]: Hash: {}, Timestamp: {}, Rate: {}, Parse: {:?}, Emit: {:?}", 
              count, data_hash, gait_data_with_rate.timestamp, rate_info, parse_duration, emit_duration);
          }
        }
      } else if data.uuid == heartbeat_uuid_clone && data.value.len() == 8 {
        // Parse the 8-byte heartbeat packet (timestamp + sequence)
        if let Ok(heartbeat_data) = parse_heartbeat_data(&data.value, &device_id_clone) {
          // Emit heartbeat to frontend
          let _ = app_handle_clone.emit("heartbeat-data", &heartbeat_data);
        }
      }
    }
  });
  
  Ok(format!("Started notifications for device: {}", device_id))
}

#[tauri::command]
async fn get_sample_rate(
  device_id: String,
  sample_rate_state: tauri::State<'_, SampleRateState>,
) -> Result<Option<f64>, String> {
  let rate_calc = sample_rate_state.0.lock().await;
  Ok(rate_calc.get_current_rate(&device_id))
}

#[tauri::command]
async fn stop_gait_notifications(
  device_id: String,
  connected_devices: tauri::State<'_, ConnectedDevicesState>,
  active_notifications: tauri::State<'_, ActiveNotificationsState>,
) -> Result<String, String> {
  use btleplug::api::Peripheral;
  
  println!("Stopping gait notifications for device: {}", device_id);
  
  // Mark device as inactive first (this will stop the notification loop)
  {
    let mut active = active_notifications.0.lock().await;
    active.insert(device_id.clone(), false);
  }

  let peripheral = {
    let connected = connected_devices.0.lock().await;
    match connected.get(&device_id) {
      Some(peripheral) => peripheral.clone(),
      None => {
        println!("Device {} not found in connected devices, marking as inactive only", device_id);
        return Ok(format!("Device {} marked as inactive", device_id));
      }
    }
  };
  
  // Check if still connected
  if !peripheral.is_connected().await.unwrap_or(false) {
    println!("Device {} is no longer connected, marking as inactive only", device_id);
    return Ok(format!("Device {} was already disconnected", device_id));
  }
  
  // Define UUIDs
  let service_uuid = Uuid::parse_str("48877734-d012-40c4-81de-3ab006f71189")
    .map_err(|e| format!("Invalid service UUID: {}", e))?;
  let characteristic_uuid = Uuid::parse_str("8c4711b4-571b-41ba-a240-73e6884a85eb")
    .map_err(|e| format!("Invalid characteristic UUID: {}", e))?;
  
  // Find the characteristic
  let services = peripheral.services();
  let gait_service = services.iter()
    .find(|s| s.uuid == service_uuid);
    
  if let Some(gait_service) = gait_service {
    if let Some(gait_characteristic) = gait_service.characteristics.iter().find(|c| c.uuid == characteristic_uuid) {
      // Unsubscribe from notifications
      match peripheral.unsubscribe(gait_characteristic).await {
        Ok(_) => println!("Successfully unsubscribed from notifications for device: {}", device_id),
        Err(e) => println!("Warning: Failed to unsubscribe from device {}: {}", device_id, e),
      }
    } else {
      println!("Warning: Gait characteristic not found on device {} during unsubscribe", device_id);
    }
  } else {
    println!("Warning: Gait service not found on device {} during unsubscribe", device_id);
  }
  
  Ok(format!("Stopped notifications for device: {}", device_id))
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

// File system and data management commands

#[derive(Serialize, serde::Deserialize, Clone)]
struct SessionMetadata {
  id: String,
  session_name: String,
  subject_id: String,
  notes: String,
  timestamp: u64,
  data_points: usize,
  file_path: String,
  devices: Vec<String>,
}

#[tauri::command]
async fn save_session_data(
  session_name: String,
  subject_id: String,
  notes: String,
  data: Vec<GaitData>,
  storage_path: Option<String>,
  csrf_token: String,
  csrf_state: tauri::State<'_, CSRFTokenState>,
  path_config: tauri::State<'_, PathConfigState>
) -> Result<String, String> {
  // CSRF Protection
  validate_csrf!(csrf_state, &csrf_token);
  
  use tokio::fs;
  use std::path::Path;
  
  // Input validation
  if data.is_empty() {
    return Err("No data to save".to_string());
  }
  
  if session_name.trim().is_empty() {
    return Err("Session name cannot be empty".to_string());
  }
  
  if subject_id.trim().is_empty() {
    return Err("Subject ID cannot be empty".to_string());
  }

  // Get path configuration
  let config = path_config.0.lock().await;

  // Validate and determine storage path
  let base_path = if let Some(user_path) = storage_path {
    // Validate the user-provided path
    let path = Path::new(&user_path);
    
    // Security checks for path traversal
    if user_path.contains("..") || user_path.contains("~") {
      return Err("Invalid path: Path traversal not allowed".to_string());
    }
    
    // Ensure path exists and is allowed
    if !config.is_path_allowed(path) {
      return Err("Invalid path: Path is not within allowed directories".to_string());
    }
    
    path.to_path_buf()
  } else {
    // Use default storage path
    config.get_default_storage_path()
  };

  // Create directory if it doesn't exist
  fs::create_dir_all(&base_path).await
    .map_err(|e| format!("Failed to create directory: {}", e))?;

  // Generate filename with timestamp
  let timestamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap()
    .as_secs();
  
  // Use the path manager to sanitize the filename
  let safe_session_name = path_manager::PathConfig::sanitize_filename(&session_name);
  
  let filename = format!("gait_{}_{}.csv", 
    chrono::DateTime::from_timestamp(timestamp as i64, 0)
      .unwrap()
      .format("%Y%m%d_%H%M%S"),
    safe_session_name
  );
  
  let file_path = base_path.join(&filename);

  // Generate CSV content
  let mut csv_content = String::new();
  
  // Header with metadata
  csv_content.push_str(&format!("# Gait Monitor Data Export\n"));
  csv_content.push_str(&format!("# Session: {}\n", session_name));
  csv_content.push_str(&format!("# Subject: {}\n", subject_id));
  csv_content.push_str(&format!("# Notes: {}\n", notes));
  csv_content.push_str(&format!("# Export Time: {}\n", 
    chrono::DateTime::from_timestamp(timestamp as i64, 0)
      .unwrap()
      .format("%Y-%m-%d %H:%M:%S UTC")
  ));
  csv_content.push_str(&format!("# Data Points: {}\n", data.len()));
  
  // Get unique devices
  let devices: std::collections::HashSet<String> = data.iter()
    .map(|d| d.device_id.clone())
    .collect();
  csv_content.push_str(&format!("# Devices: {}\n", devices.iter().cloned().collect::<Vec<_>>().join(", ")));
  csv_content.push_str("#\n");
  
  // CSV column headers
  csv_content.push_str("device_id,timestamp,r1,r2,r3,x,y,z\n");
  
  // Data rows
  for row in &data {
    csv_content.push_str(&format!("{},{},{},{},{},{},{},{}\n",
      row.device_id,
      row.timestamp,
      row.r1,
      row.r2,
      row.r3,
      row.x,
      row.y,
      row.z
    ));
  }

  // Write file asynchronously
  fs::write(&file_path, csv_content).await
    .map_err(|e| format!("Failed to write file: {}", e))?;

  // Save session metadata
  let session_id = uuid::Uuid::new_v4().to_string();
  let metadata = SessionMetadata {
    id: session_id.clone(),
    session_name,
    subject_id,
    notes,
    timestamp,
    data_points: data.len(),
    file_path: file_path.to_string_lossy().to_string(),
    devices: devices.into_iter().collect(),
  };

  save_session_metadata(&base_path, &metadata).await?;

  Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn get_sessions(
  path_config: tauri::State<'_, PathConfigState>
) -> Result<Vec<SessionMetadata>, String> {
  let config = path_config.0.lock().await;
  
  // Only use the default storage path (AppData/Roaming/GaitMonitor/sessions)
  let storage_path = config.get_default_storage_path();
  
  if storage_path.exists() {
    load_sessions_from_path(&storage_path).await
  } else {
    // Return empty list if storage directory doesn't exist yet
    Ok(vec![])
  }
}

#[tauri::command]
async fn delete_session(
  session_id: String,
  csrf_token: String,
  csrf_state: tauri::State<'_, CSRFTokenState>,
  path_config: tauri::State<'_, PathConfigState>
) -> Result<(), String> {
  // CSRF Protection
  validate_csrf!(csrf_state, &csrf_token);
  
  let sessions = get_sessions(path_config.clone()).await?;

  if let Some(session) = sessions.iter().find(|s| s.id == session_id).cloned() {
    // Delete the data file asynchronously
    if Path::new(&session.file_path).exists() {
      tokio::fs::remove_file(&session.file_path).await
        .map_err(|e| format!("Failed to delete data file: {}", e))?;
    }
    
    // Remove from metadata
    let base_path = Path::new(&session.file_path).parent()
      .ok_or("Invalid file path")?;
    
    let remaining_sessions: Vec<SessionMetadata> = sessions
      .into_iter()
      .filter(|s| s.id != session_id)
      .collect();
    
    save_sessions_metadata(base_path, &remaining_sessions).await?;
  }

  Ok(())
}

#[tauri::command]
async fn choose_storage_directory(
  app_handle: tauri::AppHandle,
  path_config: tauri::State<'_, PathConfigState>
) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;
  
  let config = path_config.0.lock().await;
  
  // Use a blocking approach with a channel to handle the callback
  let (tx, rx) = std::sync::mpsc::channel();
  
  // Determine initial directory for dialog - use app data directory as default
  let initial_dir = config.app_data_dir.clone();
  
  // Use the dialog plugin to show a folder picker
  app_handle
    .dialog()
    .file()
    .set_title("Choose Storage Directory for Gait Data")
    .set_directory(&initial_dir)
    .pick_folder(move |folder_path| {
      let result = match folder_path {
        Some(path) => {
          let path_str = path.to_string();
          println!("📁 User selected storage directory: {}", path_str);
          Some(path_str)
        }
        None => {
          println!("📁 User cancelled directory selection");
          None
        }
      };
      let _ = tx.send(result);
    });
  
  // Wait for the callback to complete
  rx.recv().map_err(|e| format!("Dialog callback failed: {}", e))
}

// Helper functions for session metadata management
async fn save_session_metadata(base_path: &Path, metadata: &SessionMetadata) -> Result<(), String> {
  let metadata_path = base_path.join("sessions_index.json");
  
  // Load existing sessions asynchronously
  let mut sessions = if metadata_path.exists() {
    let content = tokio::fs::read_to_string(&metadata_path).await
      .map_err(|e| format!("Failed to read sessions index: {}", e))?;
    serde_json::from_str::<Vec<SessionMetadata>>(&content)
      .unwrap_or_else(|_| vec![])
  } else {
    vec![]
  };
  
  // Add new session
  sessions.push(metadata.clone());
  
  // Save updated sessions
  save_sessions_metadata(Path::new(base_path), &sessions).await
}

async fn save_sessions_metadata(base_path: &Path, sessions: &[SessionMetadata]) -> Result<(), String> {
  let metadata_path = base_path.join("sessions_index.json");  let content = serde_json::to_string_pretty(sessions)
    .map_err(|e| format!("Failed to serialize sessions: {}", e))?;

  tokio::fs::write(&metadata_path, content).await
    .map_err(|e| format!("Failed to write sessions index: {}", e))?;
  
  Ok(())
}

async fn load_sessions_from_path(base_path: &Path) -> Result<Vec<SessionMetadata>, String> {
  let metadata_path = base_path.join("sessions_index.json");
  
  if !metadata_path.exists() {
    return Ok(vec![]);
  }
  
  let content = tokio::fs::read_to_string(&metadata_path).await
    .map_err(|e| format!("Failed to read sessions index: {}", e))?;
  
  let sessions: Vec<SessionMetadata> = serde_json::from_str(&content)
    .map_err(|e| format!("Failed to parse sessions index: {}", e))?;
  
  // Filter out sessions with missing files
  let valid_sessions: Vec<SessionMetadata> = sessions
    .into_iter()
    .filter(|s| Path::new(&s.file_path).exists())
    .collect();
  
  Ok(valid_sessions)
}

fn parse_gait_data(data: &[u8], device_id: &str) -> Result<GaitData, String> {
  if data.len() != 24 {
    return Err(format!("Invalid data length: {} (expected 24)", data.len()));
  }
  
  // Parse 6 floats in little-endian format
  let r1 = f32::from_le_bytes([data[0], data[1], data[2], data[3]]);
  let r2 = f32::from_le_bytes([data[4], data[5], data[6], data[7]]);
  let r3 = f32::from_le_bytes([data[8], data[9], data[10], data[11]]);
  let x = f32::from_le_bytes([data[12], data[13], data[14], data[15]]);
  let y = f32::from_le_bytes([data[16], data[17], data[18], data[19]]);
  let z = f32::from_le_bytes([data[20], data[21], data[22], data[23]]);
  
  // Use millisecond precision - sufficient for BLE data rates and reduces conversion overhead
  // At 100Hz sample rate, we have 10ms between samples, so millisecond precision is adequate
  let timestamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap()
    .as_millis() as u64;
  
  Ok(GaitData {
    device_id: device_id.to_string(),
    r1,
    r2,
    r3,
    x,
    y,
    z,
    timestamp,
  })
}

fn parse_heartbeat_data(data: &[u8], device_id: &str) -> Result<HeartbeatData, String> {
  if data.len() != 8 {
    return Err(format!("Invalid heartbeat data length: {} (expected 8)", data.len()));
  }
  
  // Parse timestamp (4 bytes) + sequence (4 bytes) in little-endian format (matching Arduino)
  let device_timestamp = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
  let sequence = u32::from_le_bytes([data[4], data[5], data[6], data[7]]);
  
  Ok(HeartbeatData {
    device_id: device_id.to_string(),
    device_timestamp,
    sequence,
    received_timestamp: std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap()
      .as_millis() as u64,
  })
}

#[tauri::command]
async fn copy_file_to_downloads(
  file_path: String,
  file_name: String,
  csrf_token: String,
  csrf_state: tauri::State<'_, CSRFTokenState>,
  path_config: tauri::State<'_, PathConfigState>
) -> Result<String, String> {
  // CSRF Protection
  validate_csrf!(csrf_state, &csrf_token);
  
  use tokio::fs;
  use std::path::Path;

  // Input validation and sanitization
  let safe_filename = path_manager::PathConfig::sanitize_filename(&file_name);
  if safe_filename.is_empty() {
    return Err("Invalid file name".to_string());
  }
  
  if file_path.contains("..") {
    return Err("Invalid file path: Path traversal not allowed".to_string());
  }

  let config = path_config.0.lock().await;
  let source_path = Path::new(&file_path);
  
  // Enhanced security: Verify source path is within allowed directories
  if !config.is_path_allowed(source_path) {
    return Err("Source file must be within allowed directories".to_string());
  }
  
  let canonical_source = source_path.canonicalize()
    .map_err(|_| "Source file path cannot be resolved".to_string())?;
  
  if !canonical_source.exists() {
    return Err("Source file does not exist".to_string());
  }

  // Get safe download path using path manager
  let dest_path = config.get_safe_download_path(&safe_filename)
    .ok_or("Could not determine safe download location")?;
  
  // Ensure download directory exists
  if let Some(parent) = dest_path.parent() {
    fs::create_dir_all(parent).await
      .map_err(|e| format!("Failed to create download directory: {}", e))?;
  }
  
  // Prevent overwriting existing files without confirmation
  if dest_path.exists() {
    return Err("Destination file already exists".to_string());
  }

  // Copy the file asynchronously
  fs::copy(&canonical_source, &dest_path).await
    .map_err(|e| format!("Failed to copy file: {}", e))?;
  
  Ok(dest_path.to_string_lossy().to_string())
}

// CSRF Protection Commands
#[tauri::command]
async fn get_csrf_token(csrf_state: tauri::State<'_, CSRFTokenState>) -> Result<String, String> {
  csrf_state.get_token().await
    .ok_or_else(|| "CSRF token not initialized".to_string())
}

#[tauri::command]
async fn refresh_csrf_token(csrf_state: tauri::State<'_, CSRFTokenState>) -> Result<String, String> {
  Ok(csrf_state.refresh_token().await)
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

  // Parse the CSV file to load actual data
  let file_path = &session_metadata.file_path;
  if !std::path::Path::new(file_path).exists() {
    return Err("Data file not found".to_string());
  }

  let content = tokio::fs::read_to_string(file_path).await
    .map_err(|e| format!("Failed to read data file: {}", e))?;

  let mut data_points = Vec::new();
  let mut devices = std::collections::HashSet::new();
  let mut data_types = std::collections::HashSet::new();
  let mut min_timestamp = u64::MAX;
  let mut max_timestamp = 0u64;

  // Parse CSV content (skip comments and header)
  let mut header_found = false;
  for line in content.lines() {
    let trimmed = line.trim();
    
    // Skip comment lines that start with #
    if trimmed.starts_with('#') || trimmed.is_empty() {
      continue;
    }
    
    // Skip the header line (device_id,timestamp,r1,r2,r3,x,y,z)
    if !header_found && trimmed.starts_with("device_id") {
      header_found = true;
      continue;
    }
    
    let parts: Vec<&str> = line.split(',').collect();
    // Expected format: device_id,timestamp,r1,r2,r3,x,y,z
    if parts.len() >= 8 {
      if let (Ok(timestamp), device_id) = (
        parts[1].parse::<u64>(),
        parts[0]
      ) {
        let device_id = device_id.to_string();
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
            data_types.insert(data_type.to_string());
            
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
    return Err("No valid data points found in file".to_string());
  }

  // Calculate metadata
  let duration = if max_timestamp > min_timestamp {
    (max_timestamp - min_timestamp) as f64 / 1_000_000.0 // Convert microseconds to seconds
  } else {
    0.0
  };

  // Calculate actual sample rate based on unique timestamps, not total data points
  // Since each timestamp can have multiple sensor values (r1,r2,r3,x,y,z), we need to count unique timestamps
  let unique_timestamps: std::collections::HashSet<u64> = data_points.iter().map(|p| p.timestamp).collect();
  let actual_sample_count = unique_timestamps.len() as f64;
  
  let sample_rate = if duration > 0.0 {
    actual_sample_count / duration
  } else {
    0.0
  };

  let session_data = SessionData {
    session_name: session_metadata.session_name.clone(),
    subject_id: session_metadata.subject_id.clone(),
    start_time: min_timestamp,
    end_time: max_timestamp,
    data: data_points,
    metadata: SessionDataMetadata {
      devices: devices.into_iter().collect(),
      data_types: data_types.into_iter().collect(),
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
  path_config: tauri::State<'_, PathConfigState>
) -> Result<String, String> {
  let config = path_config.0.lock().await;
  
  // Use sessions subdirectory within app data directory for consistency
  let sessions_dir = config.app_data_dir.join("sessions");

  println!("🔍 Sessions directory: {:?}", sessions_dir);
  println!("🔍 Allowed base dirs: {:?}", config.allowed_base_dirs);

  // Ensure the sessions directory exists
  if !sessions_dir.exists() {
    tokio::fs::create_dir_all(&sessions_dir).await
      .map_err(|e| format!("Failed to create sessions directory: {}", e))?;
  }

  let file_path = sessions_dir.join(&file_name);
  println!("🔍 Full file path: {:?}", file_path);
  
  // Validate the file path
  if !config.is_path_allowed(&file_path) {
    return Err(format!("File path is not allowed: {:?}. Allowed directories: {:?}", file_path, config.allowed_base_dirs));
  }

  // Write the file asynchronously
  tokio::fs::write(&file_path, content).await
    .map_err(|e| format!("Failed to save file: {}", e))?;

  println!("✅ Successfully saved filtered data to: {:?}", file_path);
  Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn get_storage_path(
  path_config: tauri::State<'_, PathConfigState>
) -> Result<String, String> {
  let config = path_config.0.lock().await;
  let storage_path = config.get_default_storage_path();
  Ok(storage_path.to_string_lossy().to_string())
}

fn main() {
  let connected_devices = ConnectedDevicesState(Arc::new(Mutex::new(HashMap::new())));
  let discovered_devices = DiscoveredDevicesState(Arc::new(Mutex::new(HashMap::new())));
  let bt_manager = BluetoothManagerState(Arc::new(Mutex::new(None)));
  let active_notifications = ActiveNotificationsState(Arc::new(Mutex::new(HashMap::new())));
  let rate_limiting_state = RateLimitingState::new();
  let csrf_token_state = CSRFTokenState::new();
  let path_config_state = PathConfigState::new().expect("Failed to initialize path config");
  let sample_rate_state = SampleRateState::new();
  
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
    .invoke_handler(tauri::generate_handler![scan_devices, connect_device, disconnect_device, get_connected_devices, is_device_connected, start_gait_notifications, stop_gait_notifications, get_active_notifications, is_device_collecting, debug_device_services, check_connection_status, save_session_data, get_sessions, delete_session, choose_storage_directory, copy_file_to_downloads, get_csrf_token, refresh_csrf_token, get_path_config, validate_path, load_session_data, save_filtered_data, get_storage_path, get_sample_rate])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
