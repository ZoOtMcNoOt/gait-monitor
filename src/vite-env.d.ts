/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_MODE: string
  readonly VITE_DEBUG_ENABLED: string
  readonly VITE_DEBUG_DEVICES: string
  readonly VITE_DEBUG_CHARTS: string
  readonly VITE_MAX_CHART_POINTS: string
  readonly VITE_DATA_UPDATE_INTERVAL: string
  readonly VITE_HEARTBEAT_TIMEOUT: string
  readonly VITE_CONNECTION_TIMEOUT: string
  readonly VITE_DEFAULT_THEME: string
  readonly VITE_ANIMATIONS_ENABLED: string
  readonly VITE_CHART_SMOOTHING: string
  readonly VITE_TOAST_DURATION: string
  readonly VITE_DATA_RETENTION_DAYS: string
  readonly VITE_AUTO_SAVE_ENABLED: string
  readonly VITE_AUTO_SAVE_INTERVAL: string
  readonly VITE_MAX_EXPORT_SIZE: string
  readonly VITE_PERFORMANCE_MONITORING: string
  readonly VITE_MAX_CONCURRENT_DEVICES: string
  readonly VITE_CHART_RENDER_THROTTLE: string
  readonly VITE_ENABLE_MOCK_DATA: string
  readonly VITE_MOCK_DEVICE_COUNT: string
  readonly VITE_REACT_DEVTOOLS: string
  readonly VITE_HOT_RELOAD: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.css' {
  const content: string
  export default content
}
