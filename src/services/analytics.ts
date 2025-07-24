import { invoke } from '@tauri-apps/api/core';
import type { GaitDataPoint } from '../types';

// Type definitions that match the Rust backend
export interface StatisticalSummary {
  count: number;
  min: number;
  max: number;
  mean: number;
  std_dev: number;
  median: number;
  variance: number;
}

export interface DeviceStatistics {
  device_id: string;
  sample_count: number;
  avg_sample_rate: number;
  data_range_ms: number;
  first_sample_time: number;
  last_sample_time: number;
  data_quality_score: number;
}

export interface SessionStatistics {
  session_duration_ms: number;
  total_samples: number;
  device_count: number;
  sample_rate_stats: Record<string, number>;
  data_stats: Record<string, StatisticalSummary>;
  device_stats: Record<string, DeviceStatistics>;
}

export interface DataSummary {
  time_range: [number, number];
  device_summaries: Record<string, DeviceStatistics>;
  overall_stats: StatisticalSummary;
  data_completeness: number;
}

export interface DevicePerformanceAnalysis {
  device_id: string;
  connection_stability: number;
  data_consistency: number;
  latency_stats: StatisticalSummary;
  error_rate: number;
  recommendations: string[];
}

// Use const assertions instead of enums for better compatibility
export const DataField = {
  R1: 'R1',
  R2: 'R2', 
  R3: 'R3',
  X: 'X',
  Y: 'Y',
  Z: 'Z',
  All: 'All'
} as const;

export type DataField = typeof DataField[keyof typeof DataField];

export const UnitConversion = {
  None: 'None',
  MeterToFeet: 'MeterToFeet',
  FeetToMeter: 'FeetToMeter',
  MsToSeconds: 'MsToSeconds',
  SecondsToMs: 'SecondsToMs',
  DegreeToRadians: 'DegreeToRadians',
  RadiansToDegree: 'RadiansToDegree'
} as const;

export type UnitConversion = typeof UnitConversion[keyof typeof UnitConversion];

export const NormalizationMethod = {
  None: 'None',
  MinMax: 'MinMax',
  ZScore: 'ZScore',
  Robust: 'Robust'
} as const;

export type NormalizationMethod = typeof NormalizationMethod[keyof typeof NormalizationMethod];

export interface ExportFormat {
  format: string;
  include_headers: boolean;
  delimiter: string;
  precision: number;
}

// Analytics service implementation
export class AnalyticsService {
  
  /**
   * Calculate comprehensive session statistics
   */
  async calculateSessionStatistics(data: GaitDataPoint[]): Promise<SessionStatistics> {
    try {
      return await invoke('calculate_session_statistics_cmd', { data });
    } catch (error) {
      throw new Error(`Failed to calculate session statistics: ${error}`);
    }
  }

  /**
   * Get data summary for a specific time range
   */
  async getDataSummary(
    data: GaitDataPoint[], 
    startTime?: number, 
    endTime?: number
  ): Promise<DataSummary> {
    try {
      return await invoke('get_data_summary_cmd', { 
        data, 
        startTime: startTime || null,
        endTime: endTime || null
      });
    } catch (error) {
      throw new Error(`Failed to get data summary: ${error}`);
    }
  }

  /**
   * Analyze device performance and get recommendations
   */
  async analyzeDevicePerformance(deviceId: string, data: GaitDataPoint[]): Promise<DevicePerformanceAnalysis> {
    try {
      return await invoke('analyze_device_performance_cmd', { deviceId, data });
    } catch (error) {
      throw new Error(`Failed to analyze device performance: ${error}`);
    }
  }

  /**
   * Filter data by time range
   */
  async filterDataByTimeRange(data: GaitDataPoint[], startTime: number, endTime: number): Promise<GaitDataPoint[]> {
    try {
      return await invoke('filter_data_by_time_range_cmd', { data, startTime, endTime });
    } catch (error) {
      throw new Error(`Failed to filter data by time range: ${error}`);
    }
  }

  /**
   * Filter data by device IDs
   */
  async filterDataByDevices(data: GaitDataPoint[], deviceIds: string[]): Promise<GaitDataPoint[]> {
    try {
      return await invoke('filter_data_by_devices_cmd', { data, deviceIds });
    } catch (error) {
      throw new Error(`Failed to filter data by devices: ${error}`);
    }
  }

  /**
   * Extract specific field values from data
   */
  async extractFieldValues(data: GaitDataPoint[], field: DataField): Promise<number[]> {
    try {
      return await invoke('extract_field_values_cmd', { data, field });
    } catch (error) {
      throw new Error(`Failed to extract field values: ${error}`);
    }
  }

  /**
   * Convert units for a set of values
   */
  async convertUnits(values: number[], conversion: UnitConversion): Promise<number[]> {
    try {
      return await invoke('convert_units_cmd', { values, conversion });
    } catch (error) {
      throw new Error(`Failed to convert units: ${error}`);
    }
  }

  /**
   * Normalize data using specified method
   */
  async normalizeData(values: number[], method: NormalizationMethod): Promise<number[]> {
    try {
      return await invoke('normalize_data_cmd', { values, method });
    } catch (error) {
      throw new Error(`Failed to normalize data: ${error}`);
    }
  }

