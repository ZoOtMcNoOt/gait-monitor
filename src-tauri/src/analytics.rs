use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use crate::data_processing::GaitData;

// Statistical analysis results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatisticalSummary {
    pub count: usize,
    pub min: f32,
    pub max: f32,
    pub mean: f32,
    pub std_dev: f32,
    pub median: f32,
    pub variance: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionStatistics {
    pub session_duration_ms: u64,
    pub total_samples: usize,
    pub device_count: usize,
    pub sample_rate_stats: HashMap<String, f64>,
    pub data_stats: HashMap<String, StatisticalSummary>, // Per data field (r1, r2, r3, x, y, z)
    pub device_stats: HashMap<String, DeviceStatistics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceStatistics {
    pub device_id: String,
    pub sample_count: usize,
    pub avg_sample_rate: f64,
    pub data_range_ms: u64,
    pub first_sample_time: u64,
    pub last_sample_time: u64,
    pub data_quality_score: f32, // 0.0 to 1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataSummary {
    pub time_range: (u64, u64), // (start_time, end_time)
    pub device_summaries: HashMap<String, DeviceStatistics>,
    pub overall_stats: StatisticalSummary,
    pub data_completeness: f32, // Percentage of expected samples received
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevicePerformanceAnalysis {
    pub device_id: String,
    pub connection_stability: f32, // 0.0 to 1.0
    pub data_consistency: f32, // 0.0 to 1.0
    pub latency_stats: StatisticalSummary,
    pub error_rate: f32,
    pub recommendations: Vec<String>,
}

// Analytics engine implementation
#[derive(Clone)]
pub struct AnalyticsEngine {
    // Could add caching or configuration here if needed
}

impl AnalyticsEngine {
    pub fn new() -> Self {
        Self {}
    }

    /// Calculate comprehensive session statistics
    pub fn calculate_session_statistics(&self, data: &[GaitData]) -> Result<SessionStatistics, String> {
        if data.is_empty() {
            return Err("No data provided for analysis".to_string());
        }

        let total_samples = data.len();
        let mut device_data: HashMap<String, Vec<&GaitData>> = HashMap::new();
        let mut min_time = u64::MAX;
        let mut max_time = 0u64;

        // Group data by device and find time range
        for sample in data {
            device_data.entry(sample.device_id.clone())
                .or_insert_with(Vec::new)
                .push(sample);
            min_time = min_time.min(sample.timestamp);
            max_time = max_time.max(sample.timestamp);
        }

        let device_count = device_data.len();
        let session_duration_ms = max_time - min_time;

        // Calculate per-device statistics
        let mut device_stats = HashMap::new();
        let mut sample_rate_stats = HashMap::new();

        for (device_id, device_samples) in &device_data {
            let device_stat = self.calculate_device_statistics(device_id, device_samples)?;
            sample_rate_stats.insert(device_id.clone(), device_stat.avg_sample_rate);
            device_stats.insert(device_id.clone(), device_stat);
        }

        // Calculate per-field statistics
        let data_stats = self.calculate_field_statistics(data)?;

        Ok(SessionStatistics {
            session_duration_ms,
            total_samples,
            device_count,
            sample_rate_stats,
            data_stats,
            device_stats,
        })
    }

    /// Generate data summary for a specific time range
    pub fn get_data_summary(&self, data: &[GaitData], start_time: Option<u64>, end_time: Option<u64>) -> Result<DataSummary, String> {
        if data.is_empty() {
            return Err("No data provided for summary".to_string());
        }

        // Filter data by time range if specified
        let filtered_data: Vec<&GaitData> = if let (Some(start), Some(end)) = (start_time, end_time) {
            data.iter().filter(|sample| sample.timestamp >= start && sample.timestamp <= end).collect()
        } else {
            data.iter().collect()
        };

        if filtered_data.is_empty() {
            return Err("No data in specified time range".to_string());
        }

        let time_range = (
            filtered_data.iter().map(|s| s.timestamp).min().unwrap_or(0),
            filtered_data.iter().map(|s| s.timestamp).max().unwrap_or(0),
        );

        // Group by device
        let mut device_data: HashMap<String, Vec<&GaitData>> = HashMap::new();
        for sample in &filtered_data {
            device_data.entry(sample.device_id.clone())
                .or_insert_with(Vec::new)
                .push(sample);
        }

        // Calculate device summaries
        let mut device_summaries = HashMap::new();
        for (device_id, device_samples) in &device_data {
            let device_stat = self.calculate_device_statistics(device_id, device_samples)?;
            device_summaries.insert(device_id.clone(), device_stat);
        }

        // Calculate overall statistics (using R1 as representative)
        let r1_values: Vec<f32> = filtered_data.iter().map(|s| s.r1).collect();
        let overall_stats = self.calculate_statistics(&r1_values);

        // Calculate data completeness (simplified estimation)
        let expected_duration_ms = time_range.1 - time_range.0;
        let avg_sample_rate = device_summaries.values()
            .map(|d| d.avg_sample_rate)
            .sum::<f64>() / device_summaries.len() as f64;
        let expected_samples = (expected_duration_ms as f64 / 1000.0 * avg_sample_rate) as usize;
        let data_completeness = if expected_samples > 0 {
            (filtered_data.len() as f32 / expected_samples as f32).min(1.0)
        } else {
            1.0
        };

        Ok(DataSummary {
            time_range,
            device_summaries,
            overall_stats,
            data_completeness,
        })
    }

    /// Analyze device performance and provide recommendations
    pub fn analyze_device_performance(&self, device_id: &str, data: &[GaitData]) -> Result<DevicePerformanceAnalysis, String> {
        let device_data: Vec<&GaitData> = data.iter()
            .filter(|sample| sample.device_id == device_id)
            .collect();

        if device_data.is_empty() {
            return Err(format!("No data found for device: {}", device_id));
        }

        // Calculate connection stability (based on sample timing consistency)
        let connection_stability = self.calculate_connection_stability(&device_data);

        // Calculate data consistency (variance in data patterns)
        let data_consistency = self.calculate_data_consistency(&device_data);

        // Calculate latency statistics (simplified - based on timestamp gaps)
        let latency_stats = self.calculate_latency_statistics(&device_data);

        // Calculate error rate (based on outliers and missing data patterns)
        let error_rate = self.calculate_error_rate(&device_data);

        // Generate recommendations
        let recommendations = self.generate_recommendations(
            connection_stability,
            data_consistency,
            error_rate,
            &latency_stats,
        );

        Ok(DevicePerformanceAnalysis {
            device_id: device_id.to_string(),
            connection_stability,
            data_consistency,
            latency_stats,
            error_rate,
            recommendations,
        })
    }

    // Helper methods for statistical calculations
    fn calculate_device_statistics(&self, device_id: &str, samples: &[&GaitData]) -> Result<DeviceStatistics, String> {
        if samples.is_empty() {
            return Err(format!("No samples for device: {}", device_id));
        }

        let sample_count = samples.len();
        let first_sample_time = samples.iter().map(|s| s.timestamp).min().unwrap();
        let last_sample_time = samples.iter().map(|s| s.timestamp).max().unwrap();
        let data_range_ms = last_sample_time - first_sample_time;

        // Calculate average sample rate
        let avg_sample_rate = if data_range_ms > 0 {
            (sample_count as f64 - 1.0) / (data_range_ms as f64 / 1000.0)
        } else {
            0.0
        };

        // Calculate data quality score (simplified)
        let data_quality_score = self.calculate_data_quality_score(samples);

        Ok(DeviceStatistics {
            device_id: device_id.to_string(),
            sample_count,
            avg_sample_rate,
            data_range_ms,
            first_sample_time,
            last_sample_time,
            data_quality_score,
        })
    }

    fn calculate_field_statistics(&self, data: &[GaitData]) -> Result<HashMap<String, StatisticalSummary>, String> {
        let mut field_stats = HashMap::new();

        // Extract values for each field
        let r1_values: Vec<f32> = data.iter().map(|s| s.r1).collect();
        let r2_values: Vec<f32> = data.iter().map(|s| s.r2).collect();
        let r3_values: Vec<f32> = data.iter().map(|s| s.r3).collect();

        // Calculate statistics for each resistance field
        field_stats.insert("r1".to_string(), self.calculate_statistics(&r1_values));
        field_stats.insert("r2".to_string(), self.calculate_statistics(&r2_values));
        field_stats.insert("r3".to_string(), self.calculate_statistics(&r3_values));

        Ok(field_stats)
    }

    fn calculate_statistics(&self, values: &[f32]) -> StatisticalSummary {
        if values.is_empty() {
            return StatisticalSummary {
                count: 0,
                min: 0.0,
                max: 0.0,
                mean: 0.0,
                std_dev: 0.0,
                median: 0.0,
                variance: 0.0,
            };
        }

        let count = values.len();
        let min = values.iter().fold(f32::INFINITY, |a, &b| a.min(b));
        let max = values.iter().fold(f32::NEG_INFINITY, |a, &b| a.max(b));
        let mean = values.iter().sum::<f32>() / count as f32;

        // Calculate variance and standard deviation
        let variance = values.iter()
            .map(|&x| (x - mean).powi(2))
            .sum::<f32>() / count as f32;
        let std_dev = variance.sqrt();

        // Calculate median
        let mut sorted_values = values.to_vec();
        sorted_values.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let median = if count % 2 == 0 {
            (sorted_values[count / 2 - 1] + sorted_values[count / 2]) / 2.0
        } else {
            sorted_values[count / 2]
        };

        StatisticalSummary {
            count,
            min,
            max,
            mean,
            std_dev,
            median,
            variance,
        }
    }

    fn calculate_connection_stability(&self, samples: &[&GaitData]) -> f32 {
        if samples.len() < 2 {
            return 1.0;
        }

        // Calculate timestamp intervals
        let mut intervals = Vec::new();
        for i in 1..samples.len() {
            let interval = samples[i].timestamp.saturating_sub(samples[i-1].timestamp);
            intervals.push(interval as f32);
        }

        // Calculate coefficient of variation for intervals
        let stats = self.calculate_statistics(&intervals);
        if stats.mean > 0.0 {
            let cv = stats.std_dev / stats.mean;
            // Convert to stability score (lower variation = higher stability)
            (1.0 - cv.min(1.0)).max(0.0)
        } else {
            0.0
        }
    }

    fn calculate_data_consistency(&self, samples: &[&GaitData]) -> f32 {
        if samples.is_empty() {
            return 1.0;
        }

        // Calculate consistency across different data fields
        let r1_values: Vec<f32> = samples.iter().map(|s| s.r1).collect();
        let r2_values: Vec<f32> = samples.iter().map(|s| s.r2).collect();
        let r3_values: Vec<f32> = samples.iter().map(|s| s.r3).collect();

        let r1_stats = self.calculate_statistics(&r1_values);
        let r2_stats = self.calculate_statistics(&r2_values);
        let r3_stats = self.calculate_statistics(&r3_values);

        // Use coefficient of variation as consistency metric
        let r1_cv = if r1_stats.mean != 0.0 { r1_stats.std_dev / r1_stats.mean.abs() } else { 0.0 };
        let r2_cv = if r2_stats.mean != 0.0 { r2_stats.std_dev / r2_stats.mean.abs() } else { 0.0 };
        let r3_cv = if r3_stats.mean != 0.0 { r3_stats.std_dev / r3_stats.mean.abs() } else { 0.0 };

        let avg_cv = (r1_cv + r2_cv + r3_cv) / 3.0;
        
        // Convert to consistency score (reasonable variation expected in gait data)
        (1.0 - (avg_cv / 2.0).min(1.0)).max(0.0)
    }

    fn calculate_latency_statistics(&self, samples: &[&GaitData]) -> StatisticalSummary {
        if samples.len() < 2 {
            return StatisticalSummary {
                count: 0,
                min: 0.0,
                max: 0.0,
                mean: 0.0,
                std_dev: 0.0,
                median: 0.0,
                variance: 0.0,
            };
        }

        // Calculate inter-sample intervals as proxy for latency
        let mut intervals = Vec::new();
        for i in 1..samples.len() {
            let interval = samples[i].timestamp.saturating_sub(samples[i-1].timestamp) as f32;
            intervals.push(interval);
        }

        self.calculate_statistics(&intervals)
    }

    fn calculate_error_rate(&self, samples: &[&GaitData]) -> f32 {
        if samples.is_empty() {
            return 1.0;
        }

        // Simple error detection based on outliers using R1 as representative
        let r1_values: Vec<f32> = samples.iter().map(|s| s.r1).collect();
        let r1_stats = self.calculate_statistics(&r1_values);

        // Count outliers (values beyond 3 standard deviations)
        let threshold = 3.0 * r1_stats.std_dev;
        let outliers = r1_values.iter()
            .filter(|&&x| (x - r1_stats.mean).abs() > threshold)
            .count();

        outliers as f32 / samples.len() as f32
    }

    fn calculate_data_quality_score(&self, samples: &[&GaitData]) -> f32 {
        if samples.is_empty() {
            return 0.0;
        }

        // Combine multiple quality metrics
        let connection_stability = self.calculate_connection_stability(samples);
        let data_consistency = self.calculate_data_consistency(samples);
        let error_rate = self.calculate_error_rate(samples);

        // Weighted average (connection stability and consistency are positive, error rate is negative)
        (connection_stability * 0.4 + data_consistency * 0.4 + (1.0 - error_rate) * 0.2).max(0.0).min(1.0)
    }

    fn generate_recommendations(&self, stability: f32, consistency: f32, error_rate: f32, latency_stats: &StatisticalSummary) -> Vec<String> {
        let mut recommendations = Vec::new();

        if stability < 0.7 {
            recommendations.push("Connection stability is low. Check Bluetooth signal strength and device battery level.".to_string());
        }

        if consistency < 0.6 {
            recommendations.push("Data consistency is low. Verify device placement and sensor calibration.".to_string());
        }

        if error_rate > 0.1 {
            recommendations.push("High error rate detected. Consider device maintenance or replacement.".to_string());
        }

        if latency_stats.mean > 100.0 {
            recommendations.push("High latency detected. Reduce distance to device or check for interference.".to_string());
        }

        if latency_stats.std_dev > 50.0 {
            recommendations.push("Inconsistent timing detected. Check for competing Bluetooth connections.".to_string());
        }

        if recommendations.is_empty() {
            recommendations.push("Device performance is within normal parameters.".to_string());
        }

        recommendations
    }
}

impl Default for AnalyticsEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_data(device_id: &str, count: usize) -> Vec<GaitData> {
        (0..count).map(|i| GaitData {
            device_id: device_id.to_string(),
            r1: (i as f32) * 0.1,
            r2: (i as f32) * 0.2,
            r3: (i as f32) * 0.3,
            x: (i as f32).sin(),
            y: (i as f32).cos(),
            z: (i as f32) * 0.01,
            timestamp: 1000 + (i as u64) * 10, // 10ms intervals
        }).collect()
    }

    #[test]
    fn test_calculate_session_statistics() {
        let engine = AnalyticsEngine::new();
        let data = create_test_data("device1", 100);
        
        let stats = engine.calculate_session_statistics(&data).unwrap();
        
        assert_eq!(stats.total_samples, 100);
        assert_eq!(stats.device_count, 1);
        assert!(stats.session_duration_ms > 0);
    }

    #[test]
    fn test_calculate_statistics() {
        let engine = AnalyticsEngine::new();
        let values = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        
        let stats = engine.calculate_statistics(&values);
        
        assert_eq!(stats.count, 5);
        assert_eq!(stats.min, 1.0);
        assert_eq!(stats.max, 5.0);
        assert_eq!(stats.mean, 3.0);
        assert_eq!(stats.median, 3.0);
    }

    #[test]
    fn test_device_performance_analysis() {
        let engine = AnalyticsEngine::new();
        let data = create_test_data("test_device", 50);
        
        let analysis = engine.analyze_device_performance("test_device", &data).unwrap();
        
        assert_eq!(analysis.device_id, "test_device");
        assert!(analysis.connection_stability >= 0.0 && analysis.connection_stability <= 1.0);
        assert!(analysis.data_consistency >= 0.0 && analysis.data_consistency <= 1.0);
        assert!(!analysis.recommendations.is_empty());
    }
}
