use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use async_std::sync::Mutex;
use dashmap::DashMap;
use governor::{Quota, RateLimiter, DefaultDirectRateLimiter};
use nonzero_ext::*;
use sha2::{Sha256, Digest};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use serde::Serialize;
use tracing::{info, warn, error};
use tauri;

// Rate limiting structure for general operations
#[derive(Clone)]
pub struct CustomRateLimiter {
    last_operation: Instant,
    min_interval: Duration,
}

impl CustomRateLimiter {
    pub fn new(min_interval_ms: u64) -> Self {
        Self {
            last_operation: Instant::now() - Duration::from_millis(min_interval_ms + 1),
            min_interval: Duration::from_millis(min_interval_ms),
        }
    }

    pub fn can_proceed(&mut self) -> bool {
        let now = Instant::now();
        if now.duration_since(self.last_operation) >= self.min_interval {
            self.last_operation = now;
            true
        } else {
            false
        }
    }

    pub fn time_until_next(&self) -> Duration {
        let elapsed = Instant::now().duration_since(self.last_operation);
        if elapsed >= self.min_interval {
            Duration::from_millis(0)
        } else {
            self.min_interval - elapsed
        }
    }
}

// Global rate limiting state
#[derive(Clone)]
pub struct RateLimitingState(pub Arc<Mutex<HashMap<String, CustomRateLimiter>>>);

impl RateLimitingState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

// Security event types for logging
#[derive(Debug, Clone, Serialize)]
pub enum SecurityEvent {
    TokenGenerated { timestamp: u64, token_id: String },
    TokenValidated { timestamp: u64, token_id: String, success: bool },
    TokenRefreshed { timestamp: u64, old_token_id: String, new_token_id: String },
    TokenExpired { timestamp: u64, token_id: String },
    RateLimitExceeded { timestamp: u64, operation: String },
    SuspiciousActivity { timestamp: u64, details: String },
    CSRFAttackDetected { timestamp: u64, provided_token: String, expected_token: String },
}

// Enhanced CSRF token with metadata
#[derive(Debug, Clone)]
pub struct CSRFToken {
    value: String,
    id: String,
    #[allow(dead_code)]
    created_at: Instant,
    expires_at: Instant,
    usage_count: u32,
    last_used: Option<Instant>,
}

impl CSRFToken {
    fn new(lifetime: Duration) -> Self {
        let now = Instant::now();
        let id = uuid::Uuid::new_v4().to_string();
        let value = Self::generate_secure_token(&id);
        
        Self {
            value,
            id,
            created_at: now,
            expires_at: now + lifetime,
            usage_count: 0,
            last_used: None,
        }
    }
    
    fn generate_secure_token(id: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(id.as_bytes());
        hasher.update(&SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos().to_be_bytes());
        hasher.update(uuid::Uuid::new_v4().as_bytes());
        BASE64.encode(hasher.finalize())
    }
    
    fn is_expired(&self) -> bool {
        Instant::now() > self.expires_at
    }
    
    fn mark_used(&mut self) {
        self.usage_count += 1;
        self.last_used = Some(Instant::now());
    }
}

// Rate limiter configuration
const TOKEN_REFRESH_QUOTA: Quota = Quota::per_minute(nonzero!(10u32));
const TOKEN_VALIDATION_QUOTA: Quota = Quota::per_minute(nonzero!(100u32));
const FILE_OPERATION_QUOTA: Quota = Quota::per_minute(nonzero!(30u32)); // 30 file operations per minute

#[derive(Clone)]
pub struct CSRFTokenState {
    current_token: Arc<Mutex<Option<CSRFToken>>>,
    token_lifetime: Duration,
    refresh_rate_limiter: Arc<DefaultDirectRateLimiter>,
    validation_rate_limiter: Arc<DefaultDirectRateLimiter>,
    file_operation_rate_limiter: Arc<DefaultDirectRateLimiter>,
    security_events: Arc<Mutex<Vec<SecurityEvent>>>,
    attack_attempts: Arc<DashMap<String, u32>>,
}

impl CSRFTokenState {
    pub fn new() -> Self {
        let token_lifetime = Duration::from_secs(3600); // 1 hour default
        let initial_token = CSRFToken::new(token_lifetime);
        
        let state = Self {
            current_token: Arc::new(Mutex::new(Some(initial_token.clone()))),
            token_lifetime,
            refresh_rate_limiter: Arc::new(RateLimiter::direct(TOKEN_REFRESH_QUOTA)),
            validation_rate_limiter: Arc::new(RateLimiter::direct(TOKEN_VALIDATION_QUOTA)),
            file_operation_rate_limiter: Arc::new(RateLimiter::direct(FILE_OPERATION_QUOTA)),
            security_events: Arc::new(Mutex::new(Vec::new())),
            attack_attempts: Arc::new(DashMap::new()),
        };
        
        // Initial token will be logged when first accessed
        state
    }
    
