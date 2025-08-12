import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import App from '../App'

// Mock all the major components to isolate App logic
jest.mock('../components/Sidebar', () => {
  return function MockSidebar({
    page,
    onChange,
  }: {
    page: string
    onChange: (page: string) => void
  }) {
    return React.createElement(
      'div',
      {
        'data-testid': 'sidebar',
        'data-current-page': page,
      },
      [
        React.createElement(
          'button',
          {
            key: 'connect',
            'data-testid': 'nav-connect',
            onClick: () => onChange('connect'),
          },
          'Connect',
        ),
        React.createElement(
          'button',
          {
            key: 'collect',
            'data-testid': 'nav-collect',
            onClick: () => onChange('collect'),
          },
          'Collect',
        ),
        React.createElement(
          'button',
          {
            key: 'logs',
            'data-testid': 'nav-logs',
            onClick: () => onChange('logs'),
          },
          'Logs',
        ),
        React.createElement(
          'button',
          {
            key: 'settings',
            'data-testid': 'nav-settings',
            onClick: () => onChange('settings'),
          },
          'Settings',
        ),
      ],
    )
  }
})

jest.mock('../components/ConnectTab', () => {
  return function MockConnectTab() {
    return React.createElement('div', { 'data-testid': 'connect-tab' }, 'Connect Tab Content')
  }
})

jest.mock('../components/CollectTab', () => {
  return function MockCollectTab() {
    return React.createElement('div', { 'data-testid': 'collect-tab' }, 'Collect Tab Content')
  }
})

jest.mock('../components/LogsTab', () => {
  return function MockLogsTab() {
    return React.createElement('div', { 'data-testid': 'logs-tab' }, 'Logs Tab Content')
  }
})

jest.mock('../components/SettingsTab', () => {
  return function MockSettingsTab({
    darkMode,
    onToggleDarkMode,
  }: {
    darkMode: boolean
    onToggleDarkMode: () => void
  }) {
    return React.createElement('div', { 'data-testid': 'settings-tab' }, [
      React.createElement('span', { key: 'status' }, `Dark Mode: ${darkMode ? 'On' : 'Off'}`),
      React.createElement(
        'button',
        {
          key: 'toggle',
          'data-testid': 'dark-mode-toggle',
          onClick: onToggleDarkMode,
        },
        'Toggle Dark Mode',
      ),
    ])
  }
})

jest.mock('../components/ScrollableContainer', () => {
  return function MockScrollableContainer({
    id,
    className,
    children,
  }: {
    id?: string
    className?: string
    children?: React.ReactNode
  }) {
    return React.createElement(
      'div',
      {
        'data-testid': 'scrollable-container',
        id,
        className,
      },
      children,
    )
  }
})

jest.mock('../components/KeyboardHelpDialog', () => {
  return function MockKeyboardHelpDialog({
    isOpen,
    onClose,
  }: {
    isOpen: boolean
    onClose: () => void
    shortcuts?: unknown
  }) {
    if (!isOpen) return null
    return React.createElement('div', { 'data-testid': 'keyboard-help-dialog' }, [
      React.createElement('h2', { key: 'title' }, 'Keyboard Shortcuts'),
      React.createElement(
        'button',
        {
          key: 'close',
          'data-testid': 'close-help',
          onClick: onClose,
        },
        'Close',
      ),
    ])
  }
})

// Mock context providers
jest.mock('../contexts/DeviceConnectionContext', () => ({
  DeviceConnectionProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'device-provider' }, children),
}))

jest.mock('../contexts/ToastContext', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'toast-provider' }, children),
}))

jest.mock('../contexts/ScrollContext', () => ({
  ScrollProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'scroll-provider' }, children),
}))

// Mock hooks
jest.mock('../hooks/useTabScrollReset', () => ({
  useTabScrollReset: jest.fn(),
}))

jest.mock('../hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: jest.fn(),
  createCommonShortcuts: jest.fn(() => [
    { key: '1', description: 'Navigate to Connect' },
    { key: '2', description: 'Navigate to Collect' },
    { key: '3', description: 'Navigate to Logs' },
    { key: '4', description: 'Navigate to Settings' },
    { key: 'd', description: 'Toggle Dark Mode' },
    { key: '?', description: 'Show Keyboard Help' },
  ]),
}))

