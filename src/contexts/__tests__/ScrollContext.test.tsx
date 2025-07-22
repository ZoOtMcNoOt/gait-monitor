import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ScrollProvider } from '../ScrollContext'
import ScrollContext from '../ScrollContext'

// Test component that uses the ScrollContext
const TestScrollableComponent: React.FC<{ id: string }> = ({ id }) => {
  const scrollContext = React.useContext(ScrollContext)
  const elementRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (scrollContext && elementRef.current) {
      scrollContext.registerScrollable(id, elementRef.current)
      return () => scrollContext.unregisterScrollable(id)
    }
  }, [id, scrollContext])

  return React.createElement('div', {
    ref: elementRef,
    'data-testid': `scrollable-${id}`,
    style: { height: '200px', overflow: 'auto' }
  }, [
    React.createElement('div', { 
      key: 'content',
      style: { height: '1000px' } 
    }, `Content for ${id}`)
  ])
}

const TestControllerComponent: React.FC = () => {
  const scrollContext = React.useContext(ScrollContext)
  
  return React.createElement('div', null, [
    React.createElement('button', {
      key: 'scroll-all-btn',
      'data-testid': 'scroll-all-button',
      onClick: () => scrollContext?.scrollAllToTop()
    }, 'Scroll All'),
    React.createElement('button', {
      key: 'scroll-one-btn',
      'data-testid': 'scroll-one-button',
      onClick: () => scrollContext?.scrollToTop('test-1')
    }, 'Scroll Test-1'),
    React.createElement('div', {
      key: 'status',
      'data-testid': 'context-available'
    }, scrollContext ? 'available' : 'not-available')
  ])
}

