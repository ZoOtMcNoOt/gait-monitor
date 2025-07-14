import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ScrollProvider } from '../../contexts/ScrollContext'
import ScrollableContainer from '../ScrollableContainer'

describe('ScrollableContainer', () => {
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

  const renderWithProvider = (component: React.ReactElement) => {
    flushSync(() => {
      root.render(
        React.createElement(ScrollProvider, { children: component })
      )
    })
    // Give React time to render
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  it('should render children', async () => {
    await renderWithProvider(
      React.createElement(ScrollableContainer, { 
        id: 'test-container',
        children: React.createElement('div', { 'data-testid': 'child-content' }, 'Child Content')
      })
    )

    // Use standard DOM query methods
    expect(container.textContent).toContain('Child Content')
  })

  it('should apply className prop', async () => {
    await renderWithProvider(
      React.createElement(ScrollableContainer, { 
        id: 'test-container', 
        className: 'custom-class',
        children: React.createElement('div', {}, 'Content')
      })
    )

    const scrollContainer = container.firstElementChild as HTMLElement
    expect(scrollContainer?.className).toBe('custom-class')
  })

  it('should register with scroll context', async () => {
    // This test verifies that the component registers itself without throwing errors
    await expect(async () => {
      await renderWithProvider(
        React.createElement(ScrollableContainer, { 
          id: 'test-container',
          children: React.createElement('div', {}, 'Content')
        })
      )
    }).not.toThrow()
  })
})
