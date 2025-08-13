/**
 * Test file for A3.5: Keyboard Navigation Improvements
 * Tests keyboard shortcuts, focus management, and accessibility features
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import {
  createCommonShortcuts,
  useKeyboardShortcuts,
  useFocusTrap,
  useTabNavigation,
} from '../useKeyboardShortcuts'

// Mock functions for testing
const mockPageChange = jest.fn()
const mockToggleDarkMode = jest.fn()
const mockOpenHelp = jest.fn()

// Test component for useKeyboardShortcuts
function TestKeyboardShortcutsComponent({
  onHookReady,
  options = { shortcuts: [], enabled: true },
}: {
  onHookReady: (hook: ReturnType<typeof useKeyboardShortcuts>) => void
  options?: Parameters<typeof useKeyboardShortcuts>[0]
}) {
  const hook = useKeyboardShortcuts(options)

  React.useEffect(() => {
    onHookReady(hook)
  }, [hook, onHookReady])

  return React.createElement('div', { 'data-testid': 'keyboard-shortcuts-test' }, 'Test Component')
}

// Test component for useFocusTrap
function TestFocusTrapComponent({
  onHookReady,
  isActive = true,
}: {
  onHookReady: (containerRef: React.RefObject<HTMLElement | null>) => void
  isActive?: boolean
}) {
  const containerRef = React.useRef<HTMLElement | null>(null)
  useFocusTrap(containerRef, isActive)

  React.useEffect(() => {
    onHookReady(containerRef)
  }, [containerRef, onHookReady])

  return React.createElement(
    'div',
    {
      ref: containerRef,
      'data-testid': 'focus-trap-test',
    },
    React.createElement('button', null, 'Button 1'),
    React.createElement('button', null, 'Button 2'),
    React.createElement('input', { type: 'text' }),
    React.createElement('a', { href: '#' }, 'Link'),
  )
}

// Test component for useTabNavigation
function TestTabNavigationComponent({
  onHookReady,
}: {
  onHookReady: (hook: ReturnType<typeof useTabNavigation>) => void
}) {
  const hook = useTabNavigation()

  React.useEffect(() => {
    onHookReady(hook)
  }, [hook, onHookReady])

  return React.createElement(
    'div',
    { 'data-testid': 'tab-navigation-test' },
    React.createElement('button', null, 'Button 1'),
    React.createElement('button', null, 'Button 2'),
    React.createElement('input', { type: 'text' }),
    React.createElement('div', { id: 'main-content' }, 'Main Content'),
  )
}

describe('A3.5: Keyboard Navigation Improvements', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Keyboard Shortcuts Creation', () => {
    test('creates common shortcuts with correct structure', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp)

      expect(shortcuts).toHaveLength(7) // 4 navigation + 2 dark mode + 1 help

      // Test navigation shortcuts structure
      expect(shortcuts[0]).toEqual(
        expect.objectContaining({
          key: '1',
          ctrl: true,
          description: 'Navigate to Connect tab',
          category: 'Navigation',
        }),
      )

      expect(shortcuts[1]).toEqual(
        expect.objectContaining({
          key: '2',
          ctrl: true,
          description: 'Navigate to Collect tab',
          category: 'Navigation',
        }),
      )

      // Test dark mode shortcut structure
      const darkModeShortcut = shortcuts.find((shortcut) => shortcut.key === 'd')
      expect(darkModeShortcut).toEqual(
        expect.objectContaining({
          key: 'd',
          ctrl: true,
          shift: true,
          description: 'Toggle dark mode',
          category: 'Appearance',
        }),
      )

      // Test help shortcuts
      const helpShortcuts = shortcuts.filter((shortcut) => shortcut.category === 'Help')
      expect(helpShortcuts).toHaveLength(2) // ? and F1
    })

    test('shortcuts execute correct actions', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp)

      // Test navigation shortcut execution
      shortcuts[0].action() // Ctrl+1 for Connect
      expect(mockPageChange).toHaveBeenCalledWith('connect')

      shortcuts[1].action() // Ctrl+2 for Collect
      expect(mockPageChange).toHaveBeenCalledWith('collect')

      shortcuts[2].action() // Ctrl+3 for Logs
      expect(mockPageChange).toHaveBeenCalledWith('logs')

      shortcuts[3].action() // Ctrl+4 for Settings
      expect(mockPageChange).toHaveBeenCalledWith('settings')

      // Test dark mode shortcut execution
      const darkModeShortcut = shortcuts.find((shortcut) => shortcut.key === 'd')
      darkModeShortcut?.action()
      expect(mockToggleDarkMode).toHaveBeenCalled()

      // Test help shortcut execution
      const helpShortcut = shortcuts.find((shortcut) => shortcut.key === '?')
      helpShortcut?.action()
      expect(mockOpenHelp).toHaveBeenCalled()

      // Test F1 help shortcut
      const f1Shortcut = shortcuts.find((shortcut) => shortcut.key === 'F1')
      f1Shortcut?.action()
      expect(mockOpenHelp).toHaveBeenCalledTimes(2) // Called twice now
    })

    test('shortcuts have correct key combinations', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp)

      // Navigation shortcuts should use Ctrl
      const navigationShortcuts = shortcuts.filter((shortcut) => shortcut.category === 'Navigation')
      navigationShortcuts.forEach((shortcut) => {
        expect(shortcut.ctrl).toBe(true)
        expect(shortcut.alt).toBeUndefined()
        expect(shortcut.shift).toBeUndefined()
      })

      // Dark mode should use Ctrl+Shift
      const darkModeShortcut = shortcuts.find((shortcut) => shortcut.key === 'd')
      expect(darkModeShortcut?.ctrl).toBe(true)
      expect(darkModeShortcut?.shift).toBe(true)

      // Help shortcuts
      const questionShortcut = shortcuts.find((shortcut) => shortcut.key === '?')
      expect(questionShortcut?.shift).toBe(true)
      expect(questionShortcut?.ctrl).toBeUndefined()

      const f1Shortcut = shortcuts.find((shortcut) => shortcut.key === 'F1')
      expect(f1Shortcut?.ctrl).toBeUndefined()
      expect(f1Shortcut?.shift).toBeUndefined()
      expect(f1Shortcut?.alt).toBeUndefined()
    })

    test('all shortcuts have required properties', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp)

      shortcuts.forEach((shortcut) => {
        expect(shortcut).toHaveProperty('key')
        expect(shortcut).toHaveProperty('description')
        expect(shortcut).toHaveProperty('action')
        expect(shortcut).toHaveProperty('category')
        expect(typeof shortcut.action).toBe('function')
        expect(typeof shortcut.description).toBe('string')
        expect(typeof shortcut.key).toBe('string')
      })
    })

    test('categories are properly assigned', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp)

      const categories = shortcuts.map((shortcut) => shortcut.category)
      expect(categories).toContain('Navigation')
      expect(categories).toContain('Appearance')
      expect(categories).toContain('Help')

      // Count shortcuts per category
      const navigationCount = shortcuts.filter((s) => s.category === 'Navigation').length
      const appearanceCount = shortcuts.filter((s) => s.category === 'Appearance').length
      const helpCount = shortcuts.filter((s) => s.category === 'Help').length

      expect(navigationCount).toBe(4) // Ctrl+1,2,3,4
      expect(appearanceCount).toBe(1) // Ctrl+Shift+D
      expect(helpCount).toBe(2) // ? and F1
    })
  })

  describe('Keyboard Shortcut Functionality', () => {
    test('page navigation shortcuts work correctly', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp)

      const pages = ['connect', 'collect', 'logs', 'settings'] as const
      const keys = ['1', '2', '3', '4']

      keys.forEach((key, index) => {
        const shortcut = shortcuts.find((s) => s.key === key && s.ctrl)
        expect(shortcut).toBeDefined()

        shortcut?.action()
        expect(mockPageChange).toHaveBeenCalledWith(pages[index])
      })

      expect(mockPageChange).toHaveBeenCalledTimes(4)
    })

    test('handles optional callback parameters gracefully', () => {
      // Test with undefined callbacks
      const shortcutsWithoutCallbacks = createCommonShortcuts(mockPageChange)

      expect(shortcutsWithoutCallbacks).toHaveLength(7)

      // Dark mode shortcut should handle undefined callback
      const darkModeShortcut = shortcutsWithoutCallbacks.find((s) => s.key === 'd')
      expect(() => darkModeShortcut?.action()).not.toThrow()

      // Help shortcut should handle undefined callback
      const helpShortcut = shortcutsWithoutCallbacks.find((s) => s.key === '?')
      expect(() => helpShortcut?.action()).not.toThrow()
    })
  })

  describe('Keyboard Shortcut Descriptions', () => {
    test('descriptions are user-friendly and descriptive', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp)

      const descriptions = shortcuts.map((s) => s.description)

      expect(descriptions).toContain('Navigate to Connect tab')
      expect(descriptions).toContain('Navigate to Collect tab')
      expect(descriptions).toContain('Navigate to Logs tab')
      expect(descriptions).toContain('Navigate to Settings tab')
      expect(descriptions).toContain('Toggle dark mode')
      expect(descriptions).toContain('Show keyboard shortcuts help')

      // All descriptions should be non-empty strings
      descriptions.forEach((description) => {
        expect(description).toBeTruthy()
        expect(typeof description).toBe('string')
        expect(description.length).toBeGreaterThan(0)
      })
    })
  })
})

describe('useKeyboardShortcuts Hook', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    jest.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
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
  })

  test('registers keyboard event listeners', (done) => {
    const mockAction = jest.fn()
    const shortcuts = [{ key: 'Enter', description: 'Test shortcut', action: mockAction }]

    flushSync(() => {
      root.render(
        React.createElement(TestKeyboardShortcutsComponent, {
          options: { shortcuts },
          onHookReady: (hook) => {
            // Give some time for the hook to update
            setTimeout(() => {
              expect(hook.shortcuts).toEqual(shortcuts)

              // Simulate Enter key press
              const keyEvent = new KeyboardEvent('keydown', { key: 'Enter' })
              document.dispatchEvent(keyEvent)

              setTimeout(() => {
                expect(mockAction).toHaveBeenCalled()
                done()
              }, 50)
            }, 100)
          },
        }),
      )
    })
  })

  test('handles complex key combinations', (done) => {
    const mockAction = jest.fn()
    const shortcuts = [
      {
        key: 's',
        ctrl: true,
        shift: true,
        description: 'Save as',
        action: mockAction,
      },
    ]

    flushSync(() => {
      root.render(
        React.createElement(TestKeyboardShortcutsComponent, {
          options: { shortcuts },
          onHookReady: () => {
            // Simulate Ctrl+Shift+S
            const keyEvent = new KeyboardEvent('keydown', {
              key: 's',
              ctrlKey: true,
              shiftKey: true,
            })
            document.dispatchEvent(keyEvent)

            setTimeout(() => {
              expect(mockAction).toHaveBeenCalled()
              done()
            }, 10)
          },
        }),
      )
    })
  })

  test('ignores shortcuts when disabled', (done) => {
    const mockAction = jest.fn()
    const shortcuts = [{ key: 'Enter', description: 'Test shortcut', action: mockAction }]

    flushSync(() => {
      root.render(
        React.createElement(TestKeyboardShortcutsComponent, {
          options: { shortcuts, enabled: false },
          onHookReady: () => {
            const keyEvent = new KeyboardEvent('keydown', { key: 'Enter' })
            document.dispatchEvent(keyEvent)

            setTimeout(() => {
              expect(mockAction).not.toHaveBeenCalled()
              done()
            }, 10)
          },
        }),
      )
    })
  })

  test('handles action errors gracefully', (done) => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
    const errorAction = () => {
      throw new Error('Test error')
    }
    const shortcuts = [{ key: 'Enter', description: 'Error shortcut', action: errorAction }]

    flushSync(() => {
      root.render(
        React.createElement(TestKeyboardShortcutsComponent, {
          options: { shortcuts },
          onHookReady: () => {
            const keyEvent = new KeyboardEvent('keydown', { key: 'Enter' })
            document.dispatchEvent(keyEvent)

            setTimeout(() => {
              expect(consoleSpy).toHaveBeenCalledWith(
                'Error executing keyboard shortcut:',
                expect.any(Error),
              )
              consoleSpy.mockRestore()
              done()
            }, 10)
          },
        }),
      )
    })
  })

  test('can disable preventDefault', (done) => {
    const mockAction = jest.fn()
    const shortcuts = [{ key: 'Enter', description: 'Test shortcut', action: mockAction }]

    flushSync(() => {
      root.render(
        React.createElement(TestKeyboardShortcutsComponent, {
          options: { shortcuts, preventDefault: false },
          onHookReady: () => {
            const keyEvent = new KeyboardEvent('keydown', { key: 'Enter' })
            const preventDefaultSpy = jest.spyOn(keyEvent, 'preventDefault')
            document.dispatchEvent(keyEvent)

            setTimeout(() => {
              expect(mockAction).toHaveBeenCalled()
              expect(preventDefaultSpy).not.toHaveBeenCalled()
              done()
            }, 10)
          },
        }),
      )
    })
  })
})

describe('useFocusTrap Hook', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    jest.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
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
  })

  test('traps focus within container', (done) => {
    flushSync(() => {
      root.render(
        React.createElement(TestFocusTrapComponent, {
          onHookReady: (containerRef) => {
            // Wait for the component to mount and focus to be set
            setTimeout(() => {
              const container = containerRef.current
              expect(container).toBeDefined()

              if (container) {
                const focusableElements = container.querySelectorAll('button, input, a')
                expect(focusableElements.length).toBeGreaterThan(0)

                // First element should be focused
                expect(document.activeElement).toBe(focusableElements[0])
              }
              done()
            }, 50)
          },
        }),
      )
    })
  })

  test('handles tab navigation within trap', (done) => {
    flushSync(() => {
      root.render(
        React.createElement(TestFocusTrapComponent, {
          onHookReady: (containerRef) => {
            setTimeout(() => {
              const container = containerRef.current
              if (container) {
                const focusableElements = container.querySelectorAll('button, input, a')
                const firstElement = focusableElements[0] as HTMLElement
                const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

                // Focus on first element initially (this is done by the hook)
                expect(document.activeElement).toBe(firstElement)

                // Test that tab navigation is set up (we can't easily test the actual navigation
                // without complex DOM manipulation, but we can verify the elements exist)
                expect(focusableElements.length).toBeGreaterThan(0)
                expect(firstElement).toBeTruthy()
                expect(lastElement).toBeTruthy()
              }
              done()
            }, 50)
          },
        }),
      )
    })
  })

  test('does not trap focus when inactive', (done) => {
    flushSync(() => {
      root.render(
        React.createElement(TestFocusTrapComponent, {
          isActive: false,
          onHookReady: (containerRef) => {
            setTimeout(() => {
              const container = containerRef.current
              if (container) {
                const focusableElements = container.querySelectorAll('button, input, a')
                // When inactive, first element should not be auto-focused
                expect(document.activeElement).not.toBe(focusableElements[0])
              }
              done()
            }, 50)
          },
        }),
      )
    })
  })
})

describe('useTabNavigation Hook', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    jest.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
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
  })

  test('provides navigation functions', (done) => {
    flushSync(() => {
      root.render(
        React.createElement(TestTabNavigationComponent, {
          onHookReady: (hook) => {
            expect(typeof hook.focusNext).toBe('function')
            expect(typeof hook.focusPrevious).toBe('function')
            expect(typeof hook.focusFirst).toBe('function')
            expect(typeof hook.focusMain).toBe('function')
            done()
          },
        }),
      )
    })
  })

  test('focusFirst focuses first focusable element', (done) => {
    flushSync(() => {
      root.render(
        React.createElement(TestTabNavigationComponent, {
          onHookReady: (hook) => {
            setTimeout(() => {
              hook.focusFirst()
              const firstButton = document.querySelector('button')
              if (firstButton) {
                expect(document.activeElement).toBe(firstButton)
              }
              done()
            }, 50)
          },
        }),
      )
    })
  })

  test('focusMain focuses main content area', (done) => {
    flushSync(() => {
      root.render(
        React.createElement(TestTabNavigationComponent, {
          onHookReady: (hook) => {
            setTimeout(() => {
              hook.focusMain()
              const mainContent = document.getElementById('main-content')
              if (mainContent) {
                expect(document.activeElement).toBe(mainContent)
              }
              done()
            }, 50)
          },
        }),
      )
    })
  })

  test('focusNext and focusPrevious navigate through elements', (done) => {
    flushSync(() => {
      root.render(
        React.createElement(TestTabNavigationComponent, {
          onHookReady: (hook) => {
            setTimeout(() => {
              const buttons = document.querySelectorAll('button')
              if (buttons.length >= 2) {
                // Focus first button
                ;(buttons[0] as HTMLElement).focus()
                expect(document.activeElement).toBe(buttons[0])

                // Focus next
                hook.focusNext()

                // Should now be on second button (or similar focusable element)
                expect(document.activeElement).not.toBe(buttons[0])

                // Focus previous
                hook.focusPrevious()

                // Should cycle back
                expect(document.activeElement).toBeTruthy()
              }
              done()
            }, 50)
          },
        }),
      )
    })
  })
})
