// Intelligent caching system for the Gait Monitor application
// This module provides high-performance caching with automatic invalidation

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use serde::{Serialize, Deserialize};

// Cache entry with metadata
#[derive(Debug, Clone)]
pub struct CacheEntry<T> {
    pub data: T,
    pub created_at: Instant,
    pub last_accessed: Instant,
    pub access_count: u64,
    pub ttl: Option<Duration>,
    pub size_bytes: usize,
}

impl<T> CacheEntry<T> {
    pub fn new(data: T, ttl: Option<Duration>) -> Self {
        let now = Instant::now();
        let size_bytes = std::mem::size_of_val(&data);
        
        Self {
            data,
            created_at: now,
            last_accessed: now,
            access_count: 1,
            ttl,
            size_bytes,
        }
    }

    pub fn is_expired(&self) -> bool {
        if let Some(ttl) = self.ttl {
            self.created_at.elapsed() > ttl
        } else {
            false
        }
    }

    pub fn access(&mut self) -> &T {
        self.last_accessed = Instant::now();
        self.access_count += 1;
        &self.data
    }
}

// Cache key types for different data categories
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum CacheKey {
    SessionData(String),           // Session metadata by ID
    GaitData(String, String),      // Device ID + Time range hash
    AnalyticsResult(String),       // Analytics query hash
    ExportData(String),            // Export configuration hash
    SystemMetrics(String),         // System metrics type
    DeviceBuffer(String),          // Device buffer by ID
    ConfigData(String),            // Configuration type
    ValidationResult(String),      // Validation input hash
}

impl CacheKey {
    pub fn to_string(&self) -> String {
        match self {
            CacheKey::SessionData(id) => format!("session:{}", id),
            CacheKey::GaitData(device, time_hash) => format!("gait:{}:{}", device, time_hash),
            CacheKey::AnalyticsResult(hash) => format!("analytics:{}", hash),
            CacheKey::ExportData(hash) => format!("export:{}", hash),
            CacheKey::SystemMetrics(metric_type) => format!("metrics:{}", metric_type),
            CacheKey::DeviceBuffer(device_id) => format!("buffer:{}", device_id),
            CacheKey::ConfigData(config_type) => format!("config:{}", config_type),
            CacheKey::ValidationResult(hash) => format!("validation:{}", hash),
        }
    }
}

// Cache statistics for monitoring
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_entries: usize,
    pub total_size_bytes: usize,
    pub hit_count: u64,
    pub miss_count: u64,
    pub eviction_count: u64,
    pub hit_rate: f64,
    pub average_access_time_ms: f64,
    pub memory_usage_mb: f64,
    pub oldest_entry_age_seconds: u64,
    pub most_accessed_key: String,
    pub cache_efficiency: f64,
}

// Cache configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheConfig {
    pub max_size_mb: usize,
    pub max_entries: usize,
    pub default_ttl_seconds: Option<u64>,
    pub cleanup_interval_seconds: u64,
    pub enable_lru_eviction: bool,
    pub enable_ttl_eviction: bool,
    pub enable_size_based_eviction: bool,
    pub prefetch_threshold: f64,
}

impl Default for CacheConfig {
    fn default() -> Self {
        Self {
            max_size_mb: 256,
            max_entries: 10000,
            default_ttl_seconds: Some(3600), // 1 hour
            cleanup_interval_seconds: 300,   // 5 minutes
            enable_lru_eviction: true,
            enable_ttl_eviction: true,
            enable_size_based_eviction: true,
            prefetch_threshold: 0.8,
        }
    }
}

// Main cache manager
pub struct CacheManager {
    cache: Arc<Mutex<HashMap<CacheKey, CacheEntry<Vec<u8>>>>>,
    config: CacheConfig,
    stats: Arc<Mutex<CacheStats>>,
    last_cleanup: Arc<Mutex<Instant>>,
}

