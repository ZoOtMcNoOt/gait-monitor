use std::time::{Duration, Instant};
use std::sync::{Arc, Mutex};
use serde::{Deserialize, Serialize};
use tauri::State;

// Performance metrics structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceMetrics {
    pub processing_time_ms: f64,
    pub memory_usage_mb: f64,
    pub throughput_ops_per_sec: f64,
    pub cpu_usage_percent: f64,
    pub active_connections: u32,
    pub error_rate_percent: f64,
    pub last_updated: String,
}

// Health check status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthStatus {
    pub system_health: String, // "healthy", "warning", "critical"
    pub database_health: String,
    pub connection_health: String,
    pub memory_health: String,
    pub disk_health: String,
    pub overall_status: String,
    pub last_check: String,
    pub uptime_seconds: u64,
}

// System resource metrics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemMetrics {
    pub cpu_cores: u32,
    pub total_memory_mb: u64,
    pub available_memory_mb: u64,
    pub disk_space_gb: u64,
    pub disk_available_gb: u64,
    pub network_bytes_sent: u64,
    pub network_bytes_received: u64,
    pub process_count: u32,
    pub thread_count: u32,
}

// Performance measurement point
#[derive(Debug, Clone)]
struct MeasurementPoint {
    timestamp: Instant,
    operation: String,
    duration_ms: f64,
    memory_used_mb: f64,
    success: bool,
}

// Alert configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertConfig {
    pub cpu_threshold_percent: f64,
    pub memory_threshold_percent: f64,
    pub error_rate_threshold_percent: f64,
    pub response_time_threshold_ms: f64,
    pub disk_space_threshold_percent: f64,
    pub enabled: bool,
}

// Alert notification
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertNotification {
    pub id: String,
    pub alert_type: String, // "cpu", "memory", "error_rate", etc.
    pub severity: String,   // "info", "warning", "critical"
    pub message: String,
    pub timestamp: String,
    pub resolved: bool,
    pub metrics: Option<PerformanceMetrics>,
}

// Historical performance data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalMetrics {
    pub timestamp: String,
    pub metrics: PerformanceMetrics,
}

// Performance monitor state
pub struct PerformanceMonitor {
    measurements: Arc<Mutex<Vec<MeasurementPoint>>>,
    start_time: Instant,
    alert_config: Arc<Mutex<AlertConfig>>,
    active_alerts: Arc<Mutex<Vec<AlertNotification>>>,
    historical_data: Arc<Mutex<Vec<HistoricalMetrics>>>,
    max_history_points: usize,
}

impl PerformanceMonitor {
    pub fn new() -> Self {
        Self {
            measurements: Arc::new(Mutex::new(Vec::new())),
            start_time: Instant::now(),
            alert_config: Arc::new(Mutex::new(AlertConfig {
                cpu_threshold_percent: 80.0,
                memory_threshold_percent: 85.0,
                error_rate_threshold_percent: 5.0,
                response_time_threshold_ms: 1000.0,
                disk_space_threshold_percent: 90.0,
                enabled: true,
            })),
            active_alerts: Arc::new(Mutex::new(Vec::new())),
            historical_data: Arc::new(Mutex::new(Vec::new())),
            max_history_points: 1000, // Keep last 1000 data points
        }
    }

    // Record a performance measurement
    pub fn record_measurement(&self, operation: &str, duration: Duration, memory_mb: f64, success: bool) {
        let measurement = MeasurementPoint {
            timestamp: Instant::now(),
            operation: operation.to_string(),
            duration_ms: duration.as_secs_f64() * 1000.0,
            memory_used_mb: memory_mb,
            success,
        };

        if let Ok(mut measurements) = self.measurements.lock() {
            measurements.push(measurement);
            
            // Keep only last 10000 measurements to prevent memory growth
            if measurements.len() > 10000 {
                measurements.drain(..5000); // Remove oldest 5000
            }
        }
    }

