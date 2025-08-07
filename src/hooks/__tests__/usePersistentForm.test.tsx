import { renderHook, act } from '@testing-library/react'
import { usePersistentForm } from '../usePersistentForm'

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

describe('usePersistentForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  const initialValues = {
    name: '',
    email: '',
    age: 0
  }

  const storageKey = 'test-form'

  it('should load initial values when no saved data exists', () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() =>
      usePersistentForm(initialValues, { storageKey })
    )

    expect(result.current.values).toEqual(initialValues)
    expect(result.current.isInitialized).toBe(true)
    expect(localStorageMock.getItem).toHaveBeenCalledWith(storageKey)
  })

  it('should restore saved data from localStorage', () => {
    const savedData = { name: 'John', email: 'john@example.com', age: 25 }
    localStorageMock.getItem.mockReturnValue(JSON.stringify(savedData))

    const { result } = renderHook(() =>
      usePersistentForm(initialValues, { storageKey })
    )

    expect(result.current.values).toEqual(savedData)
    expect(result.current.isInitialized).toBe(true)
  })

  it('should save data to localStorage when values change', () => {
    localStorageMock.getItem.mockReturnValue(null)

    const { result } = renderHook(() =>
      usePersistentForm(initialValues, { storageKey, debounceMs: 100 })
    )

    act(() => {
      result.current.updateField('name', 'John')
    })

    // Fast-forward debounce timer
    act(() => {
      jest.advanceTimersByTime(100)
    })

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      storageKey,
      JSON.stringify({ ...initialValues, name: 'John' })
    )
  })

  it('should clear saved data on submit when clearOnSubmit is true', () => {
    const { result } = renderHook(() =>
      usePersistentForm(initialValues, { storageKey, clearOnSubmit: true })
    )

    const mockOnSubmit = jest.fn()

    act(() => {
      result.current.handleSubmit(mockOnSubmit)
    })

    expect(mockOnSubmit).toHaveBeenCalledWith(initialValues)
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(storageKey)
  })

  it('should detect if saved data exists', () => {
    localStorageMock.getItem.mockReturnValue('{"name":"test"}')

    const { result } = renderHook(() =>
      usePersistentForm(initialValues, { storageKey })
    )

    expect(result.current.hasSavedData()).toBe(true)

    localStorageMock.getItem.mockReturnValue(null)
    expect(result.current.hasSavedData()).toBe(false)
  })
})
