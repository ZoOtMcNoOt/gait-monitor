// Background batch processing system for the Gait Monitor application
// This module provides job queuing, processing, and progress tracking

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};
use tokio::sync::{mpsc, oneshot};
use tokio::time::{sleep, interval};
use uuid::Uuid;

// Job types that can be processed in batches
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum JobType {
    DataExport {
        session_ids: Vec<String>,
        export_format: String,
        output_path: String,
    },
    DataAnalysis {
        session_ids: Vec<String>,
        analysis_type: String,
        parameters: HashMap<String, String>,
    },
    DataValidation {
        session_ids: Vec<String>,
        validation_rules: Vec<String>,
    },
    DataCleanup {
        older_than_days: u32,
        preserve_important: bool,
    },
    BufferOptimization {
        device_ids: Vec<String>,
        optimization_type: String,
    },
    BackupOperation {
        backup_type: String,
        include_sessions: bool,
        include_config: bool,
    },
    ReportGeneration {
        report_type: String,
        time_range: (DateTime<Utc>, DateTime<Utc>),
        recipients: Vec<String>,
    },
}

// Job status tracking
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum JobStatus {
    Queued,
    Running,
    Completed,
    Failed,
    Cancelled,
    Paused,
}

// Job priority levels
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub enum JobPriority {
    Low = 1,
    Normal = 2,
    High = 3,
    Critical = 4,
}

// Progress tracking information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobProgress {
    pub current_step: u32,
    pub total_steps: u32,
    pub current_item: String,
    pub items_processed: u32,
    pub total_items: u32,
    pub percentage: f64,
    pub estimated_remaining_seconds: u64,
    pub throughput_items_per_second: f64,
    pub last_update: DateTime<Utc>,
}

impl Default for JobProgress {
    fn default() -> Self {
        Self {
            current_step: 0,
            total_steps: 1,
            current_item: String::new(),
            items_processed: 0,
            total_items: 0,
            percentage: 0.0,
            estimated_remaining_seconds: 0,
            throughput_items_per_second: 0.0,
            last_update: Utc::now(),
        }
    }
}

// Batch job definition
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchJob {
    pub id: String,
    pub job_type: JobType,
    pub priority: JobPriority,
    pub status: JobStatus,
    pub progress: JobProgress,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub retry_count: u32,
    pub max_retries: u32,
    pub timeout_seconds: u64,
    pub metadata: HashMap<String, String>,
    pub dependencies: Vec<String>, // Job IDs that must complete first
    pub result_data: Option<String>, // Serialized result
}

impl BatchJob {
    pub fn new(job_type: JobType, priority: JobPriority) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            job_type,
            priority,
            status: JobStatus::Queued,
            progress: JobProgress::default(),
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            error_message: None,
            retry_count: 0,
            max_retries: 3,
            timeout_seconds: 3600, // 1 hour default
            metadata: HashMap::new(),
            dependencies: Vec::new(),
            result_data: None,
        }
    }

    pub fn with_timeout(mut self, timeout_seconds: u64) -> Self {
        self.timeout_seconds = timeout_seconds;
        self
    }

    pub fn with_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    pub fn with_dependencies(mut self, dependencies: Vec<String>) -> Self {
        self.dependencies = dependencies;
        self
    }

    pub fn with_metadata(mut self, key: String, value: String) -> Self {
        self.metadata.insert(key, value);
        self
    }

    pub fn is_ready_to_run(&self, completed_jobs: &HashMap<String, BatchJob>) -> bool {
        if self.status != JobStatus::Queued {
            return false;
        }

        // Check if all dependencies are completed
        for dep_id in &self.dependencies {
            match completed_jobs.get(dep_id) {
                Some(job) if job.status == JobStatus::Completed => continue,
                _ => return false,
            }
        }

        true
    }

    pub fn update_progress(&mut self, items_processed: u32, total_items: u32, current_item: String) {
        self.progress.items_processed = items_processed;
        self.progress.total_items = total_items;
        self.progress.current_item = current_item;
        self.progress.percentage = if total_items > 0 {
            (items_processed as f64 / total_items as f64) * 100.0
        } else {
            0.0
        };

        let now = Utc::now();
        let elapsed = now.signed_duration_since(self.started_at.unwrap_or(self.created_at));
        
        if items_processed > 0 && elapsed.num_seconds() > 0 {
            self.progress.throughput_items_per_second = 
                items_processed as f64 / elapsed.num_seconds() as f64;

            let remaining_items = total_items.saturating_sub(items_processed);
            if self.progress.throughput_items_per_second > 0.0 {
                self.progress.estimated_remaining_seconds = 
                    (remaining_items as f64 / self.progress.throughput_items_per_second) as u64;
            }
        }

        self.progress.last_update = now;
    }
}

