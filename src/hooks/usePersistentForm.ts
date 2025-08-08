import { useState, useEffect, useRef } from 'react'

interface PersistentFormOptions {
  storageKey: string
  debounceMs?: number
  clearOnSubmit?: boolean
}

/**
 * Custom hook for persistent form state using localStorage
 * Automatically saves form data to localStorage and restores it on component mount
 */
export function usePersistentForm<T extends Record<string, unknown>>(
  initialValues: T,
  options: PersistentFormOptions
) {
  const { storageKey, debounceMs = 500, clearOnSubmit = true } = options
  
  // Store initial values in a ref to avoid dependency issues
  const initialValuesRef = useRef(initialValues)
  
  // State for form values
  const [values, setValues] = useState<T>(initialValues)
  
  // Track if form has been initialized from localStorage
  const [isInitialized, setIsInitialized] = useState(false)
  
  // Debounce timer ref
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  
  // Load initial values from localStorage on mount
  useEffect(() => {
    try {
      const savedData = localStorage.getItem(storageKey)
      if (savedData) {
        const parsedData = JSON.parse(savedData)
        // Merge with initial values to handle schema changes
        const mergedData = { ...initialValuesRef.current, ...parsedData }
        setValues(mergedData)
      }
    } catch (error) {
      console.warn(`Failed to load persistent form data for ${storageKey}:`, error)
    } finally {
      setIsInitialized(true)
    }
  }, [storageKey]) // Remove initialValues from dependencies
  
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
        localStorage.setItem(storageKey, JSON.stringify(values))
      } catch (error) {
        console.warn(`Failed to save persistent form data for ${storageKey}:`, error)
      }
    }, debounceMs)
    
    // Cleanup timeout on unmount
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [values, storageKey, debounceMs, isInitialized])
  
  // Update a single field
  const updateField = (field: keyof T, value: T[keyof T]) => {
    setValues(prev => ({ ...prev, [field]: value }))
  }
  
  // Update multiple fields
  const updateFields = (updates: Partial<T>) => {
    setValues(prev => ({ ...prev, ...updates }))
  }
  
  // Reset form to initial values
  const resetForm = () => {
    setValues(initialValuesRef.current)
  }
  
  // Clear saved data from localStorage
  const clearSavedData = () => {
    try {
      localStorage.removeItem(storageKey)
    } catch (error) {
      console.warn(`Failed to clear persistent form data for ${storageKey}:`, error)
    }
  }
  
  // Submit handler that optionally clears saved data
  const handleSubmit = (onSubmit?: (values: T) => void) => {
    if (onSubmit) {
      onSubmit(values)
    }
    
    if (clearOnSubmit) {
      clearSavedData()
      resetForm()
    }
  }
  
  // Check if form has any saved data
  const hasSavedData = () => {
    try {
      return localStorage.getItem(storageKey) !== null
    } catch {
      return false
    }
  }
  
  return {
    values,
    updateField,
    updateFields,
    resetForm,
    clearSavedData,
    handleSubmit,
    hasSavedData,
    isInitialized
  }
}