impl CacheManager {
    pub fn new(config: CacheConfig) -> Self {
        Self {
            cache: Arc::new(Mutex::new(HashMap::new())),
            config,
            stats: Arc::new(Mutex::new(CacheStats {
                total_entries: 0,
                total_size_bytes: 0,
                hit_count: 0,
                miss_count: 0,
                eviction_count: 0,
                hit_rate: 0.0,
                average_access_time_ms: 0.0,
                memory_usage_mb: 0.0,
                oldest_entry_age_seconds: 0,
                most_accessed_key: String::new(),
                cache_efficiency: 0.0,
            })),
            last_cleanup: Arc::new(Mutex::new(Instant::now())),
        }
    }

    // Get data from cache
    pub fn get<T>(&self, key: &CacheKey) -> Option<T>
    where
        T: for<'de> Deserialize<'de>,
    {
        let start_time = Instant::now();
        let mut cache = self.cache.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        if let Some(entry) = cache.get_mut(key) {
            if entry.is_expired() {
                cache.remove(key);
                stats.miss_count += 1;
                None
            } else {
                let data = entry.access();
                stats.hit_count += 1;
                stats.average_access_time_ms = 
                    (stats.average_access_time_ms + start_time.elapsed().as_millis() as f64) / 2.0;
                
                // Deserialize the cached data
                match bincode::deserialize::<T>(data) {
                    Ok(deserialized) => Some(deserialized),
                    Err(_) => {
                        // Remove corrupted entry
                        cache.remove(key);
                        None
                    }
                }
            }
        } else {
            stats.miss_count += 1;
            None
        }
    }

    // Store data in cache
    pub fn set<T>(&self, key: CacheKey, data: T, ttl: Option<Duration>) -> Result<(), String>
    where
        T: Serialize,
    {
        let serialized = bincode::serialize(&data)
            .map_err(|e| format!("Failed to serialize data: {}", e))?;

        let mut cache = self.cache.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        // Check size limits before insertion
        let entry_size = serialized.len();
        let total_size = stats.total_size_bytes + entry_size;
        let max_size_bytes = self.config.max_size_mb * 1024 * 1024;

        if total_size > max_size_bytes && self.config.enable_size_based_eviction {
            self.evict_by_size(&mut cache, &mut stats, entry_size)?;
        }

        // Check entry count limits
        if cache.len() >= self.config.max_entries && self.config.enable_lru_eviction {
            self.evict_lru(&mut cache, &mut stats)?;
        }

        // Use configured TTL if none provided
        let effective_ttl = ttl.or_else(|| {
            self.config.default_ttl_seconds
                .map(|secs| Duration::from_secs(secs))
        });

        let entry = CacheEntry::new(serialized, effective_ttl);
        cache.insert(key, entry);
        
        stats.total_entries = cache.len();
        stats.total_size_bytes += entry_size;
        stats.memory_usage_mb = stats.total_size_bytes as f64 / 1024.0 / 1024.0;

        self.update_cache_stats(&cache, &mut stats);

        Ok(())
    }

    // Remove data from cache
    pub fn remove(&self, key: &CacheKey) -> bool {
        let mut cache = self.cache.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        if let Some(entry) = cache.remove(key) {
            stats.total_entries = cache.len();
            stats.total_size_bytes = stats.total_size_bytes.saturating_sub(entry.size_bytes);
            stats.memory_usage_mb = stats.total_size_bytes as f64 / 1024.0 / 1024.0;
            true
        } else {
            false
        }
    }

    // Clear entire cache
    pub fn clear(&self) {
        let mut cache = self.cache.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        cache.clear();
        stats.total_entries = 0;
        stats.total_size_bytes = 0;
        stats.memory_usage_mb = 0.0;
        stats.eviction_count = 0;
    }

    // Get cache statistics
    pub fn get_stats(&self) -> CacheStats {
        let cache = self.cache.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();
        
        self.update_cache_stats(&cache, &mut stats);
        stats.clone()
    }

    // Update cache configuration
    pub fn update_config(&mut self, config: CacheConfig) {
        self.config = config;
    }