// Job execution result
#[derive(Debug, Clone)]
pub enum JobResult {
    Success(Option<String>), // Optional result data
    Failure(String),         // Error message
    Retry(String),          // Retry reason
    Cancel,
}

// Batch processor configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchProcessorConfig {
    pub max_concurrent_jobs: usize,
    pub job_timeout_seconds: u64,
    pub retry_delay_seconds: u64,
    pub max_queue_size: usize,
    pub cleanup_completed_jobs_after_hours: u32,
    pub enable_job_persistence: bool,
    pub worker_thread_count: usize,
    pub priority_scheduling: bool,
}

impl Default for BatchProcessorConfig {
    fn default() -> Self {
        Self {
            max_concurrent_jobs: 4,
            job_timeout_seconds: 3600,
            retry_delay_seconds: 60,
            max_queue_size: 1000,
            cleanup_completed_jobs_after_hours: 24,
            enable_job_persistence: true,
            worker_thread_count: 2,
            priority_scheduling: true,
        }
    }
}

// Job queue statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueStats {
    pub total_jobs: usize,
    pub queued_jobs: usize,
    pub running_jobs: usize,
    pub completed_jobs: usize,
    pub failed_jobs: usize,
    pub cancelled_jobs: usize,
    pub average_processing_time_seconds: f64,
    pub throughput_jobs_per_minute: f64,
    pub queue_length: usize,
    pub oldest_queued_job_age_seconds: u64,
    pub worker_utilization: f64,
}

// Message types for worker communication
#[derive(Debug)]
enum WorkerMessage {
    ProcessJob(BatchJob, oneshot::Sender<JobResult>),
    UpdateProgress(String, JobProgress),
    Shutdown,
}

// Main batch processor
pub struct BatchProcessor {
    jobs: Arc<Mutex<HashMap<String, BatchJob>>>,
    queue: Arc<Mutex<VecDeque<String>>>, // Job IDs in queue order
    config: BatchProcessorConfig,
    worker_tx: mpsc::UnboundedSender<WorkerMessage>,
    stats: Arc<Mutex<QueueStats>>,
    running_jobs: Arc<Mutex<HashMap<String, Instant>>>,
}

impl BatchProcessor {
    pub fn new(config: BatchProcessorConfig) -> Self {
        let (worker_tx, worker_rx) = mpsc::unbounded_channel();
        
        let processor = Self {
            jobs: Arc::new(Mutex::new(HashMap::new())),
            queue: Arc::new(Mutex::new(VecDeque::new())),
            config: config.clone(),
            worker_tx,
            stats: Arc::new(Mutex::new(QueueStats {
                total_jobs: 0,
                queued_jobs: 0,
                running_jobs: 0,
                completed_jobs: 0,
                failed_jobs: 0,
                cancelled_jobs: 0,
                average_processing_time_seconds: 0.0,
                throughput_jobs_per_minute: 0.0,
                queue_length: 0,
                oldest_queued_job_age_seconds: 0,
                worker_utilization: 0.0,
            })),
            running_jobs: Arc::new(Mutex::new(HashMap::new())),
        };

        // Start worker tasks
        processor.start_workers(worker_rx);
        processor.start_scheduler();
        processor.start_cleanup_task();

        processor
    }

