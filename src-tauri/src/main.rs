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

#[tauri::command]
async fn scan_devices(
  discovered_devices: tauri::State<'_, DiscoveredDevicesState>,
  bt_manager: tauri::State<'_, BluetoothManagerState>
) -> Result<Vec<BluetoothDeviceInfo>, String> {
  use btleplug::api::{Central, Manager as _, Peripheral, ScanFilter};
  
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
  discovered_devices: tauri::State<'_, DiscoveredDevicesState>
) -> Result<String, String> {
  use btleplug::api::Peripheral;
  
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
        // Parse the 24-byte packet (6 floats)
        if let Ok(gait_data) = parse_gait_data(&data.value, &device_id_clone) {
          // Emit to frontend with device ID
          let _ = app_handle_clone.emit("gait-data", &gait_data);
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
) -> Result<String, String> {
  use std::fs;
  use std::path::Path;
  
  if data.is_empty() {
    return Err("No data to save".to_string());
  }

  // Determine storage directory
  let base_path = storage_path.unwrap_or_else(|| {
    // Default to Documents/GaitMonitor or current directory
    dirs::document_dir()
      .map(|p| p.join("GaitMonitor"))
      .unwrap_or_else(|| std::env::current_dir().unwrap().join("gait_data"))
      .to_string_lossy()
      .to_string()
  });

  // Create directory if it doesn't exist
  fs::create_dir_all(&base_path)
    .map_err(|e| format!("Failed to create directory: {}", e))?;

  // Generate filename with timestamp
  let timestamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .unwrap()
    .as_secs();
  
  let safe_session_name = session_name
    .chars()
    .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
    .collect::<String>();
  
  let filename = format!("gait_{}_{}.csv", 
    chrono::DateTime::from_timestamp(timestamp as i64, 0)
      .unwrap()
      .format("%Y%m%d_%H%M%S"),
    safe_session_name
  );
  
  let file_path = Path::new(&base_path).join(&filename);

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

  // Write file
  fs::write(&file_path, csv_content)
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
async fn get_sessions() -> Result<Vec<SessionMetadata>, String> {
  // Try to load from default location first
  let possible_paths = vec![
    dirs::document_dir().map(|p| p.join("GaitMonitor")),
    Some(std::env::current_dir().unwrap().join("gait_data")),
  ];

  for path_opt in possible_paths {
    if let Some(path) = path_opt {
      if path.exists() {
        match load_sessions_from_path(&path).await {
          Ok(sessions) => return Ok(sessions),
          Err(_) => continue,
        }
      }
    }
  }

  // Return empty list if no sessions found
  Ok(vec![])
}

#[tauri::command]
async fn delete_session(session_id: String) -> Result<(), String> {
  let sessions = get_sessions().await?;
  
  if let Some(session) = sessions.iter().find(|s| s.id == session_id).cloned() {
    // Delete the data file
    if Path::new(&session.file_path).exists() {
      std::fs::remove_file(&session.file_path)
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
async fn choose_storage_directory(app_handle: tauri::AppHandle) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;
  
  // Use a blocking approach with a channel to handle the callback
  let (tx, rx) = std::sync::mpsc::channel();
  
  // Use the dialog plugin to show a folder picker
  app_handle
    .dialog()
    .file()
    .set_title("Choose Storage Directory for Gait Data")
    .set_directory(&dirs::document_dir().unwrap_or_else(|| std::env::current_dir().unwrap()))
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
async fn save_session_metadata(base_path: &str, metadata: &SessionMetadata) -> Result<(), String> {
  let metadata_path = Path::new(base_path).join("sessions_index.json");
  
  // Load existing sessions
  let mut sessions = if metadata_path.exists() {
    let content = std::fs::read_to_string(&metadata_path)
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
  let metadata_path = base_path.join("sessions_index.json");
  let content = serde_json::to_string_pretty(sessions)
    .map_err(|e| format!("Failed to serialize sessions: {}", e))?;
  
  std::fs::write(&metadata_path, content)
    .map_err(|e| format!("Failed to write sessions index: {}", e))?;
  
  Ok(())
}

async fn load_sessions_from_path(base_path: &Path) -> Result<Vec<SessionMetadata>, String> {
  let metadata_path = base_path.join("sessions_index.json");
  
  if !metadata_path.exists() {
    return Ok(vec![]);
  }
  
  let content = std::fs::read_to_string(&metadata_path)
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
  
  Ok(GaitData {
    device_id: device_id.to_string(),
    r1,
    r2,
    r3,
    x,
    y,
    z,
    timestamp: std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .unwrap()
      .as_millis() as u64,
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
async fn copy_file_to_downloads(file_path: String, file_name: String) -> Result<String, String> {
  use std::fs;
  use std::path::Path;
  
  // Get the Downloads directory
  let downloads_dir = dirs::download_dir()
    .ok_or("Could not find Downloads directory")?;
  
  let source_path = Path::new(&file_path);
  if !source_path.exists() {
    return Err("Source file does not exist".to_string());
  }
  
  let dest_path = downloads_dir.join(&file_name);
  
  // Copy the file
  fs::copy(source_path, &dest_path)
    .map_err(|e| format!("Failed to copy file: {}", e))?;
  
  Ok(dest_path.to_string_lossy().to_string())
}

fn main() {
  let connected_devices = ConnectedDevicesState(Arc::new(Mutex::new(HashMap::new())));
  let discovered_devices = DiscoveredDevicesState(Arc::new(Mutex::new(HashMap::new())));
  let bt_manager = BluetoothManagerState(Arc::new(Mutex::new(None)));
  let active_notifications = ActiveNotificationsState(Arc::new(Mutex::new(HashMap::new())));
  
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .manage(connected_devices)
    .manage(discovered_devices)
    .manage(bt_manager)
    .manage(active_notifications)
    .invoke_handler(tauri::generate_handler![scan_devices, connect_device, disconnect_device, get_connected_devices, is_device_connected, start_gait_notifications, stop_gait_notifications, get_active_notifications, is_device_collecting, debug_device_services, check_connection_status, save_session_data, get_sessions, delete_session, choose_storage_directory, copy_file_to_downloads])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
