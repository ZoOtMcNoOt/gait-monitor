use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use regex::Regex;
use chrono::{DateTime, Utc};

// Audit logging structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationAuditLog {
    pub timestamp: DateTime<Utc>,
    pub operation: String,
    pub field: String,
    pub value_hash: String, // Hash of the value for privacy
    pub error: Option<String>,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

impl ValidationAuditLog {
    pub fn new(operation: &str, field: &str, value: &str, error: Option<&str>) -> Self {
        use sha2::{Sha256, Digest};
        
        let mut hasher = Sha256::new();
        hasher.update(value.as_bytes());
        let value_hash = format!("{:x}", hasher.finalize());
        
        Self {
            timestamp: Utc::now(),
            operation: operation.to_string(),
            field: field.to_string(),
            value_hash,
            error: error.map(|e| e.to_string()),
            ip_address: None,
            user_agent: None,
        }
    }
}

// Validation error types
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationError {
    InvalidSessionName(String),
    InvalidSubjectId(String),
    InvalidNotes(String),
    InvalidDeviceId(String),
    DuplicateSession(String),
    InvalidPath(String),
    InvalidTimestamp(String),
}

impl std::fmt::Display for ValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ValidationError::InvalidSessionName(msg) => write!(f, "Invalid session name: {}", msg),
            ValidationError::InvalidSubjectId(msg) => write!(f, "Invalid subject ID: {}", msg),
            ValidationError::InvalidNotes(msg) => write!(f, "Invalid notes: {}", msg),
            ValidationError::InvalidDeviceId(msg) => write!(f, "Invalid device ID: {}", msg),
            ValidationError::DuplicateSession(msg) => write!(f, "Duplicate session: {}", msg),
            ValidationError::InvalidPath(msg) => write!(f, "Invalid path: {}", msg),
            ValidationError::InvalidTimestamp(msg) => write!(f, "Invalid timestamp: {}", msg),
        }
    }
}

impl std::error::Error for ValidationError {}

// Validation result type
pub type ValidationResult<T = ()> = Result<T, ValidationError>;

// Session metadata validation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidatedSessionMetadata {
    pub session_name: String,
    pub subject_id: String,
    pub notes: String,
    pub timestamp: String,
    pub devices: Vec<String>,
}

// Validation rules and constants
#[derive(Clone)]
pub struct ValidationRules {
    // Session name rules
    pub session_name_min_length: usize,
    pub session_name_max_length: usize,
    pub session_name_pattern: Regex,
    
    // Subject ID rules
    pub subject_id_min_length: usize,
    pub subject_id_max_length: usize,
    pub subject_id_pattern: Regex,
    
    // Notes rules
    pub notes_max_length: usize,
    
    // Device ID rules
    pub device_id_pattern: Regex,
    
    // Forbidden characters and keywords
    pub forbidden_chars: HashSet<char>,
    pub reserved_keywords: HashSet<String>,
}

impl Default for ValidationRules {
    fn default() -> Self {
        let mut forbidden_chars = HashSet::new();
        forbidden_chars.extend(['<', '>', ':', '"', '|', '?', '*', '\\', '/', '\0']);
        
        let mut reserved_keywords = HashSet::new();
        reserved_keywords.extend([
            "CON".to_string(), "PRN".to_string(), "AUX".to_string(), "NUL".to_string(),
            "COM1".to_string(), "COM2".to_string(), "COM3".to_string(), "COM4".to_string(),
            "COM5".to_string(), "COM6".to_string(), "COM7".to_string(), "COM8".to_string(),
            "COM9".to_string(), "LPT1".to_string(), "LPT2".to_string(), "LPT3".to_string(),
            "LPT4".to_string(), "LPT5".to_string(), "LPT6".to_string(), "LPT7".to_string(),
            "LPT8".to_string(), "LPT9".to_string(),
        ]);
        
        Self {
            session_name_min_length: 1,
            session_name_max_length: 100,
            session_name_pattern: Regex::new(r"^[a-zA-Z0-9_\-\s]+$").unwrap(),
            
            subject_id_min_length: 1,
            subject_id_max_length: 50,
            subject_id_pattern: Regex::new(r"^[a-zA-Z0-9_\-]+$").unwrap(),
            
            notes_max_length: 1000,
            
            device_id_pattern: Regex::new(r"^[a-fA-F0-9\-:]+$").unwrap(),
            
            forbidden_chars,
            reserved_keywords,
        }
    }
}