    // Submit a new job to the queue
    pub fn submit_job(&self, mut job: BatchJob) -> Result<String, String> {
        let mut jobs = self.jobs.lock().unwrap();
        let mut queue = self.queue.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        if jobs.len() >= self.config.max_queue_size {
            return Err("Job queue is full".to_string());
        }

        job.status = JobStatus::Queued;
        let job_id = job.id.clone();
        
        jobs.insert(job_id.clone(), job);
        
        // Insert job in queue based on priority
        if self.config.priority_scheduling {
            let job_priority = jobs[&job_id].priority;
            let mut inserted = false;
            
            for (i, existing_id) in queue.iter().enumerate() {
                if let Some(existing_job) = jobs.get(existing_id) {
                    if job_priority > existing_job.priority {
                        queue.insert(i, job_id.clone());
                        inserted = true;
                        break;
                    }
                }
            }
            
            if !inserted {
                queue.push_back(job_id.clone());
            }
        } else {
            queue.push_back(job_id.clone());
        }

        stats.total_jobs += 1;
        stats.queued_jobs += 1;
        stats.queue_length = queue.len();

        Ok(job_id)
    }

    // Get job status and progress
    pub fn get_job_status(&self, job_id: &str) -> Option<BatchJob> {
        let jobs = self.jobs.lock().unwrap();
        jobs.get(job_id).cloned()
    }

    // Cancel a job
    pub fn cancel_job(&self, job_id: &str) -> Result<(), String> {
        let mut jobs = self.jobs.lock().unwrap();
        let mut queue = self.queue.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();

        if let Some(job) = jobs.get_mut(job_id) {
            match job.status {
                JobStatus::Queued => {
                    job.status = JobStatus::Cancelled;
                    queue.retain(|id| id != job_id);
                    stats.queued_jobs = stats.queued_jobs.saturating_sub(1);
                    stats.cancelled_jobs += 1;
                    stats.queue_length = queue.len();
                    Ok(())
                }
                JobStatus::Running => {
                    job.status = JobStatus::Cancelled;
                    stats.running_jobs = stats.running_jobs.saturating_sub(1);
                    stats.cancelled_jobs += 1;
                    // Note: Running jobs will check for cancellation and stop
                    Ok(())
                }
                _ => Err("Job cannot be cancelled in current state".to_string()),
            }
        } else {
            Err("Job not found".to_string())
        }
    }

    // Get queue statistics
    pub fn get_stats(&self) -> QueueStats {
        let stats = self.stats.lock().unwrap();
        let mut stats_copy = stats.clone();

        // Update queue length
        let queue = self.queue.lock().unwrap();
        stats_copy.queue_length = queue.len();

        // Calculate oldest queued job age
        if let Some(oldest_id) = queue.front() {
            let jobs = self.jobs.lock().unwrap();
            if let Some(oldest_job) = jobs.get(oldest_id) {
                stats_copy.oldest_queued_job_age_seconds = 
                    Utc::now().signed_duration_since(oldest_job.created_at).num_seconds() as u64;
            }
        }

        // Calculate worker utilization
        let running_jobs = self.running_jobs.lock().unwrap();
        stats_copy.worker_utilization = 
            (running_jobs.len() as f64 / self.config.max_concurrent_jobs as f64) * 100.0;

        stats_copy
    }

    // Get all jobs with optional filtering
    pub fn get_jobs(&self, status_filter: Option<JobStatus>) -> Vec<BatchJob> {
        let jobs = self.jobs.lock().unwrap();
        
        jobs.values()
            .filter(|job| {
                if let Some(filter_status) = &status_filter {
                    &job.status == filter_status
                } else {
                    true
                }
            })
            .cloned()
            .collect()
    }

    // Clear completed jobs older than configured time
    pub fn cleanup_completed_jobs(&self) -> usize {
        let mut jobs = self.jobs.lock().unwrap();
        let mut stats = self.stats.lock().unwrap();
        
        let cutoff_time = Utc::now() - chrono::Duration::hours(
            self.config.cleanup_completed_jobs_after_hours as i64
        );

        let jobs_to_remove: Vec<_> = jobs
            .iter()
            .filter(|(_, job)| {
                matches!(job.status, JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled)
                    && job.completed_at.map_or(false, |completed| completed < cutoff_time)
            })
            .map(|(id, _)| id.clone())
            .collect();

        let removed_count = jobs_to_remove.len();
        
        for job_id in jobs_to_remove {
            if let Some(job) = jobs.remove(&job_id) {
                match job.status {
                    JobStatus::Completed => stats.completed_jobs = stats.completed_jobs.saturating_sub(1),
                    JobStatus::Failed => stats.failed_jobs = stats.failed_jobs.saturating_sub(1),
                    JobStatus::Cancelled => stats.cancelled_jobs = stats.cancelled_jobs.saturating_sub(1),
                    _ => {}
                }
            }
        }

        stats.total_jobs = jobs.len();
        removed_count
    }