    // Get current performance metrics
    pub fn get_current_metrics(&self) -> Result<PerformanceMetrics, String> {
        let measurements = self.measurements.lock()
            .map_err(|_| "Failed to lock measurements")?;

        let now = Instant::now();
        let recent_measurements: Vec<_> = measurements
            .iter()
            .filter(|m| now.duration_since(m.timestamp) < Duration::from_secs(60))
            .collect();

        if recent_measurements.is_empty() {
            return Ok(PerformanceMetrics {
                processing_time_ms: 0.0,
                memory_usage_mb: self.get_system_memory_usage()?,
                throughput_ops_per_sec: 0.0,
                cpu_usage_percent: self.get_cpu_usage()?,
                active_connections: self.get_active_connections(),
                error_rate_percent: 0.0,
                last_updated: chrono::Utc::now().to_rfc3339(),
            });
        }

        let avg_processing_time = recent_measurements
            .iter()
            .map(|m| m.duration_ms)
            .sum::<f64>() / recent_measurements.len() as f64;

        let throughput = recent_measurements.len() as f64 / 60.0; // ops per second

        let error_count = recent_measurements
            .iter()
            .filter(|m| !m.success)
            .count();
        let error_rate = if recent_measurements.len() > 0 {
            (error_count as f64 / recent_measurements.len() as f64) * 100.0
        } else {
            0.0
        };

        Ok(PerformanceMetrics {
            processing_time_ms: avg_processing_time,
            memory_usage_mb: self.get_system_memory_usage()?,
            throughput_ops_per_sec: throughput,
            cpu_usage_percent: self.get_cpu_usage()?,
            active_connections: self.get_active_connections(),
            error_rate_percent: error_rate,
            last_updated: chrono::Utc::now().to_rfc3339(),
        })
    }

    // Get system health status
    pub fn get_health_status(&self) -> Result<HealthStatus, String> {
        let metrics = self.get_current_metrics()?;
        let system_metrics = self.get_system_metrics()?;

        let memory_usage_percent = (system_metrics.total_memory_mb - system_metrics.available_memory_mb) as f64 
            / system_metrics.total_memory_mb as f64 * 100.0;
        
        let disk_usage_percent = (system_metrics.disk_space_gb - system_metrics.disk_available_gb) as f64 
            / system_metrics.disk_space_gb as f64 * 100.0;

        // Determine health status based on thresholds
        let system_health = if metrics.cpu_usage_percent > 90.0 || memory_usage_percent > 95.0 {
            "critical"
        } else if metrics.cpu_usage_percent > 80.0 || memory_usage_percent > 85.0 {
            "warning"
        } else {
            "healthy"
        };

        let database_health = "healthy"; // TODO: Implement actual database health check
        
        let connection_health = if metrics.active_connections > 100 {
            "warning"
        } else {
            "healthy"
        };

        let memory_health = if memory_usage_percent > 95.0 {
            "critical"
        } else if memory_usage_percent > 85.0 {
            "warning"
        } else {
            "healthy"
        };

        let disk_health = if disk_usage_percent > 95.0 {
            "critical"
        } else if disk_usage_percent > 90.0 {
            "warning"
        } else {
            "healthy"
        };

        let overall_status = match (system_health, database_health, connection_health, memory_health, disk_health) {
            (_, "critical", _, _, _) | (_, _, "critical", _, _) | (_, _, _, "critical", _) | (_, _, _, _, "critical") | ("critical", _, _, _, _) => "critical",
            (_, "warning", _, _, _) | (_, _, "warning", _, _) | (_, _, _, "warning", _) | (_, _, _, _, "warning") | ("warning", _, _, _, _) => "warning",
            _ => "healthy"
        };

        Ok(HealthStatus {
            system_health: system_health.to_string(),
            database_health: database_health.to_string(),
            connection_health: connection_health.to_string(),
            memory_health: memory_health.to_string(),
            disk_health: disk_health.to_string(),
            overall_status: overall_status.to_string(),
            last_check: chrono::Utc::now().to_rfc3339(),
            uptime_seconds: self.start_time.elapsed().as_secs(),
        })
    }

