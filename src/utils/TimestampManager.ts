/**
 * Timestamp Conversion Utilities
 * 
 * Centralizes all timestamp operations to eliminate conversion overhead
 * and provide consistent timing throughout the application.
 */

// Standard precision: Use milliseconds throughout the application
// This eliminates the need for microsecond precision while maintaining accuracy

export interface TimestampConfig {
  /** Base timestamp for relative time calculations (ms) */
  baseTimestamp: number | null;
  /** Whether to use relative time (true) or absolute time (false) */
  useRelativeTime: boolean;
  /** Cache duration for timestamp calculations (ms) */
  cacheExpiration: number;
}

export interface CachedTimestamp {
  absolute: number; // milliseconds since epoch
  relative: number; // seconds since base
  computed: number; // when this was computed
}

/**
 * High-performance timestamp manager with caching
 */
export class TimestampManager {
  private config: TimestampConfig;
  private cache = new Map<number, CachedTimestamp>();
  private static instance: TimestampManager | null = null;

  constructor(config: Partial<TimestampConfig> = {}) {
    this.config = {
      baseTimestamp: null,
      useRelativeTime: true,
      cacheExpiration: 1000, // 1 second cache
      ...config
    };
  }

  /**
   * Get singleton instance for consistent timestamp management
   */
  static getInstance(config?: Partial<TimestampConfig>): TimestampManager {
    if (!TimestampManager.instance) {
      TimestampManager.instance = new TimestampManager(config);
    }
    return TimestampManager.instance;
  }

  /**
   * Set the base timestamp for relative time calculations
   * Backend always provides milliseconds since Unix epoch
   */
  setBaseTimestamp(timestamp: number): void {
    // Backend always provides millisecond timestamps - use directly
    this.config.baseTimestamp = timestamp;
    this.clearCache(); // Clear cache when base changes
  }

  /**
   * Get current timestamp in consistent format (milliseconds)
   */
  getCurrentTimestamp(): number {
    return Date.now();
  }

  /**
   * Convert backend timestamp to frontend format with caching
   */
  /**
   * Convert backend timestamp to frontend format with caching
   * Backend always provides milliseconds since Unix epoch
   */
  normalizeTimestamp(backendTimestamp: number): CachedTimestamp {
    // Check cache first
    const cached = this.cache.get(backendTimestamp);
    if (cached && (Date.now() - cached.computed) < this.config.cacheExpiration) {
      return cached;
    }

    // Backend always provides millisecond timestamps - use directly
    const absoluteMs = backendTimestamp;
    
    // Calculate relative time in seconds if base is set
    let relativeSeconds = 0;
    if (this.config.baseTimestamp !== null && this.config.useRelativeTime) {
      relativeSeconds = (absoluteMs - this.config.baseTimestamp) / 1000;
    }

    const result: CachedTimestamp = {
      absolute: absoluteMs,
      relative: relativeSeconds,
      computed: Date.now()
    };

    // Cache the result
    this.cache.set(backendTimestamp, result);
    
    // Clean up old cache entries periodically
    if (this.cache.size > 1000) {
      this.cleanupCache();
    }

    return result;
  }

  /**
   * Format timestamp for display
   */
  formatTimestamp(timestamp: number, format: 'absolute' | 'relative' | 'duration' | 'full' = 'relative'): string {
    const normalized = this.normalizeTimestamp(timestamp);

    switch (format) {
      case 'absolute':
        return new Date(normalized.absolute).toLocaleTimeString();
      
      case 'full':
        return new Date(normalized.absolute).toLocaleString();
      
      case 'relative':
        return `${normalized.relative.toFixed(2)}s`;
      
      case 'duration': {
        const minutes = Math.floor(normalized.relative / 60);
        const seconds = (normalized.relative % 60).toFixed(1);
        return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      }
      
      default:
        return normalized.relative.toFixed(2);
    }
  }

  /**
   * Calculate time difference efficiently
   */
  getTimeDifference(timestamp1: number, timestamp2: number): number {
    const ts1 = this.normalizeTimestamp(timestamp1);
    const ts2 = this.normalizeTimestamp(timestamp2);
    return Math.abs(ts1.absolute - ts2.absolute);
  }

  /**
   * Get timestamp for Chart.js (relative time in seconds)
   */
  getChartTimestamp(backendTimestamp: number): number {
    const normalized = this.normalizeTimestamp(backendTimestamp);
    return this.config.useRelativeTime ? normalized.relative : normalized.absolute;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.computed > this.config.cacheExpiration) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached timestamps
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      baseTimestamp: this.config.baseTimestamp,
      useRelativeTime: this.config.useRelativeTime
    };
  }
}

// Utility functions for common operations
export const timestampUtils = {
  /**
   * Create a timestamp manager instance
   */
  createManager: (config?: Partial<TimestampConfig>) => new TimestampManager(config),

  /**
   * Get the global timestamp manager
   */
  getGlobalManager: () => TimestampManager.getInstance(),

  /**
   * Convert microseconds to milliseconds safely
   */
  microToMilli: (microseconds: number): number => {
    return microseconds > 1e12 ? microseconds / 1000 : microseconds;
  },

  /**
   * Convert milliseconds to seconds for Chart.js
   */
  milliToSeconds: (milliseconds: number): number => {
    return milliseconds / 1000;
  },

  /**
   * Check if timestamp is in microseconds
   */
  isMicroseconds: (timestamp: number): boolean => {
    return timestamp > 1e12;
  },

  /**
   * Get relative time in seconds
   */
  getRelativeTime: (timestamp: number, baseTimestamp: number): number => {
    const current = timestampUtils.microToMilli(timestamp);
    const base = timestampUtils.microToMilli(baseTimestamp);
    return (current - base) / 1000;
  }
};

export default TimestampManager;
