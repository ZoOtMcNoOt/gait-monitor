import { useState, useEffect, useCallback } from 'react'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'

interface DeviceStatus {
  id: string
  name: string
  isConnected: boolean
  isCollecting: boolean
}

export default function MultiDeviceSelector() {
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [loading, setLoading] = useState(false)
  
  // Use global device connection context
  const { 
    connectedDevices, 
    connectionStatus, 
    deviceHeartbeats,
    startDeviceCollection,
    stopDeviceCollection,
    getActiveCollectingDevices
  } = useDeviceConnection()

  const loadDeviceStatuses = useCallback(async () => {
    setLoading(true)
    try {
      // Use connected devices from global context
      const connectedIds = connectedDevices
      
      // Get which devices are actively collecting using context method
      const activeIds = await getActiveCollectingDevices()
      
      // Create device status objects with heartbeat info
      const deviceStatuses: DeviceStatus[] = connectedIds.map(id => {
        const status = connectionStatus.get(id)
        const heartbeat = deviceHeartbeats.get(id)
        const displayName = heartbeat ? 
          `Device ${id.slice(-6)} (♥${heartbeat.sequence})` : 
          `Device ${id.slice(-6)}`
        
        return {
          id,
          name: displayName,
          isConnected: status === 'connected',
          isCollecting: activeIds.includes(id)
        }
      })
      
      setDevices(deviceStatuses)
    } catch (error) {
      console.error('Failed to load device statuses:', error)
    } finally {
      setLoading(false)
    }
  }, [connectedDevices, connectionStatus, deviceHeartbeats, getActiveCollectingDevices])

  const handleToggleCollection = async (deviceId: string, currentlyCollecting: boolean) => {
    try {
      if (currentlyCollecting) {
        // Stop collection using context method
        await stopDeviceCollection(deviceId)
        console.log(`Stopped collection for device: ${deviceId}`)
      } else {
        // Start collection using context method
        await startDeviceCollection(deviceId)
        console.log(`Started collection for device: ${deviceId}`)
      }
      
      // Reload device statuses
      await loadDeviceStatuses()
    } catch (error) {
      console.error(`Failed to toggle collection for device ${deviceId}:`, error)
      alert(`Failed to ${currentlyCollecting ? 'stop' : 'start'} collection: ${error}`)
    }
  }

  useEffect(() => {
    loadDeviceStatuses()
    
    // Refresh device statuses every 3 seconds
    const interval = setInterval(loadDeviceStatuses, 3000)
    return () => clearInterval(interval)
  }, [loadDeviceStatuses])

  if (loading && devices.length === 0) {
    return (
      <div className="multi-device-selector">
        <div className="loading">Loading device statuses...</div>
      </div>
    )
  }

  if (devices.length === 0) {
    return (
      <div className="multi-device-selector">
        <div className="no-devices">
          <p>No connected devices found.</p>
          <p>Please connect to devices in the Connect tab first.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="multi-device-selector">
      <div className="selector-header">
        <h3>Device Collection Control</h3>
        <button onClick={loadDeviceStatuses} className="refresh-btn" disabled={loading}>
          {loading ? '🔄' : '↻'} Refresh
        </button>
      </div>
      
      <div className="device-list">
        {devices.map(device => (
          <div key={device.id} className={`device-card ${device.isCollecting ? 'collecting' : ''}`}>
            <div className="device-info">
              <div className="device-name">{device.name}</div>
              <div className="device-id">{device.id}</div>
              <div className={`status ${device.isConnected ? 'connected' : 'disconnected'}`}>
                {device.isConnected ? '🔗 Connected' : '❌ Disconnected'}
              </div>
            </div>
            
            <div className="device-controls">
              <button
                className={`collection-btn ${device.isCollecting ? 'stop' : 'start'}`}
                onClick={() => handleToggleCollection(device.id, device.isCollecting)}
                disabled={!device.isConnected || loading}
              >
                {device.isCollecting ? '⏹️ Stop' : '▶️ Start'}
              </button>
            </div>
            
            {device.isCollecting && (
              <div className="collecting-indicator">
                <div className="pulse-dot"></div>
                <span>Collecting data...</span>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="collection-summary">
        <span>
          {devices.filter(d => d.isCollecting).length} of {devices.length} devices collecting data
        </span>
      </div>
    </div>
  )
}
