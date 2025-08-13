import { useEffect, useRef } from 'react'
import MetadataForm from './MetadataForm'
import LiveChart from './LiveChart'
import DeviceStatusViewer from './MultiDeviceSelector'
import ScrollableContainer from './ScrollableContainer'
import ConfirmationModal from './ConfirmationModal'
import { useOptionalDeviceConnection } from '../contexts/DeviceConnectionContext'
import { useToast } from '../contexts/ToastContext'
import { useConfirmation } from '../hooks/useConfirmation'
import { usePersistentWorkflow } from '../hooks/usePersistentWorkflow'
import ErrorBoundary from './ErrorBoundary'
import { protectedOperations, securityMonitor } from '../services/csrfProtection'
import '../styles/modal.css'
import '../styles/tabs.css'

type CollectStep = 'metadata' | 'live' | 'review'

interface GaitDataPoint {
  device_id: string
  r1: number
  r2: number
  r3: number
  x: number
  y: number
  z: number
  timestamp: number
  sample_rate?: number
}

interface CollectedData {
  sessionName: string
  subjectId: string
  notes: string
  dataPoints: GaitDataPoint[]
  timestamp: Date
}

interface CollectTabProps {
  onNavigateToConnect?: () => void
}

interface WorkflowState extends Record<string, unknown> {
  currentStep: CollectStep
  collectedData: CollectedData | null
  isCollecting: boolean
  isUsingRealData: boolean
  isSaving: boolean
  isStopping: boolean
}

