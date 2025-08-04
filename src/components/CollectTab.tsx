import { useState, useEffect, useRef } from 'react'
import MetadataForm from './MetadataForm'
import LiveChart from './LiveChart'
import DeviceStatusViewer from './MultiDeviceSelector'
import ScrollableContainer from './ScrollableContainer'
import ConfirmationModal from './ConfirmationModal'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'
import { useToast } from '../contexts/ToastContext'
import { useConfirmation } from '../hooks/useConfirmation'
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
  sample_rate?: number  // Add optional sample rate field
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

export default function CollectTab({ onNavigateToConnect }: CollectTabProps) {
  const [currentStep, setCurrentStep] = useState<CollectStep>('metadata')
  const [collectedData, setCollectedData] = useState<CollectedData | null>(null)
  const [isCollecting, setIsCollecting] = useState(false)
  const [isUsingRealData, setIsUsingRealData] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isStopping, setIsStopping] = useState(false) // Prevent multiple stop calls

  // Data collection buffer
  const dataBuffer = useRef<GaitDataPoint[]>([])

  // Confirmation modal for stop collection
  const { confirmationState, showConfirmation } = useConfirmation()

  // Toast notifications
  const { showError, showWarning, showSuccess } = useToast()

  // Initialize security monitoring
  useEffect(() => {
    console.log('🛡️ Starting security monitoring for file operations')
    securityMonitor.startMonitoring(30000) // Check every 30 seconds
    
    return () => {
      console.log('🛡️ Stopping security monitoring')
      securityMonitor.stopMonitoring()
    }
  }, [])

  // Use global device connection context
  const { 
    connectedDevices, 
    startDeviceCollection,
    stopDeviceCollection,
    subscribeToGaitData
  } = useDeviceConnection()

  // Subscribe to gait data during collection
  useEffect(() => {
    if (isCollecting) {
      console.log('🔔 Setting up gait data subscription')
      const lastReceiveTimes = new Map<string, number>() // Track frontend receive times
      const packetCounts = new Map<string, number>() // Track packet counts per device
      
      const unsubscribe = subscribeToGaitData((data) => {
        const receiveTime = performance.now()
        
        // Calculate intervals for performance monitoring
        const lastReceiveTime = lastReceiveTimes.get(data.device_id) || receiveTime
        const interval = receiveTime - lastReceiveTime
        lastReceiveTimes.set(data.device_id, receiveTime)
        
        // Log timing every 100th packet
        packetCounts.set(data.device_id, (packetCounts.get(data.device_id) || 0) + 1)
        const count = packetCounts.get(data.device_id) || 0
        
        if (count % 100 === 0) {
          const avgInterval = interval > 0 ? interval : 0
          const estimatedHz = avgInterval > 0 ? 1000 / avgInterval : 0
          console.log(`📊 Frontend timing [${data.device_id}, packet ${count}]: Interval: ${avgInterval.toFixed(1)}ms, Est. Rate: ${estimatedHz.toFixed(1)}Hz`)
        }
        
        // Add data to buffer
        console.log('📦 Received gait data:', data.device_id, data.timestamp)
        dataBuffer.current.push({
          device_id: data.device_id,
          r1: data.r1,
          r2: data.r2,
          r3: data.r3,
          x: data.x,
          y: data.y,
          z: data.z,
          timestamp: data.timestamp
        })
      })

      return () => {
        console.log('🔕 Cleaning up gait data subscription')
        unsubscribe()
      }
    }
  }, [isCollecting]) // eslint-disable-line react-hooks/exhaustive-deps -- subscribeToGaitData should be stable, excluding to prevent re-subscriptions

  const steps = [
    { id: 'metadata', label: 'Metadata', number: 1 },
    { id: 'live', label: 'Live Collection', number: 2 },
    { id: 'review', label: 'Review & Save', number: 3 }
  ] as const

  const handleMetadataSubmit = (metadata: { sessionName: string; subjectId: string; notes: string }) => {
    // Clear previous data buffer
    dataBuffer.current = []
    
    setCollectedData({
      ...metadata,
      dataPoints: [],
      timestamp: new Date()
    })
    setCurrentStep('live')
  }

  const handleStartCollection = async () => {
    try {
      console.log('🚀 Starting synchronized collection for all connected devices')
      console.log('Connected devices:', connectedDevices)
      
      if (connectedDevices.length === 0) {
        showError('No Devices Connected', 'Please connect to devices first in the Connect tab.')
        return
      }

      // Clear any previous data before starting new collection
      dataBuffer.current = []
      console.log('🧹 Cleared data buffer for new collection')

      // Start collection on ALL connected devices simultaneously
      const startPromises = connectedDevices.map(async (deviceId) => {
        try {
          console.log(`📡 Starting collection for device: ${deviceId}`)
          await startDeviceCollection(deviceId)
          console.log(`✅ Successfully started collection for device: ${deviceId}`)
          return { deviceId, success: true }
        } catch (error) {
          console.error(`❌ Failed to start collection for device ${deviceId}:`, error)
          return { deviceId, success: false, error }
        }
      })
      
      // Wait for all devices to start (or fail)
      const results = await Promise.allSettled(startPromises)
      const successfulDevices = results
        .filter(result => result.status === 'fulfilled' && result.value.success)
        .map(result => (result as PromiseFulfilledResult<{deviceId: string, success: boolean}>).value.deviceId)
      
      const failedDevices = results
        .filter(result => result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success))
        
      console.log(`📊 Collection start results: ${successfulDevices.length} successful, ${failedDevices.length} failed`)
      
      if (successfulDevices.length > 0) {
        console.log('✅ Successfully started synchronized data collection')
        setIsUsingRealData(true)
        setIsCollecting(true)
        
        if (failedDevices.length > 0) {
          showWarning('Partial Success', `Started collection on ${successfulDevices.length} devices, but ${failedDevices.length} devices failed to start. Collection will continue with available devices.`)
        }
      } else {
        console.error('❌ Failed to start collection on any devices')
        showError('Collection Failed', 'Failed to start collection on any connected devices. Please check device connections and try again.')
      }
    } catch (error) {
      console.error('Failed to start synchronized collection:', error)
      showError('Collection Error', `Failed to start collection: ${error}`)
    }
  }

  const handleStopCollectionRequest = async () => {
    // Prevent multiple stop requests
    if (isStopping) {
      console.log('⚠️ Stop collection already in progress, ignoring request')
      return
    }

    // Show confirmation modal with collection details
    const collectionTimeText = dataBuffer.current.length > 0 && collectedData?.timestamp ? 
      `${Math.round((Date.now() - collectedData.timestamp.getTime()) / 1000)}s` : 
      'N/A'

    const warningText = dataBuffer.current.length > 0 
      ? "Your collected data will be saved and you can review it in the next step."
      : "⚠️ No data has been collected yet. You may want to continue collecting before stopping."

    const confirmed = await showConfirmation({
      title: 'Stop Data Collection?',
      message: `Are you sure you want to stop collecting data?

Current Session: ${collectedData?.sessionName}
Data Points Collected: ${dataBuffer.current.length}
Collection Time: ${collectionTimeText}

${warningText}`,
      confirmText: 'Yes, Stop Collection',
      cancelText: 'No, Continue Collecting',
      type: 'warning'
    })

    if (confirmed) {
      await handleConfirmStopCollection()
    }
  }

  const handleConfirmStopCollection = async () => {
    // Prevent multiple stop calls
    if (isStopping) {
      console.log('⚠️ Stop collection already in progress, ignoring confirmation')
      return
    }
    
    console.log('🛑 User confirmed stop collection')
    setIsStopping(true)
    
    try {
      console.log('🛑 Stopping data collection...')
      console.log('Current state:', { 
        isCollecting, 
        isUsingRealData, 
        connectedDevices: connectedDevices.length,
        dataBufferLength: dataBuffer.current.length 
      })
      
      // Capture data BEFORE stopping to avoid race conditions
      const finalDataPoints = [...dataBuffer.current]
      console.log(`📊 Captured ${finalDataPoints.length} data points before stopping`)
      
      // Stop BLE notifications on ALL connected devices if using real data
      if (isUsingRealData && connectedDevices.length > 0) {
        console.log('🔄 Stopping BLE notifications for all connected devices')
        
        // Stop collection on ALL connected devices simultaneously
        const stopPromises = connectedDevices.map(async (deviceId) => {
          try {
            console.log(`� Stopping collection for device: ${deviceId}`)
            await stopDeviceCollection(deviceId)
            console.log(`✅ Successfully stopped collection for device: ${deviceId}`)
            return { deviceId, success: true }
          } catch (error) {
            console.error(`❌ Failed to stop collection for device ${deviceId}:`, error)
            return { deviceId, success: false, error }
          }
        })
        
        // Wait for all devices to stop (or fail)
        const results = await Promise.allSettled(stopPromises)
        const successfulStops = results.filter(result => result.status === 'fulfilled' && result.value.success).length
        const failedStops = results.filter(result => result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.success)).length
        
        console.log(`📊 Collection stop results: ${successfulStops} successful, ${failedStops} failed`)
        
        if (failedStops > 0) {
          console.warn(`⚠️ Failed to stop collection on ${failedStops} devices`)
        }
        
        console.log('✅ Successfully stopped synchronized data collection')
        setIsUsingRealData(false)
      }
      
      // Update UI state
      setIsCollecting(false)
      console.log('✅ Set isCollecting to false')
      
      // Update collected data with captured points
      if (collectedData) {
        const updatedData = {
          ...collectedData,
          dataPoints: finalDataPoints
        }
        setCollectedData(updatedData)
        console.log('💾 Updated collected data:', {
          sessionName: updatedData.sessionName,
          dataPointsLength: updatedData.dataPoints.length,
          sampleDataPoints: updatedData.dataPoints.slice(0, 2)
        })
      } else {
        console.warn('⚠️ No collectedData state found')
      }
      
      console.log('🔄 Moving to review step')
      setCurrentStep('review')
      
    } catch (error) {
      console.error('❌ Failed to stop collection:', error)
      
      // Show detailed error to user
      const errorMessage = error instanceof Error ? error.message : String(error)
      alert(`Failed to stop collection properly: ${errorMessage}\n\nData has been captured but device may still be streaming. Please check the device connection.`)
      
      // Force stop the UI state even if device stopping failed
      setIsCollecting(false)
      setIsUsingRealData(false)
      
      // Still capture data even if stopping failed
      const finalDataPoints = [...dataBuffer.current]
      if (collectedData) {
        setCollectedData({
          ...collectedData,
          dataPoints: finalDataPoints
        })
        console.log('💾 Force-saved data points despite error:', finalDataPoints.length)
      }
      
      setCurrentStep('review')
    } finally {
      // Always reset the stopping state
      setIsStopping(false)
    }
  }

  const handleSaveData = async () => {
    if (!collectedData) {
      console.error('❌ No collected data to save')
      alert('No data to save!')
      return
    }

    if (collectedData.dataPoints.length === 0) {
      console.error('❌ No data points to save')
      alert('No data points collected. Please collect some data before saving.')
      return
    }

    console.log('💾 Starting to save session...')
    console.log('Session data to save:', {
      sessionName: collectedData.sessionName,
      subjectId: collectedData.subjectId,
      dataPointsLength: collectedData.dataPoints.length,
      sampleDataPoints: collectedData.dataPoints.slice(0, 3)
    })

    setIsSaving(true)
    
    try {
      console.log('🔐 Saving session with enhanced CSRF protection...')

      // Use enhanced CSRF protection with automatic retry
      const filePath = await protectedOperations.saveSessionData(
        collectedData.sessionName,
        collectedData.subjectId,
        collectedData.notes,
        collectedData.dataPoints
      )

      console.log('✅ Session saved successfully to:', filePath)
      showSuccess('Session Saved', `File: ${filePath}\nData points: ${collectedData.dataPoints.length}`)
      
      // Reset wizard
      setCurrentStep('metadata')
      setCollectedData(null)
      dataBuffer.current = []
      
    } catch (error) {
      console.error('❌ Failed to save session:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // Enhanced error handling for CSRF-related errors
      if (errorMessage.includes('CSRF')) {
        alert(`Security Error: ${errorMessage}\n\nThis might be due to an expired session. The page will refresh to get a new security token.`)
        window.location.reload()
      } else if (errorMessage.includes('rate limit')) {
        alert(`Rate Limit Exceeded: ${errorMessage}\n\nPlease wait a moment before trying again.`)
      } else {
        alert(`Failed to save session: ${errorMessage}\n\nPlease check the console for more details and try again.`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDiscardData = () => {
    setCurrentStep('metadata')
    setCollectedData(null)
    dataBuffer.current = []
  }

  return (
    <ScrollableContainer id="collect-tab" className="tab-content">
      <div className="tab-header">
        <h1>Data Collection</h1>
        <p>Follow the 3-step process to collect and save gait data.</p>
      </div>

      {/* Step Progress Indicator */}
      <div className="wizard-progress">
        {steps.map((step, index) => {
          const currentStepIndex = steps.findIndex(s => s.id === currentStep)
          const isCompleted = currentStepIndex > index
          const isActive = currentStep === step.id
          
          return (
            <div 
              key={step.id} 
              className={`wizard-step ${isCompleted ? 'completed' : ''}`}
            >
              <div className={`step-indicator ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
                {isCompleted ? '✓' : step.number}
              </div>
              <span className="step-label">{step.label}</span>
            </div>
          )
        })}
      </div>

      {/* Step Content */}
      <div className="wizard-content">
        {currentStep === 'metadata' && (
          <div className="wizard-step-content">
            <h2>Step 1: Enter Session Metadata</h2>
            <MetadataForm onSubmit={handleMetadataSubmit} />
          </div>
        )}

        {currentStep === 'live' && (
          <div className="wizard-step-content">
            <h2>Step 2: Live Data Collection</h2>
            <div className="collection-controls">
              <div className="collection-info">
                <p><strong>Session:</strong> {collectedData?.sessionName}</p>
                <p><strong>Subject:</strong> {collectedData?.subjectId}</p>
                <p><strong>Status:</strong> {isCollecting ? 'Collecting...' : 'Ready'}</p>
                <p><strong>Connected Devices:</strong> {connectedDevices.length} device(s)</p>
                <p><strong>Data Points Collected:</strong> {dataBuffer.current.length}</p>
                {isUsingRealData && <p><strong>Data Source:</strong> Synchronized BLE Devices</p>}
                {!isUsingRealData && isCollecting && <p><strong>Data Source:</strong> Simulation Mode</p>}
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
            
            {/* Two-column layout for live collection */}
            <div className="collection-layout">
              <div className="main-collection-area">
                <ErrorBoundary fallback={
                  <div className="chart-error-fallback">
                    <h3>Chart Error</h3>
                    <p>The live chart component encountered an error. Please refresh the page.</p>
                  </div>
                }>
                  <LiveChart 
                    isCollecting={isCollecting} 
                  />
                </ErrorBoundary>
              </div>
              <div className="collection-sidebar">
                <ErrorBoundary fallback={
                  <div className="device-selector-error-fallback">
                    <h3>Device Selector Error</h3>
                    <p>The device selector encountered an error. Please refresh the page.</p>
                  </div>
                }>
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
                <p><strong>Session Name:</strong> {collectedData?.sessionName}</p>
                <p><strong>Subject ID:</strong> {collectedData?.subjectId}</p>
                <p><strong>Notes:</strong> {collectedData?.notes}</p>
                <p><strong>Collected:</strong> {collectedData?.timestamp.toLocaleString()}</p>
                <p><strong>Data Points:</strong> {collectedData?.dataPoints.length || 0}</p>
                {collectedData && collectedData.dataPoints.length > 0 && (
                  <div className="data-summary">
                    <p><strong>Devices:</strong> {[...new Set(collectedData.dataPoints.map(d => d.device_id))].join(', ')}</p>
                    <p><strong>Collection Duration:</strong> {
                      collectedData.dataPoints.length > 0 ? 
                        `${Math.round((collectedData.dataPoints[collectedData.dataPoints.length - 1].timestamp - collectedData.dataPoints[0].timestamp) / 1000)}s` : 
                        'N/A'
                    }</p>
                  </div>
                )}
              </div>
              
              <div className="review-actions">
                <button 
                  className="btn-primary" 
                  onClick={handleSaveData}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Session'}
                </button>
                <button 
                  className="btn-danger" 
                  onClick={handleDiscardData}
                  disabled={isSaving}
                >
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
    </ScrollableContainer>
  )
}
