/**
 * Test file for A3.5: Keyboard Navigation Improvements
 * Tests keyboard shortcuts, focus management, and accessibility features
 */

import { createCommonShortcuts } from '../useKeyboardShortcuts';

// Mock functions for testing
const mockPageChange = jest.fn();
const mockToggleDarkMode = jest.fn();  
const mockOpenHelp = jest.fn();

describe('A3.5: Keyboard Navigation Improvements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Keyboard Shortcuts Creation', () => {
    test('creates common shortcuts with correct structure', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp);

      expect(shortcuts).toHaveLength(7); // 4 navigation + 2 dark mode + 1 help
      
      // Test navigation shortcuts structure
      expect(shortcuts[0]).toEqual(
        expect.objectContaining({
          key: '1',
          ctrl: true,
          description: 'Navigate to Connect tab',
          category: 'Navigation'
        })
      );

      expect(shortcuts[1]).toEqual(
        expect.objectContaining({
          key: '2',
          ctrl: true,
          description: 'Navigate to Collect tab',
          category: 'Navigation'
        })
      );

      // Test dark mode shortcut structure
      const darkModeShortcut = shortcuts.find(shortcut => shortcut.key === 'd');
      expect(darkModeShortcut).toEqual(
        expect.objectContaining({
          key: 'd',
          ctrl: true,
          shift: true,
          description: 'Toggle dark mode',
          category: 'Appearance'
        })
      );

      // Test help shortcuts
      const helpShortcuts = shortcuts.filter(shortcut => shortcut.category === 'Help');
      expect(helpShortcuts).toHaveLength(2); // ? and F1
    });

    test('shortcuts execute correct actions', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp);

      // Test navigation shortcut execution
      shortcuts[0].action(); // Ctrl+1 for Connect
      expect(mockPageChange).toHaveBeenCalledWith('connect');

      shortcuts[1].action(); // Ctrl+2 for Collect
      expect(mockPageChange).toHaveBeenCalledWith('collect');

      shortcuts[2].action(); // Ctrl+3 for Logs
      expect(mockPageChange).toHaveBeenCalledWith('logs');

      shortcuts[3].action(); // Ctrl+4 for Settings
      expect(mockPageChange).toHaveBeenCalledWith('settings');

      // Test dark mode shortcut execution
      const darkModeShortcut = shortcuts.find(shortcut => shortcut.key === 'd');
      darkModeShortcut?.action();
      expect(mockToggleDarkMode).toHaveBeenCalled();

      // Test help shortcut execution
      const helpShortcut = shortcuts.find(shortcut => shortcut.key === '?');
      helpShortcut?.action();
      expect(mockOpenHelp).toHaveBeenCalled();

      // Test F1 help shortcut
      const f1Shortcut = shortcuts.find(shortcut => shortcut.key === 'F1');
      f1Shortcut?.action();
      expect(mockOpenHelp).toHaveBeenCalledTimes(2); // Called twice now
    });

    test('shortcuts have correct key combinations', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp);

      // Navigation shortcuts should use Ctrl
      const navigationShortcuts = shortcuts.filter(shortcut => shortcut.category === 'Navigation');
      navigationShortcuts.forEach(shortcut => {
        expect(shortcut.ctrl).toBe(true);
        expect(shortcut.alt).toBeUndefined();
        expect(shortcut.shift).toBeUndefined();
      });

      // Dark mode should use Ctrl+Shift
      const darkModeShortcut = shortcuts.find(shortcut => shortcut.key === 'd');
      expect(darkModeShortcut?.ctrl).toBe(true);
      expect(darkModeShortcut?.shift).toBe(true);

      // Help shortcuts
      const questionShortcut = shortcuts.find(shortcut => shortcut.key === '?');
      expect(questionShortcut?.shift).toBe(true);
      expect(questionShortcut?.ctrl).toBeUndefined();

      const f1Shortcut = shortcuts.find(shortcut => shortcut.key === 'F1');
      expect(f1Shortcut?.ctrl).toBeUndefined();
      expect(f1Shortcut?.shift).toBeUndefined();
      expect(f1Shortcut?.alt).toBeUndefined();
    });

    test('all shortcuts have required properties', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp);

      shortcuts.forEach(shortcut => {
        expect(shortcut).toHaveProperty('key');
        expect(shortcut).toHaveProperty('description');
        expect(shortcut).toHaveProperty('action');
        expect(shortcut).toHaveProperty('category');
        expect(typeof shortcut.action).toBe('function');
        expect(typeof shortcut.description).toBe('string');
        expect(typeof shortcut.key).toBe('string');
      });
    });

    test('categories are properly assigned', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp);

      const categories = shortcuts.map(shortcut => shortcut.category);
      expect(categories).toContain('Navigation');
      expect(categories).toContain('Appearance');
      expect(categories).toContain('Help');

      // Count shortcuts per category
      const navigationCount = shortcuts.filter(s => s.category === 'Navigation').length;
      const appearanceCount = shortcuts.filter(s => s.category === 'Appearance').length;
      const helpCount = shortcuts.filter(s => s.category === 'Help').length;

      expect(navigationCount).toBe(4); // Ctrl+1,2,3,4
      expect(appearanceCount).toBe(1); // Ctrl+Shift+D
      expect(helpCount).toBe(2); // ? and F1
    });
  });

  describe('Keyboard Shortcut Functionality', () => {
    test('page navigation shortcuts work correctly', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp);

      const pages = ['connect', 'collect', 'logs', 'settings'] as const;
      const keys = ['1', '2', '3', '4'];

      keys.forEach((key, index) => {
        const shortcut = shortcuts.find(s => s.key === key && s.ctrl);
        expect(shortcut).toBeDefined();
        
        shortcut?.action();
        expect(mockPageChange).toHaveBeenCalledWith(pages[index]);
      });

      expect(mockPageChange).toHaveBeenCalledTimes(4);
    });

    test('handles optional callback parameters gracefully', () => {
      // Test with undefined callbacks
      const shortcutsWithoutCallbacks = createCommonShortcuts(mockPageChange);

      expect(shortcutsWithoutCallbacks).toHaveLength(7);

      // Dark mode shortcut should handle undefined callback
      const darkModeShortcut = shortcutsWithoutCallbacks.find(s => s.key === 'd');
      expect(() => darkModeShortcut?.action()).not.toThrow();

      // Help shortcut should handle undefined callback
      const helpShortcut = shortcutsWithoutCallbacks.find(s => s.key === '?');
      expect(() => helpShortcut?.action()).not.toThrow();
    });
  });

  describe('Keyboard Shortcut Descriptions', () => {
    test('descriptions are user-friendly and descriptive', () => {
      const shortcuts = createCommonShortcuts(mockPageChange, mockToggleDarkMode, mockOpenHelp);

      const descriptions = shortcuts.map(s => s.description);

      expect(descriptions).toContain('Navigate to Connect tab');
      expect(descriptions).toContain('Navigate to Collect tab');
      expect(descriptions).toContain('Navigate to Logs tab');
      expect(descriptions).toContain('Navigate to Settings tab');
      expect(descriptions).toContain('Toggle dark mode');
      expect(descriptions).toContain('Show keyboard shortcuts help');

      // All descriptions should be non-empty strings
      descriptions.forEach(description => {
        expect(description).toBeTruthy();
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(0);
      });
    });
  });
});
