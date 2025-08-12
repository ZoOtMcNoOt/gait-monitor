import { useEffect, useRef } from 'react'
import '../styles/modal.css'
import { Icon } from './icons'

interface ConfirmationModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  type?: 'warning' | 'danger' | 'info'
}

export const ConfirmationModal = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'warning',
}: ConfirmationModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (isOpen && cancelButtonRef.current) {
      cancelButtonRef.current.focus()
    }
  }, [isOpen])
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onCancel])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === modalRef.current) {
      onCancel()
    }
  }

  if (!isOpen) return null

  const typeStyles = {
    warning: {
      icon: <Icon.Warning title="Warning" />,
      confirmButton: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
    },
    danger: {
      icon: <Icon.Error title="Danger" />,
      confirmButton: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    },
    info: {
      icon: <Icon.Info title="Information" />,
      confirmButton: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
    },
  } as const

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
      <div className="confirmation-modal">
        <div className="confirmation-modal-header">
          <h3 id="modal-title">
            <span aria-hidden="true">{currentStyle.icon}</span>
            {title}
          </h3>
        </div>

        <div className="confirmation-modal-body">
          <p id="modal-description">{message}</p>
        </div>

        <div className="confirmation-modal-footer">
          <button ref={cancelButtonRef} onClick={onCancel} className="btn-secondary">
            {cancelText}
          </button>
          <button onClick={onConfirm} className={type === 'danger' ? 'btn-danger' : 'btn-primary'}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmationModal
