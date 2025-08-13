// CSRF Protection Service with token management, refresh, and event monitoring

import { invoke } from '@tauri-apps/api/core'

export type SecurityEvent =
  | { TokenGenerated: { timestamp: number; token_id: string } }
  | { TokenValidated: { timestamp: number; token_id: string; success: boolean } }
  | { TokenRefreshed: { timestamp: number; old_token_id: string; new_token_id: string } }
  | { TokenExpired: { timestamp: number; token_id: string } }
  | { RateLimitExceeded: { timestamp: number; operation: string } }
  | { SuspiciousActivity: { timestamp: number; details: string } }
  | { CSRFAttackDetected: { timestamp: number; provided_token: string; expected_token: string } }

export class CSRFProtectionService {
  private currentToken: string | null = null
  private tokenRefreshPromise: Promise<string> | null = null
  private securityEventListeners: ((event: SecurityEvent) => void)[] = []
  private isInitialized = false
  private initializationAttempts = 0
  private maxInitializationAttempts = 3

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    this.initializationAttempts++

    try {
      this.currentToken = await invoke<string>('get_csrf_token')
      this.isInitialized = true
      this.initializationAttempts = 0 // Reset counter on success
      console.log('[CSRF] Protection Service initialized successfully')
    } catch (error) {
      console.warn(
        `[CSRF][Warn] Initialization attempt ${this.initializationAttempts}/${this.maxInitializationAttempts} failed:`,
        error,
      )

      if (this.initializationAttempts >= this.maxInitializationAttempts) {
        console.warn('[CSRF] Protection will run in fallback mode (reduced security)')
        // Set initialized to true to prevent infinite retry loops
        this.isInitialized = true
        this.currentToken = null
      } else {
        // Wait a bit and allow retry
        this.isInitialized = false
        await new Promise((resolve) => setTimeout(resolve, 1000 * this.initializationAttempts))
      }
    }
  }

  async getToken(): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize()
    }

    if (!this.currentToken) {
      // Get initial token
      try {
        this.currentToken = await invoke<string>('get_csrf_token')
        return this.currentToken
      } catch (error) {
        console.warn('CSRF token not available:', error)
        // Return a fallback token for development/degraded mode
        return 'fallback-token-csrf-disabled'
      }
    }

    // Validate current token before returning
    try {
      const isValid = await invoke<boolean>('validate_csrf_token', { token: this.currentToken })
      if (!isValid) {
        console.warn('Current CSRF token is invalid, refreshing...')
        return this.refreshToken()
      }
      return this.currentToken
    } catch (error) {
      console.warn('Token validation failed, using fallback...', error)
      return 'fallback-token-csrf-disabled'
    }
  }

  async refreshToken(): Promise<string> {
    // Prevent multiple concurrent refresh attempts
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise
    }

    this.tokenRefreshPromise = this.performTokenRefresh()

    try {
      const newToken = await this.tokenRefreshPromise
      this.currentToken = newToken
      return newToken
    } catch (error) {
      console.warn('Failed to refresh CSRF token, using fallback:', error)
      return 'fallback-token-csrf-disabled'
    } finally {
      this.tokenRefreshPromise = null
    }
  }

  private async performTokenRefresh(): Promise<string> {
    try {
      const newToken = await invoke<string>('refresh_csrf_token')
      console.log('CSRF token refreshed successfully')
      return newToken
    } catch (error) {
      console.error('Failed to refresh CSRF token:', error)
      if (error instanceof Error) {
        // Re-throw specific error messages from backend
        if (error.message.includes('rate limit')) {
          throw new Error('CSRF token refresh rate limited. Please wait before trying again.')
        }
        if (error.message.includes('Invalid or expired CSRF token')) {
          throw error // Re-throw original error with specific message
        }
        if (error.message.includes('Rate limit exceeded for file operations')) {
          throw error // Re-throw original error with specific message
        }
        if (error.message.includes('Network')) {
          throw error // Re-throw network errors
        }
      }
      throw new Error('Failed to refresh CSRF token')
    }
  }

  async executeProtectedOperation<T>(
    operation: (token: string) => Promise<T>,
    maxRetries: number = 1,
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const token = await this.getToken()
        return await operation(token)
      } catch (error) {
        lastError = error as Error

        // Safely get error message with fallback
        const errorMessage = lastError?.message || String(lastError) || 'Unknown error'

        // Re-throw specific backend errors immediately
        if (errorMessage.includes('Rate limit exceeded for file operations')) {
          throw lastError
        }
        if (errorMessage.includes('Network')) {
          throw lastError
        }

        // If it's a CSRF error and we have retries left, refresh token and try again
        if (errorMessage.includes('CSRF') && attempt < maxRetries) {
          console.warn(`CSRF error on attempt ${attempt + 1}, refreshing token...`)
          await this.refreshToken()
          continue
        }

        // If it's a rate limit error, don't retry
        if (errorMessage.includes('rate limit')) {
          break
        }

        throw error
      }
    }

    throw lastError || new Error('Operation failed after retries')
  }

  async getSecurityEvents(): Promise<SecurityEvent[]> {
    try {
      return await invoke<SecurityEvent[]>('get_security_events')
    } catch (error) {
      console.error('Failed to get security events:', error)
      return []
    }
  }

  addSecurityEventListener(listener: (event: SecurityEvent) => void): void {
    this.securityEventListeners.push(listener)
  }

  removeSecurityEventListener(listener: (event: SecurityEvent) => void): void {
    const index = this.securityEventListeners.indexOf(listener)
    if (index > -1) {
      this.securityEventListeners.splice(index, 1)
    }
  }

  async monitorSecurityEvents(): Promise<void> {
    try {
      const events = await this.getSecurityEvents()

      // Process new events (in a real implementation, you'd track which events are new)
      events.forEach((event) => {
        this.securityEventListeners.forEach((listener) => {
          try {
            listener(event)
          } catch (error) {
            console.error('Error in security event listener:', error)
          }
        })
      })
    } catch (error) {
      console.error('Failed to monitor security events:', error)
    }
  }

  clearToken(): void {
    this.currentToken = null
  }
}