    // Start worker tasks
    fn start_workers(&self, mut worker_rx: mpsc::UnboundedReceiver<WorkerMessage>) {
        let jobs = Arc::clone(&self.jobs);
        let stats = Arc::clone(&self.stats);
        let running_jobs = Arc::clone(&self.running_jobs);

        tokio::spawn(async move {
            while let Some(message) = worker_rx.recv().await {
                match message {
                    WorkerMessage::ProcessJob(mut job, result_tx) => {
                        let job_id = job.id.clone();
                        let start_time = Instant::now();
                        
                        // Update job status to running
                        {
                            let mut jobs_lock = jobs.lock().unwrap();
                            let mut stats_lock = stats.lock().unwrap();
                            let mut running_lock = running_jobs.lock().unwrap();
                            
                            if let Some(stored_job) = jobs_lock.get_mut(&job_id) {
                                stored_job.status = JobStatus::Running;
                                stored_job.started_at = Some(Utc::now());
                            }
                            
                            stats_lock.queued_jobs = stats_lock.queued_jobs.saturating_sub(1);
                            stats_lock.running_jobs += 1;
                            running_lock.insert(job_id.clone(), start_time);
                        }

                        // Process the job
                        let result = Self::process_job_type(&job).await;
                        let processing_time = start_time.elapsed();

                        // Update job status and statistics
                        {
                            let mut jobs_lock = jobs.lock().unwrap();
                            let mut stats_lock = stats.lock().unwrap();
                            let mut running_lock = running_jobs.lock().unwrap();
                            
                            if let Some(stored_job) = jobs_lock.get_mut(&job_id) {
                                stored_job.completed_at = Some(Utc::now());
                                
                                match &result {
                                    JobResult::Success(data) => {
                                        stored_job.status = JobStatus::Completed;
                                        stored_job.result_data = data.clone();
                                        stored_job.progress.percentage = 100.0;
                                        stats_lock.completed_jobs += 1;
                                    }
                                    JobResult::Failure(error) => {
                                        stored_job.status = JobStatus::Failed;
                                        stored_job.error_message = Some(error.clone());
                                        stats_lock.failed_jobs += 1;
                                    }
                                    JobResult::Retry(reason) => {
                                        stored_job.retry_count += 1;
                                        if stored_job.retry_count < stored_job.max_retries {
                                            stored_job.status = JobStatus::Queued;
                                            stored_job.error_message = Some(reason.clone());
                                        } else {
                                            stored_job.status = JobStatus::Failed;
                                            stored_job.error_message = Some(format!("Max retries exceeded: {}", reason));
                                            stats_lock.failed_jobs += 1;
                                        }
                                    }
                                    JobResult::Cancel => {
                                        stored_job.status = JobStatus::Cancelled;
                                        stats_lock.cancelled_jobs += 1;
                                    }
                                }
                            }
                            
                            stats_lock.running_jobs = stats_lock.running_jobs.saturating_sub(1);
                            running_lock.remove(&job_id);
                            
                            // Update average processing time
                            let total_completed = stats_lock.completed_jobs + stats_lock.failed_jobs;
                            if total_completed > 0 {
                                stats_lock.average_processing_time_seconds = 
                                    (stats_lock.average_processing_time_seconds * (total_completed - 1) as f64 + 
                                     processing_time.as_secs_f64()) / total_completed as f64;
                            }
                        }

                        let _ = result_tx.send(result);
                    }
                    WorkerMessage::UpdateProgress(job_id, progress) => {
                        let mut jobs_lock = jobs.lock().unwrap();
                        if let Some(job) = jobs_lock.get_mut(&job_id) {
                            job.progress = progress;
                        }
                    }
                    WorkerMessage::Shutdown => break,
                }
            }
        });
    }

