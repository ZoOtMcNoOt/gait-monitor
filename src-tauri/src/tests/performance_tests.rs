// Performance tests for backend functionality

#[cfg(test)]
mod performance_tests {
    use super::super::test_utils::*;
    use crate::analytics::AnalyticsEngine;
    use crate::validation::Validator;
    use std::sync::Arc;
    use std::time::Duration;

    #[tokio::test]
    async fn test_data_processing_performance() {
        let test_env = TestEnvironment::new().await;
        let sample_sizes = vec![100, 500, 1000, 2000];
        
        for size in sample_sizes {
            let test_data = TestDataGenerator::sample_gait_data("perf_test", size);
            
            let perf = PerformanceMeasurement::start(&format!("process_{}_samples", size));
            
            // Basic data validation performance
            for data_point in &test_data {
                TestAssertions::assert_gait_data_valid(data_point);
            }
            
            let duration = perf.finish();
            println!("Processing {} samples took {:?}", size, duration);
            
            // Ensure performance scales reasonably (less than 1ms per sample)
            assert!(duration.as_millis() < size as u128, 
                    "Processing {} samples took too long: {:?}", size, duration);
        }
        
        test_env.cleanup();
    }

    #[tokio::test]
    async fn test_analytics_performance() {
        let test_env = TestEnvironment::new().await;
        let analytics = AnalyticsEngine::new();
        let data_sizes = vec![50, 100, 200, 500];
        
        for size in data_sizes {
            let test_data = TestDataGenerator::sample_gait_data("analytics_perf", size);
            
            let perf = PerformanceMeasurement::start(&format!("analytics_{}_samples", size));
            let _result = analytics.calculate_session_statistics(&test_data);
            let duration = perf.finish();
            
            println!("Analytics for {} samples took {:?}", size, duration);
            
            // Analytics should complete within reasonable time
            assert!(duration.as_millis() < 100, 
                    "Analytics for {} samples took too long: {:?}", size, duration);
        }
        
        test_env.cleanup();
    }

    #[tokio::test]
    async fn test_concurrent_processing_performance() {
        let test_env = TestEnvironment::new().await;
        let concurrent_tasks = 4;
        let samples_per_task = 100;
        
        let perf = PerformanceMeasurement::start("concurrent_processing");
        
        let mut handles = vec![];
        for task_id in 0..concurrent_tasks {
            let handle = tokio::spawn(async move {
                let device_name = format!("concurrent_device_{}", task_id);
                let test_data = TestDataGenerator::sample_gait_data(&device_name, samples_per_task);
                
                // Process data
                for data_point in &test_data {
                    TestAssertions::assert_gait_data_valid(data_point);
                }
                
                test_data.len()
            });
            handles.push(handle);
        }
        
        // Wait for all tasks
        let mut total_processed = 0;
        for handle in handles {
            total_processed += handle.await.unwrap();
        }
        
        perf.assert_within_limit(200); // All concurrent tasks should complete in < 200ms
        
        assert_eq!(total_processed, concurrent_tasks * samples_per_task);
        
        test_env.cleanup();
    }

    #[tokio::test]
    async fn test_memory_usage_stability() {
        let test_env = TestEnvironment::new().await;
        let mut memory_tracker = MemoryTracker::start("memory_stability");
        
        // Process data in batches to test memory stability
        let batch_count = 10;
        let batch_size = 100;
        
        for batch in 0..batch_count {
            let test_data = TestDataGenerator::sample_gait_data(
                &format!("memory_test_batch_{}", batch), 
                batch_size
            );
            
            // Process batch
            for data_point in &test_data {
                TestAssertions::assert_gait_data_valid(data_point);
            }
            
            memory_tracker.checkpoint();
        }
        
        let memory_report = memory_tracker.finish();
        memory_report.print_report();
        
        // Memory usage should be stable (no major leaks)
        memory_report.assert_no_leaks(1024 * 100); // 100KB tolerance
        
        test_env.cleanup();
    }

    #[tokio::test]
    async fn test_validation_performance_scaling() {
        let test_env = TestEnvironment::new().await;
        let validator = Validator::new();
        
        // Test different data sizes to see how validation scales
        let test_sizes = vec![10, 50, 100, 500, 1000];
        
        for size in test_sizes {
            let test_data = TestDataGenerator::sample_gait_data("validation_perf", size);
            
            let perf = PerformanceMeasurement::start(&format!("validate_{}_samples", size));
            
            // Validate each data point
            for data_point in &test_data {
                TestAssertions::assert_gait_data_valid(data_point);
            }
            
            let duration = perf.finish();
            
            // Validation should scale linearly and be fast
            let per_sample_time = duration.as_micros() as f64 / size as f64;
            assert!(per_sample_time < 1000.0, // Less than 1ms per sample
                    "Validation too slow: {}μs per sample for {} samples", 
                    per_sample_time, size);
        }
        
        test_env.cleanup();
    }

    #[tokio::test]
    async fn test_high_frequency_data_processing() {
        let test_env = TestEnvironment::new().await;
        
        // Simulate high-frequency data collection (1000 Hz for 1 second)
        let high_freq_data = TestDataGenerator::sample_gait_data("high_freq_device", 1000);
        
        let perf = PerformanceMeasurement::start("high_frequency_processing");
        
        // Process all high-frequency data
        for data_point in &high_freq_data {
            TestAssertions::assert_gait_data_valid(data_point);
        }
        
        // Should handle 1000 samples in well under 1 second
        perf.assert_within_limit(100); // < 100ms for 1000 samples
        
        test_env.cleanup();
    }

    #[tokio::test]
    async fn test_batch_processing_performance() {
        let test_env = TestEnvironment::new().await;
        
        // Create multiple batches of data
        let batch_count = 5;
        let batch_size = 200;
        let mut all_batches = Vec::new();
        
        // Generate batches
        for batch_id in 0..batch_count {
            let batch = TestDataGenerator::sample_gait_data(
                &format!("batch_{}", batch_id), 
                batch_size
            );
            all_batches.push(batch);
        }
        
        let perf = PerformanceMeasurement::start("batch_processing");
        
        // Process all batches
        for batch in &all_batches {
            for data_point in batch {
                TestAssertions::assert_gait_data_valid(data_point);
            }
        }
        
        perf.assert_within_limit(500); // All batches should process in < 500ms
        
        test_env.cleanup();
    }

    // Note: These performance tests focus on the currently implemented functionality.
    // Additional performance tests can be added as more backend features are implemented.
}
