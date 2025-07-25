import { useState, useEffect, useRef } from 'react'
import MetadataForm from './MetadataForm'
import LiveChart from './LiveChart'
import MultiDeviceSelector from './MultiDeviceSelector'
import ScrollableContainer from './ScrollableContainer'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'
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

export default function CollectTab() {
  const [currentStep, setCurrentStep] = useState<CollectStep>('metadata')
  const [collectedData, setCollectedData] = useState<CollectedData | null>(null)
  const [isCollecting, setIsCollecting] = useState(false)
  const [isUsingRealData, setIsUsingRealData] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showStopConfirmation, setShowStopConfirmation] = useState(false)
  const [isStopping, setIsStopping] = useState(false) // Prevent multiple stop calls

  // Data collection buffer
  const dataBuffer = useRef<GaitDataPoint[]>([])

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
      const lastTimestamps = new Map<string, number>() // Track last timestamp per device
      const lastReceiveTimes = new Map<string, number>() // Track frontend receive times
      const packetCounts = new Map<string, number>() // Track packet counts per device
      
      const unsubscribe = subscribeToGaitData((data) => {
        const receiveTime = performance.now()
        
        // Deduplication: skip if we already received this exact timestamp from this device
        const deviceLastTimestamp = lastTimestamps.get(data.device_id)
        if (deviceLastTimestamp === data.timestamp) {
          console.log('🔄 Skipping duplicate data point:', data.device_id, data.timestamp)
          return
        }
        
        // Update last timestamp for this device
        lastTimestamps.set(data.device_id, data.timestamp)
        
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
      if (connectedDevices.length === 0) {
        alert('No connected devices found. Please connect to a device first in the Connect tab.')
        return
      }

      // Clear any previous data before starting new collection
      dataBuffer.current = []
      console.log('🧹 Cleared data buffer for new collection')

      // Try to start real BLE notifications on the first connected device
      const deviceId = connectedDevices[0]
      
      try {
        await startDeviceCollection(deviceId)
        console.log('✅ Started real BLE data collection:', deviceId)
        setIsUsingRealData(true)
        setIsCollecting(true)
      } catch (bleError) {
        console.warn('BLE notifications failed, using simulation:', bleError)
        alert(`BLE notifications failed: ${bleError}\n\nUsing simulation mode instead.`)
        setIsUsingRealData(false)
        setIsCollecting(true)
      }
    } catch (error) {
      console.error('Failed to start collection:', error)
      alert(`Failed to start collection: ${error}`)
    }
  }

  const handleStopCollectionRequest = () => {
    // Prevent multiple stop requests
    if (isStopping) {
      console.log('⚠️ Stop collection already in progress, ignoring request')
      return
    }
    setShowStopConfirmation(true)
  }

  const handleConfirmStopCollection = async () => {
    // Prevent multiple stop calls
    if (isStopping) {
      console.log('⚠️ Stop collection already in progress, ignoring confirmation')
      return
    }
    
    console.log('🛑 User confirmed stop collection')
    setIsStopping(true)
    setShowStopConfirmation(false)
    
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
      
      // Stop BLE notifications if using real data
      if (isUsingRealData && connectedDevices.length > 0) {
        const deviceId = connectedDevices[0]
        console.log('🔄 Stopping BLE notifications for device:', deviceId)
        await stopDeviceCollection(deviceId)
        console.log('✅ Successfully stopped BLE data collection')
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

  const handleCancelStopCollection = () => {
    setShowStopConfirmation(false)
    // Don't reset isStopping here as user cancelled
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
      alert(`Session saved successfully!\n\nFile: ${filePath}\nData points: ${collectedData.dataPoints.length}`)
      
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
                <p><strong>Connected Devices:</strong> {connectedDevices.length > 0 ? connectedDevices.join(', ') : 'None'}</p>
                <p><strong>Data Points Collected:</strong> {dataBuffer.current.length}</p>
                {isUsingRealData && <p><strong>Data Source:</strong> Real BLE Device</p>}
                {!isUsingRealData && isCollecting && <p><strong>Data Source:</strong> Simulation Mode</p>}
              </div>
              <div className="collection-buttons">
                {!isCollecting ? (
                  <button className="btn-primary" onClick={handleStartCollection}>
                    Start Collection
                  </button>
                ) : (
                  <button 
                    className="btn-secondary" 
                    onClick={handleStopCollectionRequest}
                    disabled={isStopping}
                  >
                    {isStopping ? 'Stopping...' : 'Stop Collection'}
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
                  <MultiDeviceSelector />
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

      {/* Stop Collection Confirmation Modal */}
      {showStopConfirmation && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Stop Data Collection?</h3>
            <p>
              Are you sure you want to stop collecting data?
            </p>
            <div className="modal-details">
              <p><strong>Current Session:</strong> {collectedData?.sessionName}</p>
              <p><strong>Data Points Collected:</strong> {dataBuffer.current.length}</p>
              <p><strong>Collection Time:</strong> {
                dataBuffer.current.length > 0 && collectedData?.timestamp ? 
                  `${Math.round((Date.now() - collectedData.timestamp.getTime()) / 1000)}s` : 
                  'N/A'
              }</p>
            </div>
            <p className="modal-warning">
              {dataBuffer.current.length > 0 
                ? "Your collected data will be saved and you can review it in the next step."
                : "⚠️ No data has been collected yet. You may want to continue collecting before stopping."
              }
            </p>
            <div className="modal-actions">
              <button 
                className="btn-danger modal-confirm-btn" 
                onClick={handleConfirmStopCollection}
              >
                Yes, Stop Collection
              </button>
              <button 
                className="btn-secondary" 
                onClick={handleCancelStopCollection}
              >
                No, Continue Collecting
              </button>
            </div>
          </div>
        </div>
      )}
    </ScrollableContainer>
  )
}