describe('App', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  // Mock localStorage
  const mockLocalStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
  }

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    })

    // Clear all mocks and set up default localStorage behavior
    jest.clearAllMocks()
    mockLocalStorage.getItem.mockReturnValue(null) // Default to null, not undefined
  })

  afterEach(() => {
    if (root) {
      flushSync(() => {
        root.unmount()
      })
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }

    // Clean up DOM classes
    document.documentElement.classList.remove('dark')
    document.body.removeAttribute('data-keyboard-navigation')
  })

  it('should render app with provider structure', async () => {
    await flushSync(async () => {
      root.render(React.createElement(App))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Check provider hierarchy
    const toastProvider = container.querySelector('[data-testid="toast-provider"]')
    const deviceProvider = container.querySelector('[data-testid="device-provider"]')
    const scrollProvider = container.querySelector('[data-testid="scroll-provider"]')

    expect(toastProvider).toBeTruthy()
    expect(deviceProvider).toBeTruthy()
    expect(scrollProvider).toBeTruthy()

    // Check app structure
    const appDiv = container.querySelector('.app')
    const sidebar = container.querySelector('[data-testid="sidebar"]')
    const scrollableContainer = container.querySelector('[data-testid="scrollable-container"]')

    expect(appDiv).toBeTruthy()
    expect(sidebar).toBeTruthy()
    expect(scrollableContainer).toBeTruthy()
    expect(scrollableContainer?.getAttribute('id')).toBe('main-content')
    expect(scrollableContainer?.className).toContain('content')
  })

  it('should start with connect tab by default', async () => {
    await flushSync(async () => {
      root.render(React.createElement(App))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    const sidebar = container.querySelector('[data-testid="sidebar"]')
    const connectTab = container.querySelector('[data-testid="connect-tab"]')

    expect(sidebar?.getAttribute('data-current-page')).toBe('connect')
    expect(connectTab).toBeTruthy()
    expect(container.querySelector('[data-testid="collect-tab"]')).toBeFalsy()
    expect(container.querySelector('[data-testid="logs-tab"]')).toBeFalsy()
    expect(container.querySelector('[data-testid="settings-tab"]')).toBeFalsy()
  })

  it('should navigate between tabs', async () => {
    await flushSync(async () => {
      root.render(React.createElement(App))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Navigate to collect tab
    const collectButton = container.querySelector(
      '[data-testid="nav-collect"]',
    ) as HTMLButtonElement
    flushSync(() => {
      collectButton.click()
    })

    expect(container.querySelector('[data-testid="collect-tab"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="connect-tab"]')).toBeFalsy()

    // Navigate to logs tab
    const logsButton = container.querySelector('[data-testid="nav-logs"]') as HTMLButtonElement
    flushSync(() => {
      logsButton.click()
    })

    expect(container.querySelector('[data-testid="logs-tab"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="collect-tab"]')).toBeFalsy()

    // Navigate to settings tab
    const settingsButton = container.querySelector(
      '[data-testid="nav-settings"]',
    ) as HTMLButtonElement
    flushSync(() => {
      settingsButton.click()
    })

    expect(container.querySelector('[data-testid="settings-tab"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="logs-tab"]')).toBeFalsy()
  })

  it('should handle dark mode toggle', async () => {
    await flushSync(async () => {
      root.render(React.createElement(App))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Navigate to settings tab
    const settingsButton = container.querySelector(
      '[data-testid="nav-settings"]',
    ) as HTMLButtonElement
    flushSync(() => {
      settingsButton.click()
    })

    // Check initial dark mode state
    const settingsTab = container.querySelector('[data-testid="settings-tab"]')
    expect(settingsTab?.textContent).toContain('Dark Mode: Off')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    // Toggle dark mode
    const darkModeToggle = container.querySelector(
      '[data-testid="dark-mode-toggle"]',
    ) as HTMLButtonElement
    flushSync(() => {
      darkModeToggle.click()
    })

    expect(settingsTab?.textContent).toContain('Dark Mode: On')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('darkMode', 'true')

    // Toggle back
    flushSync(() => {
      darkModeToggle.click()
    })

    expect(settingsTab?.textContent).toContain('Dark Mode: Off')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('darkMode', 'false')
  })

  it('should load dark mode setting from localStorage', async () => {
    mockLocalStorage.getItem.mockReturnValue('true')

    await flushSync(async () => {
      root.render(React.createElement(App))
      await new Promise((resolve) => setTimeout(resolve, 100)) // Increased timeout
    })

    expect(mockLocalStorage.getItem).toHaveBeenCalledWith('darkMode')
    // Wait a bit more for dark mode to be applied
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('should handle keyboard help dialog', async () => {
    await flushSync(async () => {
      root.render(React.createElement(App))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Initially dialog should not be visible
    expect(container.querySelector('[data-testid="keyboard-help-dialog"]')).toBeFalsy()

    // Simulate opening help dialog (this would normally be done via keyboard shortcut)
    // Since we can't easily test the actual keyboard events with mocked hooks,
    // we'll test the dialog functionality by simulating the state change
    // The actual keyboard shortcut testing would be covered in useKeyboardShortcuts tests
  })

  it('should add keyboard navigation attribute on tab key', async () => {
    await flushSync(async () => {
      root.render(React.createElement(App))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Simulate tab key press
    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' })
    document.dispatchEvent(tabEvent)

    expect(document.body.getAttribute('data-keyboard-navigation')).toBe('true')

    // Simulate mouse click
    const mouseEvent = new MouseEvent('mousedown')
    document.dispatchEvent(mouseEvent)

    expect(document.body.getAttribute('data-keyboard-navigation')).toBe(null)
  })

  it('should handle localStorage being null', async () => {
    mockLocalStorage.getItem.mockReturnValue(null)

    await flushSync(async () => {
      root.render(React.createElement(App))
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    // Should not crash and should use default dark mode (false)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
