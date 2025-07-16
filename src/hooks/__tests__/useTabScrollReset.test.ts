import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ScrollProvider } from '../../contexts/ScrollContext';
import { useTabScrollReset } from '../useTabScrollReset';

// Mock the useScroll hook
const mockScrollAllToTop = jest.fn();
jest.mock('../useScroll', () => ({
  useScroll: () => ({
    scrollAllToTop: mockScrollAllToTop,
  })
}));

// Test component that uses the hook
function TestComponent({ dependencies, delay }: { dependencies: unknown[]; delay?: number }) {
  useTabScrollReset(dependencies, delay);
  return React.createElement('div', { 'data-testid': 'test-component' }, 'Test Component');
}

describe('useTabScrollReset', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    try {
      root.unmount();
    } catch {
      // Ignore unmount errors in tests
    }
    container.remove();
  });

  const renderWithProvider = (dependencies: unknown[], delay?: number) => {
    flushSync(() => {
      root.render(
        React.createElement(ScrollProvider, {
          children: React.createElement(TestComponent, { dependencies, delay })
        })
      );
    });
    return new Promise(resolve => setTimeout(resolve, 0));
  };

  test('calls scrollAllToTop immediately on mount', async () => {
    await renderWithProvider(['tab1']);
    
    expect(mockScrollAllToTop).toHaveBeenCalled();
  });

  test('renders test component correctly', async () => {
    await renderWithProvider(['tab1']);
    
    expect(container.textContent).toContain('Test Component');
  });

  test('calls scrollAllToTop when dependencies change', async () => {
    await renderWithProvider(['tab1']);
    
    mockScrollAllToTop.mockClear();
    
    // Re-render with different dependencies
    await renderWithProvider(['tab2']);
    
    expect(mockScrollAllToTop).toHaveBeenCalled();
  });

  test('accepts custom delay parameter', async () => {
    const customDelay = 100;
    await renderWithProvider(['tab1'], customDelay);
    
    // Should still call immediately regardless of delay
    expect(mockScrollAllToTop).toHaveBeenCalled();
  });

  test('works with multiple dependency values', async () => {
    await renderWithProvider(['tab1', 'section2', { id: 1 }]);
    
    expect(mockScrollAllToTop).toHaveBeenCalled();
  });

  test('works with empty dependencies array', async () => {
    await renderWithProvider([]);
    
    expect(mockScrollAllToTop).toHaveBeenCalled();
  });
});
