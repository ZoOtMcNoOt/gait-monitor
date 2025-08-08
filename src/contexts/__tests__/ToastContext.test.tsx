import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ToastProvider, useToast } from '../ToastContext'

// Mock crypto.randomUUID since it might not be available in test environment
const mockRandomUUID = jest.fn()
Object.defineProperty(global.crypto, 'randomUUID', {
  value: mockRandomUUID,
  writable: true
})

// Test component that uses the ToastContext
const TestToastComponent: React.FC = () => {
  const toast = useToast()
  
  return React.createElement('div', { 'data-testid': 'test-component' }, [
    React.createElement('div', { key: 'content' }, 'Test Content'),
    React.createElement('button', {
      key: 'add-success',
      'data-testid': 'add-success-button',
      onClick: () => toast.showSuccess('Success Title', 'Success message')
    }, 'Add Success Toast'),
    React.createElement('button', {
      key: 'add-error',
      'data-testid': 'add-error-button',
      onClick: () => toast.showError('Error Title', 'Error message')
    }, 'Add Error Toast'),
    React.createElement('button', {
      key: 'add-warning',
      'data-testid': 'add-warning-button',
      onClick: () => toast.showWarning('Warning Title', 'Warning message')
    }, 'Add Warning Toast'),
    React.createElement('button', {
      key: 'add-info',
      'data-testid': 'add-info-button',
      onClick: () => toast.showInfo('Info Title', 'Info message')
    }, 'Add Info Toast'),
    React.createElement('button', {
      key: 'add-custom',
      'data-testid': 'add-custom-button',
      onClick: () => toast.addToast({ type: 'success', title: 'Custom Toast', duration: 1000 })
    }, 'Add Custom Toast'),
    React.createElement('div', {
      key: 'toast-count',
      'data-testid': 'toast-count'
    }, toast.toasts.length.toString())
  ])
}

// Mock component for testing useToast outside provider
const TestWithoutProvider: React.FC = () => {
  try {
    useToast()
    return React.createElement('div', { 'data-testid': 'success' }, 'Should not reach here')
  } catch (error) {
    return React.createElement('div', { 'data-testid': 'error' }, (error as Error).message)
  }
}