  /**
   * Generate CSV header for export
   */
  async generateCsvHeader(format: ExportFormat): Promise<string> {
    try {
      return await invoke('generate_csv_header_cmd', { format });
    } catch (error) {
      throw new Error(`Failed to generate CSV header: ${error}`);
    }
  }

  // Convenience methods for common operations

  /**
   * Get basic statistics for a specific field across all devices
   */
  async getFieldStatistics(data: GaitDataPoint[], field: DataField): Promise<StatisticalSummary> {
    const stats = await this.calculateSessionStatistics(data);
    
    // Return the specific field stats from the session statistics
    const fieldKey = field.toLowerCase();
    return stats.data_stats[fieldKey] || {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      std_dev: 0,
      median: 0,
      variance: 0
    };
  }

  /**
   * Get device performance summary for all devices in dataset
   */
  async getDevicePerformanceSummary(data: GaitDataPoint[]): Promise<Record<string, DevicePerformanceAnalysis>> {
    const deviceIds = [...new Set(data.map(d => d.device_id))];
    const results: Record<string, DevicePerformanceAnalysis> = {};

    for (const deviceId of deviceIds) {
      try {
        results[deviceId] = await this.analyzeDevicePerformance(deviceId, data);
      } catch (error) {
        console.warn(`Failed to analyze performance for device ${deviceId}:`, error);
      }
    }

    return results;
  }

  /**
   * Process data with filtering, transformation, and normalization pipeline
   */
  async processDataPipeline(
    data: GaitDataPoint[],
    options: {
      timeRange?: { start: number; end: number };
      deviceIds?: string[];
      field?: DataField;
      unitConversion?: UnitConversion;
      normalization?: NormalizationMethod;
    }
  ): Promise<{ processedData: GaitDataPoint[]; processedValues?: number[] }> {
    let processedData = data;

    // Apply time range filter
    if (options.timeRange) {
      processedData = await this.filterDataByTimeRange(
        processedData, 
        options.timeRange.start, 
        options.timeRange.end
      );
    }

    // Apply device filter
    if (options.deviceIds) {
      processedData = await this.filterDataByDevices(processedData, options.deviceIds);
    }

    // Extract and process field values if specified
    let processedValues: number[] | undefined;
    if (options.field) {
      processedValues = await this.extractFieldValues(processedData, options.field);

      // Apply unit conversion
      if (options.unitConversion && options.unitConversion !== UnitConversion.None) {
        processedValues = await this.convertUnits(processedValues, options.unitConversion);
      }

      // Apply normalization
      if (options.normalization && options.normalization !== NormalizationMethod.None) {
        processedValues = await this.normalizeData(processedValues, options.normalization);
      }
    }

    return { processedData, processedValues };
  }

  /**
   * Generate export-ready CSV data
   */
  async generateExportCsv(
    data: GaitDataPoint[], 
    format: ExportFormat = {
      format: 'csv',
      include_headers: true,
      delimiter: ',',
      precision: 3
    }
  ): Promise<{ header: string; csvData: string }> {
    try {
      const header = await this.generateCsvHeader(format);
      
      // For now, we'll generate CSV data on the frontend
      // In a future enhancement, this could be moved to backend for better performance
      let csvData = '';
      
      for (const sample of data) {
        csvData += `${sample.device_id}${format.delimiter}`;
        csvData += `${sample.timestamp}${format.delimiter}`;
        csvData += `${sample.r1.toFixed(format.precision)}${format.delimiter}`;
        csvData += `${sample.r2.toFixed(format.precision)}${format.delimiter}`;
        csvData += `${sample.r3.toFixed(format.precision)}${format.delimiter}`;
        csvData += `${sample.x.toFixed(format.precision)}${format.delimiter}`;
        csvData += `${sample.y.toFixed(format.precision)}${format.delimiter}`;
        csvData += `${sample.z.toFixed(format.precision)}\n`;
      }

      return { header, csvData };
    } catch (error) {
      throw new Error(`Failed to generate export CSV: ${error}`);
    }
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();

// Utility functions
export const formatStatisticalSummary = (stats: StatisticalSummary): string => {
  return `Count: ${stats.count}, Mean: ${stats.mean.toFixed(3)}, Std Dev: ${stats.std_dev.toFixed(3)}, Range: [${stats.min.toFixed(3)}, ${stats.max.toFixed(3)}]`;
};

export const formatDevicePerformance = (analysis: DevicePerformanceAnalysis): string => {
  const stability = (analysis.connection_stability * 100).toFixed(1);
  const consistency = (analysis.data_consistency * 100).toFixed(1);
  const errorRate = (analysis.error_rate * 100).toFixed(1);
  
  return `Stability: ${stability}%, Consistency: ${consistency}%, Error Rate: ${errorRate}%`;
};

export const getPerformanceColor = (score: number): string => {
  if (score >= 0.8) return '#4ade80'; // green
  if (score >= 0.6) return '#fbbf24'; // yellow
  if (score >= 0.4) return '#fb923c'; // orange
  return '#ef4444'; // red
};