    // Get system resource metrics
    pub fn get_system_metrics(&self) -> Result<SystemMetrics, String> {
        // Use sysinfo crate for cross-platform system information
        use sysinfo::{System, Disks, Networks};
        
        let mut sys = System::new_all();
        sys.refresh_all();

        let total_memory = sys.total_memory() / 1024 / 1024; // Convert to MB
        let available_memory = sys.available_memory() / 1024 / 1024;
        
        let cpu_cores = sys.cpus().len() as u32;
        
        // Get disk information
        let disks = Disks::new_with_refreshed_list();
        let (disk_total, disk_available) = disks.iter()
            .fold((0, 0), |(total, available), disk| {
                (total + disk.total_space(), available + disk.available_space())
            });
        
        let disk_total_gb = disk_total / 1024 / 1024 / 1024;
        let disk_available_gb = disk_available / 1024 / 1024 / 1024;

        // Get network information
        let networks = Networks::new_with_refreshed_list();
        let (bytes_sent, bytes_received) = networks.iter()
            .fold((0, 0), |(sent, received), (_, network)| {
                (sent + network.total_transmitted(), received + network.total_received())
            });

        Ok(SystemMetrics {
            cpu_cores,
            total_memory_mb: total_memory,
            available_memory_mb: available_memory,
            disk_space_gb: disk_total_gb,
            disk_available_gb: disk_available_gb,
            network_bytes_sent: bytes_sent,
            network_bytes_received: bytes_received,
            process_count: sys.processes().len() as u32,
            thread_count: sys.processes().values()
                .map(|p| p.memory())
                .count() as u32, // Approximate thread count
        })
    }

    // Record historical metrics
    pub fn record_historical_metrics(&self) -> Result<(), String> {
        let metrics = self.get_current_metrics()?;
        let historical_point = HistoricalMetrics {
            timestamp: chrono::Utc::now().to_rfc3339(),
            metrics,
        };

        if let Ok(mut history) = self.historical_data.lock() {
            history.push(historical_point);
            
            // Keep only the most recent data points
            if history.len() > self.max_history_points {
                let excess = history.len() - self.max_history_points;
                history.drain(..excess);
            }
        }

        Ok(())
    }

    // Get historical metrics
    pub fn get_historical_metrics(&self, limit: Option<usize>) -> Result<Vec<HistoricalMetrics>, String> {
        let history = self.historical_data.lock()
            .map_err(|_| "Failed to lock historical data")?;

        let result = if let Some(limit) = limit {
            history.iter()
                .rev()
                .take(limit)
                .cloned()
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect()
        } else {
            history.clone()
        };

        Ok(result)
    }

    // Check and generate alerts
    pub fn check_alerts(&self) -> Result<Vec<AlertNotification>, String> {
        let config = self.alert_config.lock()
            .map_err(|_| "Failed to lock alert config")?;

        if !config.enabled {
            return Ok(Vec::new());
        }

        let metrics = self.get_current_metrics()?;
        let mut alerts = Vec::new();

        // CPU usage alert
        if metrics.cpu_usage_percent > config.cpu_threshold_percent {
            alerts.push(AlertNotification {
                id: format!("cpu-{}", chrono::Utc::now().timestamp()),
                alert_type: "cpu".to_string(),
                severity: if metrics.cpu_usage_percent > 95.0 { "critical" } else { "warning" }.to_string(),
                message: format!("High CPU usage: {:.1}%", metrics.cpu_usage_percent),
                timestamp: chrono::Utc::now().to_rfc3339(),
                resolved: false,
                metrics: Some(metrics.clone()),
            });
        }

        // Memory usage alert
        if metrics.memory_usage_mb > config.memory_threshold_percent {
            alerts.push(AlertNotification {
                id: format!("memory-{}", chrono::Utc::now().timestamp()),
                alert_type: "memory".to_string(),
                severity: if metrics.memory_usage_mb > 95.0 { "critical" } else { "warning" }.to_string(),
                message: format!("High memory usage: {:.1} MB", metrics.memory_usage_mb),
                timestamp: chrono::Utc::now().to_rfc3339(),
                resolved: false,
                metrics: Some(metrics.clone()),
            });
        }

        // Error rate alert
        if metrics.error_rate_percent > config.error_rate_threshold_percent {
            alerts.push(AlertNotification {
                id: format!("error-rate-{}", chrono::Utc::now().timestamp()),
                alert_type: "error_rate".to_string(),
                severity: if metrics.error_rate_percent > 10.0 { "critical" } else { "warning" }.to_string(),
                message: format!("High error rate: {:.1}%", metrics.error_rate_percent),
                timestamp: chrono::Utc::now().to_rfc3339(),
                resolved: false,
                metrics: Some(metrics.clone()),
            });
        }

        // Response time alert
        if metrics.processing_time_ms > config.response_time_threshold_ms {
            alerts.push(AlertNotification {
                id: format!("response-time-{}", chrono::Utc::now().timestamp()),
                alert_type: "response_time".to_string(),
                severity: if metrics.processing_time_ms > 5000.0 { "critical" } else { "warning" }.to_string(),
                message: format!("Slow response time: {:.1} ms", metrics.processing_time_ms),
                timestamp: chrono::Utc::now().to_rfc3339(),
                resolved: false,
                metrics: Some(metrics),
            });
        }

        // Update active alerts
        if let Ok(mut active_alerts) = self.active_alerts.lock() {
            active_alerts.extend(alerts.clone());
            
            // Keep only recent alerts (last 24 hours)
            let cutoff_time = chrono::Utc::now() - chrono::Duration::hours(24);
            active_alerts.retain(|alert| {
                chrono::DateTime::parse_from_rfc3339(&alert.timestamp)
                    .map(|dt| dt.with_timezone(&chrono::Utc) > cutoff_time)
                    .unwrap_or(false)
            });
        }

        Ok(alerts)
    }

