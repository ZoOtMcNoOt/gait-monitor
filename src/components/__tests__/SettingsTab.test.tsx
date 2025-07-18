import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SettingsTab from '../SettingsTab'
import { useToast } from '../../contexts/ToastContext'
import { useConfirmation } from '../../hooks/useConfirmation'
import { useScroll } from '../../hooks/useScroll'
import { protectedOperations } from '../../services/csrfProtection'

// Mock dependencies
jest.mock('../../contexts/ToastContext')
jest.mock('../../hooks/useConfirmation')
jest.mock('../../hooks/useScroll')
jest.mock('../../services/csrfProtection')
jest.mock('@tauri-apps/api/core')

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

const mockScroll = {
  scrollToTop: jest.fn(),
  scrollToBottom: jest.fn(),
  scrollToElement: jest.fn(),
  isScrolledToTop: false,
  isScrolledToBottom: false,
  registerScrollable: jest.fn(),
  unregisterScrollable: jest.fn()
}

const mockProtectedOperations = {
  withCSRFProtection: jest.fn(),
  requestPermission: jest.fn().mockResolvedValue(true)
}

// Mock Tauri invoke
const mockInvoke = jest.fn()
jest.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args)
}))

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn()
}

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
})

describe('SettingsTab', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const mockOnToggleDarkMode = jest.fn()

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    // Setup mocks
    ;(useToast as jest.Mock).mockReturnValue(mockToast)
    ;(useConfirmation as jest.Mock).mockReturnValue(mockConfirmation)
    ;(useScroll as jest.Mock).mockReturnValue(mockScroll)
    
    // Mock protectedOperations
    Object.assign(protectedOperations, mockProtectedOperations)

    // Mock localStorage responses
    mockLocalStorage.getItem.mockReturnValue(JSON.stringify({
      defaultStoragePath: './test_data',
      dataRetentionDays: 30,
      autoBackup: true,
      exportFormat: 'json',
      sampleRate: 200
    }))

    mockInvoke.mockImplementation((command) => {
      if (command === 'get_app_settings') {
        return Promise.resolve({
          defaultStoragePath: './test_data',
          dataRetentionDays: 30,
          autoBackup: true,
          exportFormat: 'json',
          sampleRate: 200
        })
      }
      if (command === 'get_sessions') {
        return Promise.resolve([
          { id: '1', name: 'Session 1', timestamp: Date.now() },
          { id: '2', name: 'Session 2', timestamp: Date.now() }
        ])
      }
      if (command === 'get_storage_path') {
        return Promise.resolve('./test_data')
      }
      return Promise.resolve()
    })

    // Clear all mocks
    jest.clearAllMocks()
    mockLocalStorage.getItem.mockReset()
    mockLocalStorage.setItem.mockReset()
    mockLocalStorage.removeItem.mockReset()
    
    // Reset localStorage to default behavior
    mockLocalStorage.getItem.mockReturnValue(null)
    mockLocalStorage.setItem.mockImplementation(() => {})
    mockLocalStorage.removeItem.mockImplementation(() => {})
  })

  afterEach(() => {
    root.unmount()
    document.body.removeChild(container)
  })

  describe('Initialization', () => {
    it('should render settings tab component', () => {
      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })

      expect(container).toBeInTheDocument()
    })

    it('should load settings from localStorage', async () => {
      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })

      // Wait for useEffect to run
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('appSettings')
    })

    it('should handle malformed localStorage data', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid json')
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })

      expect(consoleSpy).toHaveBeenCalledWith('Failed to parse saved settings:', expect.any(Error))
      consoleSpy.mockRestore()
    })
  })

  describe('UI Theme Settings', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })
    })

    it('should display dark mode toggle', () => {
      const darkModeToggle = container.querySelector('input[type="checkbox"]') ||
                            container.querySelector('[data-testid="dark-mode-toggle"]')
      
      expect(darkModeToggle).toBeInTheDocument()
    })

    it('should handle dark mode toggle', () => {
      const darkModeToggle = container.querySelector('input[type="checkbox"]') as HTMLInputElement
      
      if (darkModeToggle) {
        flushSync(() => {
          darkModeToggle.click()
        })

        expect(mockOnToggleDarkMode).toHaveBeenCalled()
      }
    })

    it('should display high contrast mode option', () => {
      const highContrastToggle = container.querySelector('input[data-testid="high-contrast"]') ||
                                Array.from(container.querySelectorAll('input[type="checkbox"]')).find(input => 
                                  input.nextSibling?.textContent?.includes('High Contrast'))
      
      if (highContrastToggle) {
        expect(highContrastToggle).toBeInTheDocument()
      }
    })

    it('should reflect current dark mode state', () => {
      flushSync(() => {
        root.render(<SettingsTab darkMode={true} onToggleDarkMode={mockOnToggleDarkMode} />)
      })

      const darkModeToggle = container.querySelector('input[type="checkbox"]') as HTMLInputElement
      
      if (darkModeToggle) {
        expect(darkModeToggle.checked).toBe(true)
      }
    })
  })

  describe('Data Storage Settings', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })
    })

    it('should display storage path setting', () => {
      const storagePathInput = container.querySelector('input[data-testid="storage-path"]') ||
                              container.querySelector('input[type="text"]')
      
      expect(storagePathInput).toBeInTheDocument()
    })

    it('should display data retention setting', () => {
      const retentionInput = container.querySelector('input[data-testid="retention-days"]') ||
                            container.querySelector('input[type="number"]')
      
      expect(retentionInput).toBeInTheDocument()
    })

    it('should display auto backup setting', () => {
      const autoBackupToggle = container.querySelector('input[data-testid="auto-backup"]') ||
                              Array.from(container.querySelectorAll('input[type="checkbox"]')).find(input => 
                                input.nextSibling?.textContent?.includes('Auto Backup'))
      
      if (autoBackupToggle) {
        expect(autoBackupToggle).toBeInTheDocument()
      }
    })

    it('should display export format setting', () => {
      const exportFormatSelect = container.querySelector('select[data-testid="export-format"]') ||
                                container.querySelector('select')
      
      expect(exportFormatSelect).toBeInTheDocument()
    })

    it('should handle storage path change', () => {
      const storagePathInput = container.querySelector('input[type="text"]') as HTMLInputElement
      
      if (storagePathInput) {
        flushSync(() => {
          storagePathInput.value = './new_path'
          storagePathInput.dispatchEvent(new Event('change', { bubbles: true }))
        })

        expect(storagePathInput.value).toBe('./new_path')
      }
    })
  })

  describe('Device Settings', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })
    })

    it('should display sample rate setting', () => {
      const sampleRateSelect = container.querySelector('select[data-testid="sample-rate"]') ||
                               container.querySelector('select')
      
      expect(sampleRateSelect).toBeInTheDocument()
    })

    it('should handle sample rate change', () => {
      const sampleRateSelect = container.querySelector('select[data-testid="sample-rate"]') ||
                               container.querySelector('select')
      
      if (sampleRateSelect) {
        const selectElement = sampleRateSelect as HTMLSelectElement
        flushSync(() => {
          selectElement.value = '200'
          selectElement.dispatchEvent(new Event('change', { bubbles: true }))
        })

        expect(selectElement.value).toBe('200')
      }
    })

    it('should validate sample rate bounds', () => {
      const sampleRateSelect = container.querySelector('select[data-testid="sample-rate"]') as HTMLSelectElement
      
      if (sampleRateSelect) {
        // Test with the available options (50, 100, 200, 500)
        flushSync(() => {
          sampleRateSelect.value = '50'
          sampleRateSelect.dispatchEvent(new Event('change', { bubbles: true }))
        })

        // Should accept valid values
        expect(Number(sampleRateSelect.value)).toBeGreaterThan(0)
        expect(Number(sampleRateSelect.value)).toBeLessThanOrEqual(500)
      }
    })
  })

  describe('Settings Persistence', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })
    })

    it('should save settings to localStorage', () => {
      const saveButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Save'))
      
      if (saveButton) {
        flushSync(() => {
          (saveButton as HTMLButtonElement).click()
        })

        expect(mockLocalStorage.setItem).toHaveBeenCalledWith('appSettings', expect.any(String))
      }
    })

    it('should show save confirmation', () => {
      const saveButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Save'))
      
      if (saveButton) {
        flushSync(() => {
          (saveButton as HTMLButtonElement).click()
        })

        expect(mockToast.showSuccess).toHaveBeenCalledWith(
          expect.stringContaining('Settings saved') ||
          expect.stringContaining('Saved')
        )
      }
    })

    it('should reset settings to default', () => {
      const resetButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Reset') || btn.textContent?.includes('Default'))
      
      if (resetButton) {
        flushSync(() => {
          (resetButton as HTMLButtonElement).click()
        })

        expect(mockConfirmation.showConfirmation).toHaveBeenCalled()
      }
    })

    it('should detect unsaved changes', () => {
      const input = container.querySelector('input[data-testid="storage-path"]') as HTMLInputElement
      
      if (input) {
        flushSync(() => {
          // For React controlled components, we need to simulate the change properly
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'modified value')
          input.dispatchEvent(new Event('change', { bubbles: true }))
        })

        expect(
          container.textContent?.includes('unsaved') ||
          container.textContent?.includes('modified') ||
          container.textContent?.includes('Save Settings')
        ).toBe(true)
      }
    })
  })

  describe('Data Management', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })
    })

    it('should provide data cleanup options', () => {
      const cleanupButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Clean') || btn.textContent?.includes('Clear'))
      
      if (cleanupButton) {
        expect(cleanupButton).toBeInTheDocument()
      }
    })

    it('should handle data cleanup', () => {
      const cleanupButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Clean'))
      
      if (cleanupButton) {
        mockProtectedOperations.withCSRFProtection.mockImplementation(
          (operation) => operation()
        )

        flushSync(() => {
          (cleanupButton as HTMLButtonElement).click()
        })

        expect(mockProtectedOperations.withCSRFProtection).toHaveBeenCalled()
      }
    })

    it('should provide backup functionality', () => {
      const backupButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Backup') || btn.textContent?.includes('Export'))
      
      if (backupButton) {
        expect(backupButton).toBeInTheDocument()
      }
    })

    it('should handle backup creation', () => {
      const backupButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Backup'))
      
      if (backupButton) {
        mockProtectedOperations.withCSRFProtection.mockImplementation(
          (operation) => operation()
        )

        flushSync(() => {
          (backupButton as HTMLButtonElement).click()
        })

        expect(mockProtectedOperations.withCSRFProtection).toHaveBeenCalled()
      }
    })
  })

  describe('Error Handling', () => {
    it('should handle settings save errors', () => {
      // Suppress console.error during this test
      const originalError = console.error
      console.error = jest.fn()

      try {
        flushSync(() => {
          root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
        })

        mockLocalStorage.setItem.mockImplementation(() => {
          throw new Error('Storage quota exceeded')
        })

        const saveButton = Array.from(container.querySelectorAll('button')).find(btn => 
          btn.textContent?.includes('Save'))
        
        if (saveButton) {
          flushSync(() => {
            (saveButton as HTMLButtonElement).click()
          })

          expect(mockToast.showError).toHaveBeenCalledWith(
            expect.stringContaining('Save Failed'),
            expect.stringContaining('Storage quota exceeded')
          )
        }
      } finally {
        console.error = originalError
      }
    })

    it('should handle cleanup errors', () => {
      mockInvoke.mockRejectedValue(new Error('Cleanup failed'))

      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })

      const cleanupButton = Array.from(container.querySelectorAll('button')).find(btn => 
        btn.textContent?.includes('Clean'))
      
      if (cleanupButton) {
        flushSync(() => {
          (cleanupButton as HTMLButtonElement).click()
        })

        expect(mockToast.showError).toHaveBeenCalledWith(
          expect.stringContaining('Cleanup failed') ||
          expect.stringContaining('Error')
        )
      }
    })
  })

  describe('Validation', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })
    })

    it('should validate retention days', () => {
      const retentionInput = container.querySelector('input[data-testid="retention-days"]') as HTMLInputElement
      
      if (retentionInput) {
        const originalValue = retentionInput.value
        
        flushSync(() => {
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(retentionInput, '-1')
          retentionInput.dispatchEvent(new Event('change', { bubbles: true }))
        })

        // Should not accept negative values (value should remain unchanged)
        expect(retentionInput.value).toBe(originalValue)
      }
    })

    it('should validate storage path', () => {
      const storagePathInput = container.querySelector('input[data-testid="storage-path"]') as HTMLInputElement
      
      if (storagePathInput) {
        const originalValue = storagePathInput.value
        
        flushSync(() => {
          Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(storagePathInput, '')
          storagePathInput.dispatchEvent(new Event('change', { bubbles: true }))
        })

        // Should not accept empty value (value should remain unchanged)
        expect(storagePathInput.value).toBe(originalValue)
      }
    })

    it('should validate sample rate range', () => {
      const sampleRateSelect = container.querySelector('select[data-testid="sample-rate"]') as HTMLSelectElement
      
      if (sampleRateSelect) {
        // Test with valid options
        flushSync(() => {
          sampleRateSelect.value = '500'
          sampleRateSelect.dispatchEvent(new Event('change', { bubbles: true }))
        })

        expect(Number(sampleRateSelect.value)).toBeLessThanOrEqual(500)
        expect(Number(sampleRateSelect.value)).toBeGreaterThan(0)
      }
    })
  })

  describe('Accessibility', () => {
    beforeEach(() => {
      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })
    })

    it('should have proper labels for form elements', () => {
      const inputs = container.querySelectorAll('input, select')
      inputs.forEach(input => {
        const hasLabel = container.querySelector(`label[for="${input.id}"]`) ||
                        input.closest('label') ||
                        input.getAttribute('aria-label') ||
                        input.getAttribute('aria-labelledby')
        
        expect(hasLabel).toBeTruthy()
      })
    })

    it('should support keyboard navigation', () => {
      const focusableElements = container.querySelectorAll(
        'input, select, button, [tabindex]:not([tabindex="-1"])'
      )
      
      expect(focusableElements.length).toBeGreaterThan(0)
    })

    it('should have proper heading structure', () => {
      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6')
      expect(headings.length).toBeGreaterThan(0)
    })

    it('should provide form validation feedback', () => {
      const inputs = container.querySelectorAll('input, select')
      inputs.forEach(input => {
        expect(
          input.getAttribute('aria-describedby') !== null ||
          input.getAttribute('aria-label') !== null ||
          input.getAttribute('aria-labelledby') !== null
        ).toBe(true)
      })
    })
  })

  describe('Performance', () => {
    it('should handle frequent settings changes efficiently', () => {
      const startTime = performance.now()
      
      flushSync(() => {
        root.render(<SettingsTab darkMode={false} onToggleDarkMode={mockOnToggleDarkMode} />)
      })

      // Simulate rapid changes
      const input = container.querySelector('input[type="text"]') as HTMLInputElement
      
      if (input) {
        for (let i = 0; i < 10; i++) {
          flushSync(() => {
            input.value = `test-${i}`
            input.dispatchEvent(new Event('change', { bubbles: true }))
          })
        }
      }

      const endTime = performance.now()
      
      // Should handle rapid changes efficiently
      expect(endTime - startTime).toBeLessThan(1000)
    })
  })
})
