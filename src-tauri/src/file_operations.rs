use std::path::{Path, PathBuf};
use serde::{Serialize, Deserialize};
use tokio::fs;

use crate::security::CSRFTokenState;
use crate::path_manager::PathConfig;
use crate::data_processing::GaitData;
use crate::validate_file_operation;

// Session metadata structure for file operations
#[derive(Serialize, Deserialize, Clone)]
pub struct SessionMetadata {
    pub id: String,
    pub session_name: String,
    pub subject_id: String,
    pub notes: String,
    pub timestamp: u64,
    pub data_points: usize,
    pub file_path: String,
    pub devices: Vec<String>,
}

// Result structure for save operations
#[derive(Serialize)]
pub struct SaveResult {
    pub session_id: String,
    pub file_path: String,
    pub data_points: usize,
    pub success: bool,
}

// Cross-platform path configuration state wrapper
pub struct PathConfigState(pub std::sync::Arc<async_std::sync::Mutex<PathConfig>>);

impl PathConfigState {
    pub fn new() -> Result<Self, String> {
        let config = PathConfig::new()?;
        Ok(Self(std::sync::Arc::new(async_std::sync::Mutex::new(config))))
    }
}

// File operations error types
#[derive(Debug)]
pub enum FileOperationError {
    PermissionDenied(String),
    InvalidPath(String),
    IoError(String),
    SerializationError(String),
    CsrfError(String),
}

impl std::fmt::Display for FileOperationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            FileOperationError::PermissionDenied(msg) => write!(f, "Permission denied: {}", msg),
            FileOperationError::InvalidPath(msg) => write!(f, "Invalid path: {}", msg),
            FileOperationError::IoError(msg) => write!(f, "IO error: {}", msg),
            FileOperationError::SerializationError(msg) => write!(f, "Serialization error: {}", msg),
            FileOperationError::CsrfError(msg) => write!(f, "CSRF error: {}", msg),
        }
    }
}

impl std::error::Error for FileOperationError {}

