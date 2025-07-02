import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'

// Types
interface HeartbeatPayload {
  device_id: string,
  device_timestamp: number,
  sequence: number,
  received_timestamp: number
}

interface GaitDataPayload {
  device_id: string,
  r1: number,
  r2: number, 
  r3: number,
  x: number,
  y: number,
  z: number,
  timestamp: number
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
  deviceHeartbeats: Map<string, HeartbeatPayload>
  lastGaitDataTime: Map<string, number>
  
  // UI state
  isScanning: boolean
  isConnecting: string | null
  
  // Actions - Device Management
  addDevice: (deviceId: string) => void
  removeDevice: (deviceId: string) => void
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
  const [deviceHeartbeats, setDeviceHeartbeats] = useState<Map<string, HeartbeatPayload>>(new Map())
  const [lastGaitDataTime, setLastGaitDataTime] = useState<Map<string, number>>(new Map())
  
  // UI State
  const [isScanning, setIsScanning] = useState(false)
  const [isConnecting, setIsConnecting] = useState<string | null>(null)
  
  // Gait data subscribers
  const gaitDataSubscribers = React.useRef<Set<(data: GaitDataPayload) => void>>(new Set())

  // Actions - Device Management
  const addDevice = (deviceId: string) => {
    setAvailableDevices(prev => {
      if (!prev.includes(deviceId)) {
        console.log('📱 Adding device to global state:', deviceId)
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
  }

  const removeDevice = (deviceId: string) => {
    console.log('🗑️ Removing device from global state:', deviceId)
    
    setAvailableDevices(prev => prev.filter(id => id !== deviceId))
    setExpectedDevices(prev => {
      const newSet = new Set(prev)
      newSet.delete(deviceId)
      return newSet
    })
    
    // Clean up all device data
    setConnectionStatus(prev => {
      const newMap = new Map(prev)
      newMap.delete(deviceId)
      return newMap
    })
    
    setDeviceHeartbeats(prev => {
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

  const updateGaitDataTime = (deviceId: string) => {
    setLastGaitDataTime(prev => {
      const newMap = new Map(prev)
      newMap.set(deviceId, Date.now())
      return newMap
    })
  }

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
    
    // Update connection status for all devices
    setConnectionStatus(prev => {
      const newMap = new Map(prev)
      
      // Mark connected devices
      devices.forEach(deviceId => {
        if (availableDevices.includes(deviceId) || expectedDevices.has(deviceId)) {
          // Only update if we don't have more specific heartbeat info
          if (!deviceHeartbeats.has(deviceId)) {
            newMap.set(deviceId, 'connected')
          }
        }
      })
      
      // Mark disconnected devices
      availableDevices.forEach(deviceId => {
        if (!devices.includes(deviceId) && !deviceHeartbeats.has(deviceId)) {
          newMap.set(deviceId, 'disconnected')
        }
      })
      
      return newMap
    })
  }, [availableDevices, expectedDevices, deviceHeartbeats])

  // Actions - Scanning & Connection
  const refreshConnectedDevices = useCallback(async () => {
    try {
      const connected: string[] = await invoke('get_connected_devices')
      setConnectedDevices(connected)
    } catch (error) {
      console.error('Failed to refresh connected devices:', error)
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
      console.log(`✅ Successfully connected to ${deviceName}`)
    } catch (error) {
      console.error('Connection failed:', error)
      
      // Enhanced error handling
      const device = scannedDevices.find(d => d.id === deviceId)
      let errorMessage = `Failed to connect to ${device?.name || 'device'}:\n\n${error}`
      
      if (typeof error === 'string') {
        if (error.includes('not connectable')) {
          errorMessage += '\n\nThis device may not support connections or may be in a non-connectable mode.'
        } else if (error.includes('not found')) {
          errorMessage += '\n\nThe device may have moved out of range. Try scanning again.'
        } else if (error.includes('timeout') || error.includes('failed after')) {
          errorMessage += '\n\nConnection timeout. The device may be busy, already connected to another device, or out of range.'
        } else if (error.includes('Connection refused') || error.includes('refused')) {
          errorMessage += '\n\nThe device refused the connection. It may be paired with another device or in a non-connectable state.'
        }
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
      console.log(`✅ Started collection for device: ${deviceId}`)
    } catch (error) {
      console.error(`Failed to start collection for device ${deviceId}:`, error)
      throw error
    }
  }, [])

  const stopDeviceCollection = useCallback(async (deviceId: string) => {
    try {
      await invoke('stop_gait_notifications', { deviceId })
      setActiveCollectingDevices(prev => prev.filter(id => id !== deviceId))
      console.log(`⏹️ Stopped collection for device: ${deviceId}`)
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
    let unlistenHeartbeat: (() => void) | null = null
    let unlistenGaitData: (() => void) | null = null

    const setupEventListeners = async () => {
      try {
        // Heartbeat listener
        unlistenHeartbeat = await listen('heartbeat-data', (event: { payload: HeartbeatPayload }) => {
          const payload = event.payload as HeartbeatPayload
          
          console.log('💓 Global heartbeat received from device:', payload.device_id, 'seq:', payload.sequence)
          
          // Add device if not already tracked
          addDevice(payload.device_id)
          
          // Update heartbeat state
          setDeviceHeartbeats(prev => {
            const newMap = new Map(prev)
            newMap.set(payload.device_id, payload)
            return newMap
          })
          
          // Update connection status
          setConnectionStatus(prev => {
            const newMap = new Map(prev)
            newMap.set(payload.device_id, 'connected')
            return newMap
          })
        })

        // Gait data listener  
        unlistenGaitData = await listen('gait-data', (event: { payload: GaitDataPayload }) => {
          const payload = event.payload as GaitDataPayload
          
          // Update gait data timing
          updateGaitDataTime(payload.device_id)
          
          // Notify all subscribers
          gaitDataSubscribers.current.forEach(callback => {
            try {
              callback(payload)
            } catch (error) {
              console.error('Error in gait data subscriber:', error)
            }
          })
        })
        
        console.log('✅ Global event listeners setup complete')
      } catch (error) {
        console.error('❌ Failed to setup global event listeners:', error)
      }
    }

    setupEventListeners()

    return () => {
      if (unlistenHeartbeat) {
        unlistenHeartbeat()
      }
      if (unlistenGaitData) {
        unlistenGaitData()
      }
    }
  }, [])

  // Load initial connected devices
  useEffect(() => {
    refreshConnectedDevices()
  }, [refreshConnectedDevices])

  // Heartbeat monitoring - check for timeouts every 2 seconds
  useEffect(() => {
    const heartbeatInterval = setInterval(() => {
      const now = Date.now()
      const HEARTBEAT_TIMEOUT = 3000 // 3 seconds (3x heartbeat interval)
      const GAIT_DATA_TIMEOUT = 5000 // 5 seconds without gait data
      const DISCONNECT_CLEANUP_TIME = 30000 // 30 seconds
      
      setConnectionStatus(prev => {
        const newMap = new Map(prev)
        
        // Check all available devices for heartbeat status
        availableDevices.forEach(deviceId => {
          const heartbeat = deviceHeartbeats.get(deviceId)
          const lastGait = lastGaitDataTime.get(deviceId)
          let deviceStatus: ConnectionStatus = 'disconnected'
          
          // Check heartbeat status
          if (!heartbeat) {
            // No heartbeat ever received
            if (lastGait && (now - lastGait) < GAIT_DATA_TIMEOUT) {
              // Still receiving gait data recently, consider connected but no heartbeat
              deviceStatus = 'connected'
              console.log(`📡 Device ${deviceId}: No heartbeat but gait data is fresh`)
            } else if (connectedDevices.includes(deviceId)) {
              // Device is in connected list but no heartbeat/gait data
              deviceStatus = 'connected'
            } else {
              deviceStatus = 'disconnected'
              if (prev.get(deviceId) !== 'disconnected') {
                console.warn(`⚠️ Device ${deviceId}: No heartbeat and no recent gait data - marking as disconnected`)
              }
            }
          } else {
            const timeSinceLastHeartbeat = now - heartbeat.received_timestamp
            const timeSinceGaitData = lastGait ? (now - lastGait) : Infinity
            
            if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
              if (timeSinceGaitData < GAIT_DATA_TIMEOUT) {
                // Heartbeat timeout but gait data is still coming - partial connection issue
                deviceStatus = 'timeout'
                console.warn(`⚠️ Device ${deviceId}: Heartbeat timeout (${timeSinceLastHeartbeat}ms) but gait data is fresh`)
              } else {
                // Both heartbeat and gait data are stale
                deviceStatus = 'disconnected'
                console.warn(`⚠️ Device ${deviceId}: Both heartbeat (${timeSinceLastHeartbeat}ms) and gait data (${timeSinceGaitData}ms) are stale - disconnected`)
              }
            } else {
              // Heartbeat is fresh
              deviceStatus = 'connected'
            }
          }
          
          newMap.set(deviceId, deviceStatus)
        })
        
        return newMap
      })
      
      // Clean up devices that have been disconnected for a long time
      const devicesToRemove: string[] = []
      availableDevices.forEach(deviceId => {
        const status = connectionStatus.get(deviceId)
        if (status === 'disconnected') {
          const lastGait = lastGaitDataTime.get(deviceId)
          const heartbeat = deviceHeartbeats.get(deviceId)
          const lastActivity = Math.max(
            lastGait || 0,
            heartbeat?.received_timestamp || 0
          )
          
          if (lastActivity > 0 && (now - lastActivity) > DISCONNECT_CLEANUP_TIME) {
            devicesToRemove.push(deviceId)
          }
        }
      })
      
      // Remove stale devices
      devicesToRemove.forEach(deviceId => {
        console.log(`🗑️ Auto-removing stale device: ${deviceId}`)
        removeDevice(deviceId)
      })
      
    }, 2000)
    
    return () => clearInterval(heartbeatInterval)
  }, [availableDevices, connectedDevices, deviceHeartbeats, lastGaitDataTime, connectionStatus])

  const contextValue: DeviceConnectionState = {
    // Device tracking
    availableDevices,
    connectedDevices,
    expectedDevices,
    scannedDevices,
    activeCollectingDevices,
    connectionStatus,
    deviceHeartbeats,
    lastGaitDataTime,
    
    // UI state
    isScanning,
    isConnecting,
    
    // Actions - Device Management
    addDevice,
    removeDevice,
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
    
    // Event subscription
    subscribeToGaitData
  }

  return (
    <DeviceConnectionContext.Provider value={contextValue}>
      {children}
    </DeviceConnectionContext.Provider>
  )
}