// Main validation struct
#[derive(Clone)]
pub struct Validator {
    rules: ValidationRules,
    audit_logs: std::sync::Arc<std::sync::Mutex<Vec<ValidationAuditLog>>>,
}

impl Default for Validator {
    fn default() -> Self {
        Self::new()
    }
}

impl Validator {
    pub fn new() -> Self {
        Self {
            rules: ValidationRules::default(),
            audit_logs: std::sync::Arc::new(std::sync::Mutex::new(Vec::new())),
        }
    }
    
    // Add audit logging
    fn log_validation(&self, operation: &str, field: &str, value: &str, error: Option<&str>) {
        let log_entry = ValidationAuditLog::new(operation, field, value, error);
        if let Ok(mut logs) = self.audit_logs.lock() {
            // Keep only the last 1000 entries to prevent memory growth
            if logs.len() >= 1000 {
                let keep_count = logs.len() - 1000 + 1;
                logs.drain(0..keep_count);
            }
            logs.push(log_entry);
        }
    }
    
    // Get audit logs (for monitoring)
    pub fn get_audit_logs(&self) -> Vec<ValidationAuditLog> {
        match self.audit_logs.lock() {
            Ok(logs) => logs.clone(),
            Err(_) => Vec::new(),
        }
    }
    
    /// Validate session name
    pub fn validate_session_name(&self, session_name: &str) -> ValidationResult<String> {
        let result = self._validate_session_name(session_name);
        
        // Log the validation attempt
        let error_msg = result.as_ref().err().map(|e| e.to_string());
        self.log_validation("validate_session_name", "session_name", session_name, error_msg.as_deref());
        
        result
    }
    
    fn _validate_session_name(&self, session_name: &str) -> ValidationResult<String> {
        let trimmed = session_name.trim();
        
        // Check length
        if trimmed.len() < self.rules.session_name_min_length {
            return Err(ValidationError::InvalidSessionName(
                format!("Session name must be at least {} characters long", 
                       self.rules.session_name_min_length)
            ));
        }
        
        if trimmed.len() > self.rules.session_name_max_length {
            return Err(ValidationError::InvalidSessionName(
                format!("Session name must be no more than {} characters long", 
                       self.rules.session_name_max_length)
            ));
        }
        
        // Check pattern
        if !self.rules.session_name_pattern.is_match(trimmed) {
            return Err(ValidationError::InvalidSessionName(
                "Session name can only contain letters, numbers, spaces, hyphens, and underscores".to_string()
            ));
        }
        
        // Check forbidden characters
        for &ch in &self.rules.forbidden_chars {
            if trimmed.contains(ch) {
                return Err(ValidationError::InvalidSessionName(
                    format!("Session name cannot contain the character '{}'", ch)
                ));
            }
        }
        
        // Check reserved keywords
        let upper_name = trimmed.to_uppercase();
        if self.rules.reserved_keywords.contains(&upper_name) {
            return Err(ValidationError::InvalidSessionName(
                format!("'{}' is a reserved name and cannot be used", trimmed)
            ));
        }
        
        Ok(trimmed.to_string())
    }
    
