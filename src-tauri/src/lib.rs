// Module declarations
pub mod analytics;
pub mod backup_system;
pub mod batch_processing;
pub mod buffer_manager;
pub mod cache;
pub mod config;
pub mod data_processing;
pub mod device_management;
pub mod file_operations;
pub mod monitoring;
pub mod path_manager;
pub mod security;
pub mod validation;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

// Include Phase 5.1 comprehensive testing module
#[cfg(test)]
pub mod tests;