    // Get active alerts
    pub fn get_active_alerts(&self) -> Result<Vec<AlertNotification>, String> {
        let alerts = self.active_alerts.lock()
            .map_err(|_| "Failed to lock active alerts")?;
        Ok(alerts.clone())
    }

    // Update alert configuration
    pub fn update_alert_config(&self, config: AlertConfig) -> Result<(), String> {
        let mut alert_config = self.alert_config.lock()
            .map_err(|_| "Failed to lock alert config")?;
        *alert_config = config;
        Ok(())
    }

    // Get alert configuration
    pub fn get_alert_config(&self) -> Result<AlertConfig, String> {
        let config = self.alert_config.lock()
            .map_err(|_| "Failed to lock alert config")?;
        Ok(config.clone())
    }

    // Helper methods for system metrics
    fn get_system_memory_usage(&self) -> Result<f64, String> {
        use sysinfo::System;
        let mut sys = System::new();
        sys.refresh_memory();
        Ok((sys.total_memory() - sys.available_memory()) as f64 / 1024.0 / 1024.0)
    }

    fn get_cpu_usage(&self) -> Result<f64, String> {
        use sysinfo::System;
        let mut sys = System::new();
        sys.refresh_cpu();
        
        // Wait a bit and refresh again for accurate CPU usage
        std::thread::sleep(Duration::from_millis(100));
        sys.refresh_cpu();
        
        let avg_usage = sys.cpus()
            .iter()
            .map(|cpu| cpu.cpu_usage() as f64)
            .sum::<f64>() / sys.cpus().len() as f64;
        
        Ok(avg_usage)
    }

    fn get_active_connections(&self) -> u32 {
        // TODO: Implement actual connection counting
        // For now, return a placeholder
        0
    }
}

// Tauri commands for performance monitoring
#[tauri::command]
pub async fn get_performance_metrics(
    monitor: State<'_, Arc<PerformanceMonitor>>
) -> Result<PerformanceMetrics, String> {
    monitor.get_current_metrics()
}

#[tauri::command]
pub async fn get_health_status(
    monitor: State<'_, Arc<PerformanceMonitor>>
) -> Result<HealthStatus, String> {
    monitor.get_health_status()
}

#[tauri::command]
pub async fn get_system_metrics(
    monitor: State<'_, Arc<PerformanceMonitor>>
) -> Result<SystemMetrics, String> {
    monitor.get_system_metrics()
}

#[tauri::command]
pub async fn get_historical_metrics(
    monitor: State<'_, Arc<PerformanceMonitor>>,
    limit: Option<usize>
) -> Result<Vec<HistoricalMetrics>, String> {
    monitor.get_historical_metrics(limit)
}

#[tauri::command]
pub async fn get_active_alerts(
    monitor: State<'_, Arc<PerformanceMonitor>>
) -> Result<Vec<AlertNotification>, String> {
    monitor.get_active_alerts()
}

#[tauri::command]
pub async fn update_alert_config(
    monitor: State<'_, Arc<PerformanceMonitor>>,
    config: AlertConfig
) -> Result<(), String> {
    monitor.update_alert_config(config)
}

#[tauri::command]
pub async fn get_alert_config(
    monitor: State<'_, Arc<PerformanceMonitor>>
) -> Result<AlertConfig, String> {
    monitor.get_alert_config()
}

#[tauri::command]
pub async fn record_performance_measurement(
    monitor: State<'_, Arc<PerformanceMonitor>>,
    operation: String,
    duration_ms: f64,
    memory_mb: f64,
    success: bool
) -> Result<(), String> {
    monitor.record_measurement(&operation, Duration::from_secs_f64(duration_ms / 1000.0), memory_mb, success);
    Ok(())
}
