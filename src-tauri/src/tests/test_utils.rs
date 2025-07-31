// Test utilities and common fixtures for backend testing

use std::collections::HashMap;
use serde_json::json;
use crate::data_processing::GaitData;
use crate::validation::ValidatedSessionMetadata;

// Test data generators
pub struct TestDataGenerator;

impl TestDataGenerator {
    pub fn sample_gait_data(device_id: &str, count: usize) -> Vec<GaitData> {
        // Convert device_id to valid format if needed
        let valid_device_id = if device_id.chars().all(|c| c.is_ascii_hexdigit() || c == '-' || c == ':') {
            device_id.to_string()
        } else {
            // Generate a valid device ID based on the input
            format!("12345678-1234-1234-1234-{:012x}", device_id.len())
        };
        
        (0..count).map(|i| {
            // Keep values within validation limits (resistance only)
            // Force values: MAX_FORCE = 1000.0
            let cycle = (i % 1000) as f32; // Cycle through values to avoid exceeding limits
            GaitData {
                device_id: valid_device_id.clone(),
                timestamp: chrono::Utc::now().timestamp_millis() as u64 + i as u64 * 100,
                r1: (cycle * 0.1) % 999.0, // Keep under 1000
                r2: (cycle * 0.2) % 999.0,
                r3: (cycle * 0.3) % 999.0,
            }
        }).collect()
    }

    pub fn sample_session_metadata() -> ValidatedSessionMetadata {
        ValidatedSessionMetadata {
            session_name: "Test Session".to_string(),
            subject_id: "TEST001".to_string(),
            notes: "Generated test data".to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            devices: vec!["12345678-1234-1234-1234-123456789abc".to_string(), "AA:BB:CC:DD:EE:FF".to_string()],
        }
    }

    pub fn sample_config_json() -> serde_json::Value {
        json!({
            "bluetooth": {
                "scan_timeout": 10000,
                "connection_timeout": 5000,
                "auto_reconnect": true
            },
            "data_collection": {
                "buffer_size": 1000,
                "sample_rate": 100.0,
                "auto_save": true
            },
            "export": {
                "default_format": "CSV",
                "include_headers": true,
                "precision": 3
            }
        })
    }
}

// Test assertions and helpers
pub struct TestAssertions;

impl TestAssertions {
    pub fn assert_gait_data_valid(data: &GaitData) {
        assert!(!data.device_id.is_empty(), "Device ID should not be empty");
        assert!(data.timestamp > 0, "Timestamp should be positive");
        assert!(data.r1.is_finite() && data.r2.is_finite() && data.r3.is_finite(), "Resistance values should be finite");
    }

    pub fn assert_config_valid(config: &serde_json::Value) {
        assert!(config.is_object(), "Config should be a JSON object");
        assert!(config.get("bluetooth").is_some(), "Config should have bluetooth section");
        assert!(config.get("data_collection").is_some(), "Config should have data_collection section");
    }

    pub fn assert_statistics_consistent(stats: &crate::analytics::SessionStatistics, data: &[GaitData]) {
        assert_eq!(stats.total_samples as usize, data.len(), "Sample count should match");
        if !data.is_empty() {
            assert!(stats.session_duration_ms > 0, "Duration should be positive for non-empty data");
        }
    }
}

// Performance measurement utilities
pub struct PerformanceMeasurement {
    pub start_time: std::time::Instant,
    pub operation_name: String,
}

impl PerformanceMeasurement {
    pub fn start(operation_name: &str) -> Self {
        Self {
            start_time: std::time::Instant::now(),
            operation_name: operation_name.to_string(),
        }
    }

    pub fn finish(self) -> std::time::Duration {
        let duration = self.start_time.elapsed();
        println!("Performance: {} took {:?}", self.operation_name, duration);
        duration
    }