    /// Validate subject ID
    pub fn validate_subject_id(&self, subject_id: &str) -> ValidationResult<String> {
        let trimmed = subject_id.trim();
        
        // Check length
        if trimmed.len() < self.rules.subject_id_min_length {
            return Err(ValidationError::InvalidSubjectId(
                format!("Subject ID must be at least {} characters long", 
                       self.rules.subject_id_min_length)
            ));
        }
        
        if trimmed.len() > self.rules.subject_id_max_length {
            return Err(ValidationError::InvalidSubjectId(
                format!("Subject ID must be no more than {} characters long", 
                       self.rules.subject_id_max_length)
            ));
        }
        
        // Check pattern
        if !self.rules.subject_id_pattern.is_match(trimmed) {
            return Err(ValidationError::InvalidSubjectId(
                "Subject ID can only contain letters, numbers, hyphens, and underscores".to_string()
            ));
        }
        
        // Check forbidden characters
        for &ch in &self.rules.forbidden_chars {
            if trimmed.contains(ch) {
                return Err(ValidationError::InvalidSubjectId(
                    format!("Subject ID cannot contain the character '{}'", ch)
                ));
            }
        }
        
        Ok(trimmed.to_string())
    }
    
    /// Validate notes
    pub fn validate_notes(&self, notes: &str) -> ValidationResult<String> {
        let trimmed = notes.trim();
        
        // Check length
        if trimmed.len() > self.rules.notes_max_length {
            return Err(ValidationError::InvalidNotes(
                format!("Notes must be no more than {} characters long", 
                       self.rules.notes_max_length)
            ));
        }
        
        // Check for forbidden characters (but allow more flexibility for notes)
        let dangerous_chars = ['<', '>', '\0'];
        for &ch in &dangerous_chars {
            if trimmed.contains(ch) {
                return Err(ValidationError::InvalidNotes(
                    format!("Notes cannot contain the character '{}'", ch)
                ));
            }
        }
        
        Ok(trimmed.to_string())
    }
    
    /// Validate device ID
    pub fn validate_device_id(&self, device_id: &str) -> ValidationResult<String> {
        let trimmed = device_id.trim();
        
        if trimmed.is_empty() {
            return Err(ValidationError::InvalidDeviceId(
                "Device ID cannot be empty".to_string()
            ));
        }
        
        // Check pattern (UUID or MAC address format)
        if !self.rules.device_id_pattern.is_match(trimmed) {
            return Err(ValidationError::InvalidDeviceId(
                "Device ID must be in UUID or MAC address format".to_string()
            ));
        }
        
        Ok(trimmed.to_string())
    }
    
    /// Validate timestamp
    pub fn validate_timestamp(&self, timestamp: &str) -> ValidationResult<String> {
        // Try to parse as ISO 8601 format
        if chrono::DateTime::parse_from_rfc3339(timestamp).is_err() {
            return Err(ValidationError::InvalidTimestamp(
                "Timestamp must be in ISO 8601 format".to_string()
            ));
        }
        
        Ok(timestamp.to_string())
    }
    
    /// Validate complete session metadata
    pub fn validate_session_metadata(
        &self,
        session_name: &str,
        subject_id: &str,
        notes: &str,
        timestamp: &str,
        devices: &[String],
    ) -> ValidationResult<ValidatedSessionMetadata> {
        let validated_session_name = self.validate_session_name(session_name)?;
        let validated_subject_id = self.validate_subject_id(subject_id)?;
        let validated_notes = self.validate_notes(notes)?;
        let validated_timestamp = self.validate_timestamp(timestamp)?;
        
        // Validate all device IDs
        if devices.is_empty() {
            return Err(ValidationError::InvalidDeviceId("At least one device must be specified".to_string()));
        }
        
        let mut validated_devices = Vec::new();
        for device_id in devices {
            let validated_device = self.validate_device_id(device_id)?;
            validated_devices.push(validated_device);
        }
        
        Ok(ValidatedSessionMetadata {
            session_name: validated_session_name,
            subject_id: validated_subject_id,
            notes: validated_notes,
            timestamp: validated_timestamp,
            devices: validated_devices,
        })
    }
    
