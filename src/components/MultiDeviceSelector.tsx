import { useState, useEffect, useCallback } from 'react'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'
import { useToast } from '../contexts/ToastContext'
import ScrollableContainer from './ScrollableContainer'

interface DeviceStatus {
  id: string
  name: string
  isConnected: boolean
  isCollecting: boolean
  signalStrength?: number
  lastDataTime?: number
}

export default function DeviceStatusViewer() {
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [loading, setLoading] = useState(false)
  
  // Add toast for error handling
  const { showError } = useToast()
  
  // Use global device connection context
  const { 
    connectedDevices, 
    getActiveCollectingDevices
  } = useDeviceConnection()

  const loadDeviceStatuses = useCallback(async () => {
    setLoading(true)
    try {
      // Use connected devices from global context
      const connectedIds = connectedDevices
      
      // Get which devices are actively collecting using context method
      const activeIds = await getActiveCollectingDevices()
      
      // Create device status objects with simplified display names
      const deviceStatuses: DeviceStatus[] = connectedIds.map(id => {
        const displayName = `Device ${id.slice(-6)}`
        
        return {
          id,
          name: displayName,
          isConnected: true, // If it's in connectedDevices, it's BLE connected
          isCollecting: activeIds.includes(id),
          lastDataTime: Date.now() // In a real implementation, this would track actual last data time
        }
      })
      
      setDevices(deviceStatuses)
    } catch (error) {
      console.error('Failed to load device statuses:', error)
      showError('Status Error', `Failed to load device statuses: ${error}`)
    } finally {
      setLoading(false)
    }
  }, [connectedDevices, getActiveCollectingDevices, showError])

  useEffect(() => {
    loadDeviceStatuses()
    
    // Refresh device statuses every 2 seconds for real-time updates
    const interval = setInterval(loadDeviceStatuses, 2000)
    return () => clearInterval(interval)
  }, [loadDeviceStatuses])

  if (loading && devices.length === 0) {
    return (
      <div className="device-status-viewer sidebar-style">
        <div className="status-header">
          <h3>📊 Device Status</h3>
        </div>
        <div className="loading">
          <div className="loading-spinner">🔄</div>
          <p>Loading devices...</p>
        </div>
      </div>
    )
  }

  const collectingCount = devices.filter(d => d.isCollecting).length
  const connectedCount = devices.length

  return (
    <div className="device-status-viewer sidebar-style">
      <div className="status-header">
        <h3>📊 Device Status</h3>
        <button 
          onClick={loadDeviceStatuses} 
          className="refresh-btn" 
          disabled={loading} 
          title="Refresh device status"
        >
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
                  <div className="device-name">
                    {device.name}
                    <span className="device-id">({device.id.slice(-6)})</span>
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