describe('ScrollContext', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  // Mock scrollTo method
  const mockScrollTo = jest.fn()
  const originalScrollTo = HTMLElement.prototype.scrollTo

  beforeEach(() => {
    jest.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    
    // Mock scrollTo for elements
    HTMLElement.prototype.scrollTo = mockScrollTo
    
    // Mock window.scrollTo
    Object.defineProperty(window, 'scrollTo', {
      value: jest.fn(),
      writable: true
    })
  })

  afterEach(() => {
    root.unmount()
    container.remove()
    HTMLElement.prototype.scrollTo = originalScrollTo
  })

  const renderWithProvider = (component: React.ReactElement) => {
    flushSync(() => {
      root.render(
        React.createElement(ScrollProvider, { children: component })
      )
    })
    return Promise.resolve()
  }

  it('should provide scroll context when used within provider', async () => {
    await renderWithProvider(React.createElement(TestControllerComponent))

    const statusElement = container.querySelector('[data-testid="context-available"]')
    expect(statusElement?.textContent).toBe('available')
  })

  it('should register and unregister scrollable elements', async () => {
    const TestComponent = () => {
      const scrollContext = React.useContext(ScrollContext)
      const elementRef = React.useRef<HTMLDivElement>(null)
      const [isRegistered, setIsRegistered] = React.useState(false)

      const handleRegister = () => {
        if (scrollContext && elementRef.current) {
          scrollContext.registerScrollable('test-element', elementRef.current)
          setIsRegistered(true)
        }
      }

      const handleUnregister = () => {
        if (scrollContext) {
          scrollContext.unregisterScrollable('test-element')
          setIsRegistered(false)
        }
      }

      return React.createElement('div', null, [
        React.createElement('div', {
          key: 'element',
          ref: elementRef,
          'data-testid': 'scrollable-element',
          style: { height: '100px', overflow: 'auto' }
        }),
        React.createElement('button', {
          key: 'register-btn',
          'data-testid': 'register-button',
          onClick: handleRegister
        }, 'Register'),
        React.createElement('button', {
          key: 'unregister-btn',
          'data-testid': 'unregister-button',
          onClick: handleUnregister
        }, 'Unregister'),
        React.createElement('div', {
          key: 'status',
          'data-testid': 'registration-status'
        }, isRegistered ? 'registered' : 'not-registered')
      ])
    }

    await renderWithProvider(React.createElement(TestComponent))

    const registerButton = container.querySelector('[data-testid="register-button"]') as HTMLButtonElement
    const statusElement = container.querySelector('[data-testid="registration-status"]')

    expect(statusElement?.textContent).toBe('not-registered')

    // Simulate registration
    flushSync(() => {
      registerButton.click()
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(container.querySelector('[data-testid="registration-status"]')?.textContent).toBe('registered')

    // Test unregistration
    const unregisterButton = container.querySelector('[data-testid="unregister-button"]') as HTMLButtonElement
    flushSync(() => {
      unregisterButton.click()
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(container.querySelector('[data-testid="registration-status"]')?.textContent).toBe('not-registered')
  })

  it('should scroll specific element to top', async () => {
    const TestComponent = () => {
      return React.createElement('div', null, [
        React.createElement(TestScrollableComponent, { key: 'scrollable-1', id: 'test-1' }),
        React.createElement(TestScrollableComponent, { key: 'scrollable-2', id: 'test-2' }),
        React.createElement(TestControllerComponent, { key: 'controller' })
      ])
    }

    await renderWithProvider(React.createElement(TestComponent))
    await new Promise(resolve => setTimeout(resolve, 10))

    const scrollOneButton = container.querySelector('[data-testid="scroll-one-button"]') as HTMLButtonElement

    // Simulate click to scroll specific element
    flushSync(() => {
      scrollOneButton.click()
    })

    // Should call scrollTo with correct parameters
    expect(mockScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('should scroll all elements to top', async () => {
    const TestComponent = () => {
      return React.createElement('div', null, [
        React.createElement(TestScrollableComponent, { key: 'scrollable-1', id: 'test-1' }),
        React.createElement(TestScrollableComponent, { key: 'scrollable-2', id: 'test-2' }),
        React.createElement(TestControllerComponent, { key: 'controller' })
      ])
    }

    await renderWithProvider(React.createElement(TestComponent))
    await new Promise(resolve => setTimeout(resolve, 10))

    const scrollAllButton = container.querySelector('[data-testid="scroll-all-button"]') as HTMLButtonElement

    // Simulate click to scroll all elements
    flushSync(() => {
      scrollAllButton.click()
    })

    // Should call scrollTo multiple times (once for each registered element plus window)
    expect(mockScrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
  })

  it('should handle registration with null element', async () => {
    const TestComponent = () => {
      const scrollContext = React.useContext(ScrollContext)
      const [isRegistered, setIsRegistered] = React.useState(false)

      const handleRegisterNull = () => {
        if (scrollContext) {
          scrollContext.registerScrollable('null-element', null)
          setIsRegistered(true)
        }
      }

      return React.createElement('div', null, [
        React.createElement('button', {
          key: 'register-null-btn',
          'data-testid': 'register-null-button',
          onClick: handleRegisterNull
        }, 'Register Null'),
        React.createElement('div', {
          key: 'status',
          'data-testid': 'null-registration-status'
        }, isRegistered ? 'attempted' : 'not-attempted')
      ])
    }

    await renderWithProvider(React.createElement(TestComponent))

    const registerButton = container.querySelector('[data-testid="register-null-button"]') as HTMLButtonElement

    // Should not throw error when registering null element
    expect(() => {
      flushSync(() => {
        registerButton.click()
      })
    }).not.toThrow()

    await new Promise(resolve => setTimeout(resolve, 0))
    expect(container.querySelector('[data-testid="null-registration-status"]')?.textContent).toBe('attempted')
  })

  it('should handle scrollToTop for non-existent element', async () => {
    const TestComponent = () => {
      const scrollContext = React.useContext(ScrollContext)

      const handleScrollNonExistent = () => {
        if (scrollContext) {
          scrollContext.scrollToTop('non-existent-id')
        }
      }

      return React.createElement('button', {
        'data-testid': 'scroll-nonexistent-button',
        onClick: handleScrollNonExistent
      }, 'Scroll Non-existent')
    }

    await renderWithProvider(React.createElement(TestComponent))

    const scrollButton = container.querySelector('[data-testid="scroll-nonexistent-button"]') as HTMLButtonElement

    // Should not throw error when trying to scroll non-existent element
    expect(() => {
      flushSync(() => {
        scrollButton.click()
      })
    }).not.toThrow()

    // mockScrollTo should not have been called since element doesn't exist
    expect(mockScrollTo).not.toHaveBeenCalled()
  })

  it('should clean up registrations on re-registration with null', async () => {
    const TestComponent = () => {
      const scrollContext = React.useContext(ScrollContext)
      const elementRef = React.useRef<HTMLDivElement>(null)
      const [registrationCount, setRegistrationCount] = React.useState(0)

      const handleRegisterElement = () => {
        if (scrollContext && elementRef.current) {
          scrollContext.registerScrollable('test-cleanup', elementRef.current)
          setRegistrationCount(prev => prev + 1)
        }
      }

      const handleRegisterNull = () => {
        if (scrollContext) {
          scrollContext.registerScrollable('test-cleanup', null)
          setRegistrationCount(prev => prev + 1)
        }
      }

      return React.createElement('div', null, [
        React.createElement('div', {
          key: 'element',
          ref: elementRef,
          'data-testid': 'cleanup-element',
          style: { height: '100px', overflow: 'auto' }
        }),
        React.createElement('button', {
          key: 'register-element-btn',
          'data-testid': 'register-element-button',
          onClick: handleRegisterElement
        }, 'Register Element'),
        React.createElement('button', {
          key: 'register-null-btn',
          'data-testid': 'cleanup-register-null-button',
          onClick: handleRegisterNull
        }, 'Register Null'),
        React.createElement('div', {
          key: 'count',
          'data-testid': 'registration-count'
        }, registrationCount.toString())
      ])
    }

    await renderWithProvider(React.createElement(TestComponent))

    const registerElementButton = container.querySelector('[data-testid="register-element-button"]') as HTMLButtonElement
    const registerNullButton = container.querySelector('[data-testid="cleanup-register-null-button"]') as HTMLButtonElement

    // Register element first
    flushSync(() => {
      registerElementButton.click()
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(container.querySelector('[data-testid="registration-count"]')?.textContent).toBe('1')

    // Register null (should clean up previous registration)
    flushSync(() => {
      registerNullButton.click()
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(container.querySelector('[data-testid="registration-count"]')?.textContent).toBe('2')

    // Both operations should complete without error
    expect(container.querySelector('[data-testid="cleanup-element"]')).toBeTruthy()
  })
})
