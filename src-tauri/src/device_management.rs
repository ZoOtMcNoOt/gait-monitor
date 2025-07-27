use std::collections::HashMap;
use std::sync::Arc;
use async_std::sync::Mutex;
use uuid::Uuid;
use serde::Serialize;
use futures::StreamExt;
use tauri::Emitter;

use btleplug::platform::{Peripheral, Manager};
use btleplug::api::{Central, Manager as _, Peripheral as _, ScanFilter};

use crate::security::RateLimitingState;
use crate::data_processing::{
    SampleRateState, parse_gait_data, GaitDataWithRate
};

// State management structures for device connectivity
#[derive(Clone)]
pub struct ConnectedDevicesState(pub Arc<Mutex<HashMap<String, Peripheral>>>);

#[derive(Clone)]
pub struct DiscoveredDevicesState(pub Arc<Mutex<HashMap<String, Peripheral>>>);

#[derive(Clone)]
pub struct BluetoothManagerState(pub Arc<Mutex<Option<Manager>>>);

#[derive(Clone)]
pub struct ActiveNotificationsState(pub Arc<Mutex<HashMap<String, bool>>>);

impl ConnectedDevicesState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

impl DiscoveredDevicesState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

impl BluetoothManagerState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }
}

impl ActiveNotificationsState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

// Serializable device information for frontend communication
#[derive(Serialize)]
pub struct BluetoothDeviceInfo {
    pub id: String,
    pub name: String,
    pub rssi: Option<i16>,
    pub connectable: bool,
    pub address_type: String,
    pub services: Vec<String>,
    pub manufacturer_data: Vec<String>,
    pub service_data: Vec<String>,
}

// Device scanning functionality with rate limiting
pub async fn scan_devices(
    discovered_devices: &DiscoveredDevicesState,
    bt_manager: &BluetoothManagerState,
    _rate_limiting: &RateLimitingState,
) -> Result<Vec<BluetoothDeviceInfo>, String> {
    
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
        println!("Starting scan on adapter: {:?}", adapter.adapter_info().await);
        
        // Start scanning
        adapter.start_scan(ScanFilter::default()).await.map_err(|e| {
            println!("Failed to start scan: {}", e);
            e.to_string()
        })?;
        
        // Wait for devices to be discovered
        async_std::task::sleep(std::time::Duration::from_secs(3)).await;
        
        // Stop scanning
        adapter.stop_scan().await.map_err(|e| {
            println!("Failed to stop scan: {}", e);
            e.to_string()
        })?;
        
        let peripherals = adapter.peripherals().await.map_err(|e| {
            println!("Failed to get peripherals: {}", e);
            e.to_string()
        })?;
        
        println!("Found {} devices on this adapter", peripherals.len());
        
        for peripheral in peripherals {
            let id = peripheral.id().to_string();
            
            if let Ok(Some(properties)) = peripheral.properties().await {
                let device_info = BluetoothDeviceInfo {
                    id: id.clone(),
                    name: properties.local_name.unwrap_or_else(|| {
                        properties.address.to_string()
                    }),
                    rssi: properties.rssi,
                    connectable: true, // btleplug doesn't expose this field directly
                    address_type: format!("{:?}", properties.address_type),
                    services: properties.services.iter().map(|s| s.to_string()).collect(),
                    manufacturer_data: properties.manufacturer_data.keys()
                        .map(|k| format!("{}: {:?}", k, properties.manufacturer_data.get(k)))
                        .collect(),
                    service_data: properties.service_data.keys()
                        .map(|k| format!("{}: {:?}", k, properties.service_data.get(k)))
                        .collect(),
                };
                
                devices.push(device_info);
                
                // Store discovered device
                let mut discovered = discovered_devices.0.lock().await;
                discovered.insert(id, peripheral);
            }
        }
    }
    
    println!("Scan complete. Found {} total devices", devices.len());
    Ok(devices)
}

