/**
 * Test file for useTimestampManager hook
 * Comprehensive tests to improve coverage from 14.58% to 90%+
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useTimestampManager, useTimestampFormatter } from '../useTimestampManager';
import { TimestampManager } from '../../utils/TimestampManager';

// Mock the TimestampManager
jest.mock('../../utils/TimestampManager', () => {
  const mockManager = {
    setBaseTimestamp: jest.fn(),
    normalizeTimestamp: jest.fn(),
    getChartTimestamp: jest.fn(),
    formatTimestamp: jest.fn(),
    getTimeDifference: jest.fn(),
    getCacheStats: jest.fn(),
    clearCache: jest.fn(),
  };

  return {
    TimestampManager: jest.fn(() => mockManager),
  };
});

// Add getInstance static method to the mock
const MockedTimestampManager = TimestampManager as jest.MockedClass<typeof TimestampManager>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(MockedTimestampManager as any).getInstance = jest.fn(() => new MockedTimestampManager());

// Test component for useTimestampManager
function TestTimestampManagerComponent({ 
  options = {}, 
  onHookReady 
}: { 
  options?: Parameters<typeof useTimestampManager>[0];
  onHookReady: (hook: ReturnType<typeof useTimestampManager>) => void;
}) {
  const hook = useTimestampManager(options);
  
  React.useEffect(() => {
    onHookReady(hook);
  }, [hook, onHookReady]);
  
  return React.createElement('div', { 'data-testid': 'test-component' }, 'Test Component');
}

// Test component for useTimestampFormatter
function TestTimestampFormatterComponent({ 
  onHookReady 
}: { 
  onHookReady: (hook: ReturnType<typeof useTimestampFormatter>) => void;
}) {
  const hook = useTimestampFormatter();
  
  React.useEffect(() => {
    onHookReady(hook);
  }, [hook, onHookReady]);
  
  return React.createElement('div', { 'data-testid': 'test-component' }, 'Test Component');
}

describe('useTimestampManager', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    
    // Get the mock manager instance
    mockManager = new MockedTimestampManager();
    
    // Reset the mock methods
    mockManager.setBaseTimestamp.mockClear();
    mockManager.normalizeTimestamp.mockClear();
    mockManager.getChartTimestamp.mockClear();
    mockManager.formatTimestamp.mockClear();
    mockManager.getTimeDifference.mockClear();
    mockManager.getCacheStats.mockClear();
    mockManager.clearCache.mockClear();
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

  describe('default behavior with global instance', () => {
    test('uses global instance by default', (done) => {
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          onHookReady: (hook) => {
            expect(MockedTimestampManager.getInstance).toHaveBeenCalled();
            expect(hook.manager).toBeDefined();
            done();
          }
        }));
      });
    });

    test('returns all expected methods', (done) => {
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          onHookReady: (hook) => {
            expect(hook).toHaveProperty('manager');
            expect(hook).toHaveProperty('setBaseTimestamp');
            expect(hook).toHaveProperty('normalizeTimestamp');
            expect(hook).toHaveProperty('getChartTimestamp');
            expect(hook).toHaveProperty('formatTimestamp');
            expect(hook).toHaveProperty('getTimeDifference');
            expect(hook).toHaveProperty('getCacheStats');
            expect(hook).toHaveProperty('clearCache');
            done();
          }
        }));
      });
    });
  });

  describe('with custom options', () => {
    test('creates new instance when useGlobalInstance is false', (done) => {
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          options: { useGlobalInstance: false },
          onHookReady: (hook) => {
            expect(hook.manager).toBeDefined();
            done();
          }
        }));
      });
    });

    test('passes timestamp config to manager', (done) => {
      const config = {
        useGlobalInstance: true,
        useRelativeTime: true,
        cacheSize: 500,
      };

      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          options: config,
          onHookReady: (hook) => {
            expect(MockedTimestampManager.getInstance).toHaveBeenCalledWith({
              useRelativeTime: true,
              cacheSize: 500,
            });
            done();
          }
        }));
      });
    });
  });

  describe('hook methods', () => {
    test('setBaseTimestamp calls manager setBaseTimestamp', (done) => {
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          onHookReady: (hook) => {
            hook.setBaseTimestamp(1000);
            expect(mockManager.setBaseTimestamp).toHaveBeenCalledWith(1000);
            done();
          }
        }));
      });
    });

    test('normalizeTimestamp calls manager normalizeTimestamp', (done) => {
      const mockResult = { original: 1000, normalized: 500, relative: 0 };
      mockManager.normalizeTimestamp.mockReturnValue(mockResult);
      
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          onHookReady: (hook) => {
            const result = hook.normalizeTimestamp(1000);
            expect(mockManager.normalizeTimestamp).toHaveBeenCalledWith(1000);
            expect(result).toEqual(mockResult);
            done();
          }
        }));
      });
    });

    test('auto-sets base timestamp when autoSetBase is true', (done) => {
      const mockResult = { original: 1000, normalized: 500, relative: 0 };
      mockManager.normalizeTimestamp.mockReturnValue(mockResult);
      
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          options: { autoSetBase: true },
          onHookReady: (hook) => {
            hook.normalizeTimestamp(1000);
            expect(mockManager.setBaseTimestamp).toHaveBeenCalledWith(1000);
            expect(mockManager.normalizeTimestamp).toHaveBeenCalledWith(1000);
            done();
          }
        }));
      });
    });

    test('does not auto-set base timestamp when autoSetBase is false', (done) => {
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          options: { autoSetBase: false },
          onHookReady: (hook) => {
            hook.normalizeTimestamp(1000);
            expect(mockManager.setBaseTimestamp).not.toHaveBeenCalled();
            done();
          }
        }));
      });
    });

    test('getChartTimestamp calls manager getChartTimestamp', (done) => {
      mockManager.getChartTimestamp.mockReturnValue(500);
      
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          onHookReady: (hook) => {
            const result = hook.getChartTimestamp(1000);
            expect(mockManager.getChartTimestamp).toHaveBeenCalledWith(1000);
            expect(result).toBe(500);
            done();
          }
        }));
      });
    });

    test('formatTimestamp calls manager formatTimestamp with default format', (done) => {
      mockManager.formatTimestamp.mockReturnValue('1.00s');
      
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          onHookReady: (hook) => {
            const result = hook.formatTimestamp(1000);
            expect(mockManager.formatTimestamp).toHaveBeenCalledWith(1000, 'relative');
            expect(result).toBe('1.00s');
            done();
          }
        }));
      });
    });

    test('formatTimestamp calls manager formatTimestamp with specified format', (done) => {
      mockManager.formatTimestamp.mockReturnValue('12:00:01');
      
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          onHookReady: (hook) => {
            const result = hook.formatTimestamp(1000, 'absolute');
            expect(mockManager.formatTimestamp).toHaveBeenCalledWith(1000, 'absolute');
            expect(result).toBe('12:00:01');
            done();
          }
        }));
      });
    });

    test('getTimeDifference calls manager getTimeDifference', (done) => {
      mockManager.getTimeDifference.mockReturnValue(500);
      
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          onHookReady: (hook) => {
            const result = hook.getTimeDifference(1500, 1000);
            expect(mockManager.getTimeDifference).toHaveBeenCalledWith(1500, 1000);
            expect(result).toBe(500);
            done();
          }
        }));
      });
    });

    test('getCacheStats calls manager getCacheStats', (done) => {
      const mockStats = { size: 10, baseTimestamp: 1000, useRelativeTime: true };
      mockManager.getCacheStats.mockReturnValue(mockStats);
      
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          onHookReady: (hook) => {
            const result = hook.getCacheStats();
            expect(mockManager.getCacheStats).toHaveBeenCalled();
            expect(result).toEqual(mockStats);
            done();
          }
        }));
      });
    });

    test('clearCache calls manager clearCache', (done) => {
      flushSync(() => {
        root.render(React.createElement(TestTimestampManagerComponent, {
          onHookReady: (hook) => {
            hook.clearCache();
            expect(mockManager.clearCache).toHaveBeenCalled();
            done();
          }
        }));
      });
    });
  });
});

describe('useTimestampFormatter', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
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

  test('formatRelativeTime formats relative time correctly', (done) => {
    flushSync(() => {
      root.render(React.createElement(TestTimestampFormatterComponent, {
        onHookReady: (hook) => {
          const result = hook.formatRelativeTime(5000, 3000);
          expect(result).toBe('2.00s');
          done();
        }
      }));
    });
  });

  test('formatRelativeTime handles zero difference', (done) => {
    flushSync(() => {
      root.render(React.createElement(TestTimestampFormatterComponent, {
        onHookReady: (hook) => {
          const result = hook.formatRelativeTime(1000, 1000);
          expect(result).toBe('0.00s');
          done();
        }
      }));
    });
  });

  test('formatRelativeTime handles negative difference', (done) => {
    flushSync(() => {
      root.render(React.createElement(TestTimestampFormatterComponent, {
        onHookReady: (hook) => {
          const result = hook.formatRelativeTime(1000, 3000);
          expect(result).toBe('-2.00s');
          done();
        }
      }));
    });
  });

  test('formatAbsoluteTime formats absolute time correctly', (done) => {
    const mockToLocaleTimeString = jest.fn(() => '12:34:56');
    Date.prototype.toLocaleTimeString = mockToLocaleTimeString;
    
    flushSync(() => {
      root.render(React.createElement(TestTimestampFormatterComponent, {
        onHookReady: (hook) => {
          const result = hook.formatAbsoluteTime(1000);
          expect(result).toBe('12:34:56');
          expect(mockToLocaleTimeString).toHaveBeenCalled();
          done();
        }
      }));
    });
  });

  test('formatDuration formats duration in seconds only for short durations', (done) => {
    flushSync(() => {
      root.render(React.createElement(TestTimestampFormatterComponent, {
        onHookReady: (hook) => {
          const result = hook.formatDuration(3500, 1000);
          expect(result).toBe('2.5s');
          done();
        }
      }));
    });
  });

  test('formatDuration formats duration with minutes for longer durations', (done) => {
    flushSync(() => {
      root.render(React.createElement(TestTimestampFormatterComponent, {
        onHookReady: (hook) => {
          const result = hook.formatDuration(125000, 5000);
          expect(result).toBe('2m 0.0s');
          done();
        }
      }));
    });
  });

  test('formatDuration handles zero duration', (done) => {
    flushSync(() => {
      root.render(React.createElement(TestTimestampFormatterComponent, {
        onHookReady: (hook) => {
          const result = hook.formatDuration(1000, 1000);
          expect(result).toBe('0.0s');
          done();
        }
      }));
    });
  });
});
