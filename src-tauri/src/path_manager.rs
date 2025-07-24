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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_config_creation() {
        let config = PathConfig::new();
        assert!(config.is_ok(), "PathConfig creation should succeed");
        
        let config = config.unwrap();
        assert!(!config.app_data_dir.as_os_str().is_empty(), "App data directory should not be empty");
        assert!(!config.allowed_base_dirs.is_empty(), "Should have at least one allowed base directory");
    }

    #[test]
    fn test_filename_sanitization() {
        let test_cases = vec![
            ("valid_filename.txt", "valid_filename.txt"),
            ("file with spaces.txt", "file with spaces.txt"),
            ("file/with\\dangerous:chars?.txt", "file_with_dangerous_chars_.txt"),
            ("file<with>more|dangerous\"chars*.txt", "file_with_more_dangerous_chars_.txt"),
        ];

        for (input, expected) in test_cases {
            let result = PathConfig::sanitize_filename(input);
            assert_eq!(result, expected, "Sanitization failed for input: {}", input);
        }
    }

    #[test]
    fn test_default_storage_path() {
        let config = PathConfig::new().expect("Failed to create PathConfig");
        let storage_path = config.get_default_storage_path();
        
        assert!(storage_path.ends_with("sessions"), "Default storage path should end with 'sessions'");
        assert!(storage_path.starts_with(&config.app_data_dir), "Storage path should be within app data directory");
    }
}