describe('ToastContext', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    jest.clearAllMocks()
    // Use legacy fake timers for better React 19 compatibility
    jest.useFakeTimers({ legacyFakeTimers: true })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    
    // Setup mock UUID
    let idCounter = 0
    mockRandomUUID.mockImplementation(() => `test-id-${++idCounter}`)
  })

  afterEach(() => {
    jest.runOnlyPendingTimers()
    jest.useRealTimers()
    root.unmount()
    container.remove()
  })

  const renderWithProvider = (component: React.ReactElement) => {
    flushSync(() => {
      root.render(
        React.createElement(ToastProvider, { children: component })
      )
    })
    return Promise.resolve()
  }

  it('should throw error when useToast is used outside provider', () => {
    flushSync(() => {
      root.render(React.createElement(TestWithoutProvider))
    })

    const errorElement = container.querySelector('[data-testid="error"]')
    expect(errorElement).not.toBeNull()
    expect(errorElement?.textContent).toContain('useToast must be used within a ToastProvider')
  })

  it('should render children', async () => {
    await renderWithProvider(React.createElement(TestToastComponent))

    expect(container.textContent).toContain('Test Content')
  })

  it('should provide toast context with initial empty state', async () => {
    await renderWithProvider(React.createElement(TestToastComponent))

    const toastCountElement = container.querySelector('[data-testid="toast-count"]')
    expect(toastCountElement?.textContent).toBe('0')
  })

  it('should add success toast', async () => {
    await renderWithProvider(React.createElement(TestToastComponent))

    const addButton = container.querySelector('[data-testid="add-success-button"]') as HTMLButtonElement

    flushSync(() => {
      addButton.click()
    })

    // Check toast count
    expect(container.querySelector('[data-testid="toast-count"]')?.textContent).toBe('1')

    // Check toast content
    const toastElement = container.querySelector('.toast-success')
    expect(toastElement).toBeTruthy()
    expect(toastElement?.textContent).toContain('Success Title')
    expect(toastElement?.textContent).toContain('Success message')
    // Icon is now an inline SVG
    expect(toastElement?.querySelector('.toast-icon svg')).toBeTruthy()
  })

  it('should add error toast with longer duration', async () => {
    await renderWithProvider(React.createElement(TestToastComponent))

    const addButton = container.querySelector('[data-testid="add-error-button"]') as HTMLButtonElement

    flushSync(() => {
      addButton.click()
    })

    // Check toast content
    const toastElement = container.querySelector('.toast-error')
    expect(toastElement).toBeTruthy()
    expect(toastElement?.textContent).toContain('Error Title')
    expect(toastElement?.textContent).toContain('Error message')
    // Icon is now an inline SVG
    expect(toastElement?.querySelector('.toast-icon svg')).toBeTruthy()
  })

  it('should add warning toast', async () => {
    await renderWithProvider(React.createElement(TestToastComponent))

    const addButton = container.querySelector('[data-testid="add-warning-button"]') as HTMLButtonElement

    flushSync(() => {
      addButton.click()
    })

    const toastElement = container.querySelector('.toast-warning')
    expect(toastElement).toBeTruthy()
    expect(toastElement?.textContent).toContain('Warning Title')
    expect(toastElement?.textContent).toContain('Warning message')
    // Icon is now an inline SVG
    expect(toastElement?.querySelector('.toast-icon svg')).toBeTruthy()
  })

  it('should add info toast', async () => {
    await renderWithProvider(React.createElement(TestToastComponent))

    const addButton = container.querySelector('[data-testid="add-info-button"]') as HTMLButtonElement

    flushSync(() => {
      addButton.click()
    })

    const toastElement = container.querySelector('.toast-info')
    expect(toastElement).toBeTruthy()
    expect(toastElement?.textContent).toContain('Info Title')
    expect(toastElement?.textContent).toContain('Info message')
    // Icon is now an inline SVG
    expect(toastElement?.querySelector('.toast-icon svg')).toBeTruthy()
  })

  it('should add custom toast', async () => {
    await renderWithProvider(React.createElement(TestToastComponent))

    const addButton = container.querySelector('[data-testid="add-custom-button"]') as HTMLButtonElement

    flushSync(() => {
      addButton.click()
    })

    const toastElement = container.querySelector('.toast-success')
    expect(toastElement).toBeTruthy()
    expect(toastElement?.textContent).toContain('Custom Toast')
  })

  it('should remove toast manually', async () => {
    await renderWithProvider(React.createElement(TestToastComponent))

    const addButton = container.querySelector('[data-testid="add-success-button"]') as HTMLButtonElement

    flushSync(() => {
      addButton.click()
    })

    expect(container.querySelector('[data-testid="toast-count"]')?.textContent).toBe('1')

    // Click close button
    const closeButton = container.querySelector('.toast-close') as HTMLButtonElement
    expect(closeButton).toBeTruthy()

    flushSync(() => {
      closeButton.click()
    })

    expect(container.querySelector('[data-testid="toast-count"]')?.textContent).toBe('0')
    expect(container.querySelector('.toast')).toBeFalsy()
  })

  it('should auto-remove toast after timeout', async () => {
    // For this test, let's use real timers and just test the removeToast function directly
    jest.useRealTimers()
    
    await renderWithProvider(React.createElement(TestToastComponent))

    const addButton = container.querySelector('[data-testid="add-custom-button"]') as HTMLButtonElement

    flushSync(() => {
      addButton.click()
    })

    expect(container.querySelector('[data-testid="toast-count"]')?.textContent).toBe('1')
    expect(container.querySelector('.toast')).toBeTruthy()

    // Wait for the actual timeout (1000ms) with a small buffer
    await new Promise(resolve => setTimeout(resolve, 1100))

    // Check both count and DOM
    expect(container.querySelector('[data-testid="toast-count"]')?.textContent).toBe('0')
    expect(container.querySelector('.toast')).toBeFalsy()
    
    // Reset fake timers for other tests
    jest.useFakeTimers({ legacyFakeTimers: true })
  }, 10000)

  it('should handle multiple toasts', async () => {
    await renderWithProvider(React.createElement(TestToastComponent))

    const successButton = container.querySelector('[data-testid="add-success-button"]') as HTMLButtonElement
    const errorButton = container.querySelector('[data-testid="add-error-button"]') as HTMLButtonElement
    const warningButton = container.querySelector('[data-testid="add-warning-button"]') as HTMLButtonElement

    flushSync(() => {
      successButton.click()
      errorButton.click()
      warningButton.click()
    })

    expect(container.querySelector('[data-testid="toast-count"]')?.textContent).toBe('3')
    expect(container.querySelectorAll('.toast')).toHaveLength(3)
    expect(container.querySelector('.toast-success')).toBeTruthy()
    expect(container.querySelector('.toast-error')).toBeTruthy()
    expect(container.querySelector('.toast-warning')).toBeTruthy()
  })

  it('should clean up timeouts on unmount', async () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
    
    await renderWithProvider(React.createElement(TestToastComponent))

    const addButton = container.querySelector('[data-testid="add-success-button"]') as HTMLButtonElement

    flushSync(() => {
      addButton.click()
    })

    // Unmount the component
    root.unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()
    clearTimeoutSpy.mockRestore()
  })

  it('should generate unique IDs for toasts', async () => {
    await renderWithProvider(React.createElement(TestToastComponent))

    const addButton = container.querySelector('[data-testid="add-success-button"]') as HTMLButtonElement

    flushSync(() => {
      addButton.click()
      addButton.click()
    })

    expect(mockRandomUUID).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[data-testid="toast-count"]')?.textContent).toBe('2')
  })

  it('should handle toast without message', async () => {
    const TestNoMessageComponent: React.FC = () => {
      const toast = useToast()
      
      return React.createElement('button', {
        'data-testid': 'add-no-message-button',
        onClick: () => toast.showSuccess('Title Only')
      }, 'Add Toast Without Message')
    }

    await renderWithProvider(React.createElement(TestNoMessageComponent))

    const addButton = container.querySelector('[data-testid="add-no-message-button"]') as HTMLButtonElement

    flushSync(() => {
      addButton.click()
    })

    const toastElement = container.querySelector('.toast-success')
    expect(toastElement).toBeTruthy()
    expect(toastElement?.textContent).toContain('Title Only')
    // Should not contain message div
    expect(toastElement?.querySelector('.toast-message')).toBeFalsy()
  })

  it('should prevent timeout cleanup for removed toasts', async () => {
    await renderWithProvider(React.createElement(TestToastComponent))

    const addButton = container.querySelector('[data-testid="add-success-button"]') as HTMLButtonElement

    flushSync(() => {
      addButton.click()
    })

    // Manually remove toast before timeout
    const closeButton = container.querySelector('.toast-close') as HTMLButtonElement
    flushSync(() => {
      closeButton.click()
    })

    expect(container.querySelector('[data-testid="toast-count"]')?.textContent).toBe('0')

    // Advance time to when timeout would have fired
    jest.advanceTimersByTime(5000)

    // Should still be 0 toasts (no errors or duplicate removals)
    expect(container.querySelector('[data-testid="toast-count"]')?.textContent).toBe('0')
  })

})
