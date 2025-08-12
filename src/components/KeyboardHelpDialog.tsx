/**
 * Keyboard Shortcuts Help Dialog
 * Part of A3.5: Keyboard Navigation Improvements
 */

import { useEffect, useRef } from 'react'
import type { KeyboardShortcut } from '../hooks/useKeyboardShortcuts'
import { useFocusTrap } from '../hooks/useKeyboardShortcuts'
import '../styles/keyboard-help.css'

interface KeyboardHelpDialogProps {
  isOpen: boolean
  onClose: () => void
  shortcuts: KeyboardShortcut[]
}

export function KeyboardHelpDialog({ isOpen, onClose, shortcuts }: KeyboardHelpDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Enable focus trap when dialog is open
  useFocusTrap(dialogRef, isOpen)

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce(
    (groups, shortcut) => {
      const category = shortcut.category || 'General'
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(shortcut)
      return groups
    },
    {} as Record<string, KeyboardShortcut[]>,
  )

  // Format keyboard shortcut for display
  const formatShortcut = (shortcut: KeyboardShortcut): string => {
    const parts = []
    if (shortcut.ctrl) parts.push('Ctrl')
    if (shortcut.alt) parts.push('Alt')
    if (shortcut.shift) parts.push('Shift')

    // Special handling for certain keys
    let keyDisplay = shortcut.key
    if (shortcut.key === ' ') keyDisplay = 'Space'
    else if (shortcut.key === 'ArrowUp') keyDisplay = '↑'
    else if (shortcut.key === 'ArrowDown') keyDisplay = '↓'
    else if (shortcut.key === 'ArrowLeft') keyDisplay = '←'
    else if (shortcut.key === 'ArrowRight') keyDisplay = '→'
    else if (shortcut.key === '?') keyDisplay = '?'
    else keyDisplay = shortcut.key.toUpperCase()

    parts.push(keyDisplay)
    return parts.join(' + ')
  }

  if (!isOpen) return null

  return (
    <div
      ref={dialogRef}
      className="keyboard-help-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-help-title"
      aria-describedby="keyboard-help-description"
    >
      <div className="keyboard-help-dialog">
        <header className="keyboard-help-header">
          <h2 id="keyboard-help-title">Keyboard Shortcuts</h2>
          <button
            ref={closeButtonRef}
            className="keyboard-help-close"
            onClick={onClose}
            aria-label="Close keyboard shortcuts help"
          >
            ×
          </button>
        </header>

        <div className="keyboard-help-content">
          <p id="keyboard-help-description" className="keyboard-help-intro">
            Use these keyboard shortcuts to navigate and control the Gait Monitor application
            efficiently.
          </p>

          <div className="keyboard-help-sections">
            {Object.entries(groupedShortcuts).map(([category, categoryShortcuts]) => (
              <section key={category} className="keyboard-help-section">
                <h3 className="keyboard-help-category">{category}</h3>
                <dl className="keyboard-shortcuts-list">
                  {categoryShortcuts.map((shortcut, index) => (
                    <div key={`${category}-${index}`} className="keyboard-shortcut-item">
                      <dt className="keyboard-shortcut-keys">
                        <kbd className="keyboard-shortcut-key">{formatShortcut(shortcut)}</kbd>
                      </dt>
                      <dd className="keyboard-shortcut-description">{shortcut.description}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <div className="keyboard-help-footer">
            <p className="keyboard-help-tip">
              <strong>Tip:</strong> Press <kbd>Escape</kbd> to close this dialog, or <kbd>?</kbd> /{' '}
              <kbd>F1</kbd> to reopen it.
            </p>
          </div>
        </div>

        <footer className="keyboard-help-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  )
}

export default KeyboardHelpDialog