    // Perform cache maintenance
    pub fn cleanup(&self) -> Result<(), String> {
        let mut last_cleanup = self.last_cleanup.lock().unwrap();
        let cleanup_interval = Duration::from_secs(self.config.cleanup_interval_seconds);

        if last_cleanup.elapsed() < cleanup_interval {
            return Ok(());
        }

        let mut cache = self.cache.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        // Remove expired entries
        if self.config.enable_ttl_eviction {
            let expired_keys: Vec<_> = cache
                .iter()
                .filter(|(_, entry)| entry.is_expired())
                .map(|(key, _)| key.clone())
                .collect();

            for key in expired_keys {
                if let Some(entry) = cache.remove(&key) {
                    stats.total_size_bytes = stats.total_size_bytes.saturating_sub(entry.size_bytes);
                    stats.eviction_count += 1;
                }
            }
        }

        stats.total_entries = cache.len();
        stats.memory_usage_mb = stats.total_size_bytes as f64 / 1024.0 / 1024.0;
        *last_cleanup = Instant::now();

        Ok(())
    }

    // Check if key exists and is valid
    pub fn contains_key(&self, key: &CacheKey) -> bool {
        let cache = self.cache.lock().unwrap();
        
        if let Some(entry) = cache.get(key) {
            !entry.is_expired()
        } else {
            false
        }
    }

    // Get cache keys matching a pattern
    pub fn get_keys_by_prefix(&self, prefix: &str) -> Vec<CacheKey> {
        let cache = self.cache.lock().unwrap();
        
        cache.keys()
            .filter(|key| key.to_string().starts_with(prefix))
            .cloned()
            .collect()
    }

    // Invalidate cache entries by pattern
    pub fn invalidate_by_pattern(&self, pattern: &str) -> usize {
        let mut cache = self.cache.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        let keys_to_remove: Vec<_> = cache
            .keys()
            .filter(|key| key.to_string().contains(pattern))
            .cloned()
            .collect();

        let mut removed_size = 0;
        for key in &keys_to_remove {
            if let Some(entry) = cache.remove(key) {
                removed_size += entry.size_bytes;
            }
        }

        stats.total_entries = cache.len();
        stats.total_size_bytes = stats.total_size_bytes.saturating_sub(removed_size);
        stats.memory_usage_mb = stats.total_size_bytes as f64 / 1024.0 / 1024.0;

        keys_to_remove.len()
    }

    // Helper methods for eviction strategies
    fn evict_by_size(
        &self,
        cache: &mut HashMap<CacheKey, CacheEntry<Vec<u8>>>,
        stats: &mut CacheStats,
        needed_space: usize,
    ) -> Result<(), String> {
        let max_size_bytes = self.config.max_size_mb * 1024 * 1024;
        let target_size = max_size_bytes - needed_space;

        // Sort by least recently used
        let mut entries: Vec<_> = cache.iter().collect();
        entries.sort_by_key(|(_, entry)| entry.last_accessed);

        let mut freed_space = 0;
        let mut keys_to_remove = Vec::new();

        for (key, entry) in entries {
            if stats.total_size_bytes - freed_space <= target_size {
                break;
            }
            keys_to_remove.push(key.clone());
            freed_space += entry.size_bytes;
        }

        for key in keys_to_remove {
            cache.remove(&key);
            stats.eviction_count += 1;
        }

        stats.total_size_bytes -= freed_space;
        Ok(())
    }

    fn evict_lru(
        &self,
        cache: &mut HashMap<CacheKey, CacheEntry<Vec<u8>>>,
        stats: &mut CacheStats,
    ) -> Result<(), String> {
        if let Some((key, _)) = cache
            .iter()
            .min_by_key(|(_, entry)| entry.last_accessed)
            .map(|(k, v)| (k.clone(), v.clone()))
        {
            if let Some(entry) = cache.remove(&key) {
                stats.total_size_bytes = stats.total_size_bytes.saturating_sub(entry.size_bytes);
                stats.eviction_count += 1;
            }
        }
        Ok(())
    }

