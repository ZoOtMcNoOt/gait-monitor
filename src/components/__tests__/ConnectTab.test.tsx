import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { ScrollProvider } from '../../contexts/ScrollContext'
import ConnectTab from '../ConnectTab'

// Mock child components
jest.mock('../DeviceList', () => {
  return function MockDeviceList() {
    return React.createElement('div', { 'data-testid': 'device-list' }, 'Device List Component')
  }
})

jest.mock('../ScrollableContainer', () => {
  return function MockScrollableContainer({
    children,
    id,
    className,
  }: {
    children: React.ReactNode
    id: string
    className: string
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

describe('ConnectTab', () => {
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
    jest.clearAllMocks()
  })

  const renderWithProvider = () => {
    flushSync(() => {
      root.render(
        React.createElement(ScrollProvider, {
          children: React.createElement(ConnectTab),
        }),
      )
    })
    return new Promise((resolve) => setTimeout(resolve, 0))
  }

  test('renders main heading', async () => {
    await renderWithProvider()

    expect(container.textContent).toContain('Connect to Devices')
  })

  test('renders description text', async () => {
    await renderWithProvider()

    expect(container.textContent).toContain(
      'Scan for and connect to Bluetooth devices for data collection.',
    )
  })

  test('renders DeviceList component', async () => {
    await renderWithProvider()

    expect(container.textContent).toContain('Device List Component')
  })

  test('renders with correct structure', async () => {
    await renderWithProvider()

    const scrollableContainer = container.querySelector('[data-testid="scrollable-container"]')
    const tabHeader = container.querySelector('.tab-header')
    const heading = container.querySelector('h1')
    const description = container.querySelector('p')

    expect(scrollableContainer).toBeTruthy()
    expect(tabHeader).toBeTruthy()
    expect(heading).toBeTruthy()
    expect(description).toBeTruthy()
  })

  test('passes correct props to ScrollableContainer', async () => {
    await renderWithProvider()

    const scrollableContainer = container.querySelector('[data-testid="scrollable-container"]')
    expect(scrollableContainer?.getAttribute('id')).toBe('connect-tab')
    expect(scrollableContainer?.classList.contains('tab-content')).toBe(true)
  })
})
