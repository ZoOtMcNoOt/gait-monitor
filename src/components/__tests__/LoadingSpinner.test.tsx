import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import LoadingSpinner from '../LoadingSpinner';

describe('LoadingSpinner', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  const renderComponent = (props: Partial<{ size: 'small' | 'medium' | 'large'; message: string; className: string }> = {}) => {
    flushSync(() => {
      root.render(React.createElement(LoadingSpinner, props));
    });
    // Give React time to render
    return new Promise(resolve => setTimeout(resolve, 0));
  };

  test('renders with default props', async () => {
    await renderComponent();
    
    const spinner = container.querySelector('.spinner');
    expect(spinner).toBeTruthy();
    expect(spinner?.classList.contains('w-8')).toBe(true);
    expect(spinner?.classList.contains('h-8')).toBe(true);
  });

  test('renders with custom size', async () => {
    await renderComponent({ size: 'large' });
    
    const spinner = container.querySelector('.spinner');
    expect(spinner?.classList.contains('w-12')).toBe(true);
    expect(spinner?.classList.contains('h-12')).toBe(true);
  });

  test('renders with small size', async () => {
    await renderComponent({ size: 'small' });
    
    const spinner = container.querySelector('.spinner');
    expect(spinner?.classList.contains('w-4')).toBe(true);
    expect(spinner?.classList.contains('h-4')).toBe(true);
  });

  test('renders with message', async () => {
    const message = 'Loading data...';
    await renderComponent({ message });
    
    expect(container.textContent).toContain(message);
  });

  test('renders without message when not provided', async () => {
    await renderComponent();
    
    const messageElement = container.querySelector('.loading-message');
    expect(messageElement).toBeNull();
  });

  test('renders with custom className', async () => {
    const customClass = 'custom-loading-class';
    await renderComponent({ className: customClass });
    
    const containerElement = container.querySelector('.loading-spinner');
    expect(containerElement?.classList.contains(customClass)).toBe(true);
  });

  test('renders with both message and custom size', async () => {
    const message = 'Processing...';
    await renderComponent({ size: 'large', message });
    
    const spinner = container.querySelector('.spinner');
    expect(spinner?.classList.contains('w-12')).toBe(true);
    expect(spinner?.classList.contains('h-12')).toBe(true);
    expect(container.textContent).toContain(message);
  });
});
