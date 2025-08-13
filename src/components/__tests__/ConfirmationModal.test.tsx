import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ConfirmationModal } from '../ConfirmationModal'

describe('ConfirmationModal', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  const mockOnConfirm = jest.fn()
  const mockOnCancel = jest.fn()

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
        React.createElement(ConfirmationModal, {
          isOpen: false,
          title: 'Test',
          message: 'Test message',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    expect(container.querySelector('.confirmation-modal-overlay')).toBeNull()
  })

  test('should render when isOpen is true', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Test Title',
          message: 'Test message',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const modal = container.querySelector('.confirmation-modal-overlay')
    expect(modal).toBeTruthy()
    expect(modal?.getAttribute('role')).toBe('dialog')
    expect(modal?.getAttribute('aria-modal')).toBe('true')
  })

  test('should display title and message', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Delete Item',
          message: 'Are you sure you want to delete this item?',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const title = container.querySelector('#modal-title')
    const description = container.querySelector('#modal-description')

    expect(title?.textContent).toContain('Delete Item')
    expect(description?.textContent).toBe('Are you sure you want to delete this item?')
  })

  test('should use default button texts', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Test',
          message: 'Test message',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const buttons = container.querySelectorAll('button')
    expect(buttons[0].textContent).toBe('Cancel')
    expect(buttons[1].textContent).toBe('Confirm')
  })

  test('should use custom button texts', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Test',
          message: 'Test message',
          confirmText: 'Yes, Delete',
          cancelText: 'Keep It',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const buttons = container.querySelectorAll('button')
    expect(buttons[0].textContent).toBe('Keep It')
    expect(buttons[1].textContent).toBe('Yes, Delete')
  })

  test('should call onConfirm when confirm button is clicked', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Test',
          message: 'Test message',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const confirmButton = container.querySelectorAll('button')[1]
    confirmButton.click()

    expect(mockOnConfirm).toHaveBeenCalledTimes(1)
    expect(mockOnCancel).not.toHaveBeenCalled()
  })

  test('should call onCancel when cancel button is clicked', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Test',
          message: 'Test message',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const cancelButton = container.querySelectorAll('button')[0]
    cancelButton.click()

    expect(mockOnCancel).toHaveBeenCalledTimes(1)
    expect(mockOnConfirm).not.toHaveBeenCalled()
  })

  test('should call onCancel when backdrop is clicked', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Test',
          message: 'Test message',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const overlay = container.querySelector('.confirmation-modal-overlay')

    // Create a click event on the overlay itself (not child elements)
    const clickEvent = new MouseEvent('click', { bubbles: true })
    Object.defineProperty(clickEvent, 'target', { value: overlay })

    overlay?.dispatchEvent(clickEvent)

    expect(mockOnCancel).toHaveBeenCalledTimes(1)
  })

  test('should not call onCancel when modal content is clicked', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Test',
          message: 'Test message',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const modalContent = container.querySelector('.confirmation-modal') as HTMLElement
    modalContent?.click()

    expect(mockOnCancel).not.toHaveBeenCalled()
  })

  test('should handle escape key', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Test',
          message: 'Test message',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })
    document.dispatchEvent(escapeEvent)

    expect(mockOnCancel).toHaveBeenCalledTimes(1)
  })

  test('should not handle escape key when modal is closed', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: false,
          title: 'Test',
          message: 'Test message',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' })
    document.dispatchEvent(escapeEvent)

    expect(mockOnCancel).not.toHaveBeenCalled()
  })

  test('should display warning type with correct styling and icon', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Warning',
          message: 'Test message',
          type: 'warning',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const title = container.querySelector('#modal-title')
    expect(title?.textContent).toContain('Warning')
    // Icon is rendered as an inline SVG with aria-label
    const icon = title?.querySelector('svg[aria-label="Warning"]')
    expect(icon).toBeTruthy()
  })

  test('should display danger type with correct styling and icon', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Delete',
          message: 'Test message',
          type: 'danger',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const title = container.querySelector('#modal-title')
    const confirmButton = container.querySelectorAll('button')[1]
    // Icon is rendered as an inline SVG with aria-label
    const icon = title?.querySelector('svg[aria-label="Danger"]')
    expect(icon).toBeTruthy()
    expect(title?.textContent).toContain('Delete')
    expect(confirmButton.className).toContain('btn-danger')
  })

  test('should display info type with correct styling and icon', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Information',
          message: 'Test message',
          type: 'info',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const title = container.querySelector('#modal-title')
    const confirmButton = container.querySelectorAll('button')[1]
    // Icon is rendered as an inline SVG with aria-label
    const icon = title?.querySelector('svg[aria-label="Information"]')
    expect(icon).toBeTruthy()
    expect(title?.textContent).toContain('Information')
    expect(confirmButton.className).toContain('btn-primary')
  })

  test('should use warning as default type', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Default',
          message: 'Test message',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const title = container.querySelector('#modal-title')
    const confirmButton = container.querySelectorAll('button')[1]
    // Default type is warning, check for the warning icon SVG
    const icon = title?.querySelector('svg[aria-label="Warning"]')
    expect(icon).toBeTruthy()
    expect(confirmButton.className).toContain('btn-primary')
  })

  test('should have proper accessibility attributes', () => {
    flushSync(() => {
      root.render(
        React.createElement(ConfirmationModal, {
          isOpen: true,
          title: 'Accessible Modal',
          message: 'This modal is accessible',
          onConfirm: mockOnConfirm,
          onCancel: mockOnCancel,
        }),
      )
    })

    const overlay = container.querySelector('.confirmation-modal-overlay')
    const title = container.querySelector('#modal-title')
    const description = container.querySelector('#modal-description')

    expect(overlay?.getAttribute('role')).toBe('dialog')
    expect(overlay?.getAttribute('aria-modal')).toBe('true')
    expect(overlay?.getAttribute('aria-labelledby')).toBe('modal-title')
    expect(overlay?.getAttribute('aria-describedby')).toBe('modal-description')
    expect(title?.getAttribute('id')).toBe('modal-title')
    expect(description?.getAttribute('id')).toBe('modal-description')
  })
})
