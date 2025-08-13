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

// Mock the useKeyboardShortcuts hook
jest.mock('../../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: jest.fn(() => ({
    registerShortcut: jest.fn(),
    unregisterShortcut: jest.fn(),
  })),
}))

// Create dedicated mock functions for error testing
const mockConnectDevice = jest.fn()
const mockScanDevices = jest.fn()
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
      manufacturer_data: ['Apple'],
    },
    {
      id: 'device2',
      name: 'Test Device',
      rssi: -60,
      connected: false,
      address_type: 'random',
      connectable: true,
      services: [],
      manufacturer_data: [],
    },
  ],
  connectedDevices: [],
  connectionStatus: new Map([
    ['device1', 'disconnected'],
    ['device2', 'disconnected'],
  ]),
  isScanning: false,
  isConnecting: null as string | null,
  scanDevices: mockScanDevices,
  connectDevice: mockConnectDevice,
  disconnectDevice: mockDisconnectDevice,
  refreshConnectedDevices: mockRefreshConnectedDevices,
  removeScannedDevice: mockRemoveScannedDevice,
}

const mockToast = {
  showSuccess: jest.fn(),
  showError: jest.fn(),
  showInfo: jest.fn(),
}

const mockConfirmation = {
  confirmationState: {
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  },
  showConfirmation: jest.fn(),
}

describe('DeviceList Error Handling', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    // Clear all mocks
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

  it('should handle connection errors', async () => {
    // Setup the mock to reject
    mockConnectDevice.mockRejectedValue(new Error('Connection failed'))

    flushSync(() => {
      root.render(<DeviceList />)
    })

    // Find connect button (should be available for disconnected devices)
    const connectButton = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent?.includes('Connect') && !btn.textContent?.includes('Scan'),
    )

    expect(connectButton).toBeTruthy()

    if (connectButton) {
      // Click the button
      flushSync(() => {
        ;(connectButton as HTMLButtonElement).click()
      })

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Should handle error gracefully
      expect(mockConnectDevice).toHaveBeenCalled()
      expect(mockToast.showError).toHaveBeenCalledWith('Connection Failed', 'Connection failed')
    }
  })

  it('should handle scan errors', async () => {
    // Suppress console.error for this test since we're intentionally testing error handling
    const originalConsoleError = console.error
    console.error = jest.fn()

    try {
      // Setup the mock to reject
      mockScanDevices.mockRejectedValue(new Error('Scan failed'))

      flushSync(() => {
        root.render(<DeviceList />)
      })

      // Find scan button
      const scanButton = Array.from(container.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Scan'),
      )

      expect(scanButton).toBeTruthy()

      if (scanButton) {
        // Click the button
        flushSync(() => {
          ;(scanButton as HTMLButtonElement).click()
        })

        // Wait for async operations to complete
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Verify scanDevices was called
        expect(mockScanDevices).toHaveBeenCalled()

        // Verify console.error was called with the expected message
        expect(console.error).toHaveBeenCalledWith('Scan failed:', expect.any(Error))

        // The scan error is only logged to console, not shown as toast
        // This is expected behavior based on the implementation
      }
    } finally {
      // Restore console.error
      console.error = originalConsoleError
    }
  })

  it('should handle empty device list', () => {
    // Test empty device list scenario
    const emptyDeviceConnection = {
      ...mockDeviceConnection,
      scannedDevices: [],
      connectedDevices: [],
    }

    ;(useDeviceConnection as jest.Mock).mockReturnValue(emptyDeviceConnection)

    flushSync(() => {
      root.render(<DeviceList />)
    })

    // Check for the basic structure when no devices are present
    const hasDeviceSection =
      container.textContent?.includes('Available Devices') ||
      container.textContent?.includes('Bluetooth Devices')
    expect(hasDeviceSection).toBe(true)
  })

  it('should handle disconnect errors', async () => {
    // Setup a connected device scenario
    const connectedDeviceConnection = {
      ...mockDeviceConnection,
      connectedDevices: ['device1'],
      connectionStatus: new Map([
        ['device1', 'connected'],
        ['device2', 'disconnected'],
      ]),
    }

    ;(useDeviceConnection as jest.Mock).mockReturnValue(connectedDeviceConnection)

    // Setup the mock to reject
    mockDisconnectDevice.mockRejectedValue(new Error('Disconnect failed'))

    flushSync(() => {
      root.render(<DeviceList />)
    })

    // Find disconnect button
    const disconnectButton = Array.from(container.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Disconnect'),
    )

    expect(disconnectButton).toBeTruthy()

    if (disconnectButton) {
      // Click the button
      flushSync(() => {
        ;(disconnectButton as HTMLButtonElement).click()
      })

      // Wait for async operations to complete
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Should handle error gracefully
      expect(mockDisconnectDevice).toHaveBeenCalled()
      expect(mockToast.showError).toHaveBeenCalledWith(
        'Disconnection Failed',
        'Disconnection failed: Error: Disconnect failed',
      )
    }
  })
})
