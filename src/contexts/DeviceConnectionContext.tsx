import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { config, isDebugEnabled } from '../config'

// Types
interface GaitDataPayload {
  device_id: string,
  r1: number,
  r2: number, 
  r3: number,
  x: number,
  y: number,
  z: number,
  timestamp: number,
  sample_rate?: number  // Add optional sample rate field
}

interface BLEDeviceInfo { 
  id: string; 
  name: string;
  rssi?: number;
  connectable: boolean;
  address_type: string;
  services: string[];
  manufacturer_data: string[];
  service_data: string[];
}

type ConnectionStatus = 'connected' | 'timeout' | 'disconnected'

interface DeviceConnectionState {
  // Device tracking
  availableDevices: string[]
  connectedDevices: string[]
  expectedDevices: Set<string>
  scannedDevices: BLEDeviceInfo[]
  activeCollectingDevices: string[]
  
  // Connection status
  connectionStatus: Map<string, ConnectionStatus>
  lastGaitDataTime: Map<string, number>
  deviceSampleRates: Map<string, number>  // Add sample rates
  
  // UI state
  isScanning: boolean
  isConnecting: string | null
  
  // Actions - Device Management
  addDevice: (deviceId: string) => void
  removeDevice: (deviceId: string) => void
  removeScannedDevice: (deviceId: string) => void
  updateGaitDataTime: (deviceId: string) => void
  markDeviceAsExpected: (deviceId: string) => void
  unmarkDeviceAsExpected: (deviceId: string) => void
  setConnectedDevices: (devices: string[]) => void
  
  // Actions - Scanning & Connection
  scanDevices: () => Promise<void>
  connectDevice: (deviceId: string) => Promise<void>
  disconnectDevice: (deviceId: string) => Promise<void>
  refreshConnectedDevices: () => Promise<void>
  
  // Actions - Data Collection
  startDeviceCollection: (deviceId: string) => Promise<void>
  stopDeviceCollection: (deviceId: string) => Promise<void>
  getActiveCollectingDevices: () => Promise<string[]>
  getCurrentSampleRate: (deviceId: string) => number | null
  
  // Event subscription for gait data
  subscribeToGaitData: (callback: (data: GaitDataPayload) => void) => () => void
}

const DeviceConnectionContext = createContext<DeviceConnectionState | undefined>(undefined)

export const useDeviceConnection = () => {
  const context = useContext(DeviceConnectionContext)
  if (!context) {
    throw new Error('useDeviceConnection must be used within a DeviceConnectionProvider')
  }
  return context
}

interface DeviceConnectionProviderProps {
  children: ReactNode
}

