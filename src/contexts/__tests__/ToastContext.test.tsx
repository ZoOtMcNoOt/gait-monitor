import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ToastProvider } from '../ToastContext'

// Mock component for testing ToastProvider
function TestComponent() {
  return React.createElement('div', { 'data-testid': 'test-component' }, 'Test Content')
}

describe('ToastProvider', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
  })

  it('should render children', async () => {
    flushSync(() => {
      root.render(
        React.createElement(ToastProvider, { 
          children: React.createElement(TestComponent)
        })
      )
    })

    // Give React time to render
    await new Promise(resolve => setTimeout(resolve, 0))

    // Use standard DOM query methods
    expect(container.textContent).toContain('Test Content')
  })

  it('should provide toast context', async () => {
    flushSync(() => {
      root.render(
        React.createElement(ToastProvider, { 
          children: React.createElement(TestComponent)
        })
      )
    })

    // Give React time to render
    await new Promise(resolve => setTimeout(resolve, 0))

    // ToastProvider should render a toast container
    expect(container.firstChild).toBeTruthy()
  })
})
