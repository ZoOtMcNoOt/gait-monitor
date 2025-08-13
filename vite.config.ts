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
      // Avoid watching huge / generated Rust build artifacts (prevents EMFILE)
      watch: {
        ignored: ['**/src-tauri/target/**', '**/src-tauri/target/doc/**'],
      },
      fs: {
        // Restrict file system access so Vite dep-scan doesn\'t traverse target/doc
        strict: true,
        allow: [process.cwd(), 'src', 'src-tauri/src'],
      },
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

    // Prevent optimizeDeps scan from crawling large generated directories
    optimizeDeps: {
      exclude: [],
      entries: ['index.html'],
      esbuildOptions: {
        // No special options; placeholder if we need to tweak later
      },
    },

    // Safeguard: tell Vite to treat these directories as external/unrelated
    resolve: {
      alias: {
        // Explicitly no alias pointing into target/doc
      },
    },
  }
})