    pub async fn validate_token(&self, provided_token: &str) -> bool {
        // Rate limiting for validation attempts
        if self.validation_rate_limiter.check().is_err() {
            self.log_security_event(SecurityEvent::RateLimitExceeded {
                timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                operation: "token_validation".to_string(),
            }).await;
            warn!("CSRF token validation rate limit exceeded");
            return false;
        }
        
        let mut token_guard = self.current_token.lock().await;
        
        if let Some(ref mut token) = *token_guard {
            // Check if token is expired
            if token.is_expired() {
                self.log_security_event(SecurityEvent::TokenExpired {
                    timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                    token_id: token.id.clone(),
                }).await;
                *token_guard = None;
                return false;
            }
            
            let is_valid = token.value == provided_token;
            
            if is_valid {
                token.mark_used();
                self.log_security_event(SecurityEvent::TokenValidated {
                    timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                    token_id: token.id.clone(),
                    success: true,
                }).await;
                true
            } else {
                // Potential CSRF attack detected
                self.detect_csrf_attack(provided_token, &token.value).await;
                self.log_security_event(SecurityEvent::TokenValidated {
                    timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                    token_id: token.id.clone(),
                    success: false,
                }).await;
                false
            }
        } else {
            false
        }
    }
    
    pub async fn get_token(&self) -> Option<String> {
        let mut token_guard = self.current_token.lock().await;
        
        if let Some(ref token) = *token_guard {
            if token.is_expired() {
                self.log_security_event(SecurityEvent::TokenExpired {
                    timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                    token_id: token.id.clone(),
                }).await;
                *token_guard = None;
                None
            } else {
                Some(token.value.clone())
            }
        } else {
            None
        }
    }
    
    pub async fn refresh_token(&self) -> Result<String, String> {
        // Rate limiting for token refresh
        if self.refresh_rate_limiter.check().is_err() {
            self.log_security_event(SecurityEvent::RateLimitExceeded {
                timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                operation: "token_refresh".to_string(),
            }).await;
            return Err("Token refresh rate limit exceeded".to_string());
        }
        
        let mut token_guard = self.current_token.lock().await;
        let old_token_id = token_guard.as_ref().map(|t| t.id.clone()).unwrap_or_else(|| "none".to_string());
        
        let new_token = CSRFToken::new(self.token_lifetime);
        let new_token_value = new_token.value.clone();
        let new_token_id = new_token.id.clone();
        
        *token_guard = Some(new_token);
        
        self.log_security_event(SecurityEvent::TokenRefreshed {
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
            old_token_id,
            new_token_id,
        }).await;
        
        Ok(new_token_value)
    }
    
    async fn detect_csrf_attack(&self, provided_token: &str, expected_token: &str) {
        // Track attack attempts from specific tokens
        let attack_count = self.attack_attempts.entry(provided_token.to_string())
            .and_modify(|count| *count += 1)
            .or_insert(1);
        
        if *attack_count >= 3 {
            self.log_security_event(SecurityEvent::SuspiciousActivity {
                timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
                details: format!("Multiple failed CSRF token attempts with token: {}", provided_token),
            }).await;
            error!("Potential CSRF attack detected: multiple failed attempts with token {}", provided_token);
        }
        
        self.log_security_event(SecurityEvent::CSRFAttackDetected {
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs(),
            provided_token: provided_token.to_string(),
            expected_token: expected_token.to_string(),
        }).await;
        
        warn!("CSRF attack detected: invalid token provided");
    }
    
    async fn log_security_event(&self, event: SecurityEvent) {
        let mut events = self.security_events.lock().await;
        
        // Log to structured logging
        match &event {
            SecurityEvent::TokenGenerated { token_id, .. } => {
                info!("CSRF token generated: {}", token_id);
            },
            SecurityEvent::TokenValidated { token_id, success, .. } => {
                info!("CSRF token validation: {} - {}", token_id, if *success { "SUCCESS" } else { "FAILED" });
            },
            SecurityEvent::CSRFAttackDetected { .. } => {
                error!("CSRF attack detected: {}", serde_json::to_string(&event).unwrap_or_default());
            },
            _ => {
                info!("Security event: {}", serde_json::to_string(&event).unwrap_or_default());
            }
        }
        
        events.push(event);
        
        // Keep only last 1000 events to prevent memory issues
        if events.len() > 1000 {
            let len = events.len();
            events.drain(0..len - 1000);
        }
    }
    
    pub async fn get_security_events(&self) -> Vec<SecurityEvent> {
        self.security_events.lock().await.clone()
    }
    
