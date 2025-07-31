// Unit tests for validation logic

#[cfg(test)]
mod validation_tests {
    use super::super::test_utils::*;
    use crate::validation::{Validator, ValidatedSessionMetadata, ValidationError};
    use crate::data_processing::{validate_gait_data, GaitData};
    use chrono::Utc;

    #[test]
    fn test_validate_session_metadata_valid() {
        let validator = Validator::new();
        let session_name = "Valid Session";
        let subject_id = "SUBJ001";
        let notes = "Test notes";
        let timestamp = Utc::now().to_rfc3339();
        let devices = vec!["12345678-1234-1234-1234-123456789abc".to_string(), "AA:BB:CC:DD:EE:FF".to_string()];

        let result = validator.validate_session_metadata(session_name, subject_id, notes, &timestamp, &devices);
        assert!(result.is_ok(), "Valid metadata should pass validation: {:?}", result.err());
        
        let validated = result.unwrap();
        assert_eq!(validated.session_name, session_name);
        assert_eq!(validated.subject_id, subject_id);
        assert_eq!(validated.devices, devices);
    }

    #[test]
    fn test_validate_session_metadata_empty_name() {
        let validator = Validator::new();
        let session_name = "";
        let subject_id = "SUBJ001";
        let notes = "Test notes";
        let timestamp = Utc::now().to_rfc3339();
        let devices = vec!["left_foot".to_string()];

        let result = validator.validate_session_metadata(session_name, subject_id, notes, &timestamp, &devices);
        assert!(result.is_err(), "Empty session name should fail validation");
    }

    #[test]
    fn test_validate_session_metadata_empty_subject_id() {
        let validator = Validator::new();
        let session_name = "Valid Session";
        let subject_id = "";
        let notes = "Test notes";
        let timestamp = Utc::now().to_rfc3339();
        let devices = vec!["left_foot".to_string()];

        let result = validator.validate_session_metadata(session_name, subject_id, notes, &timestamp, &devices);
        assert!(result.is_err(), "Empty subject ID should fail validation");
    }

    #[test]
    fn test_validate_session_metadata_no_devices() {
        let validator = Validator::new();
        let session_name = "Valid Session";
        let subject_id = "SUBJ001";
        let notes = "Test notes";
        let timestamp = Utc::now().to_rfc3339();
        let devices: Vec<String> = vec![];

        let result = validator.validate_session_metadata(session_name, subject_id, notes, &timestamp, &devices);
        assert!(result.is_err(), "No devices should fail validation");
    }

    #[test]
    fn test_validate_session_metadata_duplicate_devices() {
        let validator = Validator::new();
        let session_name = "Valid Session";
        let subject_id = "SUBJ001";
        let notes = "Test notes";
        let timestamp = Utc::now().to_rfc3339();
        let devices = vec!["left_foot".to_string(), "left_foot".to_string()];

        let result = validator.validate_session_metadata(session_name, subject_id, notes, &timestamp, &devices);
        assert!(result.is_err(), "Duplicate devices should fail validation");
    }

    #[test]
    fn test_validate_gait_data_valid() {
        let data = TestDataGenerator::sample_gait_data("test_device", 1);
        let gait_data = &data[0];

        let result = validate_gait_data(gait_data);
        assert!(result.is_ok(), "Valid gait data should pass validation");
        TestAssertions::assert_gait_data_valid(gait_data);
    }

    #[test]
    fn test_validate_gait_data_empty_device_id() {
        let mut data = TestDataGenerator::sample_gait_data("test_device", 1);
        data[0].device_id = "".to_string();

        let result = validate_gait_data(&data[0]);
        assert!(result.is_err(), "Empty device ID should fail validation");
        assert!(result.unwrap_err().contains("Device ID cannot be empty"));
    }

    #[test]
    fn test_validate_gait_data_zero_timestamp() {
        let mut data = TestDataGenerator::sample_gait_data("test_device", 1);
        data[0].timestamp = 0;

        let result = validate_gait_data(&data[0]);
        assert!(result.is_err(), "Zero timestamp should fail validation");
        assert!(result.unwrap_err().contains("Timestamp must be positive"));
    }

    #[test]
    fn test_validate_gait_data_invalid_sample_rate() {
        let mut data = TestDataGenerator::sample_gait_data("test_device", 1);
        data[0].r1 = 0.0;

        let result = validate_gait_data(&data[0]);
        // Since r1 = 0.0 is actually valid (within range), this test should pass
        // Let's change this to test an actual invalid value
        data[0].r1 = 1500.0; // This exceeds MAX_FORCE (1000.0)
        
        let result = validate_gait_data(&data[0]);
        assert!(result.is_err(), "Excessive force value should fail validation");
        assert!(result.unwrap_err().contains("Force values are outside expected range"));
    }

