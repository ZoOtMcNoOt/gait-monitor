/**
 * Test file for useScroll hook
 * Tests to improve coverage from 87.5% to 95%+
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useScroll } from '../useScroll';
import ScrollContext from '../../contexts/ScrollContext';
import type { ScrollContextType } from '../../contexts/ScrollContext';

// Mock scroll context value
const mockScrollContextValue: ScrollContextType = {
  registerScrollable: jest.fn(),
  unregisterScrollable: jest.fn(),
  scrollAllToTop: jest.fn(),
  scrollToTop: jest.fn(),
};

// Test component that uses the hook successfully
function TestScrollComponent({ 
  onHookReady
}: { 
  onHookReady: (hook: ReturnType<typeof useScroll>) => void;
}) {
  const hook = useScroll();
  
  React.useEffect(() => {
    onHookReady(hook);
  }, [hook, onHookReady]);
  
  return React.createElement('div', { 'data-testid': 'test-component' }, 'Test Component');
}

describe('useScroll', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      flushSync(() => {
        root.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  test('returns scroll context when used within ScrollProvider', (done) => {
    flushSync(() => {
      root.render(
        React.createElement(
          ScrollContext.Provider,
          { value: mockScrollContextValue },
          React.createElement(TestScrollComponent, {
            onHookReady: (hook) => {
              expect(hook).toEqual(mockScrollContextValue);
              expect(hook.registerScrollable).toBe(mockScrollContextValue.registerScrollable);
              expect(hook.unregisterScrollable).toBe(mockScrollContextValue.unregisterScrollable);
              expect(hook.scrollAllToTop).toBe(mockScrollContextValue.scrollAllToTop);
              expect(hook.scrollToTop).toBe(mockScrollContextValue.scrollToTop);
              done();
            }
          })
        )
      );
    });
  });

  test('can call scroll methods from context', (done) => {
    flushSync(() => {
      root.render(
        React.createElement(
          ScrollContext.Provider,
          { value: mockScrollContextValue },
          React.createElement(TestScrollComponent, {
            onHookReady: (hook) => {
              // Test that we can call the methods
              hook.registerScrollable('test', document.createElement('div'));
              hook.unregisterScrollable('test');
              hook.scrollAllToTop();
              hook.scrollToTop('test');
              
              expect(mockScrollContextValue.registerScrollable).toHaveBeenCalledWith('test', expect.any(HTMLDivElement));
              expect(mockScrollContextValue.unregisterScrollable).toHaveBeenCalledWith('test');
              expect(mockScrollContextValue.scrollAllToTop).toHaveBeenCalled();
              expect(mockScrollContextValue.scrollToTop).toHaveBeenCalledWith('test');
              done();
            }
          })
        )
      );
    });
  });

  test('provides access to all context methods', (done) => {
    flushSync(() => {
      root.render(
        React.createElement(
          ScrollContext.Provider,
          { value: mockScrollContextValue },
          React.createElement(TestScrollComponent, {
            onHookReady: (hook) => {
              expect(typeof hook.registerScrollable).toBe('function');
              expect(typeof hook.unregisterScrollable).toBe('function');
              expect(typeof hook.scrollAllToTop).toBe('function');
              expect(typeof hook.scrollToTop).toBe('function');
              done();
            }
          })
        )
      );
    });
  });

  test('maintains referential equality with context value', (done) => {
    flushSync(() => {
      root.render(
        React.createElement(
          ScrollContext.Provider,
          { value: mockScrollContextValue },
          React.createElement(TestScrollComponent, {
            onHookReady: (hook) => {
              // The hook should return exactly the same object reference as the context
              expect(hook).toBe(mockScrollContextValue);
              done();
            }
          })
        )
      );
    });
  });

  test('throws error when context is undefined', () => {
    // Mock React.useContext to return undefined
    const originalUseContext = React.useContext;
    const mockUseContext = jest.fn().mockReturnValue(undefined);
    React.useContext = mockUseContext;

    try {
      // This should throw an error when called
      expect(() => {
        useScroll();
      }).toThrow('useScroll must be used within a ScrollProvider');

      // Verify useContext was called with ScrollContext
      expect(mockUseContext).toHaveBeenCalledWith(ScrollContext);
    } finally {
      // Restore original useContext
      React.useContext = originalUseContext;
    }
  });
});
