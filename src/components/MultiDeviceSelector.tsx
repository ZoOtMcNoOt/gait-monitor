import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface MultiDeviceSelectorProps {
  onDeviceToggle: (deviceId: string, isCollecting: boolean) => void
}

interface DeviceStatus {
  id: string
  name: string
  isConnected: boolean
  isCollecting: boolean
}

export default function MultiDeviceSelector({ onDeviceToggle }: MultiDeviceSelectorProps) {
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [loading, setLoading] = useState(false)

  const loadDeviceStatuses = async () => {
    setLoading(true)
    try {
      // Get connected devices
      const connectedIds: string[] = await invoke('get_connected_devices')
      
      // Get which devices are actively collecting
      const activeIds: string[] = await invoke('get_active_notifications')
      
      // Create device status objects
      const deviceStatuses: DeviceStatus[] = connectedIds.map(id => ({
        id,
        name: `Device ${id.slice(-6)}`, // Show last 6 chars of device ID
        isConnected: true,
        isCollecting: activeIds.includes(id)
      }))
      
      setDevices(deviceStatuses)
    } catch (error) {
      console.error('Failed to load device statuses:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleCollection = async (deviceId: string, currentlyCollecting: boolean) => {
    try {
      if (currentlyCollecting) {
        // Stop collection
        await invoke('stop_gait_notifications', { deviceId })
        console.log(`Stopped collection for device: ${deviceId}`)
      } else {
        // Start collection
        await invoke('start_gait_notifications', { deviceId })
        console.log(`Started collection for device: ${deviceId}`)
      }
      
      // Notify parent component
      onDeviceToggle(deviceId, !currentlyCollecting)
      
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
  }, [])

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
