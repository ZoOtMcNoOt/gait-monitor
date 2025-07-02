import { useEffect } from 'react'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'

export default function DeviceList() {
  // Use global device connection context exclusively
  const { 
    scannedDevices,
    connectedDevices, 
    connectionStatus, 
    deviceHeartbeats,
    isScanning,
    isConnecting,
    scanDevices,
    connectDevice,
    disconnectDevice,
    refreshConnectedDevices
  } = useDeviceConnection()

  // Load connected devices on component mount
  useEffect(() => {
    refreshConnectedDevices()
  }, [refreshConnectedDevices])

  const isConnected = (deviceId: string) => connectedDevices.includes(deviceId)

  const handleConnect = async (deviceId: string) => {
    try {
      await connectDevice(deviceId)
      // Show success message
      const device = scannedDevices.find(d => d.id === deviceId)
      const deviceName = device?.name || 'Unknown Device'
      alert(`Successfully connected to ${deviceName}!`)
    } catch (error) {
      alert(error instanceof Error ? error.message : `Connection failed: ${error}`)
    }
  }

  const handleDisconnect = async (deviceId: string) => {
    try {
      await disconnectDevice(deviceId)
    } catch (error) {
      alert(`Disconnection failed: ${error}`)
    }
  }

  const handleScan = async () => {
    try {
      await scanDevices()
    } catch (error) {
      console.error('Scan failed:', error)
    }
  }

  const debugServices = async (deviceId: string) => {
    try {
      console.log(`Debug: Getting services for device: ${deviceId}`)
      // This functionality would need to be moved to context if needed
      // For now, keeping the direct invoke call
      const { invoke } = await import('@tauri-apps/api/core')
      const services: string[] = await invoke('debug_device_services', { deviceId })
      console.log('Debug: Services found:', services)
      
      const device = scannedDevices.find(d => d.id === deviceId)
      const deviceName = device?.name || 'Unknown Device'
      
      alert(`Services for ${deviceName}:\n\n${services.join('\n')}`)
    } catch (e) {
      console.error('Debug services failed:', e)
      alert(`Debug services failed: ${e}`)
    }
  }

  return (
    <section className="card">
      <h2>Bluetooth Devices</h2>
      <button onClick={handleScan} disabled={isScanning}>
        {isScanning ? 'Scanning...' : 'Scan for Devices'}
      </button>
      
      {scannedDevices.length > 0 && (
        <div>
          <h3>Available Devices ({scannedDevices.length})</h3>
          <ul>
            {scannedDevices.map(d => (
              <li key={d.id} className={`device-list-item ${isConnected(d.id) ? 'connected' : ''}`}>
                <div className="device-info">
                  <div className="device-name">{d.name}</div>
                  <div className="device-id">{d.id}</div>
                  <div className="device-details">
                    {d.rssi !== undefined && (
                      <span className="device-rssi">RSSI: {d.rssi}dBm</span>
                    )}
                    <span className={`device-connectable ${d.connectable ? 'connectable' : 'not-connectable'}`}>
                      {d.connectable ? '✓ Connectable' : '✗ Not Connectable'}
                    </span>
                    <span className="device-type">Type: {d.address_type}</span>
                  </div>
                  {d.services.length > 0 && (
                    <div className="device-services">
                      <strong>Services:</strong> {d.services.slice(0, 3).join(', ')}
                      {d.services.length > 3 && ` (+${d.services.length - 3} more)`}
                    </div>
                  )}
                  {d.manufacturer_data.length > 0 && (
                    <div className="device-manufacturer">
                      <strong>Manufacturer:</strong> {d.manufacturer_data[0]}
                    </div>
                  )}
                  {isConnected(d.id) && (
                    <div className="device-connection-status">
                      <span className="device-status">
                        ● Connected
                      </span>
                      {/* Show heartbeat status if available */}
                      {(() => {
                        const status = connectionStatus.get(d.id)
                        const heartbeat = deviceHeartbeats.get(d.id)
                        if (status || heartbeat) {
                          return (
                            <div className={`device-heartbeat-status ${status || 'unknown'}`}>
                              <span className={`heartbeat-indicator ${status || 'unknown'}`}>
                                {status === 'connected' ? '💓' : status === 'timeout' ? '⏰' : '💔'}
                              </span>
                              {heartbeat && (
                                <span className="heartbeat-details" title={`Sequence: ${heartbeat.sequence}, Device time: ${heartbeat.device_timestamp}`}>
                                  #{heartbeat.sequence}
                                </span>
                              )}
                              {status && (
                                <span className="connection-status-text">
                                  {status === 'connected' ? 'Live' : status === 'timeout' ? 'Timeout' : 'Lost'}
                                </span>
                              )}
                            </div>
                          )
                        }
                        return null
                      })()}
                    </div>
                  )}
                </div>
                
                <div className="device-actions">
                  {isConnected(d.id) ? (
                    <>
                      <button 
                        onClick={() => handleDisconnect(d.id)}
                        disabled={isConnecting === d.id}
                        className="btn-disconnect"
                      >
                        {isConnecting === d.id ? 'Disconnecting...' : 'Disconnect'}
                      </button>
                      <button 
                        onClick={() => debugServices(d.id)}
                        className="btn-debug"
                        title="Debug: List all services on this device"
                      >
                        Debug Services
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={() => handleConnect(d.id)}
                      disabled={isConnecting === d.id || !d.connectable}
                      className="btn-connect"
                      title={!d.connectable ? 'Device is not connectable' : ''}
                    >
                      {isConnecting === d.id ? 'Connecting...' : 'Connect'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {connectedDevices.length > 0 && (
        <div className="connected-devices-section">
          <h3>Connected Devices ({connectedDevices.length})</h3>
          <ul>
            {connectedDevices.map(deviceId => (
              <li key={deviceId} className="connected-device-item">
                ● {deviceId}
              </li>
            ))}
          </ul>
        </div>
      )}

      {scannedDevices.length === 0 && !isScanning && (
        <p className="no-devices-message">
          No devices found. Click "Scan for Devices" to search for Bluetooth devices.
        </p>
      )}
    </section>
  )
}