    fn update_cache_stats(
        &self,
        cache: &HashMap<CacheKey, CacheEntry<Vec<u8>>>,
        stats: &mut CacheStats,
    ) {
        let total_requests = stats.hit_count + stats.miss_count;
        if total_requests > 0 {
            stats.hit_rate = stats.hit_count as f64 / total_requests as f64;
        }

        if let Some((_, oldest_entry)) = cache
            .iter()
            .min_by_key(|(_, entry)| entry.created_at)
        {
            stats.oldest_entry_age_seconds = oldest_entry.created_at.elapsed().as_secs();
        }

        if let Some((most_accessed_key, _)) = cache
            .iter()
            .max_by_key(|(_, entry)| entry.access_count)
        {
            stats.most_accessed_key = most_accessed_key.to_string();
        }

        // Calculate cache efficiency (hit rate weighted by access frequency)
        let total_accesses: u64 = cache.values().map(|entry| entry.access_count).sum();
        if total_accesses > 0 {
            stats.cache_efficiency = (stats.hit_count as f64 / total_accesses as f64) * stats.hit_rate;
        }
    }
}

// Utility function to generate cache key hash
pub fn generate_hash<T: Hash>(obj: &T) -> String {
    let mut hasher = DefaultHasher::new();
    obj.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

// Cache invalidation strategies
#[derive(Debug, Clone)]
pub enum InvalidationStrategy {
    TimeToLive(Duration),
    AccessBased(u64),
    SizeBased(usize),
    Pattern(String),
    Manual,
}

// Prefetch manager for intelligent cache warming
pub struct PrefetchManager {
    cache_manager: Arc<CacheManager>,
    access_patterns: Arc<Mutex<HashMap<String, Vec<CacheKey>>>>,
}

impl PrefetchManager {
    pub fn new(cache_manager: Arc<CacheManager>) -> Self {
        Self {
            cache_manager,
            access_patterns: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    // Record access pattern for future prefetching
    pub fn record_access(&self, context: &str, key: CacheKey) {
        let mut patterns = self.access_patterns.lock().unwrap();
        patterns.entry(context.to_string()).or_insert_with(Vec::new).push(key);
    }

    // Prefetch related data based on access patterns
    pub async fn prefetch(&self, context: &str) -> Result<(), String> {
        let patterns = self.access_patterns.lock().unwrap();
        
        if let Some(keys) = patterns.get(context) {
            for key in keys {
                // Check if key is not already cached
                if !self.cache_manager.contains_key(key) {
                    // This would typically trigger background loading
                    // Implementation depends on the specific data source
                }
            }
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_basic_operations() {
        let config = CacheConfig::default();
        let cache = CacheManager::new(config);

        // Test set and get
        let key = CacheKey::SessionData("test".to_string());
        let data = "test data".to_string();
        
        assert!(cache.set(key.clone(), data.clone(), None).is_ok());
        assert_eq!(cache.get::<String>(&key), Some(data));

        // Test remove
        assert!(cache.remove(&key));
        assert!(cache.get::<String>(&key).is_none());
    }

    #[test]
    fn test_cache_expiration() {
        let config = CacheConfig::default();
        let cache = CacheManager::new(config);

        let key = CacheKey::SessionData("test".to_string());
        let data = "test data".to_string();
        let ttl = Duration::from_millis(10);
        
        assert!(cache.set(key.clone(), data.clone(), Some(ttl)).is_ok());
        
        // Should be available immediately
        assert_eq!(cache.get::<String>(&key), Some(data));
        
        // Wait for expiration
        std::thread::sleep(Duration::from_millis(20));
        
        // Should be expired
        assert!(cache.get::<String>(&key).is_none());
    }

    #[test]
    fn test_cache_stats() {
        let config = CacheConfig::default();
        let cache = CacheManager::new(config);

        let key = CacheKey::SessionData("test".to_string());
        let data = "test data".to_string();
        
        // Initial stats
        let stats = cache.get_stats();
        assert_eq!(stats.total_entries, 0);
        
        // Add entry
        assert!(cache.set(key.clone(), data, None).is_ok());
        let stats = cache.get_stats();
        assert_eq!(stats.total_entries, 1);
        
        // Access entry (hit)
        let _ = cache.get::<String>(&key);
        let stats = cache.get_stats();
        assert_eq!(stats.hit_count, 1);
        
        // Access non-existent entry (miss)
        let miss_key = CacheKey::SessionData("missing".to_string());
        let _ = cache.get::<String>(&miss_key);
        let stats = cache.get_stats();
        assert_eq!(stats.miss_count, 1);
    }
}
