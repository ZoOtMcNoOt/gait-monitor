use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use async_std::sync::Mutex;
use chrono::{DateTime, Utc};

// Configuration data structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub app: AppSettings,
    pub device: DeviceSettings,
    pub data: DataSettings,
    pub ui: UiSettings,
    pub security: SecuritySettings,
    pub export: ExportSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub app_name: String,
    pub version: String,
    pub environment: Environment,
    pub debug_mode: bool,
    pub log_level: LogLevel,
    pub auto_save_interval_ms: u64,
    pub max_session_duration_hours: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceSettings {
    pub scan_timeout_ms: u64,
    pub connection_timeout_ms: u64,
    pub max_concurrent_devices: u8,
    pub auto_reconnect: bool,
    pub reconnect_attempts: u32,
    pub notification_timeout_ms: u64,
    pub rssi_threshold: i16,
    pub preferred_devices: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSettings {
    pub max_buffer_size: usize,
    pub sample_rate_hz: f64,
    pub data_retention_days: u32,
    pub compression_enabled: bool,
    pub validation_strict: bool,
    pub backup_enabled: bool,
    pub backup_interval_hours: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiSettings {
    pub theme: Theme,
    pub language: String,
    pub chart_refresh_rate_ms: u64,
    pub show_debug_info: bool,
    pub auto_scroll_charts: bool,
    pub default_chart_type: String,
    pub max_chart_points: usize,
    pub keyboard_shortcuts_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecuritySettings {
    pub csrf_protection_enabled: bool,
    pub rate_limiting_enabled: bool,
    pub session_timeout_minutes: u32,
    pub max_login_attempts: u32,
    pub audit_logging_enabled: bool,
    pub encryption_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSettings {
    pub default_format: String,
    pub include_headers: bool,
    pub decimal_precision: u8,
    pub date_format: String,
    pub chunk_size: usize,
    pub compression_level: u8,
}

// Enums for configuration values
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Environment {
    Development,
    Testing,
    Staging,
    Production,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
    Off,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Theme {
    Light,
    Dark,
    Auto,
}

// Configuration validation errors
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConfigValidationError {
    InvalidValue { field: String, value: String, reason: String },
    MissingField { field: String },
    InvalidRange { field: String, value: String, min: String, max: String },
    InvalidFormat { field: String, value: String, expected_format: String },
    EnvironmentMismatch { field: String, environment: Environment },
}

impl std::fmt::Display for ConfigValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigValidationError::InvalidValue { field, value, reason } => {
                write!(f, "Invalid value for '{}': '{}' - {}", field, value, reason)
            }
            ConfigValidationError::MissingField { field } => {
                write!(f, "Missing required field: '{}'", field)
            }
            ConfigValidationError::InvalidRange { field, value, min, max } => {
                write!(f, "Value '{}' for field '{}' is out of range [{}, {}]", value, field, min, max)
            }
            ConfigValidationError::InvalidFormat { field, value, expected_format } => {
                write!(f, "Invalid format for '{}': '{}', expected: {}", field, value, expected_format)
            }
            ConfigValidationError::EnvironmentMismatch { field, environment } => {
                write!(f, "Field '{}' is not valid for environment: {:?}", field, environment)
            }
        }
    }
}

impl std::error::Error for ConfigValidationError {}

// Configuration history tracking
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigurationHistory {
    pub timestamp: DateTime<Utc>,
    pub operation: ConfigOperation,
    pub field_path: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub user_id: Option<String>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConfigOperation {
    Create,
    Update,
    Delete,
    Reset,
    Import,
    Export,
}

// Main configuration manager
#[derive(Clone)]
pub struct ConfigurationManager {
    config: Arc<Mutex<AppConfig>>,
    config_path: PathBuf,
    history: Arc<Mutex<Vec<ConfigurationHistory>>>,
    watchers: Arc<Mutex<Vec<Box<dyn Fn(&AppConfig) + Send + Sync>>>>,
}

impl ConfigurationManager {
    pub fn new(config_path: Option<PathBuf>) -> Result<Self, Box<dyn std::error::Error>> {
        let config_path = config_path.unwrap_or_else(|| {
            let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
            path.push("gait-monitor");
            path.push("config.json");
            path
        });

        // Ensure config directory exists
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let config = if config_path.exists() {
            Self::load_config_from_file(&config_path)?
        } else {
            let default_config = Self::create_default_config();
            Self::save_config_to_file(&default_config, &config_path)?;
            default_config
        };

        Ok(Self {
            config: Arc::new(Mutex::new(config)),
            config_path,
            history: Arc::new(Mutex::new(Vec::new())),
            watchers: Arc::new(Mutex::new(Vec::new())),
        })
    }

    pub async fn get_config(&self) -> AppConfig {
        self.config.lock().await.clone()
    }

    pub async fn update_config(&self, updates: HashMap<String, serde_json::Value>) -> Result<(), Box<dyn std::error::Error>> {
        let mut config = self.config.lock().await;
        let old_config = config.clone();

        // Apply updates to configuration
        for (field_path, new_value) in updates {
            self.apply_field_update(&mut config, &field_path, new_value.clone()).await?;
            
            // Record history
            let history_entry = ConfigurationHistory {
                timestamp: Utc::now(),
                operation: ConfigOperation::Update,
                field_path: field_path.clone(),
                old_value: self.get_field_value(&old_config, &field_path),
                new_value: Some(new_value.to_string()),
                user_id: None, // Could be populated from context
                reason: None,
            };
            
            self.history.lock().await.push(history_entry);
        }

        // Validate the updated configuration
        self.validate_config(&config).await?;

        // Save to file
        Self::save_config_to_file(&config, &self.config_path)?;

        // Notify watchers
        self.notify_watchers(&config).await;

        Ok(())
    }

    pub async fn validate_config(&self, config: &AppConfig) -> Result<(), ConfigValidationError> {
        // Validate app settings
        if config.app.auto_save_interval_ms < 1000 {
            return Err(ConfigValidationError::InvalidRange {
                field: "app.auto_save_interval_ms".to_string(),
                value: config.app.auto_save_interval_ms.to_string(),
                min: "1000".to_string(),
                max: "3600000".to_string(),
            });
        }

        if config.app.max_session_duration_hours == 0 || config.app.max_session_duration_hours > 24 {
            return Err(ConfigValidationError::InvalidRange {
                field: "app.max_session_duration_hours".to_string(),
                value: config.app.max_session_duration_hours.to_string(),
                min: "1".to_string(),
                max: "24".to_string(),
            });
        }

        // Validate device settings
        if config.device.max_concurrent_devices == 0 || config.device.max_concurrent_devices > 10 {
            return Err(ConfigValidationError::InvalidRange {
                field: "device.max_concurrent_devices".to_string(),
                value: config.device.max_concurrent_devices.to_string(),
                min: "1".to_string(),
                max: "10".to_string(),
            });
        }

        if config.device.scan_timeout_ms < 1000 || config.device.scan_timeout_ms > 60000 {
            return Err(ConfigValidationError::InvalidRange {
                field: "device.scan_timeout_ms".to_string(),
                value: config.device.scan_timeout_ms.to_string(),
                min: "1000".to_string(),
                max: "60000".to_string(),
            });
        }

        // Validate data settings
        if config.data.max_buffer_size < 100 || config.data.max_buffer_size > 1000000 {
            return Err(ConfigValidationError::InvalidRange {
                field: "data.max_buffer_size".to_string(),
                value: config.data.max_buffer_size.to_string(),
                min: "100".to_string(),
                max: "1000000".to_string(),
            });
        }

        if config.data.sample_rate_hz <= 0.0 || config.data.sample_rate_hz > 1000.0 {
            return Err(ConfigValidationError::InvalidRange {
                field: "data.sample_rate_hz".to_string(),
                value: config.data.sample_rate_hz.to_string(),
                min: "0.1".to_string(),
                max: "1000.0".to_string(),
            });
        }

        // Validate UI settings
        if config.ui.chart_refresh_rate_ms < 16 || config.ui.chart_refresh_rate_ms > 10000 {
            return Err(ConfigValidationError::InvalidRange {
                field: "ui.chart_refresh_rate_ms".to_string(),
                value: config.ui.chart_refresh_rate_ms.to_string(),
                min: "16".to_string(),
                max: "10000".to_string(),
            });
        }

        if config.ui.max_chart_points == 0 || config.ui.max_chart_points > 10000 {
            return Err(ConfigValidationError::InvalidRange {
                field: "ui.max_chart_points".to_string(),
                value: config.ui.max_chart_points.to_string(),
                min: "10".to_string(),
                max: "10000".to_string(),
            });
        }

        // Validate security settings
        if config.security.session_timeout_minutes < 5 || config.security.session_timeout_minutes > 1440 {
            return Err(ConfigValidationError::InvalidRange {
                field: "security.session_timeout_minutes".to_string(),
                value: config.security.session_timeout_minutes.to_string(),
                min: "5".to_string(),
                max: "1440".to_string(),
            });
        }

        // Validate export settings
        if config.export.decimal_precision > 10 {
            return Err(ConfigValidationError::InvalidRange {
                field: "export.decimal_precision".to_string(),
                value: config.export.decimal_precision.to_string(),
                min: "0".to_string(),
                max: "10".to_string(),
            });
        }

        // Environment-specific validations
        match config.app.environment {
            Environment::Production => {
                if config.app.debug_mode {
                    return Err(ConfigValidationError::EnvironmentMismatch {
                        field: "app.debug_mode".to_string(),
                        environment: Environment::Production,
                    });
                }
                if config.app.log_level == LogLevel::Trace || config.app.log_level == LogLevel::Debug {
                    return Err(ConfigValidationError::EnvironmentMismatch {
                        field: "app.log_level".to_string(),
                        environment: Environment::Production,
                    });
                }
            }
            _ => {}
        }

        Ok(())
    }

    pub async fn reset_to_defaults(&self) -> Result<(), Box<dyn std::error::Error>> {
        let default_config = Self::create_default_config();
        let mut config = self.config.lock().await;
        *config = default_config.clone();

        // Record history
        let history_entry = ConfigurationHistory {
            timestamp: Utc::now(),
            operation: ConfigOperation::Reset,
            field_path: "*".to_string(),
            old_value: None,
            new_value: None,
            user_id: None,
            reason: Some("Reset to default configuration".to_string()),
        };
        
        self.history.lock().await.push(history_entry);

        // Save to file
        Self::save_config_to_file(&config, &self.config_path)?;

        // Notify watchers
        self.notify_watchers(&config).await;

        Ok(())
    }

    pub async fn get_configuration_history(&self) -> Vec<ConfigurationHistory> {
        self.history.lock().await.clone()
    }

    pub async fn export_config(&self, export_path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
        let config = self.get_config().await;
        Self::save_config_to_file(&config, export_path)?;

        // Record history
        let history_entry = ConfigurationHistory {
            timestamp: Utc::now(),
            operation: ConfigOperation::Export,
            field_path: "*".to_string(),
            old_value: None,
            new_value: Some(export_path.to_string_lossy().to_string()),
            user_id: None,
            reason: Some("Configuration exported".to_string()),
        };
        
        self.history.lock().await.push(history_entry);

        Ok(())
    }

    pub async fn import_config(&self, import_path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
        let imported_config = Self::load_config_from_file(import_path)?;
        
        // Validate imported configuration
        self.validate_config(&imported_config).await?;

        let mut config = self.config.lock().await;
        *config = imported_config.clone();

        // Record history
        let history_entry = ConfigurationHistory {
            timestamp: Utc::now(),
            operation: ConfigOperation::Import,
            field_path: "*".to_string(),
            old_value: Some(import_path.to_string_lossy().to_string()),
            new_value: None,
            user_id: None,
            reason: Some("Configuration imported".to_string()),
        };
        
        self.history.lock().await.push(history_entry);

        // Save to file
        Self::save_config_to_file(&config, &self.config_path)?;

        // Notify watchers
        self.notify_watchers(&config).await;

        Ok(())
    }

    // Helper methods
    fn create_default_config() -> AppConfig {
        let environment = if cfg!(debug_assertions) {
            Environment::Development
        } else {
            Environment::Production
        };

        AppConfig {
            app: AppSettings {
                app_name: "Gait Monitor".to_string(),
                version: env!("CARGO_PKG_VERSION").to_string(),
                environment,
                debug_mode: cfg!(debug_assertions),
                log_level: if cfg!(debug_assertions) { LogLevel::Debug } else { LogLevel::Info },
                auto_save_interval_ms: 30000,
                max_session_duration_hours: 8,
            },
            device: DeviceSettings {
                scan_timeout_ms: 10000,
                connection_timeout_ms: 5000,
                max_concurrent_devices: 4,
                auto_reconnect: true,
                reconnect_attempts: 3,
                notification_timeout_ms: 30000,
                rssi_threshold: -80,
                preferred_devices: Vec::new(),
            },
            data: DataSettings {
                max_buffer_size: 10000,
                sample_rate_hz: 100.0,
                data_retention_days: 30,
                compression_enabled: true,
                validation_strict: false,
                backup_enabled: true,
                backup_interval_hours: 24,
            },
            ui: UiSettings {
                theme: Theme::Auto,
                language: "en".to_string(),
                chart_refresh_rate_ms: 100,
                show_debug_info: cfg!(debug_assertions),
                auto_scroll_charts: true,
                default_chart_type: "line".to_string(),
                max_chart_points: 1000,
                keyboard_shortcuts_enabled: true,
            },
            security: SecuritySettings {
                csrf_protection_enabled: true,
                rate_limiting_enabled: true,
                session_timeout_minutes: 60,
                max_login_attempts: 5,
                audit_logging_enabled: true,
                encryption_enabled: false,
            },
            export: ExportSettings {
                default_format: "csv".to_string(),
                include_headers: true,
                decimal_precision: 3,
                date_format: "ISO8601".to_string(),
                chunk_size: 1000,
                compression_level: 6,
            },
        }
    }

    fn load_config_from_file(path: &PathBuf) -> Result<AppConfig, Box<dyn std::error::Error>> {
        let content = fs::read_to_string(path)?;
        let config: AppConfig = serde_json::from_str(&content)?;
        Ok(config)
    }

    fn save_config_to_file(config: &AppConfig, path: &PathBuf) -> Result<(), Box<dyn std::error::Error>> {
        let json = serde_json::to_string_pretty(config)?;
        fs::write(path, json)?;
        Ok(())
    }

    async fn apply_field_update(&self, config: &mut AppConfig, field_path: &str, value: serde_json::Value) -> Result<(), Box<dyn std::error::Error>> {
        // This is a simplified implementation - in practice, you'd want more robust field path parsing
        let parts: Vec<&str> = field_path.split('.').collect();
        
        match parts.as_slice() {
            ["app", "debug_mode"] => config.app.debug_mode = value.as_bool().unwrap_or(false),
            ["app", "auto_save_interval_ms"] => config.app.auto_save_interval_ms = value.as_u64().unwrap_or(30000),
            ["device", "max_concurrent_devices"] => config.device.max_concurrent_devices = value.as_u64().unwrap_or(4) as u8,
            ["data", "max_buffer_size"] => config.data.max_buffer_size = value.as_u64().unwrap_or(10000) as usize,
            ["ui", "theme"] => {
                if let Some(theme_str) = value.as_str() {
                    config.ui.theme = match theme_str {
                        "light" => Theme::Light,
                        "dark" => Theme::Dark,
                        "auto" => Theme::Auto,
                        _ => Theme::Auto,
                    };
                }
            },
            _ => return Err(format!("Unknown field path: {}", field_path).into()),
        }

        Ok(())
    }

    fn get_field_value(&self, config: &AppConfig, field_path: &str) -> Option<String> {
        let parts: Vec<&str> = field_path.split('.').collect();
        
        match parts.as_slice() {
            ["app", "debug_mode"] => Some(config.app.debug_mode.to_string()),
            ["app", "auto_save_interval_ms"] => Some(config.app.auto_save_interval_ms.to_string()),
            ["device", "max_concurrent_devices"] => Some(config.device.max_concurrent_devices.to_string()),
            ["data", "max_buffer_size"] => Some(config.data.max_buffer_size.to_string()),
            ["ui", "theme"] => Some(format!("{:?}", config.ui.theme).to_lowercase()),
            _ => None,
        }
    }

    async fn notify_watchers(&self, config: &AppConfig) {
        let watchers = self.watchers.lock().await;
        for watcher in watchers.iter() {
            watcher(config);
        }
    }
}

// State wrapper for Tauri
#[derive(Clone)]
pub struct ConfigurationState(pub ConfigurationManager);

impl ConfigurationState {
    pub fn new(config_path: Option<PathBuf>) -> Result<Self, Box<dyn std::error::Error>> {
        Ok(Self(ConfigurationManager::new(config_path)?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[async_std::test]
    async fn test_configuration_manager_creation() {
        let temp_dir = tempdir().unwrap();
        let config_path = temp_dir.path().join("test_config.json");
        
        let manager = ConfigurationManager::new(Some(config_path.clone())).unwrap();
        let config = manager.get_config().await;
        
        assert_eq!(config.app.app_name, "Gait Monitor");
        assert!(config_path.exists());
    }

    #[async_std::test]
    async fn test_configuration_validation() {
        let temp_dir = tempdir().unwrap();
        let config_path = temp_dir.path().join("test_config.json");
        let manager = ConfigurationManager::new(Some(config_path)).unwrap();
        
        let mut updates = HashMap::new();
        updates.insert("app.auto_save_interval_ms".to_string(), serde_json::Value::Number(serde_json::Number::from(500))); // Invalid - too low
        
        let result = manager.update_config(updates).await;
        assert!(result.is_err());
    }

    #[async_std::test]
    async fn test_configuration_update() {
        let temp_dir = tempdir().unwrap();
        let config_path = temp_dir.path().join("test_config.json");
        let manager = ConfigurationManager::new(Some(config_path)).unwrap();
        
        let mut updates = HashMap::new();
        updates.insert("app.debug_mode".to_string(), serde_json::Value::Bool(true));
        updates.insert("data.max_buffer_size".to_string(), serde_json::Value::Number(serde_json::Number::from(5000)));
        
        manager.update_config(updates).await.unwrap();
        
        let config = manager.get_config().await;
        assert_eq!(config.app.debug_mode, true);
        assert_eq!(config.data.max_buffer_size, 5000);
        
        let history = manager.get_configuration_history().await;
        assert_eq!(history.len(), 2);
    }

    #[test]
    fn test_default_configuration_validation() {
        let config = ConfigurationManager::create_default_config();
        
        // Basic validation checks
        assert!(!config.app.app_name.is_empty());
        assert!(config.app.auto_save_interval_ms >= 1000);
        assert!(config.device.max_concurrent_devices > 0);
        assert!(config.data.sample_rate_hz > 0.0);
    }
}
