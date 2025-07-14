module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^.+\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^@tauri-apps/api/(.*)$': '<rootDir>/src/test/mocks/tauri-$1.ts',
    // Redirect config imports to mock to avoid import.meta in tests
    '^\\.\\./index$': '<rootDir>/src/test/mocks/config.ts',
    '^\\.\\./config$': '<rootDir>/src/test/mocks/config.ts',
    '^\\.\\./config/index$': '<rootDir>/src/test/mocks/config.ts',
    '^\\.\\./\\.\\./config$': '<rootDir>/src/test/mocks/config.ts',
    '^\\.\\./\\.\\./config/index$': '<rootDir>/src/test/mocks/config.ts',
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
  ]
}
