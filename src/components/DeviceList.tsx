import { useEffect, useState, useRef, useCallback } from 'react'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'
import { useToast } from '../contexts/ToastContext'
import { useConfirmation } from '../hooks/useConfirmation'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import type { KeyboardShortcut } from '../hooks/useKeyboardShortcuts'
import ConfirmationModal from './ConfirmationModal'
import { Icon } from './icons'

export default function DeviceList() {
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [devicesPerPage, setDevicesPerPage] = useState(5)
  
  // Refs for keyboard navigation
  const deviceButtonRefs = useRef<(HTMLButtonElement | null)[]>([])
  
  // Add hooks for proper error handling
  const { showSuccess, showError, showInfo } = useToast()
  const { confirmationState, showConfirmation } = useConfirmation()

  // Use global device connection context exclusively
  const { 
    scannedDevices,
    connectedDevices, 
    connectionStatus, 
    isScanning,
    isConnecting,
    scanDevices,
    connectDevice,
    disconnectDevice,
    refreshConnectedDevices,
    removeScannedDevice // Add manual device removal
  } = useDeviceConnection()

  // Sort devices function - filter out connected devices from available list
  const getSortedDevices = useCallback(() => {
    return scannedDevices
      .filter(device => !connectedDevices.includes(device.id)) // Remove connected devices from available list
      .sort((a, b) => {
        // Sort GaitBLE devices to the top
        const aIsGaitBLE = (a.name || '').toLowerCase().startsWith('gaitble');
        const bIsGaitBLE = (b.name || '').toLowerCase().startsWith('gaitble');
        
        if (aIsGaitBLE && !bIsGaitBLE) return -1;
        if (!aIsGaitBLE && bIsGaitBLE) return 1;
        
        // If both are GaitBLE or both are not, sort alphabetically by name
        const aName = a.name || 'Unknown Device';
        const bName = b.name || 'Unknown Device';
        return aName.localeCompare(bName);
      })
  }, [scannedDevices, connectedDevices])

  // Keyboard navigation functions
  const focusDevice = useCallback((index: number) => {
    const sortedDevices = getSortedDevices()
    if (index >= 0 && index < sortedDevices.length) {
      deviceButtonRefs.current[index]?.focus()
    }
  }, [getSortedDevices])

  // Load connected devices on component mount
  useEffect(() => {
    refreshConnectedDevices()
  }, [refreshConnectedDevices])

  // Pagination calculations
  const sortedDevices = getSortedDevices()
  const totalPages = Math.ceil(sortedDevices.length / devicesPerPage)
  const startIndex = (currentPage - 1) * devicesPerPage
  const endIndex = startIndex + devicesPerPage
  const currentDevices = sortedDevices.slice(startIndex, endIndex)

  // Reset to first page when devices change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1)
    }
  }, [currentPage, totalPages])

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const handleDevicesPerPageChange = (newValue: number) => {
    setDevicesPerPage(newValue)
    setCurrentPage(1) // Reset to first page
  }

  const isConnected = (deviceId: string) => connectedDevices.includes(deviceId)

  const handleRemoveDevice = async (deviceId: string) => {
    const confirmed = await showConfirmation({
      title: 'Remove Device',
      message: 'Are you sure you want to remove this device from the list? You will need to scan again to find it.',
      confirmText: 'Remove',
      cancelText: 'Cancel',
      type: 'warning'
    })
    
    if (confirmed) {
      try {
        // First disconnect if connected
        if (isConnected(deviceId)) {
          await disconnectDevice(deviceId)
        }
        // Then remove from scanned device list
        removeScannedDevice(deviceId)
        showSuccess('Device Removed', 'The device has been removed from the list.')
      } catch (error) {
        console.error('Failed to remove device:', error)
        showError('Remove Failed', `Failed to remove device: ${error}`)
      }
    }
  }

  const handleConnect = useCallback(async (deviceId: string) => {
    try {
      await connectDevice(deviceId)
      // Show success message
      const device = scannedDevices.find(d => d.id === deviceId)
      const deviceName = device?.name || 'Unknown Device'
      showSuccess('Device Connected', `Successfully connected to ${deviceName}!`)
    } catch (error) {
      showError('Connection Failed', error instanceof Error ? error.message : `Connection failed: ${error}`)
    }
  }, [connectDevice, scannedDevices, showSuccess, showError])

  const handleDisconnect = useCallback(async (deviceId: string) => {
    try {
      await disconnectDevice(deviceId)
      showSuccess('Device Disconnected', 'Device has been disconnected successfully.')
    } catch (error) {
      showError('Disconnection Failed', `Disconnection failed: ${error}`)
    }
  }, [disconnectDevice, showSuccess, showError])

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
      
      showInfo(
        `Services for ${deviceName}`,
        `Available services:\n\n${services.join('\n')}`
      )
    } catch (e) {
      console.error('Debug services failed:', e)
      showError('Debug Failed', `Debug services failed: ${e}`)
    }
  }

  // Keyboard navigation handler (defined after the action handlers)
  const handleDeviceKeyDown = useCallback((e: React.KeyboardEvent, deviceIndex: number) => {
    const devices = getSortedDevices()
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        focusDevice((deviceIndex + 1) % devices.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        focusDevice(deviceIndex === 0 ? devices.length - 1 : deviceIndex - 1)
        break
      case 'Enter':
      case ' ': {
        e.preventDefault()
        const device = devices[deviceIndex]
        if (device) {
          const isDeviceConnected = connectedDevices.includes(device.id)
          if (isDeviceConnected) {
            handleDisconnect(device.id)
          } else {
            handleConnect(device.id)
          }
        }
        break
      }
    }
  }, [focusDevice, connectedDevices, handleConnect, handleDisconnect, getSortedDevices])

  // Device list keyboard shortcuts
  const deviceShortcuts: KeyboardShortcut[] = [
    {
      key: 's',
      ctrl: true,
      description: 'Start/stop device scanning',
      category: 'Device Management',
      action: () => handleScan()
    },
    {
      key: 'r',
      ctrl: true,
      description: 'Refresh connected devices',
      category: 'Device Management', 
      action: () => refreshConnectedDevices()
    }
  ].filter(shortcut => shortcut && shortcut.key) // Ensure all shortcuts are valid

  // Enable keyboard shortcuts for device list
  useKeyboardShortcuts({
    shortcuts: deviceShortcuts,
    enabled: true
  })

  return (
    <section className="card device-list-card">
      <h2>Bluetooth Devices</h2>
      <button onClick={handleScan} disabled={isScanning}>
        {isScanning ? 'Scanning...' : 'Scan for Devices'}
      </button>
      
      {/* Device list area - always present to prevent layout shift */}
      <div className="device-list-container">        
        {/* Connected Devices Section - Show first */}
        {connectedDevices.length > 0 && (
          <div className="connected-devices-section">
            <h3>
              <span aria-hidden="true" className="section-icon"><Icon.Link title="Connected" /></span>
              Connected Devices ({connectedDevices.length})
            </h3>
            <ul>
              {connectedDevices.map(deviceId => {
                // Find device info from scanned devices
                const deviceInfo = scannedDevices.find(d => d.id === deviceId)
                const status = connectionStatus.get(deviceId)
                
                return (
                  <li key={deviceId} className={`device-card connected gaitble-device`}>
                    <div className="device-header">
                      <div className="device-name-section">
                        <h4 className="device-name" title={deviceInfo?.name || 'Unknown Device'}>{deviceInfo?.name || 'Unknown Device'}</h4>
                        <div className="device-id" title={deviceId}>{deviceId}</div>
                      </div>
                    </div>

                    <div className="device-body">
                      <div className="device-info-grid">
                        <div className="device-info-section">
                          <div className="info-row">
                            <span className="info-label">Signal:</span>
                            <span className={`info-value ${deviceInfo?.rssi !== undefined ? 'rssi-value' : ''}`}>
                              {deviceInfo?.rssi !== undefined ? `${deviceInfo.rssi}dBm` : 'N/A'}
                            </span>
                          </div>
                          <div className="info-row">
                            <span className="info-label">Status:</span>
                            <span className="info-value device-connectable connectable">
                              ✓ Connected
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Connection status */}
                      {status && (
                        <div className={`data-status ${status || 'unknown'}`}>
                          <span className={`data-icon ${status || 'unknown'}`} aria-hidden="true">
                            {status === 'connected' ? <Icon.Heart title="Data Live" /> : status === 'timeout' ? <Icon.Clock title="Data Timeout" /> : <Icon.HeartOff title="No Data" />}
                          </span>
                          <span className="data-text">
                            {status === 'connected' ? 'Data Live' : status === 'timeout' ? 'Data Timeout' : 'No Data'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="device-footer">
                      <div className="device-connection-status">
                        <span className="connected-badge">● Connected</span>
                      </div>
                      
                      <div className="device-actions">
                        <div className="action-buttons">
                          <button 
                            onClick={() => handleDisconnect(deviceId)}
                            disabled={isConnecting === deviceId}
                            className="btn btn-disconnect"
                          >
                            {isConnecting === deviceId ? 'Disconnecting...' : 'Disconnect'}
                          </button>
                          <button 
                            onClick={() => debugServices(deviceId)}
                            className="btn btn-debug"
                            title="Debug: List all services on this device"
                          >
                            Debug Services
                          </button>
                          <button 
                            onClick={() => handleRemoveDevice(deviceId)}
                            className="btn btn-remove"
                            title="Remove this device from the list"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

    {isScanning && scannedDevices.length === 0 && (
          <div className="scanning-message">
      <p><span aria-hidden="true" className="tab-icon"><Icon.Search title="Scanning" /></span> Scanning for devices...</p>
          </div>
        )}
        
        {scannedDevices.length > 0 && (
          <div>
            <div className="device-list-header">
              <h3>Available Devices ({sortedDevices.length})</h3>
              <div className="pagination-controls">
                <label>
                  Devices per page:
                  <select 
                    value={devicesPerPage} 
                    onChange={(e) => handleDevicesPerPageChange(Number(e.target.value))}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </label>
              </div>
            </div>
            
            {totalPages > 1 && (
              <div className="pagination-info">
                <span>
                  Showing {startIndex + 1}-{Math.min(endIndex, scannedDevices.length)} of {scannedDevices.length} devices
                  (Page {currentPage} of {totalPages})
                </span>
              </div>
            )}
            
            <ul>
              {currentDevices.map((d, index) => (
                <li key={d.id} className={`device-card ${isConnected(d.id) ? 'connected' : ''} ${(d.name || '').toLowerCase().startsWith('gaitble') ? 'gaitble-device' : ''}`}>
                  <div className="device-header">
                    <div className="device-name-section">
                      <h4 className="device-name" title={d.name || 'Unknown Device'}>{d.name || 'Unknown Device'}</h4>
                      <div className="device-id" title={d.id}>{d.id}</div>
                    </div>
                  </div>

                  <div className="device-body">
                    <div className="device-info-grid">
                      <div className="device-info-section">
                        <div className="info-row">
                          <span className="info-label">Signal:</span>
                          <span className={`info-value ${d.rssi !== undefined ? 'rssi-value' : ''}`}>
                            {d.rssi !== undefined ? `${d.rssi}dBm` : 'N/A'}
                          </span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Status:</span>
                          <span className={`info-value device-connectable ${d.connectable ? 'connectable' : 'not-connectable'}`}>
                            {d.connectable ? '✓ Connectable' : '✗ Not Connectable'}
                          </span>
                        </div>
                        <div className="info-row">
                          <span className="info-label">Type:</span>
                          <span className="info-value device-type">{d.address_type}</span>
                        </div>
                      </div>

                      {(d.services.length > 0 || d.manufacturer_data.length > 0) && (
                        <div className="device-additional-info">
                          {d.services.length > 0 && (
                            <div className="info-row">
                              <span className="info-label">Services:</span>
                              <span className="info-value device-services">
                                {d.services.slice(0, 2).join(', ')}
                                {d.services.length > 2 && ` (+${d.services.length - 2} more)`}
                              </span>
                            </div>
                          )}
                          {d.manufacturer_data.length > 0 && (
                            <div className="info-row">
                              <span className="info-label">Manufacturer:</span>
                              <span className="info-value device-manufacturer" title={d.manufacturer_data[0]}>{d.manufacturer_data[0]}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Connection status for all devices */}
                    {(() => {
                      const status = connectionStatus.get(d.id)
                      const isConnectedDevice = isConnected(d.id)
                      
                      return isConnectedDevice && status ? (
                        <div className={`data-status ${status || 'unknown'}`}>
                          <span className={`data-icon ${status || 'unknown'}`} aria-hidden="true">
                            {status === 'connected' ? <Icon.Heart title="Data Live" /> : status === 'timeout' ? <Icon.Clock title="Data Timeout" /> : <Icon.HeartOff title="No Data" />}
                          </span>
                          <span className="data-text">
                            {status === 'connected' ? 'Data Live' : status === 'timeout' ? 'Data Timeout' : 'No Data'}
                          </span>
                        </div>
                      ) : null
                    })()}
                  </div>

                  <div className="device-footer">
                    <div className="device-connection-status">
                      {isConnected(d.id) && (
                        <span className="connected-badge">
                          ● Connected
                        </span>
                      )}
                    </div>
                    
                    <div className="device-actions">
                    {isConnected(d.id) ? (
                      <div className="action-buttons">
                        <button 
                          ref={el => { deviceButtonRefs.current[startIndex + index] = el }}
                          onClick={() => handleDisconnect(d.id)}
                          onKeyDown={(e) => handleDeviceKeyDown(e, startIndex + index)}
                          disabled={isConnecting === d.id}
                          className="btn btn-disconnect"
                          aria-label={`Disconnect ${d.name || 'Unknown Device'} (Arrow keys to navigate, Enter to activate)`}
                          tabIndex={0}
                        >
                          {isConnecting === d.id ? 'Disconnecting...' : 'Disconnect'}
                        </button>
                        <button 
                          onClick={() => debugServices(d.id)}
                          className="btn btn-debug"
                          title="Debug: List all services on this device"
                          aria-label={`Debug services for ${d.name || 'Unknown Device'}`}
                        >
                          Debug Services
                        </button>
                        <button 
                          onClick={() => handleRemoveDevice(d.id)}
                          className="btn btn-remove"
                          title="Remove this device from the list"
                          aria-label={`Remove ${d.name || 'Unknown Device'} from list`}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="action-buttons">
                        <button 
                          ref={el => { deviceButtonRefs.current[startIndex + index] = el }}
                          onClick={() => handleConnect(d.id)}
                          onKeyDown={(e) => handleDeviceKeyDown(e, startIndex + index)}
                          disabled={isConnecting === d.id || !d.connectable}
                          className="btn btn-connect"
                          title={!d.connectable ? 'Device is not connectable' : ''}
                          aria-label={`Connect to ${d.name || 'Unknown Device'} (Arrow keys to navigate, Enter to activate)`}
                          tabIndex={0}
                        >
                          {isConnecting === d.id ? 'Connecting...' : 'Connect'}
                        </button>
                        <button 
                          onClick={() => handleRemoveDevice(d.id)}
                          className="btn btn-remove"
                          title="Remove this device from the list"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                </li>
            ))}
          </ul>
          
          {totalPages > 1 && (
            <div className="pagination-navigation">
              <button 
                onClick={() => goToPage(1)} 
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                First
              </button>
              <button 
                onClick={() => goToPage(currentPage - 1)} 
                disabled={currentPage === 1}
                className="pagination-btn"
              >
                Previous
              </button>
              
              <div className="pagination-pages">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  
                  return (
                    <button
                      key={pageNum}
                      onClick={() => goToPage(pageNum)}
                      className={`pagination-btn ${currentPage === pageNum ? 'active' : ''}`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              
              <button 
                onClick={() => goToPage(currentPage + 1)} 
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                Next
              </button>
              <button 
                onClick={() => goToPage(totalPages)} 
                disabled={currentPage === totalPages}
                className="pagination-btn"
              >
                Last
              </button>
            </div>
          )}
        </div>
        )}

        {sortedDevices.length === 0 && scannedDevices.length === 0 && !isScanning && (
          <div className="no-devices-message">
            <p>No devices found. Click "Scan for Devices" to search for Bluetooth devices.</p>
          </div>
        )}

        {sortedDevices.length === 0 && scannedDevices.length > 0 && !isScanning && (
          <div className="no-devices-message">
            <p>All scanned devices are already connected. Scan for more devices to find additional options.</p>
          </div>
        )}
      </div>
      
      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        title={confirmationState.title}
        message={confirmationState.message}
        confirmText={confirmationState.confirmText}
        cancelText={confirmationState.cancelText}
        onConfirm={confirmationState.onConfirm}
        onCancel={confirmationState.onCancel}
        type={confirmationState.type}
      />
    </section>
  )
}