    /// Check if session name would create a duplicate file
    pub fn check_session_uniqueness(
        &self,
        session_name: &str,
        existing_sessions: &[String],
    ) -> ValidationResult<()> {
        let normalized_name = session_name.trim().to_lowercase();
        
        for existing in existing_sessions {
            if existing.trim().to_lowercase() == normalized_name {
                return Err(ValidationError::DuplicateSession(
                    format!("A session named '{}' already exists", session_name)
                ));
            }
        }
        
        Ok(())
    }
    
    /// Validate file path for safety
    pub fn validate_file_path(&self, path: &str) -> ValidationResult<String> {
        use std::path::Path;
        
        let path_obj = Path::new(path);
        
        // Check for path traversal attempts
        if path.contains("..") {
            return Err(ValidationError::InvalidPath(
                "Path cannot contain '..' (path traversal)".to_string()
            ));
        }
        
        // Check for absolute paths in user input
        if path_obj.is_absolute() && !path.starts_with("C:\\") && !path.starts_with("/") {
            return Err(ValidationError::InvalidPath(
                "Suspicious absolute path detected".to_string()
            ));
        }
        
        // Check filename components
        for component in path_obj.components() {
            if let std::path::Component::Normal(name) = component {
                if let Some(name_str) = name.to_str() {
                    // Check for forbidden characters in filename
                    for &ch in &self.rules.forbidden_chars {
                        if name_str.contains(ch) {
                            return Err(ValidationError::InvalidPath(
                                format!("Filename cannot contain the character '{}'", ch)
                            ));
                        }
                    }
                    
                    // Check for reserved names
                    let upper_name = name_str.to_uppercase();
                    if self.rules.reserved_keywords.contains(&upper_name) {
                        return Err(ValidationError::InvalidPath(
                            format!("'{}' is a reserved filename", name_str)
                        ));
                    }
                }
            }
        }
        
        Ok(path.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_session_name() {
        let validator = Validator::new();
        
        // Valid names
        assert!(validator.validate_session_name("Test Session").is_ok());
        assert!(validator.validate_session_name("Test_Session_123").is_ok());
        assert!(validator.validate_session_name("Session-1").is_ok());
        
        // Invalid names
        assert!(validator.validate_session_name("").is_err());
        assert!(validator.validate_session_name("Test<Session").is_err());
        assert!(validator.validate_session_name("CON").is_err());
        assert!(validator.validate_session_name("a".repeat(200).as_str()).is_err());
    }
    
    #[test]
    fn test_validate_subject_id() {
        let validator = Validator::new();
        
        // Valid IDs
        assert!(validator.validate_subject_id("Subject123").is_ok());
        assert!(validator.validate_subject_id("SUB_001").is_ok());
        assert!(validator.validate_subject_id("test-subject").is_ok());
        
        // Invalid IDs
        assert!(validator.validate_subject_id("").is_err());
        assert!(validator.validate_subject_id("Subject 123").is_err()); // spaces not allowed
        assert!(validator.validate_subject_id("Sub<ject").is_err());
    }
    
    #[test]
    fn test_validate_device_id() {
        let validator = Validator::new();
        
        // Valid device IDs
        assert!(validator.validate_device_id("12345678-1234-1234-1234-123456789abc").is_ok());
        assert!(validator.validate_device_id("AA:BB:CC:DD:EE:FF").is_ok());
        assert!(validator.validate_device_id("aabbccddeeff").is_ok());
        
        // Invalid device IDs
        assert!(validator.validate_device_id("").is_err());
        assert!(validator.validate_device_id("invalid_device_id").is_err());
    }
    
    #[test]
    fn test_session_uniqueness() {
        let validator = Validator::new();
        let existing = vec!["Session1".to_string(), "Session2".to_string()];
        
        // Should pass for new session
        assert!(validator.check_session_uniqueness("Session3", &existing).is_ok());
        
        // Should fail for duplicate (case insensitive)
        assert!(validator.check_session_uniqueness("session1", &existing).is_err());
        assert!(validator.check_session_uniqueness("SESSION2", &existing).is_err());
    }
}
