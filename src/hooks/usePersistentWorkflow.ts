import { useState, useEffect, useRef } from 'react'

interface PersistentWorkflowOptions {
  storageKey: string
  debounceMs?: number
  clearOnComplete?: boolean
  trackTabSwitching?: boolean
}

/**
 * Custom hook for persistent workflow state using localStorage
 * Specifically designed for multi-step workflows that need to persist step progress
 */
export function usePersistentWorkflow<T extends Record<string, unknown>>(
  initialState: T,
  options: PersistentWorkflowOptions,
) {
  const { storageKey, debounceMs = 500, clearOnComplete = true, trackTabSwitching = true } = options

  // Store initial state in a ref to avoid dependency issues
  const initialStateRef = useRef(initialState)

  // State for workflow values
  const [state, setState] = useState<T>(initialState)

  // Track if workflow has been initialized from localStorage
  const [isInitialized, setIsInitialized] = useState(false)

  // Track if user actually returned from another tab
  const [hasReturned, setHasReturned] = useState(false)

  // Debounce timer ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Track tab switching if enabled
  useEffect(() => {
    if (!trackTabSwitching) return

    let tabSwitchDetected = false

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // User switched away from tab
        tabSwitchDetected = true
        try {
          sessionStorage.setItem(`${storageKey}-tab-switched`, 'true')
        } catch (error) {
          console.warn('Failed to track tab switching:', error)
        }
      } else if (tabSwitchDetected) {
        // User returned to tab
        setHasReturned(true)

        // Clear the return indicator after a reasonable time
        setTimeout(() => {
          setHasReturned(false)
          try {
            sessionStorage.removeItem(`${storageKey}-tab-switched`)
          } catch (error) {
            console.warn('Failed to clear tab switching flag:', error)
          }
        }, 5000) // Hide after 5 seconds
      }
    }

    // Check if user previously switched away (handles page refresh case)
    try {
      const hadSwitched = sessionStorage.getItem(`${storageKey}-tab-switched`)
      if (hadSwitched === 'true') {
        setHasReturned(true)
        setTimeout(() => {
          setHasReturned(false)
          sessionStorage.removeItem(`${storageKey}-tab-switched`)
        }, 5000)
      }
    } catch (error) {
      console.warn('Failed to check previous tab switching:', error)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [storageKey, trackTabSwitching])

  // Load initial state from localStorage on mount - run only once
  useEffect(() => {
    try {
      const savedData = localStorage.getItem(storageKey)
      if (savedData) {
        const parsedData = JSON.parse(savedData)
        // Merge with initial state to handle schema changes
        const mergedData = { ...initialStateRef.current, ...parsedData }
        setState(mergedData)
      }
    } catch (error) {
      console.warn(`Failed to load persistent workflow data for ${storageKey}:`, error)
    } finally {
      setIsInitialized(true)
    }
  }, [storageKey])

  // Save to localStorage with debouncing
  useEffect(() => {
    // Don't save until initialized to avoid overwriting saved data with initial values
    if (!isInitialized) return

    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    // Set new timeout
    debounceRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state))
      } catch (error) {
        console.warn(`Failed to save persistent workflow data for ${storageKey}:`, error)
      }
    }, debounceMs)

    // Cleanup timeout on unmount
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [state, storageKey, debounceMs, isInitialized])

  // Update a single field
  const updateField = (field: keyof T, value: T[keyof T]) => {
    setState((prev) => ({ ...prev, [field]: value }))
  }

  // Update multiple fields
  const updateFields = (updates: Partial<T>) => {
    setState((prev) => ({ ...prev, ...updates }))
  }

  // Reset workflow to initial state
  const resetWorkflow = () => {
    setState(initialStateRef.current)
  }

  // Clear saved data from localStorage
  const clearSavedData = () => {
    try {
      localStorage.removeItem(storageKey)
    } catch (error) {
      console.warn(`Failed to clear persistent workflow data for ${storageKey}:`, error)
    }
  }

  // Complete workflow - optionally clears saved data
  const completeWorkflow = () => {
    if (clearOnComplete) {
      clearSavedData()
      resetWorkflow()
    }
  }

  // Check if workflow has any saved data
  const hasSavedData = () => {
    try {
      return localStorage.getItem(storageKey) !== null
    } catch {
      return false
    }
  }

  return {
    state,
    updateField,
    updateFields,
    resetWorkflow,
    clearSavedData,
    completeWorkflow,
    hasSavedData,
    isInitialized,
    hasReturned,
  }
}
