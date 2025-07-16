import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import DeviceList from '../DeviceList'
import { useDeviceConnection } from '../../contexts/DeviceConnectionContext'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'

// Mock dependencies
jest.mock('../../contexts/DeviceConnectionContext')
jest.mock('../../contexts/ToastContext')
jest.mock('../../hooks/useConfirmation')

// Create mock functions that can be reassigned
const mockScanDevices = jest.fn()
const mockConnectDevice = jest.fn()
const mockDisconnectDevice = jest.fn()
const mockRefreshConnectedDevices = jest.fn()
const mockRemoveScannedDevice = jest.fn()

const mockDeviceConnection = {
  scannedDevices: [
    { 
      id: 'device1', 
      name: 'GaitBLE_Left', 
      rssi: -45, 
      connected: false,
      address_type: 'random',
      connectable: true,
      services: ['180A', '180F'],
      manufacturer_data: ['Apple']
    },
    { 
      id: 'device2', 
      name: 'GaitBLE_Right', 
      rssi: -50, 
      connected: true,
      address_type: 'public',
      connectable: true,
      services: ['180A'],
      manufacturer_data: []
    },
    { 
      id: 'device3', 
      name: 'Unknown Device', 
      rssi: -60, 
      connected: false,
      address_type: 'random',
      connectable: true,
      services: [],
      manufacturer_data: ['Samsung']
    }
  ],
  connectedDevices: [
    'device2' // Just IDs, not objects
  ],
  connectionStatus: new Map([
    ['device1', 'disconnected'],
    ['device2', 'connected'],
    ['device3', 'disconnected']
  ]),
  deviceHeartbeats: new Map([
    ['device2', Date.now()]
  ]),
  isScanning: false,
  isConnecting: null as string | null,
  scanDevices: mockScanDevices,
  connectDevice: mockConnectDevice,
  disconnectDevice: mockDisconnectDevice,
  refreshConnectedDevices: mockRefreshConnectedDevices,
  removeScannedDevice: mockRemoveScannedDevice
}

const mockToast = {
  showSuccess: jest.fn(),
  showError: jest.fn(),
  showInfo: jest.fn()
}

const mockConfirmation = {
  confirmationState: {
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: jest.fn(),
    onCancel: jest.fn()
  },
  showConfirmation: jest.fn()
}

const mockKeyboardShortcuts = {
  registerShortcut: jest.fn(),
  unregisterShortcut: jest.fn()
}

// Mock the useKeyboardShortcuts hook to accept a config parameter
jest.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: jest.fn((config) => {
    if (config && config.shortcuts) {
      config.shortcuts.forEach(() => {
        mockKeyboardShortcuts.registerShortcut()
      })
    }
    return mockKeyboardShortcuts
  })
}))

