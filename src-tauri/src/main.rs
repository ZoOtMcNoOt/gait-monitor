#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use async_std::sync::Mutex;
use btleplug::platform::{Peripheral, Manager};
use uuid::Uuid;
use futures::stream::StreamExt;
use tauri::Emitter;

// Global state for devices and connections - using different wrapper structs to avoid type conflicts
#[derive(Clone)]
pub struct ConnectedDevicesState(Arc<Mutex<HashMap<String, Peripheral>>>);

#[derive(Clone)]
pub struct DiscoveredDevicesState(Arc<Mutex<HashMap<String, Peripheral>>>);

#[derive(Clone)]
pub struct BluetoothManagerState(Arc<Mutex<Option<Manager>>>);

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
#[derive(Clone, Serialize)]
struct GaitData {
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
  
  // Define the UUIDs from your Arduino code
  let service_uuid = Uuid::parse_str("48877734-d012-40c4-81de-3ab006f71189")
    .map_err(|e| format!("Invalid service UUID: {}", e))?;
  let characteristic_uuid = Uuid::parse_str("8c4711b4-571b-41ba-a240-73e6884a85eb")
    .map_err(|e| format!("Invalid characteristic UUID: {}", e))?;
  
  // Discover services
  peripheral.discover_services().await
    .map_err(|e| format!("Failed to discover services: {}", e))?;
  
  // Find the gait service
  let services = peripheral.services();
  let gait_service = services.iter()
    .find(|s| s.uuid == service_uuid)
    .ok_or_else(|| format!("Gait service not found on device: {}", device_id))?;
  
  // Find the gait characteristic
  let gait_characteristic = gait_service.characteristics.iter()
    .find(|c| c.uuid == characteristic_uuid)
    .ok_or_else(|| format!("Gait characteristic not found on device: {}", device_id))?;
  
  // Subscribe to notifications
  peripheral.subscribe(gait_characteristic).await
    .map_err(|e| format!("Failed to subscribe to notifications: {}", e))?;
  
  // Set up notification handler
  let app_handle_clone = app_handle.clone();
  
  // Start listening for notifications in a background task
  tauri::async_runtime::spawn(async move {
    let mut notification_stream = peripheral.notifications().await.unwrap();
    
    while let Some(data) = notification_stream.next().await {
      if data.uuid == characteristic_uuid && data.value.len() == 24 {
        // Parse the 24-byte packet (6 floats)
        if let Ok(gait_data) = parse_gait_data(&data.value) {
          // Emit to frontend
          let _ = app_handle_clone.emit("gait-data", &gait_data);
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
) -> Result<String, String> {
  use btleplug::api::Peripheral;
  
  println!("Stopping gait notifications for device: {}", device_id);
  
  let peripheral = {
    let connected = connected_devices.0.lock().await;
    match connected.get(&device_id) {
      Some(peripheral) => peripheral.clone(),
      None => return Err(format!("Device not connected: {}", device_id)),
    }
  };
  
  // Define UUIDs
  let service_uuid = Uuid::parse_str("48877734-d012-40c4-81de-3ab006f71189")
    .map_err(|e| format!("Invalid service UUID: {}", e))?;
  let characteristic_uuid = Uuid::parse_str("8c4711b4-571b-41ba-a240-73e6884a85eb")
    .map_err(|e| format!("Invalid characteristic UUID: {}", e))?;
  
  // Find the characteristic
  let services = peripheral.services();
  let gait_service = services.iter()
    .find(|s| s.uuid == service_uuid)
    .ok_or_else(|| format!("Gait service not found"))?;
  let gait_characteristic = gait_service.characteristics.iter()
    .find(|c| c.uuid == characteristic_uuid)
    .ok_or_else(|| format!("Gait characteristic not found"))?;
  
  // Unsubscribe from notifications
  peripheral.unsubscribe(gait_characteristic).await
    .map_err(|e| format!("Failed to unsubscribe: {}", e))?;
  
  Ok(format!("Stopped notifications for device: {}", device_id))
}

fn parse_gait_data(data: &[u8]) -> Result<GaitData, String> {
  if data.len() != 24 {
    return Err(format!("Invalid data length: {} (expected 24)", data.len()));
  }
  
  // Parse 6 floats in little-endian format (matching Arduino)
  let r1 = f32::from_le_bytes([data[0], data[1], data[2], data[3]]);
  let r2 = f32::from_le_bytes([data[4], data[5], data[6], data[7]]);
  let r3 = f32::from_le_bytes([data[8], data[9], data[10], data[11]]);
  let x = f32::from_le_bytes([data[12], data[13], data[14], data[15]]);
  let y = f32::from_le_bytes([data[16], data[17], data[18], data[19]]);
  let z = f32::from_le_bytes([data[20], data[21], data[22], data[23]]);
  
  Ok(GaitData {
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

fn main() {
  let connected_devices = ConnectedDevicesState(Arc::new(Mutex::new(HashMap::new())));
  let discovered_devices = DiscoveredDevicesState(Arc::new(Mutex::new(HashMap::new())));
  let bt_manager = BluetoothManagerState(Arc::new(Mutex::new(None)));
  
  tauri::Builder::default()
    .manage(connected_devices)
    .manage(discovered_devices)
    .manage(bt_manager)
    .invoke_handler(tauri::generate_handler![scan_devices, connect_device, disconnect_device, get_connected_devices, is_device_connected, start_gait_notifications, stop_gait_notifications])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