// Export singleton instance
export const csrfService = new CSRFProtectionService()

/**
 * Helper function to wrap file operations with CSRF protection
 */
export async function withCSRFProtection<T>(operation: (token: string) => Promise<T>): Promise<T> {
  return csrfService.executeProtectedOperation(operation)
}

/**
 * Utility functions for common protected operations
 */
export const protectedOperations = {
  saveSessionData: async (
    sessionName: string,
    subjectId: string,
    notes: string,
    data: unknown[],
    storagePath?: string,
  ) => {
    return withCSRFProtection(async (token) => {
      return invoke('save_session_data', {
        sessionName,
        subjectId,
        notes,
        data,
        storagePath,
        csrfToken: token,
      })
    })
  },

  deleteSession: async (sessionId: string) => {
    return withCSRFProtection(async (token) => {
      return invoke('delete_session', {
        sessionId,
        csrfToken: token,
      })
    })
  },

  copyFileToDownloads: async (filePath: string, fileName: string) => {
    return withCSRFProtection(async (token) => {
      return invoke('copy_file_to_downloads', {
        filePath,
        fileName,
        csrfToken: token,
      })
    })
  },

  saveFilteredData: async (fileName: string, content: string) => {
    return withCSRFProtection(async (token) => {
      return invoke('save_filtered_data', {
        fileName,
        content,
        csrfToken: token,
      })
    })
  },

  chooseStorageDirectory: async () => {
    return withCSRFProtection(async (token) => {
      return invoke('choose_storage_directory', {
        csrfToken: token,
      })
    })
  },
}

// Security monitoring component
export class SecurityMonitor {
  private monitoringInterval: NodeJS.Timeout | null = null

  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring()
    }

    this.monitoringInterval = setInterval(async () => {
      await csrfService.monitorSecurityEvents()
    }, intervalMs)

    // Add security event listener for real-time alerts
    csrfService.addSecurityEventListener(this.handleSecurityEvent.bind(this))
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
  }

  private handleSecurityEvent(event: SecurityEvent): void {
    // Handle different types of security events
    if ('CSRFAttackDetected' in event) {
      console.warn('[CSRF][ALERT] Attack Detected!', event)
      this.showSecurityAlert('CSRF attack detected', 'critical')
    } else if ('SuspiciousActivity' in event) {
      console.warn('[CSRF][Warn] Suspicious Activity:', event)
      this.showSecurityAlert('Suspicious activity detected', 'warning')
    } else if ('RateLimitExceeded' in event) {
      console.warn('[RateLimit] Exceeded:', event)
      this.showSecurityAlert('Rate limit exceeded', 'info')
    }
  }

  private showSecurityAlert(message: string, severity: 'info' | 'warning' | 'critical'): void {
    // In a real application, you'd integrate with your notification system
    console.log(`Security Alert [${severity.toUpperCase()}]: ${message}`)

    // Example: Show toast notification if available
    try {
      const globalWindow = window as unknown as Record<string, unknown>
      const showToast = globalWindow.showToast
      if (typeof showToast === 'function') {
        ;(showToast as (msg: string, type: string) => void)(
          message,
          severity === 'critical' ? 'error' : severity,
        )
      }
    } catch {
      // Ignore toast errors
    }
  }
}

// Export the security monitor instance
export const securityMonitor = new SecurityMonitor()

// Auto-initialize CSRF protection after a short delay to allow Tauri backend to start
setTimeout(async () => {
  try {
    await csrfService.initialize()
  } catch (error) {
    console.warn('Auto-initialization of CSRF protection failed:', error)
  }
}, 2000) // 2 second delay to allow backend initialization

// Note: Service initialization is deferred to first use to avoid issues in tests
