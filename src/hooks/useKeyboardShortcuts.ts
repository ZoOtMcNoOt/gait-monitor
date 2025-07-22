/**
 * Custom hook for managing keyboard shortcuts and navigation
 * Part of A3.5: Keyboard Navigation Improvements
 */

import { useEffect, useCallback, useRef } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  description: string;
  action: () => void;
  category?: string;
}

interface UseKeyboardShortcutsOptions {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
  preventDefault?: boolean;
}

/**
 * Hook for managing keyboard shortcuts with proper cleanup and conflict resolution
 */
export function useKeyboardShortcuts({
  shortcuts,
  enabled = true,
  preventDefault = true
}: UseKeyboardShortcutsOptions) {
  const shortcutsRef = useRef<KeyboardShortcut[]>([]);
  
  // Update shortcuts ref when shortcuts change
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    const { key, ctrlKey, altKey, shiftKey } = event;
    
    // Find matching shortcut
    const matchingShortcut = shortcutsRef.current.find(shortcut => {
      const keyMatches = shortcut.key.toLowerCase() === key.toLowerCase();
      const ctrlMatches = !!shortcut.ctrl === ctrlKey;
      const altMatches = !!shortcut.alt === altKey;
      const shiftMatches = !!shortcut.shift === shiftKey;
      
      return keyMatches && ctrlMatches && altMatches && shiftMatches;
    });

    if (matchingShortcut) {
      if (preventDefault) {
        event.preventDefault();
        event.stopPropagation();
      }
      
      try {
        matchingShortcut.action();
      } catch (error) {
        console.error('Error executing keyboard shortcut:', error);
      }
    }
  }, [enabled, preventDefault]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [handleKeyDown]);

  return {
    shortcuts: shortcuts
  };
}

/**
 * Hook for managing focus trap within a container (useful for modals)
 */
export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  isActive: boolean = true
) {
  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    const container = containerRef.current;
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab (backward)
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        // Tab (forward)
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTabKey);
    
    // Focus first element when trap becomes active
    if (firstElement) {
      firstElement.focus();
    }

    return () => {
      container.removeEventListener('keydown', handleTabKey);
    };
  }, [containerRef, isActive]);
}

/**
 * Hook for managing tab order and focus navigation
 */
export function useTabNavigation() {
  const focusNext = useCallback(() => {
    const focusableElements = Array.from(
      document.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
    ) as HTMLElement[];

    const currentIndex = focusableElements.findIndex(el => el === document.activeElement);
    const nextIndex = (currentIndex + 1) % focusableElements.length;
    focusableElements[nextIndex]?.focus();
  }, []);

  const focusPrevious = useCallback(() => {
    const focusableElements = Array.from(
      document.querySelectorAll(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      )
    ) as HTMLElement[];

    const currentIndex = focusableElements.findIndex(el => el === document.activeElement);
    const previousIndex = currentIndex <= 0 ? focusableElements.length - 1 : currentIndex - 1;
    focusableElements[previousIndex]?.focus();
  }, []);

  const focusFirst = useCallback(() => {
    const firstFocusable = document.querySelector(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    ) as HTMLElement;
    firstFocusable?.focus();
  }, []);

  const focusMain = useCallback(() => {
    const mainContent = document.querySelector('#main-content') as HTMLElement;
    if (mainContent) {
      mainContent.setAttribute('tabindex', '-1');
      mainContent.focus();
      // Remove tabindex after focus to not interfere with normal tab order
      setTimeout(() => mainContent.removeAttribute('tabindex'), 100);
    }
  }, []);

  return {
    focusNext,
    focusPrevious,
    focusFirst,
    focusMain
  };
}

/**
 * Common keyboard shortcuts for the application
 */
export function createCommonShortcuts(
  onPageChange: (page: 'connect' | 'collect' | 'logs' | 'settings') => void,
  onToggleDarkMode?: () => void,
  onOpenHelp?: () => void
): KeyboardShortcut[] {
  return [
    // Navigation shortcuts
    {
      key: '1',
      ctrl: true,
      description: 'Navigate to Connect tab',
      category: 'Navigation',
      action: () => onPageChange('connect')
    },
    {
      key: '2',
      ctrl: true,
      description: 'Navigate to Collect tab',
      category: 'Navigation',
      action: () => onPageChange('collect')
    },
    {
      key: '3',
      ctrl: true,
      description: 'Navigate to Logs tab',
      category: 'Navigation',
      action: () => onPageChange('logs')
    },
    {
      key: '4',
      ctrl: true,
      description: 'Navigate to Settings tab',
      category: 'Navigation',
      action: () => onPageChange('settings')
    },
    
    // Application shortcuts
    {
      key: 'd',
      ctrl: true,
      shift: true,
      description: 'Toggle dark mode',
      category: 'Appearance',
      action: () => onToggleDarkMode?.()
    },
    {
      key: '?',
      shift: true,
      description: 'Show keyboard shortcuts help',
      category: 'Help',
      action: () => onOpenHelp?.()
    },
    {
      key: 'F1',
      description: 'Show keyboard shortcuts help',
      category: 'Help',
      action: () => onOpenHelp?.()
    }
  ];
}