export default function CollectTab({ onNavigateToConnect }: CollectTabProps) {
  const {
    state: workflowState,
    updateField: updateWorkflowField,
    hasSavedData,
    isInitialized,
    completeWorkflow,
  } = usePersistentWorkflow<WorkflowState>(
    {
      currentStep: 'metadata' as CollectStep,
      collectedData: null,
      isCollecting: false,
      isUsingRealData: false,
      isSaving: false,
      isStopping: false,
    },
    {
      storageKey: 'gait-monitor-collect-workflow',
      debounceMs: 300,
      clearOnComplete: true,
    },
  )

  const { currentStep, collectedData, isCollecting, isUsingRealData, isSaving, isStopping } =
    workflowState

  const setCurrentStep = (step: CollectStep) => updateWorkflowField('currentStep', step)
  const setCollectedData = (data: CollectedData | null) =>
    updateWorkflowField('collectedData', data)
  const setIsCollecting = (collecting: boolean) => updateWorkflowField('isCollecting', collecting)
  const setIsUsingRealData = (useReal: boolean) => updateWorkflowField('isUsingRealData', useReal)
  const setIsSaving = (saving: boolean) => updateWorkflowField('isSaving', saving)
  const setIsStopping = (stopping: boolean) => updateWorkflowField('isStopping', stopping)

  const restorationAppliedRef = useRef(false)
  useEffect(() => {
    if (restorationAppliedRef.current) return
    if (isInitialized && hasSavedData()) {
      const currentState = workflowState
      if (currentState.isCollecting || currentState.isStopping || currentState.isSaving) {
        console.log('[Collect][Restore] Resetting transient flags from restored workflow')
        updateWorkflowField('isCollecting', false)
        updateWorkflowField('isStopping', false)
        updateWorkflowField('isSaving', false)
      }
      restorationAppliedRef.current = true
    }
  }, [isInitialized, hasSavedData, workflowState, updateWorkflowField])

  const dataBuffer = useRef<GaitDataPoint[]>([])

  const metadataFormClearRef = useRef<(() => void) | null>(null)

  const { confirmationState, showConfirmation } = useConfirmation()

  const { showError, showWarning, showSuccess } = useToast()

  useEffect(() => {
    console.log('[Security] Starting monitoring for file operations')
    securityMonitor.startMonitoring(30000) // Check every 30 seconds

    return () => {
      console.log('[Security] Stopping monitoring')
      securityMonitor.stopMonitoring()
    }
  }, [])

  const optionalCtx = useOptionalDeviceConnection()
  if (!optionalCtx) {
    return (
      <div className="card">
        <h2>Collection Unavailable</h2>
        <p>
          The DeviceConnectionProvider is not mounted. Ensure the root App component wraps this
          component.
        </p>
      </div>
    )
  }
  const { connectedDevices, startDeviceCollection, stopDeviceCollection, subscribeToGaitData } =
    optionalCtx

  useEffect(() => {
    if (isCollecting) {
      console.log('[Collect] Setting up gait data subscription')
      const lastReceiveTimes = new Map<string, number>()
      const packetCounts = new Map<string, number>()

      const unsubscribe = subscribeToGaitData((data) => {
        const receiveTime = performance.now()

        const lastReceiveTime = lastReceiveTimes.get(data.device_id) || receiveTime
        const interval = receiveTime - lastReceiveTime
        lastReceiveTimes.set(data.device_id, receiveTime)

        packetCounts.set(data.device_id, (packetCounts.get(data.device_id) || 0) + 1)
        const count = packetCounts.get(data.device_id) || 0

        if (count % 100 === 0) {
          const avgInterval = interval > 0 ? interval : 0
          const estimatedHz = avgInterval > 0 ? 1000 / avgInterval : 0
          console.log(
            `[Collect][Timing] [${data.device_id}, packet ${count}]: Interval: ${avgInterval.toFixed(1)}ms, Est. Rate: ${estimatedHz.toFixed(1)}Hz`,
          )
        }

        console.log('[Collect] Received gait data:', data.device_id, data.timestamp)
        dataBuffer.current.push({
          device_id: data.device_id,
          r1: data.r1,
          r2: data.r2,
          r3: data.r3,
          x: data.x,
          y: data.y,
          z: data.z,
          timestamp: data.timestamp,
        })
      })

      return () => {
        console.log('[Collect] Cleaning up gait data subscription')
        unsubscribe()
      }
    }
  }, [isCollecting]) // eslint-disable-line react-hooks/exhaustive-deps -- subscribeToGaitData should be stable, excluding to prevent re-subscriptions

  const steps = [
    { id: 'metadata', label: 'Metadata', number: 1 },
    { id: 'live', label: 'Live Collection', number: 2 },
    { id: 'review', label: 'Review & Save', number: 3 },
  ] as const

  const handleMetadataSubmit = (metadata: {
    sessionName: string
    subjectId: string
    notes: string
  }) => {
    dataBuffer.current = []

    setCollectedData({
      ...metadata,
      dataPoints: [],
      timestamp: new Date(),
    })
    setCurrentStep('live')
  }

  const handleStartCollection = async () => {
    try {
      console.log('[Collect] Starting synchronized collection for all connected devices')
      console.log('Connected devices:', connectedDevices)

      if (connectedDevices.length === 0) {
        showError('No Devices Connected', 'Please connect to devices first in the Connect tab.')
        return
      }

      dataBuffer.current = []
      console.log('[Collect] Cleared data buffer for new collection')

      const startPromises = connectedDevices.map(async (deviceId) => {
        try {
          console.log(`[Collect] Starting collection for device: ${deviceId}`)
          await startDeviceCollection(deviceId)
          console.log(`[Collect] Successfully started collection for device: ${deviceId}`)
          return { deviceId, success: true }
        } catch (error) {
          console.error(
            `[Collect][Error] Failed to start collection for device ${deviceId}:`,
            error,
          )
          return { deviceId, success: false, error }
        }
      })

      const results = await Promise.allSettled(startPromises)
      const successfulDevices = results
        .filter((result) => result.status === 'fulfilled' && result.value.success)
        .map(
          (result) =>
            (result as PromiseFulfilledResult<{ deviceId: string; success: boolean }>).value
              .deviceId,
        )

      const failedDevices = results.filter(
        (result) =>
          result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success),
      )

      console.log(
        `[Collect] Start results: ${successfulDevices.length} successful, ${failedDevices.length} failed`,
      )

      if (successfulDevices.length > 0) {
        console.log('[Collect] Successfully started synchronized data collection')
        setIsUsingRealData(true)
        setIsCollecting(true)

        if (failedDevices.length > 0) {
          showWarning(
            'Partial Success',
            `Started collection on ${successfulDevices.length} devices, but ${failedDevices.length} devices failed to start. Collection will continue with available devices.`,
          )
        }
      } else {
        console.error('[Collect][Error] Failed to start collection on any devices')
        showError(
          'Collection Failed',
          'Failed to start collection on any connected devices. Please check device connections and try again.',
        )
      }
    } catch (error) {
      console.error('Failed to start synchronized collection:', error)
      showError('Collection Error', `Failed to start collection: ${error}`)
    }
  }

  const handleStopCollectionRequest = async () => {
    if (isStopping) {
      console.log('[Collect][Warn] Stop collection already in progress, ignoring request')
      return
    }

    let sessionStartMs: number | undefined
    if (collectedData?.timestamp) {
      const rawTs: unknown = collectedData.timestamp as unknown
      if (rawTs instanceof Date) {
        sessionStartMs = rawTs.getTime()
      } else if (typeof rawTs === 'number') {
        sessionStartMs = rawTs
      } else if (typeof rawTs === 'string') {
        const parsed = Date.parse(rawTs)
        if (!isNaN(parsed)) sessionStartMs = parsed
      }
      if (sessionStartMs === undefined) {
        console.warn('[Collect][Warn] Unable to parse collectedData.timestamp, raw value:', rawTs)
      }
    }
    const collectionTimeText =
      dataBuffer.current.length > 0 && sessionStartMs !== undefined
        ? `${Math.round((Date.now() - sessionStartMs) / 1000)}s`
        : 'N/A'

    const warningText =
      dataBuffer.current.length > 0
        ? 'Your collected data will be saved and you can review it in the next step.'
        : 'No data has been collected yet. You may want to continue collecting before stopping.'

    const confirmed = await showConfirmation({
      title: 'Stop Data Collection?',
      message: `Are you sure you want to stop collecting data?

Current Session: ${collectedData?.sessionName}
Data Points Collected: ${dataBuffer.current.length}
Collection Time: ${collectionTimeText}

${warningText}`,
      confirmText: 'Yes, Stop Collection',
      cancelText: 'No, Continue Collecting',
      type: 'warning',
    })

    if (confirmed) {
      await handleConfirmStopCollection()
    }
  }

  const handleConfirmStopCollection = async () => {
    if (isStopping) {
      console.log('[Collect][Warn] Stop collection already in progress, ignoring confirmation')
      return
    }

    console.log('[Collect] User confirmed stop collection')
    setIsStopping(true)

    try {
      console.log('[Collect] Stopping data collection...')
      console.log('Current state:', {
        isCollecting,
        isUsingRealData,
        connectedDevices: connectedDevices.length,
        dataBufferLength: dataBuffer.current.length,
      })

      const finalDataPoints = [...dataBuffer.current]
      console.log(`[Collect] Captured ${finalDataPoints.length} data points before stopping`)

      if (isUsingRealData && connectedDevices.length > 0) {
        console.log('[Collect] Stopping BLE notifications for all connected devices')

        const stopPromises = connectedDevices.map(async (deviceId) => {
          try {
            console.log(`� Stopping collection for device: ${deviceId}`)
            await stopDeviceCollection(deviceId)
            console.log(`[Collect] Successfully stopped collection for device: ${deviceId}`)
            return { deviceId, success: true }
          } catch (error) {
            console.error(
              `[Collect][Error] Failed to stop collection for device ${deviceId}:`,
              error,
            )
            return { deviceId, success: false, error }
          }
        })

        const results = await Promise.allSettled(stopPromises)
        const successfulStops = results.filter(
          (result) => result.status === 'fulfilled' && result.value.success,
        ).length
        const failedStops = results.filter(
          (result) =>
            result.status === 'rejected' ||
            (result.status === 'fulfilled' && !result.value.success),
        ).length

        console.log(`[Collect] Stop results: ${successfulStops} successful, ${failedStops} failed`)

        if (failedStops > 0) {
          console.warn(`[Collect][Warn] Failed to stop collection on ${failedStops} devices`)
        }

        console.log('[Collect] Successfully stopped synchronized data collection')
        setIsUsingRealData(false)
      }

      setIsCollecting(false)
      console.log('[Collect] Set isCollecting to false')

      if (collectedData) {
        const updatedData = {
          ...collectedData,
          dataPoints: finalDataPoints,
        }
        setCollectedData(updatedData)
        console.log('[Collect] Updated collected data:', {
          sessionName: updatedData.sessionName,
          dataPointsLength: updatedData.dataPoints.length,
          sampleDataPoints: updatedData.dataPoints.slice(0, 2),
        })
      } else {
        console.warn('[Collect][Warn] No collectedData state found')
      }

      console.log('[Collect] Moving to review step')
      setCurrentStep('review')
    } catch (error) {
      console.error('[Collect][Error] Failed to stop collection:', error)

      const errorMessage = error instanceof Error ? error.message : String(error)
      alert(
        `Failed to stop collection properly: ${errorMessage}\n\nData has been captured but device may still be streaming. Please check the device connection.`,
      )

      setIsCollecting(false)
      setIsUsingRealData(false)

      const finalDataPoints = [...dataBuffer.current]
      if (collectedData) {
        setCollectedData({
          ...collectedData,
          dataPoints: finalDataPoints,
        })
        console.log('[Collect] Force-saved data points despite error:', finalDataPoints.length)
      }

      setCurrentStep('review')
    } finally {
      setIsStopping(false)
    }
  }

  const handleSaveData = async () => {
    if (!collectedData) {
      console.error('[Collect][Error] No collected data to save')
      alert('No data to save!')
      return
    }

    if (collectedData.dataPoints.length === 0) {
      console.error('[Collect][Error] No data points to save')
      alert('No data points collected. Please collect some data before saving.')
      return
    }

    console.log('[Collect] Starting to save session...')
    console.log('Session data to save:', {
      sessionName: collectedData.sessionName,
      subjectId: collectedData.subjectId,
      dataPointsLength: collectedData.dataPoints.length,
      sampleDataPoints: collectedData.dataPoints.slice(0, 3),
    })

    setIsSaving(true)

    try {
      console.log('[Collect] Saving session with enhanced CSRF protection...')

      const filePath = await protectedOperations.saveSessionData(
        collectedData.sessionName,
        collectedData.subjectId,
        collectedData.notes,
        collectedData.dataPoints,
      )

      console.log('[Collect] Session saved successfully to:', filePath)
      showSuccess(
        'Session Saved',
        `File: ${filePath}\nData points: ${collectedData.dataPoints.length}`,
      )

      completeWorkflow()
      dataBuffer.current = []

      metadataFormClearRef.current?.()
    } catch (error) {
      console.error('[Collect][Error] Failed to save session:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('CSRF')) {
        alert(
          `Security Error: ${errorMessage}\n\nThis might be due to an expired session. The page will refresh to get a new security token.`,
        )
        window.location.reload()
      } else if (errorMessage.includes('rate limit')) {
        alert(`Rate Limit Exceeded: ${errorMessage}\n\nPlease wait a moment before trying again.`)
      } else {
        alert(
          `Failed to save session: ${errorMessage}\n\nPlease check the console for more details and try again.`,
        )
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDiscardData = () => {
    completeWorkflow()
    dataBuffer.current = []

    metadataFormClearRef.current?.()
  }

  return (
    <ScrollableContainer id="collect-tab" className="tab-content">
      <style>{`
        .workflow-restored-indicator {
          background: #e8f5e8;
          border: 1px solid #c3e6c3;
          border-radius: 6px;
          font-size: 0.875rem;
          color: #2d5a2d;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          
          opacity: 0;
          max-height: 0;
          padding: 0 0.75rem;
          margin-bottom: 0;
          border-width: 0;
        }
        
        .workflow-restored-indicator.visible {
          opacity: 1;
          max-height: 60px;
          padding: 0.75rem;
          margin-bottom: 1rem;
          border-width: 1px;
        }
        
        .workflow-restored-indicator.loading {
          opacity: 0.7;
          max-height: 60px;
          padding: 0.75rem;
          margin-bottom: 1rem;
          border-width: 1px;
          background: #f0f0f0;
          color: #666;
        }
        
        .dark .workflow-restored-indicator {
          background: #1a2e1a;
          border-color: #2d4a2d;
          color: #a3d4a3;
        }
        
        .dark .workflow-restored-indicator.loading {
          background: #2d2d2d;
          color: #999;
        }
      `}</style>

      <div className="tab-header">
        <h1>Data Collection</h1>
        <p>Follow the 3-step process to collect and save gait data.</p>
      </div>

      <div className="wizard-progress">
        {steps.map((step, index) => {
          const currentStepIndex = steps.findIndex((s) => s.id === currentStep)
          const isCompleted = currentStepIndex > index
          const isActive = currentStep === step.id

          return (
            <div key={step.id} className={`wizard-step ${isCompleted ? 'completed' : ''}`}>
              <div
                className={`step-indicator ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
              >
                {isCompleted ? '✓' : step.number}
              </div>
              <span className="step-label">{step.label}</span>
            </div>
          )
        })}
      </div>

      <div className="wizard-content">
        {currentStep === 'metadata' && (
          <div className="wizard-step-content">
            <h2>Step 1: Enter Session Metadata</h2>
            <MetadataForm
              onSubmit={handleMetadataSubmit}
              onRegisterClearFunction={(clearFn) => {
                metadataFormClearRef.current = clearFn
              }}
            />
          </div>
        )}

        {currentStep === 'live' && (
          <div className="wizard-step-content">
            <h2>Step 2: Live Data Collection</h2>
            <div className="collection-controls">
              <div className="collection-info">
                <p>
                  <strong>Session:</strong> {collectedData?.sessionName}
                </p>
                <p>
                  <strong>Subject:</strong> {collectedData?.subjectId}
                </p>
              </div>
              <div className="collection-buttons">
                {!isCollecting ? (
                  <button className="btn-primary" onClick={handleStartCollection}>
                    Start All Connected Devices
                  </button>
                ) : (
                  <button
                    className="btn-secondary"
                    onClick={handleStopCollectionRequest}
                    disabled={isStopping}
                  >
                    {isStopping ? 'Stopping All Devices...' : 'Stop All Devices'}
                  </button>
                )}
                <button className="btn-tertiary" onClick={() => setCurrentStep('metadata')}>
                  Back to Metadata
                </button>
              </div>
            </div>

            <div className="collection-layout">
              <div className="main-collection-area">
                <ErrorBoundary
                  fallback={
                    <div className="chart-error-fallback">
                      <h3>Chart Error</h3>
                      <p>The live chart component encountered an error. Please refresh the page.</p>
                    </div>
                  }
                >
                  <LiveChart isCollecting={isCollecting} />
                </ErrorBoundary>
              </div>
              <div className="collection-sidebar">
                <ErrorBoundary
                  fallback={
                    <div className="device-selector-error-fallback">
                      <h3>Device Selector Error</h3>
                      <p>The device selector encountered an error. Please refresh the page.</p>
                    </div>
                  }
                >
                  <DeviceStatusViewer onNavigateToConnect={onNavigateToConnect} />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'review' && (
          <div className="wizard-step-content">
            <h2>Step 3: Review & Save</h2>
            <div className="data-review">
              <div className="review-metadata">
                <h3>Session Information</h3>
                <p>
                  <strong>Session Name:</strong> {collectedData?.sessionName}
                </p>
                <p>
                  <strong>Subject ID:</strong> {collectedData?.subjectId}
                </p>
                <p>
                  <strong>Notes:</strong> {collectedData?.notes}
                </p>
                <p>
                  <strong>Collected:</strong> {collectedData?.timestamp.toLocaleString()}
                </p>
                <p>
                  <strong>Data Points:</strong> {collectedData?.dataPoints.length || 0}
                </p>
                {collectedData && collectedData.dataPoints.length > 0 && (
                  <div className="data-summary">
                    <p>
                      <strong>Devices:</strong>{' '}
                      {[...new Set(collectedData.dataPoints.map((d) => d.device_id))].join(', ')}
                    </p>
                    <p>
                      <strong>Collection Duration:</strong>{' '}
                      {collectedData.dataPoints.length > 0
                        ? `${Math.round((collectedData.dataPoints[collectedData.dataPoints.length - 1].timestamp - collectedData.dataPoints[0].timestamp) / 1000)}s`
                        : 'N/A'}
                    </p>
                  </div>
                )}
              </div>

              <div className="review-actions">
                <button className="btn-primary" onClick={handleSaveData} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Session'}
                </button>
                <button className="btn-danger" onClick={handleDiscardData} disabled={isSaving}>
                  Discard Data
                </button>
                <button
                  className="btn-tertiary"
                  onClick={() => setCurrentStep('live')}
                  disabled={isSaving}
                >
                  Back to Collection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

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
    </ScrollableContainer>
  )
}
