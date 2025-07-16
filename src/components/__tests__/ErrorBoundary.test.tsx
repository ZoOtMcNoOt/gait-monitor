import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ErrorBoundary from '../ErrorBoundary';

// Component that throws an error for testing
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return React.createElement('div', { 'data-testid': 'success' }, 'No error');
}

describe('ErrorBoundary', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    
    // Mock console.error to avoid noise in test output
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    consoleErrorSpy.mockRestore();
  });

  const renderWithErrorBoundary = (children: React.ReactElement, fallback?: React.ReactNode) => {
    try {
      flushSync(() => {
        root.render(
          React.createElement(ErrorBoundary, { children, fallback })
        );
      });
    } catch {
      // Expected for error cases
    }
    return new Promise(resolve => setTimeout(resolve, 0));
  };

  test('renders children when no error occurs', async () => {
    await renderWithErrorBoundary(
      React.createElement(ThrowError, { shouldThrow: false })
    );
    
    expect(container.textContent).toContain('No error');
  });

  test('renders default error UI when error occurs', async () => {
    await renderWithErrorBoundary(
      React.createElement(ThrowError, { shouldThrow: true })
    );
    
    expect(container.textContent).toContain('Something went wrong');
    expect(container.textContent).toContain('An unexpected error occurred in this part of the application.');
  });

  test('renders custom fallback when provided', async () => {
    const customFallback = React.createElement('div', { 'data-testid': 'custom-fallback' }, 'Custom Error Message');
    
    await renderWithErrorBoundary(
      React.createElement(ThrowError, { shouldThrow: true }),
      customFallback
    );
    
    expect(container.textContent).toContain('Custom Error Message');
    expect(container.textContent).not.toContain('Something went wrong');
  });

  test('displays error details in default UI', async () => {
    await renderWithErrorBoundary(
      React.createElement(ThrowError, { shouldThrow: true })
    );
    
    const details = container.querySelector('details');
    const summary = container.querySelector('summary');
    const errorMessage = container.querySelector('pre');
    
    expect(details).toBeTruthy();
    expect(summary?.textContent).toBe('Error details');
    expect(errorMessage?.textContent).toContain('Test error');
  });

  test('has try again button in default UI', async () => {
    await renderWithErrorBoundary(
      React.createElement(ThrowError, { shouldThrow: true })
    );
    
    const buttons = container.querySelectorAll('button');
    const tryAgainButton = Array.from(buttons).find(btn => btn.textContent === 'Try again');
    
    expect(tryAgainButton).toBeTruthy();
  });

  test('has reload page button in default UI', async () => {
    await renderWithErrorBoundary(
      React.createElement(ThrowError, { shouldThrow: true })
    );
    
    const buttons = container.querySelectorAll('button');
    const reloadButton = Array.from(buttons).find(btn => btn.textContent === 'Reload page');
    
    expect(reloadButton).toBeTruthy();
  });

  test('try again button resets error state', async () => {
    await renderWithErrorBoundary(
      React.createElement(ThrowError, { shouldThrow: true })
    );
    
    // Should show error state
    expect(container.textContent).toContain('Something went wrong');
    
    const buttons = container.querySelectorAll('button');
    const tryAgainButton = Array.from(buttons).find(btn => btn.textContent === 'Try again');
    
    // Click try again
    tryAgainButton?.click();
    
    // Re-render with no error
    await renderWithErrorBoundary(
      React.createElement(ThrowError, { shouldThrow: false })
    );
    
    expect(container.textContent).toContain('No error');
  });

  test('calls console.error when error occurs', async () => {
    await renderWithErrorBoundary(
      React.createElement(ThrowError, { shouldThrow: true })
    );
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error boundary caught an error:',
      expect.any(Error),
      expect.any(Object)
    );
  });

  test('has correct CSS classes in default UI', async () => {
    await renderWithErrorBoundary(
      React.createElement(ThrowError, { shouldThrow: true })
    );
    
    const errorBoundary = container.querySelector('.error-boundary');
    const errorContent = container.querySelector('.error-boundary-content');
    
    expect(errorBoundary).toBeTruthy();
    expect(errorContent).toBeTruthy();
  });

  test('displays error stack trace', async () => {
    await renderWithErrorBoundary(
      React.createElement(ThrowError, { shouldThrow: true })
    );
    
    const preElements = container.querySelectorAll('pre');
    // Should have at least 2 pre elements: message and stack
    expect(preElements.length).toBeGreaterThanOrEqual(2);
  });
});