export const DeviceConnectionProvider: React.FC<DeviceConnectionProviderProps> = ({ children }) => {
  // State
  const [availableDevices, setAvailableDevices] = useState<string[]>([])
  const [connectedDevices, setConnectedDevicesState] = useState<string[]>([])
  const [expectedDevices, setExpectedDevices] = useState<Set<string>>(new Set())
  const [scannedDevices, setScannedDevices] = useState<BLEDeviceInfo[]>([])
  const [activeCollectingDevices, setActiveCollectingDevices] = useState<string[]>([])
  const [connectionStatus, setConnectionStatus] = useState<Map<string, ConnectionStatus>>(new Map())
  const [lastGaitDataTime, setLastGaitDataTime] = useState<Map<string, number>>(new Map())
  const [deviceSampleRates, setDeviceSampleRates] = useState<Map<string, number>>(new Map())
  
  // UI State
  const [isScanning, setIsScanning] = useState(false)
  const [isConnecting, setIsConnecting] = useState<string | null>(null)
  
  // Gait data subscribers
  const gaitDataSubscribers = React.useRef<Set<(data: GaitDataPayload) => void>>(new Set())

  // Actions - Device Management
  const addDevice = useCallback((deviceId: string) => {
    setAvailableDevices(prev => {
      if (!prev.includes(deviceId)) {
        if (isDebugEnabled()) {
          console.log('[Device] Adding device to global state:', deviceId)
        }
        return [...prev, deviceId]
      }
      return prev
    })
    
    // Initialize connection status
    setConnectionStatus(prev => {
      const newMap = new Map(prev)
      if (!newMap.has(deviceId)) {
        newMap.set(deviceId, 'disconnected')
      }
      return newMap
    })
  }, [])

  const removeDevice = (deviceId: string) => {
    if (isDebugEnabled()) {
  console.log('[Device] Removing device from global state:', deviceId)
    }
    
    setAvailableDevices(prev => prev.filter(id => id !== deviceId))
    setExpectedDevices(prev => {
      const newSet = new Set(prev)
      newSet.delete(deviceId)
      return newSet
    })
    
    // Also remove from scanned devices
    setScannedDevices(prev => prev.filter(device => device.id !== deviceId))
    
    // Clean up all device data
    setConnectionStatus(prev => {
      const newMap = new Map(prev)
      newMap.delete(deviceId)
      return newMap
    })
    
    setLastGaitDataTime(prev => {
      const newMap = new Map(prev)
      newMap.delete(deviceId)
      return newMap
    })
  }

  const removeScannedDevice = useCallback((deviceId: string) => {
  console.log('[Device] Removing scanned device:', deviceId)
    setScannedDevices(prev => prev.filter(device => device.id !== deviceId))
  }, [])

  const updateGaitDataTime = useCallback((deviceId: string) => {
    setLastGaitDataTime(prev => {
      const newMap = new Map(prev)
      newMap.set(deviceId, Date.now())
      return newMap
    })
  }, [])

  const markDeviceAsExpected = (deviceId: string) => {
    setExpectedDevices(prev => new Set([...prev, deviceId]))
  }

  const unmarkDeviceAsExpected = (deviceId: string) => {
    setExpectedDevices(prev => {
      const newSet = new Set(prev)
      newSet.delete(deviceId)
      return newSet
    })
  }

  const setConnectedDevices = useCallback((devices: string[]) => {
    setConnectedDevicesState(devices)
  }, [])

  // Actions - Scanning & Connection
  const refreshConnectedDevices = useCallback(async () => {
    try {
      // Use the new check_connection_status function for more accurate status
      const connected: string[] = await invoke('check_connection_status')
      setConnectedDevices(connected)
    } catch (error) {
      console.error('Failed to refresh connected devices:', error)
      // Fallback to the old method
      try {
        const connected: string[] = await invoke('get_connected_devices')
        setConnectedDevices(connected)
      } catch (fallbackError) {
        console.error('Fallback refresh also failed:', fallbackError)
      }
    }
  }, [setConnectedDevices])

  const scanDevices = useCallback(async () => {
    setIsScanning(true)
    try {
      const devices: BLEDeviceInfo[] = await invoke('scan_devices')
      
      // Sort devices: known devices first (reverse alphabetically), then unknown devices (by RSSI descending)
      const sortedDevices = devices.sort((a, b) => {
        const aHasName = a.name && a.name.trim() !== '' && a.name !== 'Unknown'
        const bHasName = b.name && b.name.trim() !== '' && b.name !== 'Unknown'
        
        if (aHasName === bHasName) {
          if (aHasName) {
            return b.name.localeCompare(a.name)
          } else {
            return (b.rssi || -100) - (a.rssi || -100)
          }
        }
        
        return aHasName ? -1 : 1
      })
      
      setScannedDevices(sortedDevices)
      await refreshConnectedDevices()
    } catch (error) {
      console.error('Scan failed:', error)
      throw error
    } finally {
      setIsScanning(false)
    }
  }, [refreshConnectedDevices])

  const connectDevice = useCallback(async (deviceId: string) => {
    setIsConnecting(deviceId)
    try {
      const result: string = await invoke('connect_device', { deviceId })
      console.log('Connection result:', result)
      await refreshConnectedDevices()
      
      // Show success message
      const device = scannedDevices.find(d => d.id === deviceId)
      const deviceName = device?.name || 'Unknown Device'
  console.log(`[BLE] Successfully connected to ${deviceName}`)
    } catch (error) {
      console.error('Connection failed:', error)
      
      // Enhanced error handling
      const device = scannedDevices.find(d => d.id === deviceId)
      let errorMessage = `Failed to connect to ${device?.name || 'device'}:\n\n${error}`
      
      const errorString = typeof error === 'string' ? error : (error as Error).message || String(error)
      if (errorString.includes('not connectable')) {
        errorMessage += '\n\nThis device may not support connections or may be in a non-connectable mode.'
      } else if (errorString.includes('not found')) {
        errorMessage += '\n\nThe device may have moved out of range. Try scanning again.'
      } else if (errorString.includes('timeout') || errorString.includes('failed after')) {
        errorMessage += '\n\nConnection timeout. The device may be busy, already connected to another device, or out of range.'
      } else if (errorString.includes('Connection refused') || errorString.includes('refused')) {
        errorMessage += '\n\nThe device refused the connection. It may be paired with another device or in a non-connectable state.'
      }
      
      throw new Error(errorMessage)
    } finally {
      setIsConnecting(null)
    }
  }, [scannedDevices, refreshConnectedDevices])

  const disconnectDevice = useCallback(async (deviceId: string) => {
    setIsConnecting(deviceId)
    try {
      const result: string = await invoke('disconnect_device', { deviceId })
      console.log('Disconnect result:', result)
      await refreshConnectedDevices()
    } catch (error) {
      console.error('Disconnection failed:', error)
      throw error
    } finally {
      setIsConnecting(null)
    }
  }, [refreshConnectedDevices])

  // Actions - Data Collection
  const startDeviceCollection = useCallback(async (deviceId: string) => {
    try {
      await invoke('start_gait_notifications', { deviceId })
      setActiveCollectingDevices(prev => 
        prev.includes(deviceId) ? prev : [...prev, deviceId]
      )
  console.log(`[Collect] Started collection for device: ${deviceId}`)
    } catch (error) {
      console.error(`Failed to start collection for device ${deviceId}:`, error)
      throw error
    }
  }, [])

  const stopDeviceCollection = useCallback(async (deviceId: string) => {
    try {
      await invoke('stop_gait_notifications', { deviceId })
      setActiveCollectingDevices(prev => prev.filter(id => id !== deviceId))
  console.log(`[Collect] Stopped collection for device: ${deviceId}`)
    } catch (error) {
      console.error(`Failed to stop collection for device ${deviceId}:`, error)
      throw error
    }
  }, [])

  const getActiveCollectingDevices = useCallback(async (): Promise<string[]> => {
    try {
      const activeIds: string[] = await invoke('get_active_notifications')
      setActiveCollectingDevices(activeIds)
      return activeIds
    } catch (error) {
      console.error('Failed to get active collecting devices:', error)
      return []
    }
  }, [])

  // Gait data subscription
  const subscribeToGaitData = useCallback((callback: (data: GaitDataPayload) => void) => {
    gaitDataSubscribers.current.add(callback)
    
    return () => {
      gaitDataSubscribers.current.delete(callback)
    }
  }, [])

  // Set up event listeners
  useEffect(() => {
    let unlistenGaitData: (() => void) | null = null
    let unlistenConnectionStatus: (() => void) | null = null

    const setupEventListeners = async () => {
      try {
        // Connection status update listener
        unlistenConnectionStatus = await listen('connection-status-update', (event: { payload: string[] }) => {
          const connectedIds = event.payload as string[]
          console.log('[BLE] Connection status update received:', connectedIds)
          setConnectedDevices(connectedIds)
        })

        // Gait data listener  
        unlistenGaitData = await listen('gait-data', (event: { payload: GaitDataPayload }) => {
          const payload = event.payload as GaitDataPayload
          
          // Update gait data timing
          updateGaitDataTime(payload.device_id)
          
          // Update sample rate if provided
          if (payload.sample_rate !== undefined) {
            setDeviceSampleRates(prev => {
              const newMap = new Map(prev)
              newMap.set(payload.device_id, payload.sample_rate!)
              return newMap
            })
          }
          
          // Notify all subscribers
          gaitDataSubscribers.current.forEach(callback => {
            try {
              callback(payload)
            } catch (error) {
              console.error('Error in gait data subscriber:', error)
            }
          })
        })
        
  console.log('[Init] Global event listeners setup complete')
      } catch (error) {
  console.error('[Init] Failed to setup global event listeners:', error)
      }
    }

    setupEventListeners()

    return () => {
      if (unlistenGaitData) {
        unlistenGaitData()
      }
      if (unlistenConnectionStatus) {
        unlistenConnectionStatus()
      }
    }
  }, [addDevice, updateGaitDataTime, setConnectedDevices])

  // Load initial connected devices and set up periodic refresh
  useEffect(() => {
    refreshConnectedDevices()
    
    // Refresh connection status every 10 seconds
    const interval = setInterval(() => {
      refreshConnectedDevices()
    }, config.heartbeatTimeout)
    
    return () => clearInterval(interval)
  }, [refreshConnectedDevices])

  // BLE Connection monitoring - simplified without heartbeat dependency
  useEffect(() => {
    const connectionMonitorInterval = setInterval(() => {
      const now = Date.now()
      const GAIT_DATA_TIMEOUT = config.heartbeatTimeout // Reuse timeout config for gait data
      
      setConnectionStatus(prev => {
        const newMap = new Map(prev)
        
        // Check all available devices based on BLE connection status
        availableDevices.forEach(deviceId => {
          const lastGait = lastGaitDataTime.get(deviceId)
          const isActuallyConnected = connectedDevices.includes(deviceId)
          let deviceStatus: ConnectionStatus = 'disconnected'
          
          if (!isActuallyConnected) {
            // If not BLE connected, mark as disconnected
            deviceStatus = 'disconnected'
            if (prev.get(deviceId) !== 'disconnected') {
              console.log(`[BLE] Device ${deviceId}: Not BLE connected - marking as disconnected`)
            }
          } else {
            // Device is BLE connected, check if we're receiving data
            if (lastGait && (now - lastGait) < GAIT_DATA_TIMEOUT) {
              // Still receiving gait data recently, consider connected
              deviceStatus = 'connected'
            } else if (lastGait && (now - lastGait) >= GAIT_DATA_TIMEOUT) {
              // No recent gait data but BLE connected - timeout
              deviceStatus = 'timeout'
              console.warn(`[BLE][Warn] Device ${deviceId}: BLE connected but no gait data for ${Math.round((now - lastGait)/1000)}s`)
            } else {
              // Device is BLE connected but no data yet - could be starting up
              deviceStatus = 'connected'
              console.log(`[BLE] Device ${deviceId}: BLE connected, waiting for first data`)
            }
          }
          
          newMap.set(deviceId, deviceStatus)
        })
        
        return newMap
      })
      
    }, config.dataUpdateInterval * 50) // Check every 50 update intervals
    
    return () => clearInterval(connectionMonitorInterval)
  }, [availableDevices, connectedDevices, lastGaitDataTime])

  // Memory monitoring and cleanup for Maps to prevent memory leaks
  useEffect(() => {
    const memoryMonitoringInterval = setInterval(() => {
      // Monitor Map sizes and warn if they grow too large
      const statusCount = connectionStatus.size
      const dataTimeCount = lastGaitDataTime.size
      
      if (statusCount > 50 || dataTimeCount > 50) {
  console.warn(`[Memory][Warn] Large Maps detected:`, {
          statuses: statusCount,
          dataTimes: dataTimeCount
        })
      }
      
      // Clean up stale entries for devices that haven't been seen in 5 minutes
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
      const staleDevices: string[] = []
      
      lastGaitDataTime.forEach((lastTime, deviceId) => {
        if (lastTime < fiveMinutesAgo && !connectedDevices.includes(deviceId)) {
          staleDevices.push(deviceId)
        }
      })
      
      if (staleDevices.length > 0) {
  console.log(`[Cleanup] Cleaning up stale device data for ${staleDevices.length} devices`)
        
        setConnectionStatus(prev => {
          const newMap = new Map(prev)
          staleDevices.forEach(deviceId => newMap.delete(deviceId))
          return newMap
        })
        
        setLastGaitDataTime(prev => {
          const newMap = new Map(prev)
          staleDevices.forEach(deviceId => newMap.delete(deviceId))
          return newMap
        })
      }
    }, 60000) // Check every minute

    return () => clearInterval(memoryMonitoringInterval)
  }, [connectionStatus, lastGaitDataTime, connectedDevices])

  // Immediately update connection status when connected devices change
  useEffect(() => {
    setConnectionStatus(prev => {
      const newMap = new Map(prev)
      
      // Mark connected devices that are in availableDevices
      connectedDevices.forEach(deviceId => {
        if (availableDevices.includes(deviceId) || expectedDevices.has(deviceId)) {
          newMap.set(deviceId, 'connected')
        }
      })
      
      // Mark disconnected devices that are in availableDevices but not connected
      availableDevices.forEach(deviceId => {
        if (!connectedDevices.includes(deviceId)) {
          newMap.set(deviceId, 'disconnected')
        }
      })
      
      return newMap
    })
  }, [connectedDevices, availableDevices, expectedDevices])

  // Actions - Sample Rate
  const getCurrentSampleRate = useCallback((deviceId: string): number | null => {
    return deviceSampleRates.get(deviceId) || null
  }, [deviceSampleRates])

  const contextValue: DeviceConnectionState = {
    // Device tracking
    availableDevices,
    connectedDevices,
    expectedDevices,
    scannedDevices,
    activeCollectingDevices,
    connectionStatus,
    lastGaitDataTime,
    deviceSampleRates,
    
    // UI state
    isScanning,
    isConnecting,
    
    // Actions - Device Management
    addDevice,
    removeDevice,
    removeScannedDevice,
    updateGaitDataTime,
    markDeviceAsExpected,
    unmarkDeviceAsExpected,
    setConnectedDevices,
    
    // Actions - Scanning & Connection
    scanDevices,
    connectDevice,
    disconnectDevice,
    refreshConnectedDevices,
    
    // Actions - Data Collection
    startDeviceCollection,
    stopDeviceCollection,
    getActiveCollectingDevices,
    getCurrentSampleRate,
    
    // Event subscription
    subscribeToGaitData
  }

  return (
    <DeviceConnectionContext.Provider value={contextValue}>
      {children}
    </DeviceConnectionContext.Provider>
  )
}
