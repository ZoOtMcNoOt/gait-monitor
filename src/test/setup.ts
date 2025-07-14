// Jest setup for DOM testing
// Using standard Jest with jsdom environment

// Add custom matchers to replace testing-library functionality
expect.extend({
  toBeInTheDocument(received: Element | null) {
    const pass = received !== null && document.body.contains(received)
    return {
      pass,
      message: () => pass 
        ? `Expected element not to be in the document`
        : `Expected element to be in the document`
    }
  },
  toHaveClass(received: Element | null, className: string) {
    const pass = received?.classList.contains(className) || false
    return {
      pass,
      message: () => pass
        ? `Expected element not to have class "${className}"`
        : `Expected element to have class "${className}"`
    }
  }
})

// Mock import.meta.env for Vite environment variables
const mockImportMeta = {
  env: {
    VITE_APP_MODE: 'development',
    VITE_DEBUG_ENABLED: 'true',
    VITE_DEBUG_DEVICES: 'true',
    VITE_DEBUG_CHARTS: 'false',
    VITE_MAX_CHART_POINTS: '1000',
    VITE_DATA_UPDATE_INTERVAL: '100',
    VITE_HEARTBEAT_TIMEOUT: '10000',
    VITE_CONNECTION_TIMEOUT: '30000',
    VITE_MAX_DEVICE_BUFFER_POINTS: '500',
    VITE_MAX_DEVICE_DATASETS: '12',
    VITE_MEMORY_THRESHOLD_MB: '50',
    VITE_BUFFER_CLEANUP_INTERVAL: '5000',
    VITE_SLIDING_WINDOW_SECONDS: '10',
    VITE_ENABLE_CIRCULAR_BUFFERS: 'true',
    VITE_DEFAULT_THEME: 'auto',
    VITE_ANIMATIONS_ENABLED: 'true',
    VITE_CHART_SMOOTHING: '0.3',
    VITE_TOAST_DURATION: '5000',
    VITE_DATA_RETENTION_DAYS: '30',
    VITE_AUTO_SAVE_ENABLED: 'true',
    VITE_AUTO_SAVE_INTERVAL: '60000',
    VITE_MAX_EXPORT_SIZE: '100',
    VITE_PERFORMANCE_MONITORING: 'true',
    VITE_MAX_CONCURRENT_DEVICES: '10',
    VITE_CHART_RENDER_THROTTLE: '16',
    VITE_ENABLE_MOCK_DATA: 'false',
    VITE_MOCK_DEVICE_COUNT: '2',
    VITE_REACT_DEV_TOOLS: 'true',
    VITE_HOT_RELOAD: 'true',
  }
}

// Mock import.meta globally
Object.defineProperty(global, 'import', {
  value: {
    meta: mockImportMeta
  },
  writable: true,
  configurable: true
})

// Mock the ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Mock the IntersectionObserver  
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Mock Chart.js canvas rendering
HTMLCanvasElement.prototype.getContext = jest.fn().mockReturnValue({
  fillRect: jest.fn(),
  clearRect: jest.fn(),
  getImageData: jest.fn(() => ({ data: new Array(4) })),
  putImageData: jest.fn(),
  createImageData: jest.fn(() => ({ data: new Array(4) })),
  setTransform: jest.fn(),
  drawImage: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  closePath: jest.fn(),
  stroke: jest.fn(),
  fill: jest.fn(),
  scale: jest.fn(),
  rotate: jest.fn(),
  translate: jest.fn(),
  clip: jest.fn(),
  measureText: jest.fn(() => ({ width: 0 })),
  isPointInPath: jest.fn(),
})

// Mock localStorage
const localStorageMock: Storage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  length: 0,
  key: jest.fn(() => null),
}
global.localStorage = localStorageMock

// Mock console.log to reduce test output noise
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}

// Set up cleanup after each test
afterEach(() => {
  jest.clearAllMocks()
  localStorageMock.clear()
})