// Device connection functionality with retry logic
pub async fn connect_device(
    device_id: &str,
    connected_devices: &ConnectedDevicesState,
    discovered_devices: &DiscoveredDevicesState,
    _rate_limiting: &RateLimitingState,
) -> Result<String, String> {
    
    println!("Attempting to connect to device: {}", device_id);
    
    // Check if already connected
    {
        let connected = connected_devices.0.lock().await;
        if connected.contains_key(device_id) {
            return Ok(format!("Already connected to device: {}", device_id));
        }
    }
    
    // Get the peripheral from discovered devices
    let peripheral = {
        let discovered = discovered_devices.0.lock().await;
        match discovered.get(device_id) {
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
        connected.insert(device_id.to_string(), peripheral);
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
                    connected.insert(device_id.to_string(), peripheral);
                    
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

// Device disconnection functionality
pub async fn disconnect_device(
    device_id: &str,
    connected_devices: &ConnectedDevicesState,
) -> Result<String, String> {
    println!("Attempting to disconnect from device: {}", device_id);
    
    let mut connected = connected_devices.0.lock().await;
    
    if let Some(peripheral) = connected.remove(device_id) {
        match peripheral.disconnect().await {
            Ok(_) => {
                println!("Successfully disconnected from device: {}", device_id);
                Ok(format!("Disconnected from device: {}", device_id))
            }
            Err(e) => {
                println!("Failed to disconnect from device: {}", e);
                // Re-insert the device since disconnect failed
                connected.insert(device_id.to_string(), peripheral);
                Err(format!("Failed to disconnect: {}", e))
            }
        }
    } else {
        Err(format!("Device not connected: {}", device_id))
    }
}

// Get list of connected devices
pub async fn get_connected_devices(
    connected_devices: &ConnectedDevicesState,
) -> Result<Vec<String>, String> {
    let connected = connected_devices.0.lock().await;
    let device_ids: Vec<String> = connected.keys().cloned().collect();
    Ok(device_ids)
}

// Check if specific device is connected
pub async fn is_device_connected(
    device_id: &str,
    connected_devices: &ConnectedDevicesState,
) -> Result<bool, String> {
    let connected = connected_devices.0.lock().await;
    Ok(connected.contains_key(device_id))
}

// Start data collection notifications from a device
pub async fn start_gait_notifications(
    device_id: &str,
    connected_devices: &ConnectedDevicesState,
    active_notifications: &ActiveNotificationsState,
    sample_rate_state: &SampleRateState,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    println!("Starting gait notifications for device: {}", device_id);
    
    let peripheral = {
        let connected = connected_devices.0.lock().await;
        match connected.get(device_id) {
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
    
    // Subscribe to gait notifications
    println!("Subscribing to gait notifications for device: {}", device_id);
    peripheral.subscribe(gait_characteristic).await
        .map_err(|e| format!("Failed to subscribe to gait notifications: {}", e))?;
    
    println!("Successfully subscribed to gait notifications for device: {}", device_id);
    
    // Mark device as actively collecting
    {
        let mut active = active_notifications.0.lock().await;
        active.insert(device_id.to_string(), true);
    }

    // Set up notification handler
    let app_handle_clone = app_handle.clone();
    let device_id_clone = device_id.to_string();
    let active_notifications_clone = active_notifications.clone();
    let sample_rate_state_clone = sample_rate_state.clone();
    
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
                    let sample_rate = sample_rate_state_clone.record_sample(&device_id_clone).await;
                    
                    // Create enhanced data with sample rate using the conversion method
                    let gait_data_with_rate = GaitDataWithRate::from(gait_data).with_sample_rate(sample_rate);
                    
                    let emit_start = std::time::Instant::now();
                    // Emit enhanced data to frontend with device ID and sample rate
                    let _ = app_handle_clone.emit("gait-data", &gait_data_with_rate);
                    let emit_duration = emit_start.elapsed();
                    
                    // Log timing every 5th packet to avoid spam (thread-safe)
                    use std::sync::atomic::{AtomicU32, Ordering};
                    static PACKET_COUNT: AtomicU32 = AtomicU32::new(0);
                    
                    let count = PACKET_COUNT.fetch_add(1, Ordering::Relaxed);
                    if count % 5 == 0 {  // More frequent logging to catch duplicates
                        let rate_info = sample_rate.map(|r| format!("{:.1} Hz", r)).unwrap_or_else(|| "calculating...".to_string());
                        println!("🕐 BLE Packet [{}]: Hash: {}, Timestamp: {}, Rate: {}, Parse: {:?}, Emit: {:?}", 
                            count, data_hash, gait_data_with_rate.timestamp, rate_info, parse_duration, emit_duration);
                    }
                } else {
                    // Unknown characteristic or invalid data length - log and ignore
                    println!("Received data from unknown characteristic {} or invalid length: {} bytes", 
                        data.uuid, data.value.len());
                }
            }
        }
    });
    
    Ok(format!("Started notifications for device: {}", device_id))
}