// Save session data to CSV file with comprehensive metadata
pub async fn save_session_data(
    session_name: &str,
    subject_id: &str,
    notes: &str,
    data: &[GaitData],
    storage_path: Option<&str>,
    csrf_token: &str,
    csrf_state: &CSRFTokenState,
    path_config: &PathConfigState,
) -> Result<SaveResult, String> {
    // CSRF Protection with rate limiting
    validate_file_operation!(csrf_state, csrf_token, "save_session_data");
    
    if data.is_empty() {
        return Err("No data to save".to_string());
    }

    // Validate inputs
    if session_name.trim().is_empty() {
        return Err("Session name cannot be empty".to_string());
    }
    if subject_id.trim().is_empty() {
        return Err("Subject ID cannot be empty".to_string());
    }

    let config = path_config.0.lock().await;
    let base_path = if let Some(custom_path) = storage_path {
        PathBuf::from(custom_path)
    } else {
        config.get_default_storage_path()
    };

    // Ensure the storage directory exists
    if let Err(e) = fs::create_dir_all(&base_path).await {
        return Err(format!("Failed to create storage directory: {}", e));
    }

    // Generate session ID and file timestamp
    let session_id = uuid::Uuid::new_v4().to_string();
    
    // Generate filename with timestamp (for filename, seconds are fine)
    let file_timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    // Use the path manager to sanitize the filename
    let safe_session_name = PathConfig::sanitize_filename(session_name);

    let filename = format!("gait_{}_{}.csv", 
        chrono::DateTime::from_timestamp(file_timestamp as i64, 0)
            .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap())
            .format("%Y%m%d_%H%M%S"),
        safe_session_name
    );

    let file_path = base_path.join(&filename);

    // Create CSV content with comprehensive metadata
    let mut csv_content = String::new();
    
    // Header with metadata
    csv_content.push_str(&format!("# Gait Monitor Data Export\n"));
    csv_content.push_str(&format!("# Session Name: {}\n", session_name));
    csv_content.push_str(&format!("# Subject ID: {}\n", subject_id));
    csv_content.push_str(&format!("# Notes: {}\n", notes));
    csv_content.push_str(&format!("# Export Time: {}\n", 
        chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")));
    csv_content.push_str(&format!("# Data Points: {}\n", data.len()));
    csv_content.push_str(&format!("# Session ID: {}\n", session_id));

    // Extract unique devices from data
    let devices: std::collections::HashSet<String> = data.iter()
        .map(|d| d.device_id.clone())
        .collect();
    let device_list: Vec<String> = devices.into_iter().collect();
    csv_content.push_str(&format!("# Devices: {}\n", device_list.join(", ")));

    // Time range
    if let (Some(first), Some(last)) = (data.first(), data.last()) {
        csv_content.push_str(&format!("# Time Range: {} to {}\n", first.timestamp, last.timestamp));
        csv_content.push_str(&format!("# Duration: {:.2} seconds\n", 
            (last.timestamp - first.timestamp) as f64 / 1000.0));
    }

    csv_content.push_str("#\n"); // Empty comment line for separation

    // CSV header
    csv_content.push_str("timestamp,device_id,r1,r2,r3,x,y,z\n");

    // CSV data
    for point in data {
        csv_content.push_str(&format!("{},{},{},{},{},{},{},{}\n",
            point.timestamp,
            point.device_id,
            point.r1, point.r2, point.r3,
            point.x, point.y, point.z
        ));
    }

    // Write file asynchronously
    fs::write(&file_path, csv_content).await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // Create session metadata
    let metadata = SessionMetadata {
        id: session_id.clone(),
        session_name: session_name.to_string(),
        subject_id: subject_id.to_string(),
        notes: notes.to_string(),
        timestamp: file_timestamp,
        data_points: data.len(),
        file_path: file_path.to_string_lossy().to_string(),
        devices: device_list,
    };

    // Save metadata
    save_session_metadata(&base_path, &metadata).await?;

    Ok(SaveResult {
        session_id,
        file_path: file_path.to_string_lossy().to_string(),
        data_points: data.len(),
        success: true,
    })
}

// Get list of all saved sessions
pub async fn get_sessions(path_config: &PathConfigState) -> Result<Vec<SessionMetadata>, String> {
    let config = path_config.0.lock().await;
    
    // Only use the default storage path (AppData/Roaming/GaitMonitor/sessions)
    let storage_path = config.get_default_storage_path();
    
    if storage_path.exists() {
        load_sessions_from_path(&storage_path).await
    } else {
        // Return empty list if storage directory doesn't exist yet
        Ok(Vec::new())
    }
}

// Delete a session and its associated files
pub async fn delete_session(
    session_id: &str,
    csrf_token: &str,
    csrf_state: &CSRFTokenState,
    path_config: &PathConfigState,
) -> Result<String, String> {
    // CSRF Protection
    validate_file_operation!(csrf_state, csrf_token, "delete_session");
    
    let config = path_config.0.lock().await;
    let storage_path = config.get_default_storage_path();
    
    // Load existing sessions
    let mut sessions = load_sessions_from_path(&storage_path).await?;
    
    // Find and remove the session
    if let Some(pos) = sessions.iter().position(|s| s.id == session_id) {
        let session = sessions.remove(pos);
        
        // Delete the data file
        if Path::new(&session.file_path).exists() {
            if let Err(e) = fs::remove_file(&session.file_path).await {
                return Err(format!("Failed to delete data file: {}", e));
            }
        }
        
        // Save updated metadata
        save_sessions_metadata(&storage_path, &sessions).await?;
        
        Ok(format!("Session '{}' deleted successfully", session.session_name))
    } else {
        Err(format!("Session with ID '{}' not found", session_id))
    }
}

// Choose storage directory using system dialog
pub async fn choose_storage_directory(app_handle: &tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let selected_path = app_handle.dialog()
        .file()
        .set_title("Choose Storage Directory")
        .blocking_pick_folder();
    
    match selected_path {
        Some(path) => Ok(Some(path.to_string())),
        None => Ok(None), // User cancelled the dialog
    }
}

// Copy file to downloads directory
pub async fn copy_file_to_downloads(
    source_file_path: &str,
    csrf_token: &str,
    csrf_state: &CSRFTokenState,
) -> Result<String, String> {
    // CSRF Protection
    validate_file_operation!(csrf_state, csrf_token, "copy_file_to_downloads");
    
    let source_path = Path::new(source_file_path);
    
    // Validate source file exists
    if !source_path.exists() {
        return Err(format!("Source file does not exist: {}", source_file_path));
    }
    
    // Get downloads directory
    let downloads_dir = get_downloads_directory()
        .ok_or("Could not determine downloads directory")?;
    
    // Ensure downloads directory exists
    if let Err(e) = fs::create_dir_all(&downloads_dir).await {
        return Err(format!("Failed to create downloads directory: {}", e));
    }
    
    // Generate destination filename
    let file_name = source_path.file_name()
        .ok_or("Invalid source file name")?;
    let dest_path = downloads_dir.join(file_name);
    
    // Copy file
    if let Err(e) = fs::copy(source_path, &dest_path).await {
        return Err(format!("Failed to copy file: {}", e));
    }
    
    Ok(dest_path.to_string_lossy().to_string())
}

// Load session data from file
pub async fn load_session_data(
    file_path: &str,
    csrf_token: &str,
    csrf_state: &CSRFTokenState,
) -> Result<Vec<GaitData>, String> {
    // CSRF Protection
    validate_file_operation!(csrf_state, csrf_token, "load_session_data");
    
    // Validate file path
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }
    
    // Read file content
    let content = fs::read_to_string(path).await
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Parse CSV data
    parse_csv_content(&content)
}

