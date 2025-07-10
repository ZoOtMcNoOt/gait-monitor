import { useState, useEffect, useRef } from 'react'
import MetadataForm from './MetadataForm'
import LiveChart from './LiveChart'
import MultiDeviceSelector from './MultiDeviceSelector'
import { useDeviceConnection } from '../contexts/DeviceConnectionContext'
import { invoke } from '@tauri-apps/api/core'
import ErrorBoundary from './ErrorBoundary'

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
      const unsubscribe = subscribeToGaitData((data) => {
        // Add data to buffer
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

      return unsubscribe
    }
  }, [isCollecting, subscribeToGaitData])

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
    }
  }

  const handleCancelStopCollection = () => {
    setShowStopConfirmation(false)
  }

  const handleSaveData = async () => {
    if (!collectedData) {
      alert('No data to save!')
      return
    }

    if (collectedData.dataPoints.length === 0) {
      alert('No data points collected. Please collect some data before saving.')
      return
    }

    setIsSaving(true)
    
    try {
      const filePath = await invoke<string>('save_session_data', {
        sessionName: collectedData.sessionName,
        subjectId: collectedData.subjectId,
        notes: collectedData.notes,
        data: collectedData.dataPoints,
        storagePath: null // Use default path for now
      })

      console.log('✅ Data saved successfully to:', filePath)
      alert(`Data saved successfully!\n\nFile: ${filePath}\nData points: ${collectedData.dataPoints.length}`)
      
      // Reset wizard
      setCurrentStep('metadata')
      setCollectedData(null)
      dataBuffer.current = []
      
    } catch (error) {
      console.error('Failed to save data:', error)
      alert(`Failed to save data: ${error}`)
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
    <div className="tab-content">
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
                  <button className="btn-secondary" onClick={handleStopCollectionRequest}>
                    Stop Collection
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
                  disabled={isSaving || !collectedData?.dataPoints.length}
                >
                  {isSaving ? 'Saving...' : 'Save to CSV'}
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
    </div>
  )
}
