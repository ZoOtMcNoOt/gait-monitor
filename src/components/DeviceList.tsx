import { invoke } from '@tauri-apps/api/core'
import { useState, useEffect } from 'react'

interface BLEInfo { 
  id: string; 
  name: string;
  rssi?: number;
  connectable: boolean;
  address_type: string;
  services: string[];
  manufacturer_data: string[];
  service_data: string[];
}

export default function DeviceList() {
  const [devices, setDevices] = useState<BLEInfo[]>([])
  const [connectedDevices, setConnectedDevices] = useState<string[]>([])
  const [connecting, setConnecting] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  // Load connected devices on component mount
  useEffect(() => {
    loadConnectedDevices()
  }, [])

  async function loadConnectedDevices() {
    try {
      const connected: string[] = await invoke('get_connected_devices')
      setConnectedDevices(connected)
    } catch (e) {
      console.error('Failed to load connected devices', e)
    }
  }

  async function scan() {
    setScanning(true)
    try {
      const list: BLEInfo[] = await invoke('scan_devices')
      
      // Sort devices: known devices first (reverse alphabetically), then unknown devices (by RSSI descending - strongest first)
      const sortedDevices = list.sort((a, b) => {
        const aHasName = a.name && a.name.trim() !== '' && a.name !== 'Unknown'
        const bHasName = b.name && b.name.trim() !== '' && b.name !== 'Unknown'
        
        // If both have names or both don't have names, sort appropriately
        if (aHasName === bHasName) {
          if (aHasName) {
            // Both have names - sort reverse alphabetically (Z to A)
            return b.name.localeCompare(a.name)
          } else {
            // Both are unknown - sort by RSSI descending (stronger signal first)
            return (b.rssi || -100) - (a.rssi || -100)
          }
        }
        
        // One has name, one doesn't - named devices come first
        return aHasName ? -1 : 1
      })
      
      setDevices(sortedDevices)
      await loadConnectedDevices() // Refresh connection status
    } catch (e) {
      console.error('scan failed', e)
    } finally {
      setScanning(false)
    }
  }

  async function connect(deviceId: string) {
    setConnecting(deviceId)
    try {
      console.log(`Attempting to connect to device: ${deviceId}`)
      const result: string = await invoke('connect_device', { deviceId })
      console.log('Connection result:', result)
      await loadConnectedDevices() // Refresh connection status
      
      // Show success message
      const device = devices.find(d => d.id === deviceId);
      const deviceName = device?.name || 'Unknown Device';
      alert(`Successfully connected to ${deviceName}!`);
    } catch (e) {
      console.error('Connection failed:', e)
      
      // Show detailed error message
      const device = devices.find(d => d.id === deviceId);
      let errorMessage = `Failed to connect to ${device?.name || 'device'}:\n\n${e}`;
      
      if (typeof e === 'string') {
        if (e.includes('not connectable')) {
          errorMessage += '\n\nThis device may not support connections or may be in a non-connectable mode.';
        } else if (e.includes('not found')) {
          errorMessage += '\n\nThe device may have moved out of range. Try scanning again.';
        } else if (e.includes('timeout') || e.includes('failed after')) {
          errorMessage += '\n\nConnection timeout. The device may be busy, already connected to another device, or out of range.';
        } else if (e.includes('Connection refused') || e.includes('refused')) {
          errorMessage += '\n\nThe device refused the connection. It may be paired with another device or in a non-connectable state.';
        }
      }
      
      alert(errorMessage);
    } finally {
      setConnecting(null)
    }
  }

  async function disconnect(deviceId: string) {
    setConnecting(deviceId)
    try {
      const result: string = await invoke('disconnect_device', { deviceId })
      console.log(result)
      await loadConnectedDevices() // Refresh connection status
    } catch (e) {
      console.error('Disconnection failed', e)
      alert(`Disconnection failed: ${e}`)
    } finally {
      setConnecting(null)
    }
  }

  const isConnected = (deviceId: string) => connectedDevices.includes(deviceId)
  const isConnecting = (deviceId: string) => connecting === deviceId

  return (
    <section className="card">
      <h2>Bluetooth Devices</h2>
      <button onClick={scan} disabled={scanning}>
        {scanning ? 'Scanning...' : 'Scan for Devices'}
      </button>
      
      {devices.length > 0 && (
        <div>
          <h3>Available Devices ({devices.length})</h3>
          <ul>
            {devices.map(d => (
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
                    <span className="device-status">
                      ● Connected
                    </span>
                  )}
                </div>
                
                <div className="device-actions">
                  {isConnected(d.id) ? (
                    <button 
                      onClick={() => disconnect(d.id)}
                      disabled={isConnecting(d.id)}
                      className="btn-disconnect"
                    >
                      {isConnecting(d.id) ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  ) : (
                    <button 
                      onClick={() => connect(d.id)}
                      disabled={isConnecting(d.id) || !d.connectable}
                      className="btn-connect"
                      title={!d.connectable ? 'Device is not connectable' : ''}
                    >
                      {isConnecting(d.id) ? 'Connecting...' : 'Connect'}
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

      {devices.length === 0 && !scanning && (
        <p className="no-devices-message">
          No devices found. Click "Scan for Devices" to search for Bluetooth devices.
        </p>
      )}
    </section>
  )
}