    // Start job scheduler
    fn start_scheduler(&self) {
        let jobs = Arc::clone(&self.jobs);
        let queue = Arc::clone(&self.queue);
        let worker_tx = self.worker_tx.clone();
        let max_concurrent = self.config.max_concurrent_jobs;
        let running_jobs = Arc::clone(&self.running_jobs);

        tokio::spawn(async move {
            let mut scheduler_interval = interval(Duration::from_millis(1000));
            
            loop {
                scheduler_interval.tick().await;
                
                // Check if we can start new jobs
                let current_running = {
                    let running = running_jobs.lock().unwrap();
                    running.len()
                };
                
                if current_running >= max_concurrent {
                    continue;
                }
                
                // Get next job from queue
                let next_job_id = {
                    let mut queue_lock = queue.lock().unwrap();
                    queue_lock.pop_front()
                };
                
                if let Some(job_id) = next_job_id {
                    let job = {
                        let jobs_lock = jobs.lock().unwrap();
                        jobs_lock.get(&job_id).cloned()
                    };
                    
                    if let Some(job) = job {
                        // Check if job is ready to run (dependencies satisfied)
                        let completed_jobs = {
                            let jobs_lock = jobs.lock().unwrap();
                            jobs_lock.clone()
                        };
                        
                        if job.is_ready_to_run(&completed_jobs) {
                            let (result_tx, _result_rx) = oneshot::channel();
                            let _ = worker_tx.send(WorkerMessage::ProcessJob(job, result_tx));
                        } else {
                            // Put job back in queue
                            let mut queue_lock = queue.lock().unwrap();
                            queue_lock.push_back(job_id);
                        }
                    }
                }
            }
        });
    }

    // Start cleanup task
    fn start_cleanup_task(&self) {
        let jobs = Arc::clone(&self.jobs);
        let stats = Arc::clone(&self.stats);
        let cleanup_hours = self.config.cleanup_completed_jobs_after_hours;

        tokio::spawn(async move {
            let mut cleanup_interval = interval(Duration::from_secs(3600)); // Run every hour
            
            loop {
                cleanup_interval.tick().await;
                
                let cutoff_time = Utc::now() - chrono::Duration::hours(cleanup_hours as i64);
                let mut jobs_lock = jobs.lock().unwrap();
                let mut stats_lock = stats.lock().unwrap();
                
                let jobs_to_remove: Vec<_> = jobs_lock
                    .iter()
                    .filter(|(_, job)| {
                        matches!(job.status, JobStatus::Completed | JobStatus::Failed | JobStatus::Cancelled)
                            && job.completed_at.map_or(false, |completed| completed < cutoff_time)
                    })
                    .map(|(id, _)| id.clone())
                    .collect();
                
                for job_id in jobs_to_remove {
                    if let Some(job) = jobs_lock.remove(&job_id) {
                        match job.status {
                            JobStatus::Completed => stats_lock.completed_jobs = stats_lock.completed_jobs.saturating_sub(1),
                            JobStatus::Failed => stats_lock.failed_jobs = stats_lock.failed_jobs.saturating_sub(1),
                            JobStatus::Cancelled => stats_lock.cancelled_jobs = stats_lock.cancelled_jobs.saturating_sub(1),
                            _ => {}
                        }
                    }
                }
                
                stats_lock.total_jobs = jobs_lock.len();
            }
        });
    }

