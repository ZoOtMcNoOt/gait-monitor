import { useState, useEffect } from 'react'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'
import ScrollableContainer from './ScrollableContainer'

interface DeviceStatus {
  id: string
  name: string
  isConnected: boolean
  isCollecting: boolean
  signalStrength?: number
  lastDataTime?: number
  dataRate?: number
  errorState?: string
}

export default function DeviceStatusViewer() {
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())
  
  // Use global device connection context
  const { 
    connectedDevices, 
    getActiveCollectingDevices
  } = useDeviceConnection()

  // Update devices automatically when context changes - no manual loading needed
  useEffect(() => {
    const updateDeviceStatuses = async () => {
      try {
        // Get which devices are actively collecting using context method
        const activeIds = await getActiveCollectingDevices()
        
        // Create device status objects with clean display names
        const deviceStatuses: DeviceStatus[] = connectedDevices.map(id => {
          // Use last 6 characters for compact but unique identification
          const deviceShortId = id.slice(-6).toUpperCase()
          
          return {
            id,
            name: deviceShortId, // Just the short ID, no redundancy
            isConnected: true, // If it's in connectedDevices, it's BLE connected
            isCollecting: activeIds.includes(id),
            lastDataTime: Date.now(), // In a real implementation, this would track actual last data time
            dataRate: Math.floor(Math.random() * 50) + 10, // Mock data rate for demo
            signalStrength: Math.floor(Math.random() * 100) + 1 // Mock signal strength
          }
        })
        
        setDevices(deviceStatuses)
        setLastUpdateTime(Date.now())
      } catch (error) {
        console.error('Failed to update device statuses:', error)
        // Set error state for devices that failed to update
        setDevices(prev => prev.map(device => ({ 
          ...device, 
          errorState: 'Connection error' 
        })))
      }
    }

    updateDeviceStatuses()
  }, [connectedDevices, getActiveCollectingDevices]) // React to context changes automatically

  const collectingCount = devices.filter(d => d.isCollecting).length
  const connectedCount = devices.length
  
  // Format time ago for data freshness
  const formatTimeAgo = (timestamp: number) => {
    const secondsAgo = Math.floor((Date.now() - timestamp) / 1000)
    if (secondsAgo < 60) return `${secondsAgo}s ago`
    const minutesAgo = Math.floor(secondsAgo / 60)
    if (minutesAgo < 60) return `${minutesAgo}m ago`
    const hoursAgo = Math.floor(minutesAgo / 60)
    return `${hoursAgo}h ago`
  }

  const collectingCount = devices.filter(d => d.isCollecting).length
  const connectedCount = devices.length

  return (
    <div className="device-status-viewer sidebar-style">
      <div className="status-header">
        <h3>📊 Device Status</h3>
      </div>
      
      {devices.length === 0 ? (
        <div className="no-devices">
          <div className="no-devices-icon">🔌</div>
          <p>No connected devices</p>
          <small>Connect devices in the Connect tab</small>
        </div>
      ) : (
        <>
          <div className="status-summary">
            <div className="summary-stats">
              <span className="stat">
                <span className="stat-number">{collectingCount}</span>
                <span className="stat-label">Collecting</span>
              </span>
              <span className="stat">
                <span className="stat-number">{connectedCount}</span>
                <span className="stat-label">Connected</span>
              </span>
            </div>
            {collectingCount > 0 && (
              <div className="sync-indicator">
                <span className="sync-icon">🔗</span>
                <span className="sync-text">Synchronized Collection</span>
              </div>
            )}
          </div>
          
          <ScrollableContainer id="device-status-list" className="device-status-list">
            {devices.map(device => (
              <div key={device.id} className={`device-status-item ${device.isCollecting ? 'collecting' : 'idle'}`}>
                <div className="device-info">
                  <div className="device-name-section">
                    <span className="device-name">{device.name}</span>
                    <span className="device-label">Device</span>
                  </div>
                  <div className="device-indicators">
                    <div className="connection-status">
                      <span className={`status-dot ${device.isConnected ? 'connected' : 'disconnected'}`}>
                        ●
                      </span>
                      <span className="status-label">
                        {device.isConnected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    <div className="collection-status">
                      <span className={`status-dot ${device.isCollecting ? 'collecting' : 'idle'}`}>
                        {device.isCollecting ? '📡' : '⏸'}
                      </span>
                      <span className="status-label">
                        {device.isCollecting ? 'Collecting' : 'Idle'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {device.isCollecting && (
                  <div className="activity-indicator">
                    <div className="pulse-animation"></div>
                    <span className="activity-text">Active</span>
                  </div>
                )}
              </div>
            ))}
          </ScrollableContainer>
          
          <div className="status-footer">
            <small className="help-text">
              Use "Start Collection" button to begin synchronized data collection from all connected devices
            </small>
          </div>
        </>
      )}
    </div>
  )
}