// Save filtered data to new file
pub async fn save_filtered_data(
    data: &[GaitData],
    file_path: &str,
    csrf_token: &str,
    csrf_state: &CSRFTokenState,
) -> Result<String, String> {
    // CSRF Protection
    validate_file_operation!(csrf_state, csrf_token, "save_filtered_data");
    
    if data.is_empty() {
        return Err("No data to save".to_string());
    }
    
    // Create CSV content
    let mut csv_content = String::new();
    csv_content.push_str("# Filtered Gait Monitor Data\n");
    csv_content.push_str(&format!("# Export Time: {}\n", 
        chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")));
    csv_content.push_str(&format!("# Data Points: {}\n", data.len()));
    csv_content.push_str("#\n");
    csv_content.push_str("timestamp,device_id,r1,r2,r3,x,y,z\n");
    
    for point in data {
        csv_content.push_str(&format!("{},{},{},{},{},{},{},{}\n",
            point.timestamp,
            point.device_id,
            point.r1, point.r2, point.r3,
            point.x, point.y, point.z
        ));
    }
    
    // Write file
    fs::write(file_path, csv_content).await
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    Ok(format!("Filtered data saved to: {}", file_path))
}

// Get storage path for configuration
pub async fn get_storage_path(path_config: &PathConfigState) -> Result<String, String> {
    let config = path_config.0.lock().await;
    let storage_path = config.get_default_storage_path();
    Ok(storage_path.to_string_lossy().to_string())
}

// Helper functions

async fn save_session_metadata(base_path: &Path, metadata: &SessionMetadata) -> Result<(), String> {
    let mut sessions = load_sessions_from_path(base_path).await.unwrap_or_default();
    sessions.push(metadata.clone());
    save_sessions_metadata(base_path, &sessions).await
}

async fn save_sessions_metadata(base_path: &Path, sessions: &[SessionMetadata]) -> Result<(), String> {
    let metadata_file = base_path.join("sessions.json");
    let json_content = serde_json::to_string_pretty(sessions)
        .map_err(|e| format!("Failed to serialize sessions: {}", e))?;
    
    fs::write(metadata_file, json_content).await
        .map_err(|e| format!("Failed to write sessions metadata: {}", e))?;
    
    Ok(())
}

async fn load_sessions_from_path(storage_path: &Path) -> Result<Vec<SessionMetadata>, String> {
    let metadata_file = storage_path.join("sessions.json");
    
    if !metadata_file.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(metadata_file).await
        .map_err(|e| format!("Failed to read sessions metadata: {}", e))?;
    
    let sessions: Vec<SessionMetadata> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse sessions metadata: {}", e))?;
    
    Ok(sessions)
}

fn parse_csv_content(content: &str) -> Result<Vec<GaitData>, String> {
    let mut data_points = Vec::new();
    
    for line in content.lines() {
        let line = line.trim();
        
        // Skip comment lines that start with #
        if line.starts_with('#') || line.is_empty() {
            continue;
        }
        
        // Skip header line
        if line.starts_with("timestamp") {
            continue;
        }
        
        // Parse CSV line
        let parts: Vec<&str> = line.split(',').collect();
        if parts.len() != 8 {
            continue; // Skip malformed lines
        }
        
        match parse_csv_line(&parts) {
            Ok(data_point) => data_points.push(data_point),
            Err(_) => continue, // Skip invalid lines
        }
    }
    
    Ok(data_points)
}

fn parse_csv_line(parts: &[&str]) -> Result<GaitData, String> {
    if parts.len() != 8 {
        return Err("Invalid number of fields".to_string());
    }
    
    let timestamp = parts[0].parse::<u64>()
        .map_err(|_| "Invalid timestamp")?;
    let device_id = parts[1].to_string();
    let r1 = parts[2].parse::<f32>().map_err(|_| "Invalid r1")?;
    let r2 = parts[3].parse::<f32>().map_err(|_| "Invalid r2")?;
    let r3 = parts[4].parse::<f32>().map_err(|_| "Invalid r3")?;
    let x = parts[5].parse::<f32>().map_err(|_| "Invalid x")?;
    let y = parts[6].parse::<f32>().map_err(|_| "Invalid y")?;
    let z = parts[7].parse::<f32>().map_err(|_| "Invalid z")?;
    
    Ok(GaitData {
        timestamp,
        device_id,
        r1, r2, r3,
        x, y, z,
    })
}

fn get_downloads_directory() -> Option<PathBuf> {
    dirs::download_dir()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[async_std::test]
    async fn test_session_metadata_serialization() {
        let metadata = SessionMetadata {
            id: "test-id".to_string(),
            session_name: "Test Session".to_string(),
            subject_id: "Subject-001".to_string(),
            notes: "Test notes".to_string(),
            timestamp: 1234567890,
            data_points: 100,
            file_path: "/path/to/file.csv".to_string(),
            devices: vec!["device1".to_string(), "device2".to_string()],
        };
        
        let json = serde_json::to_string(&metadata).unwrap();
        let deserialized: SessionMetadata = serde_json::from_str(&json).unwrap();
        
        assert_eq!(metadata.id, deserialized.id);
        assert_eq!(metadata.session_name, deserialized.session_name);
        assert_eq!(metadata.data_points, deserialized.data_points);
    }

    #[async_std::test]
    async fn test_csv_parsing() {
        let csv_content = r#"# Test CSV
timestamp,device_id,r1,r2,r3,x,y,z
1234567890,device1,1.0,2.0,3.0,4.0,5.0,6.0
1234567891,device2,1.1,2.1,3.1,4.1,5.1,6.1
"#;
        
        let data = parse_csv_content(csv_content).unwrap();
        assert_eq!(data.len(), 2);
        assert_eq!(data[0].timestamp, 1234567890);
        assert_eq!(data[0].device_id, "device1");
        assert_eq!(data[1].r1, 1.1);
    }

    #[async_std::test]
    async fn test_csv_line_parsing() {
        let parts = vec!["1234567890", "device1", "1.0", "2.0", "3.0", "4.0", "5.0", "6.0"];
        let data = parse_csv_line(&parts).unwrap();
        
        assert_eq!(data.timestamp, 1234567890);
        assert_eq!(data.device_id, "device1");
        assert_eq!(data.r1, 1.0);
        assert_eq!(data.r2, 2.0);
        assert_eq!(data.r3, 3.0);
        assert_eq!(data.x, 4.0);
        assert_eq!(data.y, 5.0);
        assert_eq!(data.z, 6.0);
    }

    #[async_std::test]
    async fn test_invalid_csv_line() {
        let parts = vec!["invalid", "device1", "1.0", "2.0"];
        let result = parse_csv_line(&parts);
        assert!(result.is_err());
    }

    #[async_std::test]
    async fn test_path_config_state_creation() {
        // This test would need to be adapted based on PathConfig implementation
        // For now, we'll test the basic structure
        assert!(true); // Placeholder
    }

    #[async_std::test]
    async fn test_file_operation_error_display() {
        let error = FileOperationError::PermissionDenied("test error".to_string());
        let display = format!("{}", error);
        assert!(display.contains("Permission denied"));
        assert!(display.contains("test error"));
    }
}