    pub fn assert_within_limit(self, limit_ms: u64) {
        let operation_name = self.operation_name.clone(); // Clone before moving self
        let duration = self.finish();
        assert!(duration.as_millis() <= limit_ms as u128, 
                "Operation {} took {:?}, expected < {}ms", 
                operation_name, duration, limit_ms);
    }
}

// Mock data structures for testing
pub struct MockBluetoothDevice {
    pub id: String,
    pub name: String,
    pub connected: bool,
    pub data_stream: Vec<GaitData>,
}

impl MockBluetoothDevice {
    pub fn new(id: &str, name: &str) -> Self {
        Self {
            id: id.to_string(),
            name: name.to_string(),
            connected: false,
            data_stream: TestDataGenerator::sample_gait_data(id, 100),
        }
    }

    pub fn connect(&mut self) {
        self.connected = true;
    }

    pub fn disconnect(&mut self) {
        self.connected = false;
    }

    pub fn get_next_data(&mut self) -> Option<GaitData> {
        self.data_stream.pop()
    }
}

// Error injection utilities for testing error handling
pub struct ErrorInjector {
    pub should_fail: bool,
    pub failure_rate: f64, // 0.0 to 1.0
    pub error_message: String,
}

impl ErrorInjector {
    pub fn new(failure_rate: f64, error_message: &str) -> Self {
        Self {
            should_fail: false,
            failure_rate,
            error_message: error_message.to_string(),
        }
    }

    pub fn maybe_fail(&self) -> Result<(), String> {
        if self.should_fail || rand::random::<f64>() < self.failure_rate {
            Err(self.error_message.clone())
        } else {
            Ok(())
        }
    }

    pub fn force_fail(&mut self) {
        self.should_fail = true;
    }

    pub fn reset(&mut self) {
        self.should_fail = false;
    }
}

// Memory usage tracking for leak detection
pub struct MemoryTracker {
    initial_usage: usize,
    peak_usage: usize,
    operation_name: String,
}

impl MemoryTracker {
    pub fn start(operation_name: &str) -> Self {
        let initial_usage = Self::get_memory_usage();
        Self {
            initial_usage,
            peak_usage: initial_usage,
            operation_name: operation_name.to_string(),
        }
    }

    pub fn checkpoint(&mut self) {
        let current_usage = Self::get_memory_usage();
        if current_usage > self.peak_usage {
            self.peak_usage = current_usage;
        }
    }

    pub fn finish(self) -> MemoryReport {
        let final_usage = Self::get_memory_usage();
        MemoryReport {
            operation_name: self.operation_name,
            initial_usage: self.initial_usage,
            peak_usage: self.peak_usage,
            final_usage,
            leaked_bytes: final_usage.saturating_sub(self.initial_usage),
        }
    }

    fn get_memory_usage() -> usize {
        // In a real implementation, this would use system APIs to get actual memory usage
        // For testing purposes, we'll simulate memory usage
        std::mem::size_of::<usize>() * 1000 // Placeholder
    }
}

pub struct MemoryReport {
    pub operation_name: String,
    pub initial_usage: usize,
    pub peak_usage: usize,
    pub final_usage: usize,
    pub leaked_bytes: usize,
}

impl MemoryReport {
    pub fn assert_no_leaks(&self, tolerance_bytes: usize) {
        assert!(self.leaked_bytes <= tolerance_bytes,
                "Memory leak detected in {}: leaked {} bytes (tolerance: {})",
                self.operation_name, self.leaked_bytes, tolerance_bytes);
    }

    pub fn print_report(&self) {
        println!("Memory Report for {}:", self.operation_name);
        println!("  Initial: {} bytes", self.initial_usage);
        println!("  Peak: {} bytes", self.peak_usage);
        println!("  Final: {} bytes", self.final_usage);
        println!("  Leaked: {} bytes", self.leaked_bytes);
    }
}

// Test environment setup for integration tests
pub struct TestEnvironment;

impl TestEnvironment {
    pub async fn new() -> Self {
        Self
    }
    
    pub fn cleanup(&self) {
        // Cleanup test environment if needed
    }
}