    pub async fn validate_file_operation(&self, operation_name: &str) -> bool {
        // Check rate limit for file operations
        if self.file_operation_rate_limiter.check().is_err() {
            warn!("File operation rate limit exceeded for: {}", operation_name);
            self.log_security_event(SecurityEvent::RateLimitExceeded {
                timestamp: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs(),
                operation: operation_name.to_string(),
            }).await;
            return false;
        }
        true
    }
    
    pub async fn cleanup_expired_attack_attempts(&self) {
        // Remove old attack attempt records (older than 1 hour)
        self.attack_attempts.retain(|_, _| {
            // In a production system, you'd want to track timestamps for each attempt
            // For now, we'll periodically clear all attempts
            false
        });
    }
}

// Enhanced macro to validate CSRF token for protected commands
#[macro_export]
macro_rules! validate_csrf {
    ($csrf_state:expr, $token:expr) => {
        if !$csrf_state.validate_token($token).await {
            return Err("Invalid or expired CSRF token. Please refresh and try again.".to_string());
        }
    };
}

// Enhanced macro to validate CSRF token AND rate limiting for file operations
#[macro_export]
macro_rules! validate_file_operation {
    ($csrf_state:expr, $token:expr, $operation_name:expr) => {
        if !$csrf_state.validate_token($token).await {
            return Err("Invalid or expired CSRF token. Please refresh and try again.".to_string());
        }
        if !$csrf_state.validate_file_operation($operation_name).await {
            return Err("Rate limit exceeded for file operations. Please wait before trying again.".to_string());
        }
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_std::test;

    #[test]
    async fn test_csrf_token_creation() {
        let state = CSRFTokenState::new();
        let token = state.get_token().await;
        assert!(token.is_some(), "Should have an initial token");
        
        let token_value = token.unwrap();
        assert!(!token_value.is_empty(), "Token should not be empty");
        assert!(token_value.len() > 10, "Token should be substantial length");
    }

    #[test]
    async fn test_token_validation() {
        let state = CSRFTokenState::new();
        let token = state.get_token().await.unwrap();
        
        // Valid token should pass
        assert!(state.validate_token(&token).await, "Valid token should pass validation");
        
        // Invalid token should fail
        assert!(!state.validate_token("invalid_token").await, "Invalid token should fail validation");
    }

    #[test]
    async fn test_token_refresh() {
        let state = CSRFTokenState::new();
        let original_token = state.get_token().await.unwrap();
        
        let new_token = state.refresh_token().await;
        assert!(new_token.is_ok(), "Token refresh should succeed");
        
        let new_token_value = new_token.unwrap();
        assert_ne!(original_token, new_token_value, "New token should be different from original");
        
        // Original token should no longer be valid
        assert!(!state.validate_token(&original_token).await, "Original token should be invalid after refresh");
        
        // New token should be valid
        assert!(state.validate_token(&new_token_value).await, "New token should be valid");
    }

    #[test]
    async fn test_security_event_logging() {
        let state = CSRFTokenState::new();
        
        // Trigger a validation event
        let token = state.get_token().await.unwrap();
        state.validate_token(&token).await;
        
        let events = state.get_security_events().await;
        assert!(!events.is_empty(), "Should have logged security events");
        
        // Check for validation event
        let has_validation_event = events.iter().any(|e| matches!(e, SecurityEvent::TokenValidated { .. }));
        assert!(has_validation_event, "Should have a token validation event");
    }

    #[test]
    async fn test_file_operation_rate_limiting() {
        let state = CSRFTokenState::new();
        
        // Should initially allow file operations
        assert!(state.validate_file_operation("test_operation").await, "Should initially allow file operations");
        
        // After many operations, should still work (within rate limit)
        for _ in 0..10 {
            state.validate_file_operation("test_operation").await;
        }
        
        // The 30 operations per minute limit would need more complex testing
        // This test just ensures the method works
    }
}

// Tauri commands for CSRF token management
#[tauri::command]
pub async fn get_csrf_token(csrf_state: tauri::State<'_, CSRFTokenState>) -> Result<String, String> {
    csrf_state.get_token().await.ok_or_else(|| "No CSRF token available".to_string())
}

#[tauri::command]
pub async fn refresh_csrf_token(csrf_state: tauri::State<'_, CSRFTokenState>) -> Result<String, String> {
    csrf_state.refresh_token().await
}

#[tauri::command]
pub async fn get_security_events(csrf_state: tauri::State<'_, CSRFTokenState>) -> Result<Vec<SecurityEvent>, String> {
    Ok(csrf_state.get_security_events().await)
}

#[tauri::command]
pub async fn validate_csrf_token(
    token: String,
    csrf_state: tauri::State<'_, CSRFTokenState>
) -> Result<bool, String> {
    Ok(csrf_state.validate_token(&token).await)
}
