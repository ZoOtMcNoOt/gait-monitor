// Jest configuration for coverage that doesn't mock config imports
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^.+\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@tauri-apps/api/(.*)$': '<rootDir>/src/test/mocks/tauri-$1.ts',
    // For coverage runs, don't redirect config imports - let them hit the real files
    // Only redirect non-config imports to mocks
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: 'tsconfig.test.json'
    }],
  },
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(ts|tsx)',
    '<rootDir>/src/**/(*.)+(spec|test).(ts|tsx)',
  ],
  collectCoverageFrom: [
    'src/**/*.(ts|tsx)',
    '!src/**/*.d.ts',
    '!src/main.tsx',
    '!src/vite-env.d.ts',
    '!src/test/**/*',
    '!src/**/__tests__/**/*',
  ],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },
  // Handle ES modules from node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(chart.js|@tauri-apps)/)',
  ],
  // Add global setup to mock import.meta for config files
  globals: {
    'import.meta': {
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
        VITE_AUTO_SAVE_INTERVAL: '300',
        VITE_MAX_EXPORT_SIZE: '100',
        VITE_PERFORMANCE_MONITORING: 'true',
        VITE_MAX_CONCURRENT_DEVICES: '4',
        VITE_CHART_RENDER_THROTTLE: '16',
        VITE_ENABLE_MOCK_DATA: 'false',
        VITE_MOCK_DEVICE_COUNT: '2',
        VITE_REACT_DEVTOOLS: 'true',
        VITE_HOT_RELOAD: 'true'
      }
    }
  }
}
