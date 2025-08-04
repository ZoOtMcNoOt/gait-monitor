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

interface DeviceStatusViewerProps {
  onNavigateToConnect?: () => void
}

export default function DeviceStatusViewer({ onNavigateToConnect }: DeviceStatusViewerProps) {
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  
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

  return (
    <div className="device-status-viewer sidebar-style" role="region" aria-label="Device Status Viewer">
      <div className="status-header">
        <h3>📊 Device Status</h3>
        <div className="last-update" aria-live="polite">
          <span className="update-indicator">●</span>
          <span className="update-text">Live</span>
        </div>
      </div>
      
      {devices.length === 0 ? (
        <div className="no-devices" role="status" aria-label="No devices connected">
          <div className="no-devices-icon">🔌</div>
          <p className="no-devices-title">No connected devices</p>
          <small className="no-devices-subtitle">Connect devices in the Connect tab to begin monitoring</small>
          {onNavigateToConnect && (
            <div className="no-devices-action">
              <button 
                className="btn-secondary" 
                onClick={onNavigateToConnect}
                aria-label="Go to Connect tab"
              >
                Go to Connect
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="status-summary" aria-label="Device summary statistics">
            <div className="summary-stats">
              <span className="stat" aria-label={`${collectingCount} devices collecting data`}>
                <span className="stat-number">{collectingCount}</span>
                <span className="stat-label">Collecting</span>
              </span>
              <span className="stat" aria-label={`${connectedCount} devices connected`}>
                <span className="stat-number">{connectedCount}</span>
                <span className="stat-label">Connected</span>
              </span>
            </div>
            {collectingCount > 0 && (
              <div className="sync-indicator" aria-label="Synchronized collection active">
                <span className="sync-icon">🔗</span>
                <span className="sync-text">Synchronized Collection</span>
              </div>
            )}
          </div>
          
          <ScrollableContainer id="device-status-list" className="device-status-list">
            <div role="list" aria-label="Connected devices">
              {devices.map(device => (
                <div 
                  key={device.id} 
                  className={`device-status-item ${device.isCollecting ? 'collecting' : 'idle'} ${device.errorState ? 'error' : ''}`}
                  role="listitem"
                  aria-label={`Device ${device.name}: ${device.isConnected ? 'Connected' : 'Disconnected'}, ${device.isCollecting ? 'Collecting data' : 'Idle'}`}
                  tabIndex={0}
                >
                  <div className="device-info">
                    <div className="device-name-section">
                      <span className="device-name" title={`Full ID: ${device.id}`}>
                        {device.name}
                      </span>
                      <span className="device-label">Device</span>
                    </div>
                    
                    <div className="device-indicators">
                      <div className="connection-status">
                        <span 
                          className={`status-dot ${device.isConnected ? 'connected' : 'disconnected'}`}
                          aria-hidden="true"
                        >
                          ●
                        </span>
                        <span className="status-label">
                          {device.isConnected ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>
                      
                      <div className="collection-status">
                        <span 
                          className={`status-icon ${device.isCollecting ? 'collecting' : 'idle'}`}
                          aria-hidden="true"
                        >
                          {device.isCollecting ? '📡' : '⏸'}
                        </span>
                        <span className="status-label">
                          {device.isCollecting ? 'Collecting' : 'Idle'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Enhanced data indicators */}
                    {device.isCollecting && (
                      <div className="data-indicators">
                        {device.dataRate && (
                          <div className="data-rate" title="Data points per second">
                            <span className="rate-value">{device.dataRate}</span>
                            <span className="rate-unit">Hz</span>
                          </div>
                        )}
                        {device.signalStrength && (
                          <div className="signal-strength" title={`Signal strength: ${device.signalStrength}%`}>
                            <div className="signal-bars">
                              {[...Array(4)].map((_, i) => (
                                <div 
                                  key={i}
                                  className={`signal-bar ${device.signalStrength! > (i + 1) * 25 ? 'active' : ''}`}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {device.errorState && (
                      <div className="error-indicator" role="alert">
                        <span className="error-icon">⚠️</span>
                        <span className="error-text">{device.errorState}</span>
                      </div>
                    )}
                  </div>
                  
                  {device.isCollecting && !device.errorState && (
                    <div className="activity-indicator" aria-label="Device is actively collecting data">
                      <div className="pulse-animation"></div>
                      <span className="activity-text">Active</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollableContainer>
        </>
      )}
    </div>
  )
}
