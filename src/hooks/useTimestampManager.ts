import { useRef, useCallback, useEffect } from 'react';
import { TimestampManager, type TimestampConfig, type CachedTimestamp } from '../utils/TimestampManager';

interface UseTimestampManagerOptions extends Partial<TimestampConfig> {
  /** Whether to use global instance or create new one */
  useGlobalInstance?: boolean;
  /** Auto-set base timestamp on first data point */
  autoSetBase?: boolean;
}

interface TimestampManagerHook {
  /** The timestamp manager instance */
  manager: TimestampManager;
  /** Set base timestamp for relative calculations */
  setBaseTimestamp: (timestamp: number) => void;
  /** Normalize backend timestamp to frontend format */
  normalizeTimestamp: (timestamp: number) => CachedTimestamp;
  /** Get timestamp formatted for Chart.js */
  getChartTimestamp: (timestamp: number) => number;
  /** Format timestamp for display */
  formatTimestamp: (timestamp: number, format?: 'absolute' | 'relative' | 'duration') => string;
  /** Calculate time difference between timestamps */
  getTimeDifference: (timestamp1: number, timestamp2: number) => number;
  /** Get cache statistics */
  getCacheStats: () => { size: number; baseTimestamp: number | null; useRelativeTime: boolean };
  /** Clear timestamp cache */
  clearCache: () => void;
}

/**
 * React hook for efficient timestamp management with caching
 * 
 * Provides a consistent interface for timestamp operations across components
 * and automatically handles cleanup on unmount.
 */
export const useTimestampManager = (options: UseTimestampManagerOptions = {}): TimestampManagerHook => {
  const {
    useGlobalInstance = true,
    autoSetBase = true,
    ...timestampConfig
  } = options;

  // Get or create timestamp manager
  const managerRef = useRef<TimestampManager | null>(null);
  
  if (!managerRef.current) {
    managerRef.current = useGlobalInstance 
      ? TimestampManager.getInstance(timestampConfig)
      : new TimestampManager(timestampConfig);
  }

  const manager = managerRef.current;

  // Track if base timestamp has been set
  const baseTimestampSetRef = useRef(false);

  const setBaseTimestamp = useCallback((timestamp: number) => {
    manager.setBaseTimestamp(timestamp);
    baseTimestampSetRef.current = true;
  }, [manager]);

  const normalizeTimestamp = useCallback((timestamp: number): CachedTimestamp => {
    // Auto-set base timestamp on first call if enabled
    if (autoSetBase && !baseTimestampSetRef.current) {
      setBaseTimestamp(timestamp);
    }
    
    return manager.normalizeTimestamp(timestamp);
  }, [manager, autoSetBase, setBaseTimestamp]);

  const getChartTimestamp = useCallback((timestamp: number): number => {
    // Auto-set base if needed
    if (autoSetBase && !baseTimestampSetRef.current) {
      setBaseTimestamp(timestamp);
    }
    
    return manager.getChartTimestamp(timestamp);
  }, [manager, autoSetBase, setBaseTimestamp]);

  const formatTimestamp = useCallback((
    timestamp: number, 
    format: 'absolute' | 'relative' | 'duration' = 'relative'
  ): string => {
    return manager.formatTimestamp(timestamp, format);
  }, [manager]);

  const getTimeDifference = useCallback((timestamp1: number, timestamp2: number): number => {
    return manager.getTimeDifference(timestamp1, timestamp2);
  }, [manager]);

  const getCacheStats = useCallback(() => {
    return manager.getCacheStats();
  }, [manager]);

  const clearCache = useCallback(() => {
    manager.clearCache();
  }, [manager]);

  // Cleanup on unmount (only for non-global instances)
  useEffect(() => {
    return () => {
      if (!useGlobalInstance) {
        manager.clearCache();
      }
    };
  }, [manager, useGlobalInstance]);

  return {
    manager,
    setBaseTimestamp,
    normalizeTimestamp,
    getChartTimestamp,
    formatTimestamp,
    getTimeDifference,
    getCacheStats,
    clearCache
  };
};

/**
 * Hook for simple timestamp formatting without caching
 * Useful for display-only components that don't need full timestamp management
 */
export const useTimestampFormatter = () => {
  const formatRelativeTime = useCallback((timestamp: number, baseTimestamp: number): string => {
    const current = timestamp > 1e12 ? timestamp / 1000 : timestamp;
    const base = baseTimestamp > 1e12 ? baseTimestamp / 1000 : baseTimestamp;
    const relativeSeconds = (current - base) / 1000;
    return `${relativeSeconds.toFixed(2)}s`;
  }, []);

  const formatAbsoluteTime = useCallback((timestamp: number): string => {
    const ms = timestamp > 1e12 ? timestamp / 1000 : timestamp;
    return new Date(ms).toLocaleTimeString();
  }, []);

  const formatDuration = useCallback((timestamp: number, baseTimestamp: number): string => {
    const current = timestamp > 1e12 ? timestamp / 1000 : timestamp;
    const base = baseTimestamp > 1e12 ? baseTimestamp / 1000 : baseTimestamp;
    const relativeSeconds = (current - base) / 1000;
    
    const minutes = Math.floor(relativeSeconds / 60);
    const seconds = (relativeSeconds % 60).toFixed(1);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }, []);

  return {
    formatRelativeTime,
    formatAbsoluteTime,
    formatDuration
  };
};

export default useTimestampManager;
