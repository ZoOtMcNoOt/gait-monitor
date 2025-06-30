import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import MetadataForm from './MetadataForm'
import LiveChart from './LiveChart'

type CollectStep = 'metadata' | 'live' | 'review'

interface CollectedData {
  sessionName: string
  subjectId: string
  notes: string
  dataPoints: number[]
  timestamp: Date
}

interface BLEFunctions {
  setupNotifications: (characteristic: BluetoothRemoteGATTCharacteristic) => Promise<void>
  cleanupNotifications: (characteristic: BluetoothRemoteGATTCharacteristic) => void
}

export default function CollectTab() {
  const [currentStep, setCurrentStep] = useState<CollectStep>('metadata')
  const [collectedData, setCollectedData] = useState<CollectedData | null>(null)
  const [isCollecting, setIsCollecting] = useState(false)
  const [bleFunctions, setBLEFunctions] = useState<BLEFunctions | null>(null)
  const [connectedDevices, setConnectedDevices] = useState<string[]>([])
  const [activeCharacteristic, setActiveCharacteristic] = useState<BluetoothRemoteGATTCharacteristic | null>(null)
  const [isUsingRealData, setIsUsingRealData] = useState(false)

  // Load connected devices when component mounts
  useEffect(() => {
    loadConnectedDevices()
  }, [])

  // Set up BLE data listener
  useEffect(() => {
    if (isCollecting && isUsingRealData) {
      const unlisten = listen('gait-data', (event) => {
        // The real BLE data is automatically handled by the LiveChart component
        // through the Tauri event system
        console.log('Received real BLE data:', event.payload)
      })
      
      return () => {
        unlisten.then(fn => fn())
      }
    }
  }, [isCollecting, isUsingRealData])

  async function loadConnectedDevices() {
    try {
      const connected: string[] = await invoke('get_connected_devices')
      setConnectedDevices(connected)
    } catch (e) {
      console.error('Failed to load connected devices', e)
    }
  }

  const steps = [
    { id: 'metadata', label: 'Metadata', number: 1 },
    { id: 'live', label: 'Live Collection', number: 2 },
    { id: 'review', label: 'Review & Save', number: 3 }
  ] as const

  const handleMetadataSubmit = (metadata: { sessionName: string; subjectId: string; notes: string }) => {
    setCollectedData({
      ...metadata,
      dataPoints: [],
      timestamp: new Date()
    })
    setCurrentStep('live')
  }

  const handleStartCollection = async () => {
    try {
      // Check if we have connected devices
      await loadConnectedDevices()
      
      if (connectedDevices.length === 0) {
        alert('No connected devices found. Please connect to a device first in the Connect tab.')
        return
      }

      // Try to start real BLE notifications
      const deviceId = connectedDevices[0] // Use first connected device
      
      try {
        const result = await invoke('start_gait_notifications', { deviceId })
        console.log('✅ Started real BLE data collection:', result)
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

  const handleStopCollection = async () => {
    try {
      if (isUsingRealData && connectedDevices.length > 0) {
        const deviceId = connectedDevices[0]
        await invoke('stop_gait_notifications', { deviceId })
        console.log('🔄 Stopped real BLE data collection')
        setIsUsingRealData(false)
      }
      
      if (activeCharacteristic && bleFunctions) {
        bleFunctions.cleanupNotifications(activeCharacteristic)
        setActiveCharacteristic(null)
      }
      
      setIsCollecting(false)
      setCurrentStep('review')
    } catch (error) {
      console.error('Failed to stop collection:', error)
      setIsCollecting(false)
      setCurrentStep('review')
    }
  }

  const handleSaveData = () => {
    if (collectedData) {
      // TODO: Save to CSV
      console.log('Saving data:', collectedData)
      // Reset wizard
      setCurrentStep('metadata')
      setCollectedData(null)
    }
  }

  const handleDiscardData = () => {
    setCurrentStep('metadata')
    setCollectedData(null)
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
              </div>
              <div className="collection-buttons">
                {!isCollecting ? (
                  <button className="btn-primary" onClick={handleStartCollection}>
                    Start Collection
                  </button>
                ) : (
                  <button className="btn-secondary" onClick={handleStopCollection}>
                    Stop Collection
                  </button>
                )}
                <button className="btn-tertiary" onClick={() => setCurrentStep('metadata')}>
                  Back to Metadata
                </button>
              </div>
            </div>
            <LiveChart 
              isCollecting={isCollecting} 
              onBLEFunctionsReady={setBLEFunctions}
            />
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
              </div>
              
              <div className="review-actions">
                <button className="btn-primary" onClick={handleSaveData}>
                  Save to CSV
                </button>
                <button className="btn-danger" onClick={handleDiscardData}>
                  Discard Data
                </button>
                <button className="btn-tertiary" onClick={() => setCurrentStep('live')}>
                  Back to Collection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