    // Process different job types
    async fn process_job_type(job: &BatchJob) -> JobResult {
        match &job.job_type {
            JobType::DataExport { session_ids, export_format, output_path } => {
                // Simulate export processing
                for (i, session_id) in session_ids.iter().enumerate() {
                    // Check for cancellation
                    if job.status == JobStatus::Cancelled {
                        return JobResult::Cancel;
                    }
                    
                    // Simulate processing time
                    sleep(Duration::from_millis(500)).await;
                    
                    // Update progress would be sent via worker message in real implementation
                    // For now, we'll just simulate the processing
                }
                
                JobResult::Success(Some(format!("Exported {} sessions to {}", session_ids.len(), output_path)))
            }
            
            JobType::DataAnalysis { session_ids, analysis_type, parameters } => {
                // Simulate analysis processing
                sleep(Duration::from_secs(2)).await;
                JobResult::Success(Some(format!("Analyzed {} sessions with {}", session_ids.len(), analysis_type)))
            }
            
            JobType::DataValidation { session_ids, validation_rules } => {
                // Simulate validation processing
                for session_id in session_ids {
                    sleep(Duration::from_millis(200)).await;
                }
                JobResult::Success(Some(format!("Validated {} sessions", session_ids.len())))
            }
            
            JobType::DataCleanup { older_than_days, preserve_important } => {
                // Simulate cleanup processing
                sleep(Duration::from_secs(1)).await;
                JobResult::Success(Some(format!("Cleaned up data older than {} days", older_than_days)))
            }
            
            JobType::BufferOptimization { device_ids, optimization_type } => {
                // Simulate buffer optimization
                sleep(Duration::from_millis(800)).await;
                JobResult::Success(Some(format!("Optimized {} device buffers", device_ids.len())))
            }
            
            JobType::BackupOperation { backup_type, include_sessions, include_config } => {
                // Simulate backup processing
                sleep(Duration::from_secs(3)).await;
                JobResult::Success(Some(format!("Created {} backup", backup_type)))
            }
            
            JobType::ReportGeneration { report_type, time_range, recipients } => {
                // Simulate report generation
                sleep(Duration::from_secs(2)).await;
                JobResult::Success(Some(format!("Generated {} report for {} recipients", report_type, recipients.len())))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_batch_job_creation() {
        let job_type = JobType::DataExport {
            session_ids: vec!["session1".to_string()],
            export_format: "CSV".to_string(),
            output_path: "/tmp/export.csv".to_string(),
        };
        
        let job = BatchJob::new(job_type, JobPriority::Normal)
            .with_timeout(1800)
            .with_retries(5);
        
        assert_eq!(job.priority, JobPriority::Normal);
        assert_eq!(job.timeout_seconds, 1800);
        assert_eq!(job.max_retries, 5);
        assert_eq!(job.status, JobStatus::Queued);
    }

    #[tokio::test]
    async fn test_batch_processor_submit() {
        let config = BatchProcessorConfig::default();
        let processor = BatchProcessor::new(config);
        
        let job_type = JobType::DataValidation {
            session_ids: vec!["session1".to_string()],
            validation_rules: vec!["rule1".to_string()],
        };
        
        let job = BatchJob::new(job_type, JobPriority::High);
        let job_id = processor.submit_job(job).unwrap();
        
        assert!(!job_id.is_empty());
        
        // Wait a moment for processing
        sleep(Duration::from_millis(100)).await;
        
        let stats = processor.get_stats();
        assert!(stats.total_jobs > 0);
    }

    #[tokio::test]
    async fn test_job_priority_scheduling() {
        let mut config = BatchProcessorConfig::default();
        config.priority_scheduling = true;
        config.max_concurrent_jobs = 1; // Process one at a time to test ordering
        
        let processor = BatchProcessor::new(config);
        
        // Submit jobs with different priorities
        let low_job = BatchJob::new(
            JobType::DataCleanup { older_than_days: 30, preserve_important: true },
            JobPriority::Low,
        );
        let high_job = BatchJob::new(
            JobType::DataValidation {
                session_ids: vec!["urgent".to_string()],
                validation_rules: vec!["critical".to_string()],
            },
            JobPriority::High,
        );
        
        let low_id = processor.submit_job(low_job).unwrap();
        let high_id = processor.submit_job(high_job).unwrap();
        
        // Wait for processing
        sleep(Duration::from_millis(500)).await;
        
        let low_status = processor.get_job_status(&low_id).unwrap();
        let high_status = processor.get_job_status(&high_id).unwrap();
        
        // High priority job should be processed first or at least started
        assert!(high_status.started_at.is_some() || high_status.status == JobStatus::Completed);
    }
}
