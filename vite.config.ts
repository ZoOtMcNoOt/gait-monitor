import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    // Tauri needs this so asset paths are correct
    base: './',

    // Define global constants
    define: {
      __APP_VERSION__: JSON.stringify(env.npm_package_version || '0.0.0'),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },

    // Environment variables starting with VITE_ are automatically exposed
    envPrefix: 'VITE_',

    // Development server configuration
    server: {
      // Tauri expects the frontend to be served on a fixed port
      port: 1420,
      strictPort: true,
    },

    // Build configuration
    build: {
      // Generate source maps in development
      sourcemap: mode === 'development',

      // Minimize in production
      minify: mode === 'production',

      // Target ES2020 for better compatibility
      target: 'es2020',

      // Chunk splitting for better caching
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            charts: ['chart.js'],
          },
        },
      },
    },
  }
})
