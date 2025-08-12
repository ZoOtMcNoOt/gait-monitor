import type { GaitDataPoint, ChartDataPoint } from '../types'

// Chart data transformation utilities for testing
export const transformGaitDataToChart = (
  gaitData: GaitDataPoint[],
  valueKey: keyof Pick<GaitDataPoint, 'r1' | 'r2' | 'r3' | 'x' | 'y' | 'z'> = 'x',
): ChartDataPoint[] => {
  return gaitData.map((point) => ({
    x: point.timestamp,
    y: point[valueKey] as number,
  }))
}

export const groupDataByDevice = (data: GaitDataPoint[]): Map<string, GaitDataPoint[]> => {
  const deviceMap = new Map<string, GaitDataPoint[]>()

  data.forEach((point) => {
    const deviceData = deviceMap.get(point.device_id) || []
    deviceData.push(point)
    deviceMap.set(point.device_id, deviceData)
  })

  return deviceMap
}

export const formatDeviceId = (deviceId: string): string => {
  // Standardize device ID format
  const cleanId = deviceId.trim().toLowerCase()

  // Handle common prefixes
  if (cleanId.startsWith('device-') || cleanId.startsWith('dev-')) {
    return cleanId
  }

  // Add device prefix if missing
  if (cleanId.match(/^\d+$/)) {
    return `device-${cleanId}`
  }

  return cleanId
}

export const validateDeviceId = (deviceId: string): boolean => {
  // Check if device ID is valid format
  const trimmed = deviceId.trim()
  if (trimmed.length === 0) return false
  if (trimmed.length > 50) return false

  // Allow alphanumeric, hyphens, underscores
  return /^[a-zA-Z0-9_-]+$/.test(trimmed)
}

export const getDeviceColor = (deviceId: string, dataType: string, alpha: number = 1): string => {
  // Generate consistent colors for device/data type combinations
  const deviceHash = deviceId.split('').reduce((hash, char) => {
    return (hash << 5) - hash + char.charCodeAt(0)
  }, 0)

  const typeHash = dataType.split('').reduce((hash, char) => {
    return (hash << 5) - hash + char.charCodeAt(0)
  }, 0)

  const combinedHash = Math.abs(deviceHash + typeHash)

  // Generate RGB values
  const r = (combinedHash * 123) % 256
  const g = (combinedHash * 456) % 256
  const b = (combinedHash * 789) % 256

  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const filterDataByTimeRange = (
  data: GaitDataPoint[],
  startTime: number,
  endTime: number,
): GaitDataPoint[] => {
  return data.filter((point) => point.timestamp >= startTime && point.timestamp <= endTime)
}

export const calculateDataStatistics = (
  data: GaitDataPoint[],
  valueKey: keyof Pick<GaitDataPoint, 'r1' | 'r2' | 'r3' | 'x' | 'y' | 'z'> = 'x',
) => {
  if (data.length === 0) {
    return {
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      std: 0,
    }
  }

  const values = data.map((point) => point[valueKey] as number)
  const count = values.length
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((sum, val) => sum + val, 0) / count

  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / count
  const std = Math.sqrt(variance)

  return { count, min, max, mean, std }
}
