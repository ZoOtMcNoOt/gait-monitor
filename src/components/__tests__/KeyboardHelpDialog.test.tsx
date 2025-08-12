import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { KeyboardHelpDialog } from '../KeyboardHelpDialog'
import type { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts'

// Mock the useFocusTrap hook
jest.mock('../../hooks/useKeyboardShortcuts', () => ({
  useFocusTrap: jest.fn(),
}))

describe('KeyboardHelpDialog', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const mockOnClose = jest.fn()

  const mockShortcuts: KeyboardShortcut[] = [
    {
      key: 'Enter',
      description: 'Connect to device',
      category: 'Navigation',
      action: jest.fn(),
    },
    {
      key: 'ArrowUp',
      description: 'Move up',
      category: 'Navigation',
      action: jest.fn(),
    },
    {
      key: 'Space',
      description: 'Select item',
      category: 'General',
      action: jest.fn(),
    },
    {
      key: 's',
      ctrl: true,
      description: 'Save data',
      category: 'Actions',
      action: jest.fn(),
    },
    {
      key: '?',
      description: 'Show help',
      category: 'General',
      action: jest.fn(),
    },
  ]

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    jest.clearAllMocks()
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

  test('should not render when isOpen is false', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: false,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    expect(container.querySelector('.keyboard-help-overlay')).toBeNull()
  })

  test('should render when isOpen is true', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const dialog = container.querySelector('.keyboard-help-overlay')
    expect(dialog).toBeTruthy()
    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
  })

  test('should display title and description', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const title = container.querySelector('#keyboard-help-title')
    const description = container.querySelector('#keyboard-help-description')

    expect(title?.textContent).toBe('Keyboard Shortcuts')
    expect(description?.textContent).toContain('Use these keyboard shortcuts')
  })

  test('should group shortcuts by category', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const sections = container.querySelectorAll('.keyboard-help-section')
    const categories = Array.from(sections).map(
      (section) => section.querySelector('.keyboard-help-category')?.textContent,
    )

    expect(categories).toContain('Navigation')
    expect(categories).toContain('General')
    expect(categories).toContain('Actions')
  })

  test('should format shortcuts correctly', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const shortcutKeys = container.querySelectorAll('.keyboard-shortcut-key')
    const shortcutTexts = Array.from(shortcutKeys).map((key) => key.textContent)

    expect(shortcutTexts).toContain('ENTER')
    expect(shortcutTexts).toContain('↑')
    expect(shortcutTexts).toContain('SPACE')
    expect(shortcutTexts).toContain('Ctrl + S')
    expect(shortcutTexts).toContain('?')
  })

  test('should display shortcut descriptions', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const descriptions = container.querySelectorAll('.keyboard-shortcut-description')
    const descriptionTexts = Array.from(descriptions).map((desc) => desc.textContent)

    expect(descriptionTexts).toContain('Connect to device')
    expect(descriptionTexts).toContain('Move up')
    expect(descriptionTexts).toContain('Select item')
    expect(descriptionTexts).toContain('Save data')
    expect(descriptionTexts).toContain('Show help')
  })

  test('should call onClose when close button is clicked', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const closeButton = container.querySelector('.keyboard-help-close') as HTMLButtonElement
    closeButton.click()

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  test('should call onClose when "Got it" button is clicked', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const gotItButton = container.querySelector('.btn-primary') as HTMLButtonElement
    gotItButton.click()

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  test('should call onClose when backdrop is clicked', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const overlay = container.querySelector('.keyboard-help-overlay')

    // Create a click event on the overlay itself
    const clickEvent = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(clickEvent, 'target', { value: overlay })

    overlay?.dispatchEvent(clickEvent)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  test('should not call onClose when dialog content is clicked', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const dialogContent = container.querySelector('.keyboard-help-dialog') as HTMLElement
    dialogContent.click()

    expect(mockOnClose).not.toHaveBeenCalled()
  })

  test('should handle escape key', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })
    document.dispatchEvent(escapeEvent)

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  test('should not handle escape key when dialog is closed', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: false,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })
    document.dispatchEvent(escapeEvent)

    expect(mockOnClose).not.toHaveBeenCalled()
  })

  test('should handle shortcuts without category (default to General)', () => {
    const shortcutsWithoutCategory: KeyboardShortcut[] = [
      {
        key: 'Tab',
        description: 'Navigate forward',
        action: jest.fn(),
      },
    ]

    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: shortcutsWithoutCategory,
        }),
      )
    })

    const generalSection = Array.from(container.querySelectorAll('.keyboard-help-category')).find(
      (category) => category.textContent === 'General',
    )

    expect(generalSection).toBeTruthy()
  })

  test('should format complex shortcuts with multiple modifiers', () => {
    const complexShortcuts: KeyboardShortcut[] = [
      {
        key: 'F',
        ctrl: true,
        shift: true,
        alt: true,
        description: 'Complex shortcut',
        action: jest.fn(),
      },
    ]

    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: complexShortcuts,
        }),
      )
    })

    const shortcutKey = container.querySelector('.keyboard-shortcut-key')
    expect(shortcutKey?.textContent).toBe('Ctrl + Alt + Shift + F')
  })

  test('should format arrow keys with symbols', () => {
    const arrowShortcuts: KeyboardShortcut[] = [
      { key: 'ArrowUp', description: 'Up', action: jest.fn() },
      { key: 'ArrowDown', description: 'Down', action: jest.fn() },
      { key: 'ArrowLeft', description: 'Left', action: jest.fn() },
      { key: 'ArrowRight', description: 'Right', action: jest.fn() },
    ]

    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: arrowShortcuts,
        }),
      )
    })

    const shortcutKeys = container.querySelectorAll('.keyboard-shortcut-key')
    const keyTexts = Array.from(shortcutKeys).map((key) => key.textContent)

    expect(keyTexts).toContain('↑')
    expect(keyTexts).toContain('↓')
    expect(keyTexts).toContain('←')
    expect(keyTexts).toContain('→')
  })

  test('should have proper accessibility attributes', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: mockShortcuts,
        }),
      )
    })

    const overlay = container.querySelector('.keyboard-help-overlay')
    const title = container.querySelector('#keyboard-help-title')
    const description = container.querySelector('#keyboard-help-description')
    const closeButton = container.querySelector('.keyboard-help-close')

    expect(overlay?.getAttribute('role')).toBe('dialog')
    expect(overlay?.getAttribute('aria-modal')).toBe('true')
    expect(overlay?.getAttribute('aria-labelledby')).toBe('keyboard-help-title')
    expect(overlay?.getAttribute('aria-describedby')).toBe('keyboard-help-description')
    expect(title?.getAttribute('id')).toBe('keyboard-help-title')
    expect(description?.getAttribute('id')).toBe('keyboard-help-description')
    expect(closeButton?.getAttribute('aria-label')).toBe('Close keyboard shortcuts help')
  })

  test('should render with empty shortcuts array', () => {
    flushSync(() => {
      root.render(
        React.createElement(KeyboardHelpDialog, {
          isOpen: true,
          onClose: mockOnClose,
          shortcuts: [],
        }),
      )
    })

    const dialog = container.querySelector('.keyboard-help-overlay')
    const sections = container.querySelectorAll('.keyboard-help-section')

    expect(dialog).toBeTruthy()
    expect(sections.length).toBe(0)
  })
})
