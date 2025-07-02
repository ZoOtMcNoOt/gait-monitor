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
        const heartbeat = deviceHeartbeats.get(id)
        const displayName = heartbeat ? 
          `Device ${id.slice(-6)} (♥${heartbeat.sequence})` : 
          `Device ${id.slice(-6)}`
        
        return {
          id,
          name: displayName,
          isConnected: true, // If it's in connectedDevices, it's BLE connected
          isCollecting: activeIds.includes(id)
        }
      })
      
      setDevices(deviceStatuses)
    } catch (error) {
      console.error('Failed to load device statuses:', error)
    } finally {
      setLoading(false)
    }
  }, [connectedDevices, deviceHeartbeats, getActiveCollectingDevices])

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
      <div className="multi-device-selector sidebar-style">
        <div className="selector-header">
          <h3>📊 Collection Control</h3>
        </div>
        <div className="loading">
          <div className="loading-spinner">🔄</div>
          <p>Loading devices...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="multi-device-selector sidebar-style">
      <div className="selector-header">
        <h3>📊 Collection Control</h3>
        <button onClick={loadDeviceStatuses} className="refresh-btn" disabled={loading} title="Refresh device status">
          {loading ? '🔄' : '↻'}
        </button>
      </div>
      
      {devices.length === 0 ? (
        <div className="no-devices">
          <div className="no-devices-icon">🔌</div>
          <p>No connected devices</p>
          <small>Connect devices in the Connect tab</small>
        </div>
      ) : (
        <>
          <div className="collection-summary">
            <div className="summary-stats">
              <span className="stat">
                <span className="stat-number">{devices.filter(d => d.isCollecting).length}</span>
                <span className="stat-label">Active</span>
              </span>
              <span className="stat">
                <span className="stat-number">{devices.length}</span>
                <span className="stat-label">Total</span>
              </span>
            </div>
          </div>
          
          <div className="device-list">
            {devices.map(device => (
              <div key={device.id} className={`device-item ${device.isCollecting ? 'collecting' : ''}`}>
                <div className="device-info">
                  <div className="device-name">{device.name}</div>
                  <div className="device-status">
                    <span className={`status-indicator ${device.isConnected ? 'connected' : 'disconnected'}`}>
                      {device.isConnected ? '●' : '○'}
                    </span>
                    <span className="status-text">
                      {device.isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                </div>
                
                <div className="device-controls">
                  <button
                    className={`collection-toggle ${device.isCollecting ? 'stop' : 'start'}`}
                    onClick={() => handleToggleCollection(device.id, device.isCollecting)}
                    disabled={!device.isConnected || loading}
                    title={device.isCollecting ? 'Stop data collection' : 'Start data collection'}
                  >
                    {device.isCollecting ? '⏹' : '▶'}
                  </button>
                </div>
                
                {device.isCollecting && (
                  <div className="collecting-indicator">
                    <div className="pulse-animation"></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
