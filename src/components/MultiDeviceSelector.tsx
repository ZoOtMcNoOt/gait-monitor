import { useMemo } from 'react'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'
import ScrollableContainer from './ScrollableContainer'
import { Icon } from './icons'

interface DeviceStatus {
  id: string
  name: string
  isConnected: boolean
  isCollecting: boolean
  signalStrength?: number // RSSI converted to %-style indicator
  lastDataTime?: number // epoch ms of last data packet
  dataRate?: number // sample rate (Hz)
  stale?: boolean // true if data is old
  initializing?: boolean // true if collecting but no data yet
  errorState?: string
}

interface DeviceStatusViewerProps {
  onNavigateToConnect?: () => void
}

export default function DeviceStatusViewer({ onNavigateToConnect }: DeviceStatusViewerProps) {
  const {
    connectedDevices,
    getActiveCollectingDevices,
    scannedDevices,
    lastGaitDataTime,
    deviceSampleRates,
    connectionStatus,
  } = useDeviceConnection()

  // Derive active collecting devices (async function returns and updates state internally).
  // We rely on Maps changing to trigger re-render, so we just call once per render cycle lazily.
  // (Side-effect intentionally omitted to avoid race conditions in SSR/tests.)
  void getActiveCollectingDevices()

  const devices: DeviceStatus[] = useMemo(() => {
    const now = Date.now()
    const GAIT_STALE_MS = 5_000 // 5s threshold for stale

    return connectedDevices.map((id) => {
      const shortId = id.slice(-6).toUpperCase()
      const lastTime = lastGaitDataTime.get(id)
      const sampleRate = deviceSampleRates.get(id)
      const status = connectionStatus.get(id)

      // RSSI from scanned devices list
      const scanInfo = scannedDevices.find((d) => d.id === id)
      const rssi = scanInfo?.rssi
      // Convert RSSI (~ -100 to -30) to 0-100 strength
      const signalStrength =
        rssi !== undefined ? Math.min(100, Math.max(0, ((rssi + 100) / 70) * 100)) : undefined

      const isCollecting = sampleRate !== undefined || status === 'connected'
      const hasData = lastTime !== undefined
      const age = hasData ? now - lastTime! : Infinity
      const stale = hasData ? age > GAIT_STALE_MS : false
      const initializing = isCollecting && !hasData

      return {
        id,
        name: shortId,
        isConnected: status === 'connected' || status === 'timeout',
        isCollecting: isCollecting && !stale,
        signalStrength: signalStrength ? Math.round(signalStrength) : undefined,
        lastDataTime: lastTime,
        dataRate: sampleRate,
        stale,
        initializing,
        errorState:
          status === 'timeout'
            ? 'Data timeout'
            : status === 'disconnected'
              ? 'Disconnected'
              : undefined,
      } as DeviceStatus
    })
  }, [connectedDevices, lastGaitDataTime, deviceSampleRates, scannedDevices, connectionStatus])

  const collectingCount = devices.filter((d) => d.isCollecting).length
  const connectedCount = devices.filter((d) => d.isConnected).length

  return (
    <div
      className="device-status-viewer sidebar-style"
      role="region"
      aria-label="Device Status Viewer"
    >
      <div className="status-header">
        <h3>
          <span aria-hidden="true" className="tab-icon">
            <Icon.Chart title="Device Status" />
          </span>{' '}
          Device Status
        </h3>
        <div className="last-update" aria-live="polite">
          <span className="update-indicator">●</span>
          <span className="update-text">Live</span>
        </div>
      </div>

      {devices.length === 0 ? (
        <div className="no-devices" role="status" aria-label="No devices connected">
          <div className="no-devices-icon" aria-hidden="true">
            <Icon.Plug title="No devices" size={48} />
          </div>
          <p className="no-devices-title">No connected devices</p>
          <small className="no-devices-subtitle">
            Connect devices in the Connect tab to begin monitoring
          </small>
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
                <span className="sync-icon" aria-hidden="true">
                  <Icon.Link title="Synchronized" />
                </span>
                <span className="sync-text">Synchronized Collection</span>
              </div>
            )}
          </div>

          <ScrollableContainer id="device-status-list" className="device-status-list">
            <div role="list" aria-label="Connected devices">
              {devices.map((device) => (
                <div
                  key={device.id}
                  className={`device-status-item ${device.isCollecting ? 'collecting' : device.initializing ? 'initializing' : 'idle'} ${device.stale ? 'stale' : ''} ${device.errorState ? 'error' : ''}`}
                  role="listitem"
                  aria-label={`Device ${device.name}: ${device.isConnected ? 'Connected' : 'Disconnected'}${device.initializing ? ', initializing' : device.stale ? ', stale' : ''}, ${device.isCollecting ? 'Collecting data' : 'Idle'}`}
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
                          className={`status-icon ${device.isCollecting ? 'collecting' : device.initializing ? 'initializing' : device.stale ? 'stale' : 'idle'}`}
                          aria-hidden="true"
                        >
                          {device.isCollecting ? (
                            <Icon.Radio title="Collecting" />
                          ) : device.initializing ? (
                            <Icon.Clock title="Initializing" />
                          ) : device.stale ? (
                            <Icon.Warning title="Stale" />
                          ) : (
                            <Icon.Pause title="Idle" />
                          )}
                        </span>
                        <span className="status-label">
                          {device.isCollecting
                            ? 'Collecting'
                            : device.initializing
                              ? 'Initializing'
                              : device.stale
                                ? 'Stale'
                                : 'Idle'}
                        </span>
                      </div>
                    </div>

                    {/* Enhanced data indicators */}
                    {device.isCollecting && (
                      <div className="data-indicators">
                        {device.dataRate && (
                          <div
                            className="data-rate"
                            title={`Sample rate: ${device.dataRate.toFixed(1)} Hz`}
                          >
                            <span className="rate-value">{device.dataRate.toFixed(0)}</span>
                            <span className="rate-unit">Hz</span>
                          </div>
                        )}
                        {device.signalStrength !== undefined && (
                          <div
                            className="signal-strength"
                            title={`Signal strength (RSSI derived): ${device.signalStrength}%`}
                          >
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
                        {device.lastDataTime && (
                          <div className="last-seen" title="Seconds since last packet">
                            <span className="last-seen-value">
                              {Math.min(999, Math.round((Date.now() - device.lastDataTime) / 1000))}
                              s
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {device.errorState && (
                      <div className="error-indicator" role="alert">
                        <span className="error-icon" aria-hidden="true">
                          <Icon.Warning title="Error" />
                        </span>
                        <span className="error-text">{device.errorState}</span>
                      </div>
                    )}
                  </div>

                  {device.isCollecting && !device.errorState && (
                    <div
                      className="activity-indicator"
                      aria-label="Device is actively collecting data"
                    >
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
