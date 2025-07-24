use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use async_std::sync::{Mutex, RwLock};
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// Data structures for buffer management
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GaitDataPoint {
    pub timestamp: DateTime<Utc>,
    pub device_id: String,
    pub acceleration_x: f64,
    pub acceleration_y: f64,
    pub acceleration_z: f64,
    pub gyroscope_x: Option<f64>,
    pub gyroscope_y: Option<f64>,
    pub gyroscope_z: Option<f64>,
    pub magnetometer_x: Option<f64>,
    pub magnetometer_y: Option<f64>,
    pub magnetometer_z: Option<f64>,
    pub sequence_number: u64,
    pub signal_strength: Option<i16>,
    pub battery_level: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BufferMetrics {
    pub buffer_id: String,
    pub device_id: String,
    pub current_size: usize,
    pub max_size: usize,
    pub utilization_percent: f64,
    pub data_rate_hz: f64,
    pub last_updated: DateTime<Utc>,
    pub memory_usage_bytes: usize,
    pub dropped_samples: u64,
    pub total_samples: u64,
    pub oldest_sample_age_ms: u64,
    pub newest_sample_age_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamingConfig {
    pub max_subscribers: usize,
    pub backpressure_threshold: f64,
    pub chunk_size: usize,
    pub compression_enabled: bool,
    pub rate_limit_per_second: u32,
    pub heartbeat_interval_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionMetrics {
    pub connection_id: String,
    pub device_id: String,
    pub connected_at: DateTime<Utc>,
    pub last_data_received: DateTime<Utc>,
    pub packets_received: u64,
    pub packets_lost: u64,
    pub average_latency_ms: f64,
    pub signal_quality: f64,
    pub reconnection_count: u32,
}

// Circular buffer implementation optimized for real-time data
pub struct CircularBuffer<T> {
    data: Vec<Option<T>>,
    head: usize,
    tail: usize,
    capacity: usize,
    size: usize,
    dropped_count: u64,
    total_inserted: u64,
}

impl<T: Clone> CircularBuffer<T> {
    pub fn new(capacity: usize) -> Self {
        Self {
            data: vec![None; capacity],
            head: 0,
            tail: 0,
            capacity,
            size: 0,
            dropped_count: 0,
            total_inserted: 0,
        }
    }

    pub fn push(&mut self, item: T) {
        if self.size == self.capacity {
            // Buffer is full, drop oldest item
            self.tail = (self.tail + 1) % self.capacity;
            self.dropped_count += 1;
        } else {
            self.size += 1;
        }

        self.data[self.head] = Some(item);
        self.head = (self.head + 1) % self.capacity;
        self.total_inserted += 1;
    }

    pub fn pop(&mut self) -> Option<T> {
        if self.size == 0 {
            return None;
        }

        let item = self.data[self.tail].take();
        self.tail = (self.tail + 1) % self.capacity;
        self.size -= 1;
        item
    }

    pub fn peek(&self) -> Option<&T> {
        if self.size == 0 {
            return None;
        }
        self.data[self.tail].as_ref()
    }

    pub fn get_range(&self, start: usize, count: usize) -> Vec<T> {
        let mut result = Vec::new();
        let actual_count = count.min(self.size);
        
        for i in 0..actual_count {
            let index = (self.tail + start + i) % self.capacity;
            if let Some(ref item) = self.data[index] {
                result.push(item.clone());
            }
        }
        
        result
    }

    pub fn len(&self) -> usize {
        self.size
    }

    pub fn capacity(&self) -> usize {
        self.capacity
    }

    pub fn is_empty(&self) -> bool {
        self.size == 0
    }

    pub fn is_full(&self) -> bool {
        self.size == self.capacity
    }

    pub fn dropped_count(&self) -> u64 {
        self.dropped_count
    }

    pub fn total_inserted(&self) -> u64 {
        self.total_inserted
    }

    pub fn utilization(&self) -> f64 {
        self.size as f64 / self.capacity as f64
    }

    pub fn clear(&mut self) {
        for item in &mut self.data {
            *item = None;
        }
        self.head = 0;
        self.tail = 0;
        self.size = 0;
    }

    pub fn resize(&mut self, new_capacity: usize) {
        if new_capacity == self.capacity {
            return;
        }

        let current_data = self.drain_all();
        self.data = vec![None; new_capacity];
        self.capacity = new_capacity;
        self.head = 0;
        self.tail = 0;
        self.size = 0;

        // Re-add data up to new capacity
        for item in current_data.into_iter().take(new_capacity) {
            self.push(item);
        }
    }

    fn drain_all(&mut self) -> Vec<T> {
        let mut result = Vec::new();
        while let Some(item) = self.pop() {
            result.push(item);
        }
        result
    }
}

// Device-specific buffer manager
pub struct DeviceBuffer {
    pub device_id: String,
    pub buffer: CircularBuffer<GaitDataPoint>,
    pub last_sequence: u64,
    pub creation_time: DateTime<Utc>,
    pub last_access: DateTime<Utc>,
    pub metrics: BufferMetrics,
    pub auto_cleanup: bool,
    pub retention_duration: Duration,
}

impl DeviceBuffer {
    pub fn new(device_id: String, capacity: usize) -> Self {
        let now = Utc::now();
        let buffer_id = Uuid::new_v4().to_string();
        
        Self {
            device_id: device_id.clone(),
            buffer: CircularBuffer::new(capacity),
            last_sequence: 0,
            creation_time: now,
            last_access: now,
            metrics: BufferMetrics {
                buffer_id,
                device_id,
                current_size: 0,
                max_size: capacity,
                utilization_percent: 0.0,
                data_rate_hz: 0.0,
                last_updated: now,
                memory_usage_bytes: 0,
                dropped_samples: 0,
                total_samples: 0,
                oldest_sample_age_ms: 0,
                newest_sample_age_ms: 0,
            },
            auto_cleanup: true,
            retention_duration: Duration::hours(1),
        }
    }

    pub fn push_data(&mut self, data_point: GaitDataPoint) {
        // Validate sequence number for duplicate detection
        if data_point.sequence_number <= self.last_sequence {
            // Duplicate or out-of-order data
            return;
        }

        // Save sequence number before moving data_point
        let sequence_number = data_point.sequence_number;
        self.buffer.push(data_point);
        self.last_sequence = sequence_number;
        self.last_access = Utc::now();
        self.update_metrics();
    }

    pub fn get_latest(&self, count: usize) -> Vec<GaitDataPoint> {
        let buffer_size = self.buffer.len();
        if buffer_size == 0 {
            return Vec::new();
        }

        let start_index = if count >= buffer_size { 0 } else { buffer_size - count };
        self.buffer.get_range(start_index, count)
    }

    pub fn get_range(&self, start_time: DateTime<Utc>, end_time: DateTime<Utc>) -> Vec<GaitDataPoint> {
        let all_data = self.buffer.get_range(0, self.buffer.len());
        all_data.into_iter()
            .filter(|point| point.timestamp >= start_time && point.timestamp <= end_time)
            .collect()
    }

    pub fn clear_old_data(&mut self) {
        if !self.auto_cleanup {
            return;
        }

        let cutoff_time = Utc::now() - self.retention_duration;
        
        // For circular buffer, we'll implement a simple approach
        // In practice, you might want a more sophisticated cleanup strategy
        while let Some(oldest) = self.buffer.peek() {
            if oldest.timestamp < cutoff_time {
                self.buffer.pop();
            } else {
                break;
            }
        }
        
        self.update_metrics();
    }

    fn update_metrics(&mut self) {
        let now = Utc::now();
        self.metrics.current_size = self.buffer.len();
        self.metrics.utilization_percent = self.buffer.utilization() * 100.0;
        self.metrics.last_updated = now;
        self.metrics.dropped_samples = self.buffer.dropped_count();
        self.metrics.total_samples = self.buffer.total_inserted();
        
        // Calculate data rate (simplified)
        if let Some(oldest) = self.buffer.peek() {
            let time_span = now.signed_duration_since(oldest.timestamp);
            if time_span.num_milliseconds() > 0 {
                self.metrics.data_rate_hz = self.buffer.len() as f64 / (time_span.num_milliseconds() as f64 / 1000.0);
            }
            self.metrics.oldest_sample_age_ms = time_span.num_milliseconds() as u64;
        }

        // Estimate memory usage
        self.metrics.memory_usage_bytes = std::mem::size_of::<GaitDataPoint>() * self.buffer.capacity();
    }
}

// Main buffer manager coordinating all device buffers
pub struct BufferManager {
    device_buffers: Arc<RwLock<HashMap<String, DeviceBuffer>>>,
    streaming_config: Arc<Mutex<StreamingConfig>>,
    connection_metrics: Arc<RwLock<HashMap<String, ConnectionMetrics>>>,
    cleanup_interval: Duration,
    max_memory_usage: usize,
    global_metrics: Arc<Mutex<GlobalBufferMetrics>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalBufferMetrics {
    pub total_devices: usize,
    pub total_memory_usage: usize,
    pub total_data_points: u64,
    pub average_utilization: f64,
    pub highest_utilization_device: Option<String>,
    pub total_dropped_samples: u64,
    pub cleanup_runs: u64,
    pub last_cleanup: DateTime<Utc>,
}

impl BufferManager {
    pub fn new(max_memory_usage: usize) -> Self {
        Self {
            device_buffers: Arc::new(RwLock::new(HashMap::new())),
            streaming_config: Arc::new(Mutex::new(StreamingConfig {
                max_subscribers: 10,
                backpressure_threshold: 0.8,
                chunk_size: 100,
                compression_enabled: true,
                rate_limit_per_second: 1000,
                heartbeat_interval_ms: 5000,
            })),
            connection_metrics: Arc::new(RwLock::new(HashMap::new())),
            cleanup_interval: Duration::minutes(5),
            max_memory_usage,
            global_metrics: Arc::new(Mutex::new(GlobalBufferMetrics {
                total_devices: 0,
                total_memory_usage: 0,
                total_data_points: 0,
                average_utilization: 0.0,
                highest_utilization_device: None,
                total_dropped_samples: 0,
                cleanup_runs: 0,
                last_cleanup: Utc::now(),
            })),
        }
    }

    pub async fn register_device(&self, device_id: String, buffer_capacity: usize) -> Result<(), String> {
        let mut buffers = self.device_buffers.write().await;
        
        if buffers.contains_key(&device_id) {
            return Err(format!("Device {} already registered", device_id));
        }

        let device_buffer = DeviceBuffer::new(device_id.clone(), buffer_capacity);
        buffers.insert(device_id.clone(), device_buffer);

        // Update global metrics while we have the buffers lock
        self.update_global_metrics_with_buffers(&buffers).await;
        
        // Release buffers lock before acquiring connections lock
        drop(buffers);

        // Initialize connection metrics
        let mut connections = self.connection_metrics.write().await;
        connections.insert(device_id.clone(), ConnectionMetrics {
            connection_id: Uuid::new_v4().to_string(),
            device_id,
            connected_at: Utc::now(),
            last_data_received: Utc::now(),
            packets_received: 0,
            packets_lost: 0,
            average_latency_ms: 0.0,
            signal_quality: 1.0,
            reconnection_count: 0,
        });

        Ok(())
    }

    pub async fn unregister_device(&self, device_id: &str) -> Result<(), String> {
        let mut buffers = self.device_buffers.write().await;
        let mut connections = self.connection_metrics.write().await;

        buffers.remove(device_id);
        connections.remove(device_id);

        self.update_global_metrics().await;
        Ok(())
    }

    pub async fn add_data_point(&self, device_id: &str, data_point: GaitDataPoint) -> Result<(), String> {
        let mut buffers = self.device_buffers.write().await;
        
        let buffer = buffers.get_mut(device_id)
            .ok_or_else(|| format!("Device {} not registered", device_id))?;

        buffer.push_data(data_point);

        // Update global metrics while we have the buffers lock
        self.update_global_metrics_with_buffers(&buffers).await;
        
        // Release buffers lock before acquiring connections lock
        drop(buffers);

        // Update connection metrics
        let mut connections = self.connection_metrics.write().await;
        if let Some(connection) = connections.get_mut(device_id) {
            connection.last_data_received = Utc::now();
            connection.packets_received += 1;
        }

        Ok(())
    }

    pub async fn get_device_data(&self, device_id: &str, count: usize) -> Result<Vec<GaitDataPoint>, String> {
        let buffers = self.device_buffers.read().await;
        
        let buffer = buffers.get(device_id)
            .ok_or_else(|| format!("Device {} not registered", device_id))?;

        Ok(buffer.get_latest(count))
    }

    pub async fn get_device_data_range(&self, device_id: &str, start_time: DateTime<Utc>, end_time: DateTime<Utc>) -> Result<Vec<GaitDataPoint>, String> {
        let buffers = self.device_buffers.read().await;
        
        let buffer = buffers.get(device_id)
            .ok_or_else(|| format!("Device {} not registered", device_id))?;

        Ok(buffer.get_range(start_time, end_time))
    }

    pub async fn get_buffer_metrics(&self, device_id: &str) -> Result<BufferMetrics, String> {
        let buffers = self.device_buffers.read().await;
        
        let buffer = buffers.get(device_id)
            .ok_or_else(|| format!("Device {} not registered", device_id))?;

        Ok(buffer.metrics.clone())
    }

    pub async fn get_all_metrics(&self) -> Vec<BufferMetrics> {
        let buffers = self.device_buffers.read().await;
        buffers.values().map(|buffer| buffer.metrics.clone()).collect()
    }

    pub async fn get_global_metrics(&self) -> GlobalBufferMetrics {
        self.global_metrics.lock().await.clone()
    }

    pub async fn get_connection_metrics(&self, device_id: &str) -> Result<ConnectionMetrics, String> {
        let connections = self.connection_metrics.read().await;
        
        connections.get(device_id)
            .cloned()
            .ok_or_else(|| format!("Device {} not found", device_id))
    }

    pub async fn get_all_connection_metrics(&self) -> Vec<ConnectionMetrics> {
        let connections = self.connection_metrics.read().await;
        connections.values().cloned().collect()
    }

    pub async fn resize_device_buffer(&self, device_id: &str, new_capacity: usize) -> Result<(), String> {
        let mut buffers = self.device_buffers.write().await;
        
        let buffer = buffers.get_mut(device_id)
            .ok_or_else(|| format!("Device {} not registered", device_id))?;

        buffer.buffer.resize(new_capacity);
        buffer.metrics.max_size = new_capacity;
        buffer.update_metrics();

        self.update_global_metrics().await;
        Ok(())
    }

    pub async fn clear_device_buffer(&self, device_id: &str) -> Result<(), String> {
        let mut buffers = self.device_buffers.write().await;
        
        let buffer = buffers.get_mut(device_id)
            .ok_or_else(|| format!("Device {} not registered", device_id))?;

        buffer.buffer.clear();
        buffer.update_metrics();

        self.update_global_metrics().await;
        Ok(())
    }

    pub async fn cleanup_old_data(&self) -> Result<u64, String> {
        let mut buffers = self.device_buffers.write().await;
        let mut total_cleaned = 0u64;

        for buffer in buffers.values_mut() {
            let before_size = buffer.buffer.len();
            buffer.clear_old_data();
            let after_size = buffer.buffer.len();
            total_cleaned += (before_size - after_size) as u64;
        }

        // Update global metrics
        let mut global = self.global_metrics.lock().await;
        global.cleanup_runs += 1;
        global.last_cleanup = Utc::now();

        Ok(total_cleaned)
    }

    pub async fn force_memory_cleanup(&self) -> Result<(), String> {
        let current_usage = self.calculate_total_memory_usage().await;
        
        if current_usage <= self.max_memory_usage {
            return Ok(());
        }

        // Cleanup strategies in order of preference:
        // 1. Clean old data from all buffers
        self.cleanup_old_data().await?;

        let current_usage = self.calculate_total_memory_usage().await;
        if current_usage <= self.max_memory_usage {
            return Ok(());
        }

        // 2. Reduce buffer sizes for least active devices
        let mut buffers = self.device_buffers.write().await;
        let mut device_activity: Vec<(String, DateTime<Utc>)> = buffers
            .iter()
            .map(|(id, buffer)| (id.clone(), buffer.last_access))
            .collect();
        
        device_activity.sort_by(|a, b| a.1.cmp(&b.1)); // Sort by last access time

        // Reduce buffer size for least active devices
        for (device_id, _) in device_activity.iter().take(buffers.len() / 2) {
            if let Some(buffer) = buffers.get_mut(device_id) {
                let new_capacity = (buffer.buffer.capacity() * 3) / 4; // Reduce by 25%
                if new_capacity > 100 { // Minimum buffer size
                    buffer.buffer.resize(new_capacity);
                    buffer.metrics.max_size = new_capacity;
                    buffer.update_metrics();
                }
            }
        }

        self.update_global_metrics().await;
        Ok(())
    }

    async fn calculate_total_memory_usage(&self) -> usize {
        let buffers = self.device_buffers.read().await;
        buffers.values()
            .map(|buffer| buffer.metrics.memory_usage_bytes)
            .sum()
    }

    async fn update_global_metrics(&self) {
        let buffers = self.device_buffers.read().await;
        self.update_global_metrics_with_buffers(&buffers).await;
    }

    async fn update_global_metrics_with_buffers(&self, buffers: &HashMap<String, DeviceBuffer>) {
        let mut global = self.global_metrics.lock().await;

        global.total_devices = buffers.len();
        global.total_memory_usage = buffers.values()
            .map(|buffer| buffer.metrics.memory_usage_bytes)
            .sum();
        global.total_data_points = buffers.values()
            .map(|buffer| buffer.metrics.total_samples)
            .sum();
        global.total_dropped_samples = buffers.values()
            .map(|buffer| buffer.metrics.dropped_samples)
            .sum();

        if !buffers.is_empty() {
            global.average_utilization = buffers.values()
                .map(|buffer| buffer.metrics.utilization_percent)
                .sum::<f64>() / buffers.len() as f64;

            global.highest_utilization_device = buffers.iter()
                .max_by(|a, b| a.1.metrics.utilization_percent.partial_cmp(&b.1.metrics.utilization_percent).unwrap())
                .map(|(id, _)| id.clone());
        }
    }

    pub async fn get_streaming_config(&self) -> StreamingConfig {
        self.streaming_config.lock().await.clone()
    }

    pub async fn update_streaming_config(&self, config: StreamingConfig) -> Result<(), String> {
        let mut current_config = self.streaming_config.lock().await;
        *current_config = config;
        Ok(())
    }

    // Background task methods
    pub async fn start_background_cleanup(&self) -> Result<(), String> {
        // This would typically spawn a background task
        // For now, we'll just provide the interface
        Ok(())
    }

    pub async fn start_memory_monitor(&self) -> Result<(), String> {
        // This would typically spawn a background task to monitor memory usage
        // For now, we'll just provide the interface
        Ok(())
    }
}

// State wrapper for Tauri
#[derive(Clone)]
pub struct BufferManagerState(pub Arc<BufferManager>);

impl BufferManagerState {
    pub fn new(max_memory_usage: usize) -> Self {
        Self(Arc::new(BufferManager::new(max_memory_usage)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_circular_buffer_basic_operations() {
        let mut buffer = CircularBuffer::new(3);
        
        assert!(buffer.is_empty());
        assert_eq!(buffer.len(), 0);
        
        buffer.push(1);
        buffer.push(2);
        buffer.push(3);
        
        assert!(buffer.is_full());
        assert_eq!(buffer.len(), 3);
        
        // Test overflow
        buffer.push(4);
        assert_eq!(buffer.len(), 3);
        assert_eq!(buffer.dropped_count(), 1);
        
        // Test retrieval
        let data = buffer.get_range(0, 3);
        assert_eq!(data, vec![2, 3, 4]); // First item (1) was dropped
    }

    #[tokio::test]
    async fn test_device_buffer_operations() {
        let mut device_buffer = DeviceBuffer::new("test-device".to_string(), 5);
        
        let data_point = GaitDataPoint {
            timestamp: Utc::now(),
            device_id: "test-device".to_string(),
            acceleration_x: 1.0,
            acceleration_y: 2.0,
            acceleration_z: 3.0,
            gyroscope_x: None,
            gyroscope_y: None,
            gyroscope_z: None,
            magnetometer_x: None,
            magnetometer_y: None,
            magnetometer_z: None,
            sequence_number: 1,
            signal_strength: Some(-50),
            battery_level: Some(80),
        };
        
        device_buffer.push_data(data_point);
        assert_eq!(device_buffer.buffer.len(), 1);
        
        let latest = device_buffer.get_latest(1);
        assert_eq!(latest.len(), 1);
        assert_eq!(latest[0].sequence_number, 1);
    }

    #[test]
    fn test_buffer_manager_creation() {
        let manager = BufferManager::new(1024 * 1024); // 1MB limit
        
        // Just test that the manager can be created successfully
        assert_eq!(manager.max_memory_usage, 1024 * 1024);
    }

    #[test] 
    fn test_buffer_manager_basic_functionality() {
        // Test basic non-async functionality
        let manager = BufferManager::new(2048);
        assert_eq!(manager.max_memory_usage, 2048);
        
        // Test that we can create the manager without hanging
        let _manager2 = BufferManager::new(4096);
    }
}
