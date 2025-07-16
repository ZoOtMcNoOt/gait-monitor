import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useConfirmation, type ConfirmationOptions } from '../useConfirmation';

// Test component that uses the hook
function TestComponent({ onHookReady }: { onHookReady: (hook: ReturnType<typeof useConfirmation>) => void }) {
  const hook = useConfirmation();
  
  React.useEffect(() => {
    onHookReady(hook);
  }, [hook, onHookReady]);
  
  return React.createElement('div', { 'data-testid': 'test-component' }, 'Test Component');
}

describe('useConfirmation', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let hookResult: ReturnType<typeof useConfirmation> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    hookResult = null;
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

  const renderHook = () => {
    flushSync(() => {
      root.render(React.createElement(TestComponent, {
        onHookReady: (hook) => {
          hookResult = hook;
        }
      }));
    });
  };

  test('should initialize with closed state', () => {
    renderHook();
    
    expect(hookResult?.confirmationState.isOpen).toBe(false);
    expect(hookResult?.confirmationState.title).toBe('');
    expect(hookResult?.confirmationState.message).toBe('');
    expect(typeof hookResult?.confirmationState.onConfirm).toBe('function');
    expect(typeof hookResult?.confirmationState.onCancel).toBe('function');
  });

  test('should show confirmation with basic options', () => {
    renderHook();
    
    const options: ConfirmationOptions = {
      title: 'Delete Item',
      message: 'Are you sure you want to delete this item?'
    };

    flushSync(() => {
      hookResult?.showConfirmation(options);
    });

    expect(hookResult?.confirmationState.isOpen).toBe(true);
    expect(hookResult?.confirmationState.title).toBe('Delete Item');
    expect(hookResult?.confirmationState.message).toBe('Are you sure you want to delete this item?');
    expect(hookResult?.confirmationState.confirmText).toBeUndefined();
    expect(hookResult?.confirmationState.cancelText).toBeUndefined();
    expect(hookResult?.confirmationState.type).toBeUndefined();
  });

  test('should show confirmation with all options', () => {
    renderHook();
    
    const options: ConfirmationOptions = {
      title: 'Warning',
      message: 'This action cannot be undone',
      confirmText: 'Yes, Delete',
      cancelText: 'Keep It',
      type: 'danger'
    };

    flushSync(() => {
      hookResult?.showConfirmation(options);
    });

    expect(hookResult?.confirmationState.isOpen).toBe(true);
    expect(hookResult?.confirmationState.title).toBe('Warning');
    expect(hookResult?.confirmationState.message).toBe('This action cannot be undone');
    expect(hookResult?.confirmationState.confirmText).toBe('Yes, Delete');
    expect(hookResult?.confirmationState.cancelText).toBe('Keep It');
    expect(hookResult?.confirmationState.type).toBe('danger');
  });

  test('should resolve true when onConfirm is called', async () => {
    renderHook();
    
    const options: ConfirmationOptions = {
      title: 'Confirm',
      message: 'Proceed?'
    };

    let promiseResult: boolean | undefined;
    
    flushSync(() => {
      hookResult?.showConfirmation(options).then((res: boolean) => {
        promiseResult = res;
      });
    });

    expect(hookResult?.confirmationState.isOpen).toBe(true);

    // Call onConfirm
    flushSync(() => {
      hookResult?.confirmationState.onConfirm();
    });

    expect(hookResult?.confirmationState.isOpen).toBe(false);
    
    // Wait for promise to resolve
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(promiseResult).toBe(true);
  });

  test('should resolve false when onCancel is called', async () => {
    renderHook();
    
    const options: ConfirmationOptions = {
      title: 'Confirm',
      message: 'Proceed?'
    };

    let promiseResult: boolean | undefined;
    
    flushSync(() => {
      hookResult?.showConfirmation(options).then((res: boolean) => {
        promiseResult = res;
      });
    });

    expect(hookResult?.confirmationState.isOpen).toBe(true);

    // Call onCancel
    flushSync(() => {
      hookResult?.confirmationState.onCancel();
    });

    expect(hookResult?.confirmationState.isOpen).toBe(false);
    
    // Wait for promise to resolve
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(promiseResult).toBe(false);
  });

  test('should close confirmation when closeConfirmation is called', () => {
    renderHook();
    
    const options: ConfirmationOptions = {
      title: 'Test',
      message: 'Test message'
    };

    flushSync(() => {
      hookResult?.showConfirmation(options);
    });

    expect(hookResult?.confirmationState.isOpen).toBe(true);

    flushSync(() => {
      hookResult?.closeConfirmation();
    });

    expect(hookResult?.confirmationState.isOpen).toBe(false);
  });

  test('should handle multiple confirmation calls', () => {
    renderHook();
    
    const options1: ConfirmationOptions = {
      title: 'First',
      message: 'First message'
    };

    const options2: ConfirmationOptions = {
      title: 'Second', 
      message: 'Second message',
      type: 'warning'
    };

    // Show first confirmation
    flushSync(() => {
      hookResult?.showConfirmation(options1);
    });

    expect(hookResult?.confirmationState.title).toBe('First');

    // Show second confirmation (should replace first)
    flushSync(() => {
      hookResult?.showConfirmation(options2);
    });

    expect(hookResult?.confirmationState.title).toBe('Second');
    expect(hookResult?.confirmationState.message).toBe('Second message');
    expect(hookResult?.confirmationState.type).toBe('warning');
    expect(hookResult?.confirmationState.isOpen).toBe(true);
  });

  test('should handle different confirmation types', () => {
    renderHook();
    
    const types: Array<'warning' | 'danger' | 'info'> = ['warning', 'danger', 'info'];

    types.forEach(type => {
      const options: ConfirmationOptions = {
        title: `${type} title`,
        message: `${type} message`,
        type
      };

      flushSync(() => {
        hookResult?.showConfirmation(options);
      });

      expect(hookResult?.confirmationState.type).toBe(type);
    });
  });
});
