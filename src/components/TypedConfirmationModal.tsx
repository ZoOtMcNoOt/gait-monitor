import { useState, useEffect, useRef } from 'react'
import '../styles/modal.css'

interface TypedConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  requiredPhrase: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'warning' | 'danger' | 'info';
}

export const TypedConfirmationModal = ({
  isOpen,
  title,
  message,
  requiredPhrase,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'danger'
}: TypedConfirmationModalProps) => {
  const [inputValue, setInputValue] = useState('')
  const [showMismatchError, setShowMismatchError] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  const isExactMatch = inputValue === requiredPhrase
  const hasAttemptedSubmit = showMismatchError

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setInputValue('')
      setShowMismatchError(false)
      // Focus the input field when modal opens
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onCancel])

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      onCancel()
    }
  }

  const handleConfirm = () => {
    if (isExactMatch) {
      onConfirm()
    } else {
      setShowMismatchError(true)
      inputRef.current?.focus()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    // Clear error when user starts typing again
    if (showMismatchError) {
      setShowMismatchError(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleConfirm()
    }
  }

  if (!isOpen) return null

  const typeStyles = {
    warning: {
      icon: '⚠️',
      confirmButton: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500'
    },
    danger: {
      icon: '🗑️',
      confirmButton: 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
    },
    info: {
      icon: 'ℹ️',
      confirmButton: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
    }
  }

  const currentStyle = typeStyles[type]

  return (
    <div
      ref={modalRef}
      className="confirmation-modal-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-description"
    >
      <div className="confirmation-modal typed-confirmation">
        <div className="confirmation-modal-header">
          <h3 id="modal-title">
            <span aria-hidden="true">{currentStyle.icon}</span>
            {title}
          </h3>
        </div>
        
        <div className="confirmation-modal-body">
          <p id="modal-description">
            {message}
          </p>
          
          <div className="typed-confirmation-section">
            <p className="confirmation-instruction">
              To confirm this action, type: <strong className="required-phrase">"{requiredPhrase}"</strong>
            </p>
            
            <div className="input-group">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                className={`confirmation-input ${hasAttemptedSubmit && !isExactMatch ? 'error' : ''}`}
                placeholder={`Type "${requiredPhrase}" to confirm`}
                aria-describedby="confirmation-input-help"
                autoComplete="off"
                spellCheck="false"
              />
              {hasAttemptedSubmit && !isExactMatch && (
                <p id="confirmation-input-help" className="input-error" role="alert">
                  Text must match exactly: "{requiredPhrase}"
                </p>
              )}
            </div>
          </div>
        </div>
        
        <div className="confirmation-modal-footer">
          <button
            ref={cancelButtonRef}
            onClick={onCancel}
            className="btn-secondary"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`${type === 'danger' ? 'btn-danger' : 'btn-primary'} ${!isExactMatch ? 'disabled' : ''}`}
            disabled={!isExactMatch}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default TypedConfirmationModal