    #[test]
    fn test_validate_gait_data_extreme_resistance() {
        let mut data = TestDataGenerator::sample_gait_data("test_device", 1);
        data[0].r1 = 2000.0; // Unrealistic resistance value

        let result = validate_gait_data(&data[0]);
        assert!(result.is_err(), "Extreme resistance should fail validation");
        assert!(result.unwrap_err().contains("Force values are outside expected range"));
    }

    #[test]
    fn test_validate_gait_data_extreme_force() {
        let mut data = TestDataGenerator::sample_gait_data("test_device", 1);
        data[0].r2 = 2000.0; // Unrealistic force reading

        let result = validate_gait_data(&data[0]);
        assert!(result.is_err(), "Extreme force reading should fail validation");
        assert!(result.unwrap_err().contains("Force values are outside expected range"));
    }

    #[test]
    fn test_validate_batch_gait_data() {
        let data = TestDataGenerator::sample_gait_data("test_device", 100);
        
        let perf = PerformanceMeasurement::start("validate_batch_gait_data");
        let results: Vec<_> = data.iter().map(validate_gait_data).collect();
        perf.assert_within_limit(10); // Should validate 100 samples in < 10ms

        let valid_count = results.iter().filter(|r| r.is_ok()).count();
        assert_eq!(valid_count, 100, "All generated test data should be valid");
    }

    #[test]
    fn test_validate_mixed_batch_data() {
        let mut data = TestDataGenerator::sample_gait_data("test_device", 10);
        
        // Introduce some invalid data
        data[3].device_id = "".to_string(); // Invalid empty device ID
        // Note: sample_rate is not a field in GaitData, so we'll skip that test

        let results: Vec<_> = data.iter().map(validate_gait_data).collect();
        let valid_count = results.iter().filter(|r| r.is_ok()).count();
        let invalid_count = results.iter().filter(|r| r.is_err()).count();

        assert_eq!(valid_count, 9, "Should have 9 valid samples");
        assert_eq!(invalid_count, 1, "Should have 1 invalid sample");
    }

    #[test]
    fn test_validation_performance_stress() {
        let large_batch = TestDataGenerator::sample_gait_data("stress_test", 10000);
        
        let perf = PerformanceMeasurement::start("validate_large_batch");
        let results: Vec<_> = large_batch.iter().map(validate_gait_data).collect();
        perf.assert_within_limit(100); // Should validate 10k samples in < 100ms

        let valid_count = results.iter().filter(|r| r.is_ok()).count();
        let error_count = results.iter().filter(|r| r.is_err()).count();
        
        // Debug: print a few error messages
        let mut error_counter = 0;
        for (i, result) in results.iter().enumerate() {
            if let Err(e) = result {
                if error_counter < 5 {
                    println!("Validation error at index {}: {:?}", i, e);
                    error_counter += 1;
                }
            }
        }
        
        println!("Valid: {}, Errors: {}", valid_count, error_count);
        assert_eq!(valid_count, 10000, "All stress test data should be valid");
    }

    #[test]
    fn test_validation_error_messages() {
        let mut data = TestDataGenerator::sample_gait_data("test_device", 1);
        
        // Test each error condition and verify error messages
        data[0].device_id = "".to_string();
        let result = validate_gait_data(&data[0]);
        assert!(result.is_err(), "Empty device ID should fail validation");

        data[0].device_id = "test_device".to_string();
        data[0].timestamp = 0;
        let result = validate_gait_data(&data[0]);
        assert!(result.is_err(), "Zero timestamp should fail validation");
    }

    #[test]
    fn test_validation_boundary_conditions() {
        let mut data = TestDataGenerator::sample_gait_data("test_device", 1);
        
        // Test boundary values for resistance data
        data[0].r1 = 1000.0; // At the upper limit
        let result = validate_gait_data(&data[0]);
        assert!(result.is_ok(), "Boundary resistance value should be valid");

        data[0].r1 = 1000.1; // Just over the limit
        let result = validate_gait_data(&data[0]);
        assert!(result.is_err(), "Over-limit resistance should fail validation");

        data[0].r1 = -1000.0; // At the lower limit
        let result = validate_gait_data(&data[0]);
        assert!(result.is_ok(), "Boundary negative resistance should be valid");

        data[0].r1 = -1000.1; // Just under the limit
        let result = validate_gait_data(&data[0]);
        assert!(result.is_err(), "Under-limit resistance should fail validation");
    }
}
