import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SettingsPanel from '../SettingsPanel'

describe('SettingsPanel', () => {
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

  const renderComponent = () => {
    flushSync(() => {
      root.render(React.createElement(SettingsPanel))
    })
    return new Promise((resolve) => setTimeout(resolve, 0))
  }

  test('renders settings heading', async () => {
    await renderComponent()

    const heading = container.querySelector('h2')
    expect(heading?.textContent).toBe('Settings')
  })

  test('renders with correct section structure', async () => {
    await renderComponent()

    const section = container.querySelector('section')
    expect(section).toBeTruthy()
    expect(section?.classList.contains('card')).toBe(true)
    expect(section?.classList.contains('grid')).toBe(true)
  })

  test('renders Dark Theme checkbox', async () => {
    await renderComponent()

    expect(container.textContent).toContain('Dark Theme')
    const darkThemeCheckbox = Array.from(container.querySelectorAll('input[type="checkbox"]')).find(
      (input) => input.parentElement?.textContent?.includes('Dark Theme'),
    )
    expect(darkThemeCheckbox).toBeTruthy()
  })

  test('renders Chart Smoothing checkbox', async () => {
    await renderComponent()

    expect(container.textContent).toContain('Chart Smoothing')
    const smoothingCheckbox = Array.from(container.querySelectorAll('input[type="checkbox"]')).find(
      (input) => input.parentElement?.textContent?.includes('Chart Smoothing'),
    )
    expect(smoothingCheckbox).toBeTruthy()
  })

  test('renders Auto-Reconnect checkbox', async () => {
    await renderComponent()

    expect(container.textContent).toContain('Auto-Reconnect')
    const reconnectCheckbox = Array.from(container.querySelectorAll('input[type="checkbox"]')).find(
      (input) => input.parentElement?.textContent?.includes('Auto-Reconnect'),
    )
    expect(reconnectCheckbox).toBeTruthy()
  })

  test('renders Clear All Logs button', async () => {
    await renderComponent()

    const button = container.querySelector('button')
    expect(button?.textContent).toBe('Clear All Logs')
    expect(button?.style.gridColumn).toBe('1 / -1')
  })

  test('renders all three checkboxes', async () => {
    await renderComponent()

    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(3)
  })

  test('all checkboxes are wrapped in labels', async () => {
    await renderComponent()

    const labels = container.querySelectorAll('label')
    expect(labels).toHaveLength(3)

    labels.forEach((label) => {
      const checkbox = label.querySelector('input[type="checkbox"]')
      expect(checkbox).toBeTruthy()
    })
  })
})