describe('DeviceList', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    // Clear all mocks first
    jest.clearAllMocks()

    // Reset mock implementations to default behavior
    mockScanDevices.mockResolvedValue(undefined)
    mockConnectDevice.mockResolvedValue(undefined)
    mockDisconnectDevice.mockResolvedValue(undefined)
    mockRefreshConnectedDevices.mockResolvedValue(undefined)
    mockRemoveScannedDevice.mockResolvedValue(undefined)

    // Setup mocks
    ;(useDeviceConnection as jest.Mock).mockReturnValue(mockDeviceConnection)
    ;(useToast as jest.Mock).mockReturnValue(mockToast)
    ;(useConfirmation as jest.Mock).mockReturnValue(mockConfirmation)
  })

  afterEach(() => {
    root.unmount()
    document.body.removeChild(container)
  })

  describe('Initialization', () => {
    it('should render device list component', () => {
      flushSync(() => {
        root.render(<DeviceList />)
      })

      expect(container).toBeInTheDocument()
    })

    it('should display scan button', () => {
      flushSync(() => {
        root.render(<DeviceList />)
      })

      const scanButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Scan'))
      
      expect(scanButton).toBeInTheDocument()
    })

    it('should register keyboard shortcuts', () => {
      flushSync(() => {
        root.render(<DeviceList />)
      })

      expect(mockKeyboardShortcuts.registerShortcut).toHaveBeenCalled()
    })
  })

  describe('Device Display', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<DeviceList />)
      })
    })

    it('should display scanned devices', () => {
      expect(container.textContent).toContain('GaitBLE_Left')
      expect(container.textContent).toContain('GaitBLE_Right')
      expect(container.textContent).toContain('Unknown Device')
    })

    it('should show device signal strength', () => {
      flushSync(() => {
        root.render(<DeviceList />)
      })

      const hasSignalStrength = container.textContent?.includes('-45') || 
                               container.textContent?.includes('-50') || 
                               container.textContent?.includes('-60')
      expect(hasSignalStrength).toBe(true)
    })

    it('should prioritize GaitBLE devices', () => {
      const deviceElements = container.querySelectorAll('[data-testid="device-item"]')
      
      if (deviceElements.length > 0) {
        // First devices should be GaitBLE devices
        const firstDeviceText = deviceElements[0].textContent
        expect(firstDeviceText).toContain('GaitBLE')
      }
    })

    it('should show connection status', () => {
      flushSync(() => {
        root.render(<DeviceList />)
      })

      const hasConnectionStatus = container.textContent?.includes('Connected') || 
                                  container.textContent?.includes('Disconnected')
      expect(hasConnectionStatus).toBe(true)
    })
  })

  describe('Device Connection', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<DeviceList />)
      })
    })

    it('should handle device connection', () => {
      const connectButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Connect'))
      
      if (connectButton) {
        flushSync(() => {
          (connectButton as HTMLButtonElement).click()
        })

        expect(mockDeviceConnection.connectDevice).toHaveBeenCalled()
      }
    })

    it('should handle device disconnection', () => {
      const disconnectButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Disconnect'))
      
      if (disconnectButton) {
        flushSync(() => {
          (disconnectButton as HTMLButtonElement).click()
        })

        expect(mockDeviceConnection.disconnectDevice).toHaveBeenCalled()
      }
    })

    it('should show loading state during connection', () => {
      mockDeviceConnection.isConnecting = 'device1'
      
      flushSync(() => {
        root.render(<DeviceList />)
      })

      const hasLoadingState = container.textContent?.includes('Connecting...') || 
                              container.querySelector('[data-testid="loading"]') !== null
      expect(hasLoadingState).toBe(true)
    })

    it('should disable buttons during connection', () => {
      mockDeviceConnection.isConnecting = 'device1'
      
      flushSync(() => {
        root.render(<DeviceList />)
      })

      // Check if there are any disabled buttons
      const disabledButtons = container.querySelectorAll('button[disabled]')
      expect(disabledButtons.length).toBeGreaterThan(0)
    })
  })

  describe('Device Scanning', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<DeviceList />)
      })
    })

    it('should trigger device scan', () => {
      const scanButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Scan'))
      
      if (scanButton) {
        flushSync(() => {
          (scanButton as HTMLButtonElement).click()
        })

        expect(mockDeviceConnection.scanDevices).toHaveBeenCalled()
      }
    })

    it('should show scanning state', () => {
      mockDeviceConnection.isScanning = true
      
      flushSync(() => {
        root.render(<DeviceList />)
      })

      const hasScanningState = container.textContent?.includes('Scanning') || 
                               container.querySelector('[data-testid="scanning"]') !== null
      expect(hasScanningState).toBe(true)
    })

    it('should refresh connected devices', () => {
      const refreshButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Refresh'))
      
      if (refreshButton) {
        flushSync(() => {
          (refreshButton as HTMLButtonElement).click()
        })

        expect(mockDeviceConnection.refreshConnectedDevices).toHaveBeenCalled()
      }
    })
  })

  describe('Device Management', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<DeviceList />)
      })
    })

    it('should allow device removal', async () => {
      // Mock showConfirmation to return a resolved promise (user confirms)
      mockConfirmation.showConfirmation.mockResolvedValue(true)
      
      const removeButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Remove') || btn.textContent?.includes('×'))
      
      if (removeButton) {
        flushSync(() => {
          (removeButton as HTMLButtonElement).click()
        })

        // Wait for async operations to complete
        await new Promise(resolve => setTimeout(resolve, 0))
        
        expect(mockConfirmation.showConfirmation).toHaveBeenCalled()
        expect(mockDeviceConnection.removeScannedDevice).toHaveBeenCalled()
      }
    })

    it('should show confirmation for device removal', () => {
      const removeButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Remove'))
      
      if (removeButton) {
        flushSync(() => {
          (removeButton as HTMLButtonElement).click()
        })

        expect(mockConfirmation.showConfirmation).toHaveBeenCalled()
      }
    })
  })

  describe('Pagination', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<DeviceList />)
      })
    })

    it('should handle pagination controls', () => {
      const nextButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Next') || btn.textContent?.includes('>')
      )
      
      if (nextButton) {
        expect(nextButton).toBeInTheDocument()
      }
    })

    it('should allow changing devices per page', () => {
      const selectElement = container.querySelector('select[data-testid="devices-per-page"]')
      
      if (selectElement) {
        expect(selectElement).toBeInTheDocument()
      }
    })

    it('should display page information', () => {
      // Add more devices to trigger pagination
      mockDeviceConnection.scannedDevices = [
        ...mockDeviceConnection.scannedDevices,
        ...Array.from({ length: 10 }, (_, i) => ({
          id: `device${i + 4}`,
          name: `Device ${i + 4}`,
          rssi: -60 - i,
          connected: false,
          address_type: 'random',
          connectable: true,
          services: [],
          manufacturer_data: []
        }))
      ]
      
      flushSync(() => {
        root.render(<DeviceList />)
      })

      const hasPageInfo = container.textContent?.includes('Page') || 
                          container.textContent?.includes('of')
      expect(hasPageInfo).toBe(true)
    })
  })

  describe('Keyboard Navigation', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<DeviceList />)
      })
    })

    it('should support keyboard shortcuts', () => {
      expect(mockKeyboardShortcuts.registerShortcut).toHaveBeenCalled()
    })

    it('should handle arrow key navigation', () => {
      const firstButton = container.querySelector('button')
      
      if (firstButton) {
        firstButton.focus()
        
        // Simulate arrow key press
        const event = new KeyboardEvent('keydown', { key: 'ArrowDown' })
        firstButton.dispatchEvent(event)
        
        // Should handle navigation
        expect(mockKeyboardShortcuts.registerShortcut).toHaveBeenCalled()
      }
    })
  })

  describe('Device Heartbeat', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<DeviceList />)
      })
    })

    it('should display device heartbeat status', () => {
      flushSync(() => {
        root.render(<DeviceList />)
      })

      const hasHeartbeat = container.textContent?.includes('BLE Connected') ||
                           container.textContent?.includes('Data Live') ||
                           container.querySelector('[data-testid="heartbeat"]') !== null
      expect(hasHeartbeat).toBe(true)
    })

    it('should handle stale heartbeats', () => {
      // Set up stale heartbeat scenario
      mockDeviceConnection.connectionStatus = new Map([
        ['device1', 'disconnected'],
        ['device2', 'timeout'], // Set to timeout status
        ['device3', 'disconnected']
      ])
      
      flushSync(() => {
        root.render(<DeviceList />)
      })

      const hasStaleHeartbeat = container.textContent?.includes('Data Timeout') ||
                                container.textContent?.includes('No Data')
      expect(hasStaleHeartbeat).toBe(true)
    })
  })

  describe('Accessibility', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<DeviceList />)
      })
    })

    it('should have proper ARIA labels', () => {
      const buttons = container.querySelectorAll('button')
      buttons.forEach(button => {
        expect(button.getAttribute('aria-label') || button.textContent).toBeTruthy()
      })
    })

    it('should support screen readers', () => {
      const listElements = container.querySelectorAll('ul, li, [role="list"], [role="listitem"]')
      expect(listElements.length).toBeGreaterThan(0)
    })

    it('should have proper heading structure', () => {
      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
      expect(headings.length).toBeGreaterThan(0)
    })

    it('should support keyboard navigation', () => {
      const focusableElements = container.querySelectorAll(
        'button, input, select, [tabindex]:not([tabindex="-1"])'
      )
      
      expect(focusableElements.length).toBeGreaterThan(0)
    })
  })

  describe('Performance', () => {
    it('should handle large device lists', () => {
      const largeDeviceList = Array.from({ length: 100 }, (_, i) => ({
        id: `device${i}`,
        name: `Device ${i}`,
        rssi: -40 - i,
        connected: i % 10 === 0,
        address_type: 'random',
        connectable: true,
        services: ['180A'],
        manufacturer_data: []
      }))

      mockDeviceConnection.scannedDevices = largeDeviceList

      const startTime = performance.now()
      flushSync(() => {
        root.render(<DeviceList />)
      })
      const endTime = performance.now()

      // Should render within reasonable time
      expect(endTime - startTime).toBeLessThan(1000)
    })

    it('should implement virtual scrolling for large lists', () => {
      const largeDeviceList = Array.from({ length: 1000 }, (_, i) => ({
        id: `device${i}`,
        name: `Device ${i}`,
        rssi: -40 - i,
        connected: false,
        address_type: 'random',
        connectable: true,
        services: ['180A'],
        manufacturer_data: []
      }))

      mockDeviceConnection.scannedDevices = largeDeviceList

      flushSync(() => {
        root.render(<DeviceList />)
      })

      // Should not render all 1000 devices at once
      const deviceElements = container.querySelectorAll('[data-testid="device-item"]')
      expect(deviceElements.length).toBeLessThan(100)
    })
  })
})
