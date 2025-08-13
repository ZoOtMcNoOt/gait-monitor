import { useMemo } from 'react'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'
import ScrollableContainer from './ScrollableContainer'
import { Icon } from './icons'

interface DeviceStatus {
  id: string
  name: string
  isConnected: boolean
  isTimeout?: boolean
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
  deviceSides,
  setDeviceSide,
  activeCollectingDevices,
  } = useDeviceConnection()

  // Derive active collecting devices (async function returns and updates state internally).
  // We rely on Maps changing to trigger re-render, so we just call once per render cycle lazily.
  // (Side-effect intentionally omitted to avoid race conditions in SSR/tests.)
  void getActiveCollectingDevices()

  const devices: DeviceStatus[] = useMemo(() => {
    const now = Date.now()
    const STALE_THRESHOLD_MS = 5000

    return connectedDevices.map((id) => {
      const shortId = id.slice(-6).toUpperCase()
      const lastTime = lastGaitDataTime.get(id)
      const sampleRate = deviceSampleRates.get(id)
      const status = connectionStatus.get(id)
      const active = activeCollectingDevices.includes(id)
      const hasData = lastTime !== undefined
      const age = hasData ? now - (lastTime as number) : Infinity
      const stale = active && hasData && age > STALE_THRESHOLD_MS
      const initializing = active && !hasData
      const isCollecting = active && hasData && !stale
      const isTimeout = status === 'timeout'

      // RSSI from scanned devices list
      const scanInfo = scannedDevices.find((d) => d.id === id)
      const rssi = scanInfo?.rssi
      let signalStrength: number | undefined
      if (rssi !== undefined) {
        const pct = Math.min(100, Math.max(0, ((rssi + 100) / 70) * 100))
        signalStrength = Math.round(pct)
      }

      // Only treat fully disconnected as error; timeout is a warning state now
      const errorState = status === 'disconnected' ? 'Disconnected' : undefined

      return {
        id,
        name: shortId,
        isConnected: status === 'connected',
        isTimeout,
        isCollecting,
        signalStrength,
        lastDataTime: lastTime,
        dataRate: isCollecting && sampleRate ? sampleRate : undefined,
        stale,
        initializing,
        errorState,
      } as DeviceStatus
    })
  }, [
    connectedDevices,
    lastGaitDataTime,
    deviceSampleRates,
    scannedDevices,
    connectionStatus,
    activeCollectingDevices,
  ])

  // Summary counts removed with status summary UI

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
          {/* Status summary removed per user request */}

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
                        {(() => {
                          const side = deviceSides.get(device.id)
                          return side ? `${side}:${device.name}` : device.name
                        })()}
                      </span>
                      <span className="device-label">Device</span>
                      {!deviceSides.get(device.id) && (
                        <div className="device-side-select inline">
                          <label className="sr-only" htmlFor={`mdv-side-${device.id}`}>
                            Set side for device {device.id}
                          </label>
                          <select
                            id={`mdv-side-${device.id}`}
                            value={deviceSides.get(device.id) || ''}
                            onChange={(e) => {
                              const val = e.target.value as 'L' | 'R' | ''
                              if (val) setDeviceSide(device.id, val)
                            }}
                          >
                            <option value="">Side?</option>
                            <option value="L">Left</option>
                            <option value="R">Right</option>
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="device-indicators">
                      {(device.isConnected || device.isTimeout) && (
                        <div className="connection-status">
                          <span
                            className={`status-dot ${device.isConnected ? 'connected' : device.isTimeout ? 'timeout' : ''}`}
                            aria-hidden="true"
                          >
                            ●
                          </span>
                          <span className="status-label">
                            {device.isConnected ? 'Connected' : 'Timeout'}
                          </span>
                        </div>
                      )}

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