// Stop data collection notifications from a device
pub async fn stop_gait_notifications(
    device_id: &str,
    connected_devices: &ConnectedDevicesState,
    active_notifications: &ActiveNotificationsState,
) -> Result<String, String> {
    println!("Stopping gait notifications for device: {}", device_id);
    
    // Mark device as inactive first (this will stop the notification loop)
    {
        let mut active = active_notifications.0.lock().await;
        active.insert(device_id.to_string(), false);
    }

    let peripheral = {
        let connected = connected_devices.0.lock().await;
        match connected.get(device_id) {
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

// Get current sample rate for a device
pub async fn get_sample_rate(
    device_id: &str,
    sample_rate_state: &SampleRateState,
) -> Result<Option<f64>, String> {
    Ok(sample_rate_state.get_current_rate(device_id).await)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[async_std::test]
    async fn test_device_state_creation() {
        let connected = ConnectedDevicesState::new();
        let discovered = DiscoveredDevicesState::new();
        let manager = BluetoothManagerState::new();
        let active = ActiveNotificationsState::new();
        
        // Verify states are properly initialized
        assert!(connected.0.lock().await.is_empty());
        assert!(discovered.0.lock().await.is_empty());
        assert!(manager.0.lock().await.is_none());
        assert!(active.0.lock().await.is_empty());
    }

    #[async_std::test]
    async fn test_connected_devices_management() {
        let connected = ConnectedDevicesState::new();
        
        // Test getting connected devices when empty
        let devices = get_connected_devices(&connected).await.unwrap();
        assert!(devices.is_empty());
        
        // Test device connection check when empty
        let is_connected = is_device_connected("test-device", &connected).await.unwrap();
        assert!(!is_connected);
    }

    #[async_std::test]
    async fn test_active_notifications_state() {
        let active = ActiveNotificationsState::new();
        
        // Test setting device as active
        {
            let mut active_map = active.0.lock().await;
            active_map.insert("device1".to_string(), true);
            active_map.insert("device2".to_string(), false);
        }
        
        // Verify state
        {
            let active_map = active.0.lock().await;
            assert_eq!(active_map.get("device1"), Some(&true));
            assert_eq!(active_map.get("device2"), Some(&false));
            assert_eq!(active_map.get("device3"), None);
        }
    }

    #[async_std::test]
    async fn test_bluetooth_device_info_serialization() {
        let device_info = BluetoothDeviceInfo {
            id: "test-id".to_string(),
            name: "Test Device".to_string(),
            rssi: Some(-50),
            connectable: true,
            address_type: "Public".to_string(),
            services: vec!["service1".to_string(), "service2".to_string()],
            manufacturer_data: vec!["manufacturer1".to_string()],
            service_data: vec!["service_data1".to_string()],
        };
        
        // Verify the structure can be serialized
        let serialized = serde_json::to_string(&device_info);
        assert!(serialized.is_ok());
        
        let json = serialized.unwrap();
        assert!(json.contains("test-id"));
        assert!(json.contains("Test Device"));
        assert!(json.contains("-50"));
    }

    #[async_std::test]
    async fn test_device_management_workflow() {
        let connected = ConnectedDevicesState::new();
        let discovered = DiscoveredDevicesState::new();
        let active = ActiveNotificationsState::new();
        
        // Simulate device workflow
        let device_id = "test-device-123";
        
        // Initially not connected
        assert!(!is_device_connected(device_id, &connected).await.unwrap());
        
        // Mark as active
        {
            let mut active_map = active.0.lock().await;
            active_map.insert(device_id.to_string(), true);
        }
        
        // Verify active state
        {
            let active_map = active.0.lock().await;
            assert_eq!(active_map.get(device_id), Some(&true));
        }
        
        // Mark as inactive
        {
            let mut active_map = active.0.lock().await;
            active_map.insert(device_id.to_string(), false);
        }
        
        // Verify inactive state
        {
            let active_map = active.0.lock().await;
            assert_eq!(active_map.get(device_id), Some(&false));
        }
    }
}
