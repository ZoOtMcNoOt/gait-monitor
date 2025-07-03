// Type definitions for the Gait Monitor application

export interface SessionMetadata {
  id: string;
  session_name: string;
  subject_id: string;
  notes: string;
  timestamp: number;
  data_points: number;
  file_path: string;
  devices: string[];
}

export interface LogEntry {
  id: string;
  session_name: string;
  subject_id: string;
  timestamp: number;
  data_points: number;
  file_path: string;
  notes?: string;
  devices: string[];
}

// Legacy interface for backward compatibility (used by LogsTable.tsx)
export interface LegacySession {
  id: string | number;
  date: number;
  meta: {
    name: string;
    [key: string]: unknown;
  };
  data: unknown[];
  csv: string;
}

export interface GaitDataPoint {
  device_id: string;
  r1: number;
  r2: number;
  r3: number;
  x: number;
  y: number;
  z: number;
  timestamp: number;
  sequence?: number;
}

export interface DeviceInfo {
  id: string;
  name: string | null;
  address_type: string;
  rssi?: number;
  connectable: boolean;
  services: string[];
  manufacturer_data: string[];
}

export interface DeviceHeartbeat {
  sequence: number;
  device_timestamp: number;
  received_timestamp: number;
}

export interface ConnectionStatus {
  status: 'connected' | 'disconnected' | 'timeout';
  lastUpdate: number;
}

export interface AppError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: number;
}

export interface AppSettings {
  darkMode: boolean;
  autoReconnect: boolean;
  chartSmoothing: boolean;
  dataRetentionDays: number;
  defaultStoragePath?: string;
  exportFormat: 'csv' | 'json';
}

export interface ExportProgress {
  sessionId: string;
  progress: number; // 0-100
  status: 'pending' | 'copying' | 'completed' | 'error';
  error?: string;
}

// Tauri command response types
export interface TauriResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Chart data types
export interface ChartDataPoint {
  x: number;
  y: number;
}

export interface ChartDataset {
  label: string;
  data: ChartDataPoint[];
  borderColor: string;
  backgroundColor: string;
  tension: number;
  pointRadius: number;
  borderWidth: number;
}

// Form validation types
export interface ValidationError {
  field: string;
  message: string;
}

export interface FormState<T> {
  data: T;
  errors: ValidationError[];
  isValid: boolean;
  isSubmitting: boolean;
}
