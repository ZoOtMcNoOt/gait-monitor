/**
 * Custom hook for managing keyboard shortcuts and navigation
 * Part of A3.5: Keyboard Navigation Improvements
 */

import { useEffect, useCallback, useRef } from 'react'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  description: string
  action: () => void
  category?: string
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[]
  enabled?: boolean
  preventDefault?: boolean
}

/**
 * Hook for managing keyboard shortcuts with proper cleanup and conflict resolution
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
  preventDefault = true,
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef<KeyboardShortcut[]>([])

  // Update shortcuts ref when shortcuts change
  useEffect(() => {
    // Filter out any invalid shortcuts
    const validShortcuts = shortcuts.filter((shortcut) => {
      if (!shortcut || !shortcut.key) {
        console.warn('Filtering out invalid shortcut:', shortcut)
        return false
      }
      return true
    })

    shortcutsRef.current = validShortcuts
  }, [shortcuts])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      const { key, ctrlKey, altKey, shiftKey } = event

      // Filter out undefined, empty, or non-printable keys early
      if (!key || key === 'Unidentified' || key.length === 0) {
        return
      }

      // Skip modifier-only key events (performance optimization)
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        return
      }

      // Early exit if no shortcuts to check (performance optimization)
      if (shortcutsRef.current.length === 0) {
        return
      }

      // Find matching shortcut with optimized comparison
      const matchingShortcut = shortcutsRef.current.find((shortcut) => {
        // Safety check: ensure shortcut and key are defined
        if (!shortcut?.key) {
          return false
        }

        // Case-insensitive key comparison with early exit
        if (shortcut.key.toLowerCase() !== key.toLowerCase()) {
          return false
        }

        // Modifier key matching
        return (
          !!shortcut.ctrl === ctrlKey && !!shortcut.alt === altKey && !!shortcut.shift === shiftKey
        )
      })

      if (matchingShortcut) {
        if (preventDefault) {
          event.preventDefault()
          event.stopPropagation()
        }

        try {
          matchingShortcut.action()
        } catch (error) {
          console.error('Error executing keyboard shortcut:', error)
        }
      }
    },
    [enabled, preventDefault],
  )

  useEffect(() => {
    // Only add listener if we have shortcuts and are enabled
    if (!enabled || shortcutsRef.current.length === 0) {
      return
    }

    document.addEventListener('keydown', handleKeyDown, {
      capture: true,
      passive: false, // Cannot be passive since we may preventDefault
    })

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [handleKeyDown, enabled])

  return {
    shortcuts: shortcuts,
  }
}

/**
 * Hook for managing focus trap within a container (useful for modals)
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  isActive: boolean = true,
) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return

    const container = containerRef.current
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )

    const firstElement = focusableElements[0] as HTMLElement
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        // Shift + Tab (backward)
        if (document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        }
      } else {
        // Tab (forward)
        if (document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    container.addEventListener('keydown', handleTabKey)

    // Focus first element when trap becomes active
    if (firstElement) {
      firstElement.focus()
    }

    return () => {
      container.removeEventListener('keydown', handleTabKey)
    }
  }, [containerRef, isActive])
}

/**
 * Hook for managing tab order and focus navigation
 */
export function useTabNavigation() {
  const focusNext = useCallback(() => {
    const focusableElements = Array.from(
      document.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ) as HTMLElement[]

    const currentIndex = focusableElements.findIndex((el) => el === document.activeElement)
    const nextIndex = (currentIndex + 1) % focusableElements.length
    focusableElements[nextIndex]?.focus()
  }, [])

  const focusPrevious = useCallback(() => {
    const focusableElements = Array.from(
      document.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ) as HTMLElement[]

    const currentIndex = focusableElements.findIndex((el) => el === document.activeElement)
    const previousIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1
    focusableElements[previousIndex]?.focus()
  }, [])

  const focusFirst = useCallback(() => {
    const firstFocusable = document.querySelector(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) as HTMLElement
    firstFocusable?.focus()
  }, [])

  const focusMain = useCallback(() => {
    const mainContent = document.querySelector('#main-content') as HTMLElement
    if (mainContent) {
      mainContent.setAttribute('tabindex', '-1')
      mainContent.focus()
      // Remove tabindex after focus to not interfere with normal tab order
      setTimeout(() => mainContent.removeAttribute('tabindex'), 100)
    }
  }, [])

  return {
    focusNext,
    focusPrevious,
    focusFirst,
    focusMain,
  }
}

/**
 * Common keyboard shortcuts for the application
 */
export function createCommonShortcuts(
  onPageChange: (page: 'connect' | 'collect' | 'logs' | 'settings') => void,
  onToggleDarkMode?: () => void,
  onOpenHelp?: () => void,
): KeyboardShortcut[] {
  return [
    // Navigation shortcuts
    {
      key: '1',
      ctrl: true,
      description: 'Navigate to Connect tab',
      category: 'Navigation',
      action: () => onPageChange('connect'),
    },
    {
      key: '2',
      ctrl: true,
      description: 'Navigate to Collect tab',
      category: 'Navigation',
      action: () => onPageChange('collect'),
    },
    {
      key: '3',
      ctrl: true,
      description: 'Navigate to Logs tab',
      category: 'Navigation',
      action: () => onPageChange('logs'),
    },
    {
      key: '4',
      ctrl: true,
      description: 'Navigate to Settings tab',
      category: 'Navigation',
      action: () => onPageChange('settings'),
    },

    // Application shortcuts
    {
      key: 'd',
      ctrl: true,
      shift: true,
      description: 'Toggle dark mode',
      category: 'Appearance',
      action: () => onToggleDarkMode?.(),
    },
    {
      key: '?',
      shift: true,
      description: 'Show keyboard shortcuts help',
      category: 'Help',
      action: () => onOpenHelp?.(),
    },
    {
      key: 'F1',
      description: 'Show keyboard shortcuts help',
      category: 'Help',
      action: () => onOpenHelp?.(),
    },
  ]
}
