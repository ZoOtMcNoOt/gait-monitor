import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { config } from '../config'
import '../styles/toast.css'
import { Icon } from '../components/icons'

export interface Toast {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message?: string
  duration?: number
  metadata?: Record<string, string> // For custom data attributes
}

interface ToastContextType {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  showSuccess: (title: string, message?: string) => void
  showError: (title: string, message?: string) => void
  showWarning: (title: string, message?: string) => void
  showInfo: (title: string, message?: string) => void
  showSettingsSaved: (title?: string, message?: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: ReactNode
}

export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const toastsRef = useRef<Toast[]>([])

  // Keep ref in sync with state
  useEffect(() => {
    toastsRef.current = toasts
  }, [toasts])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))

    // Clear the timeout for this toast if it exists
    const timeoutId = timeoutRefs.current.get(id)
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutRefs.current.delete(id)
    }
  }, [])

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    // Use crypto.randomUUID() for secure ID generation instead of Math.random()
    const id = crypto.randomUUID()
    const newToast = { ...toast, id }

    setToasts((prev) => [...prev, newToast])

    // Auto remove after duration with proper cleanup
    const duration = toast.duration || config.toastDuration
    const timeoutId = setTimeout(() => {
      // Use direct state update to avoid closure issues
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timeoutRefs.current.delete(id)
    }, duration)

    // Store timeout reference for cleanup
    timeoutRefs.current.set(id, timeoutId)
  }, []) // Remove removeToast dependency to avoid re-creating timeouts

  // Cleanup all timeouts on unmount
  useEffect(() => {
    const currentTimeouts = timeoutRefs.current
    return () => {
      currentTimeouts.forEach((timeoutId) => clearTimeout(timeoutId))
      currentTimeouts.clear()
    }
  }, [])

  const showSuccess = useCallback(
    (title: string, message?: string) => {
      addToast({ type: 'success', title, message })
    },
    [addToast],
  )

  const showError = useCallback(
    (title: string, message?: string) => {
      addToast({ type: 'error', title, message, duration: config.toastDuration + 2000 }) // Errors stay longer
    },
    [addToast],
  )

  const showWarning = useCallback(
    (title: string, message?: string) => {
      addToast({ type: 'warning', title, message })
    },
    [addToast],
  )

  const showInfo = useCallback(
    (title: string, message?: string) => {
      addToast({ type: 'info', title, message })
    },
    [addToast],
  )

  const showSettingsSaved = useCallback(
    (title = 'Settings Saved', message = 'Your settings have been saved successfully!') => {
      addToast({
        type: 'success',
        title,
        message,
        metadata: { 'settings-save': 'true' },
      })
    },
    [addToast],
  )

  const value = {
    toasts,
    addToast,
    removeToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showSettingsSaved,
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

const ToastContainer = ({ toasts, onRemove }: ToastContainerProps) => {
  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  )
}

interface ToastItemProps {
  toast: Toast
  onRemove: (id: string) => void
}

const ToastItem = ({ toast, onRemove }: ToastItemProps) => {
  const typeIcons = {
    success: <Icon.Success className="toast-icon-svg" title="Success" />,
    error: <Icon.Error className="toast-icon-svg" title="Error" />,
    warning: <Icon.Warning className="toast-icon-svg" title="Warning" />,
    info: <Icon.Info className="toast-icon-svg" title="Information" />,
  } as const

  // Build data attributes from metadata
  const dataAttributes = toast.metadata
    ? Object.entries(toast.metadata).reduce(
        (acc, [key, value]) => {
          acc[`data-${key}`] = value
          return acc
        },
        {} as Record<string, string>,
      )
    : {}

  return (
    <div className={`toast toast-${toast.type}`} {...dataAttributes}>
      <div className="toast-content">
        <div className="toast-header">
          <span className="toast-icon" aria-hidden="true">
            {typeIcons[toast.type]}
          </span>
          <span className="toast-title">{toast.title}</span>
          <button
            className="toast-close"
            onClick={() => onRemove(toast.id)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
    </div>
  )
}
