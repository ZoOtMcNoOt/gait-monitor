/**
 * Enhanced CSRF Protection Service
 * Provides comprehensive CSRF token management with automatic refresh,
 * rate limiting awareness, and security event monitoring.
 */

import { invoke } from '@tauri-apps/api/core';

export type SecurityEvent = 
  | { TokenGenerated: { timestamp: number; token_id: string } }
  | { TokenValidated: { timestamp: number; token_id: string; success: boolean } }
  | { TokenRefreshed: { timestamp: number; old_token_id: string; new_token_id: string } }
  | { TokenExpired: { timestamp: number; token_id: string } }
  | { RateLimitExceeded: { timestamp: number; operation: string } }
  | { SuspiciousActivity: { timestamp: number; details: string } }
  | { CSRFAttackDetected: { timestamp: number; provided_token: string; expected_token: string } };

class CSRFProtectionService {
  private currentToken: string | null = null;
  private tokenRefreshPromise: Promise<string> | null = null;
  private securityEventListeners: ((event: SecurityEvent) => void)[] = [];
  private isInitialized = false;

  /**
   * Initialize the CSRF protection service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      this.currentToken = await invoke<string>('get_csrf_token');
      this.isInitialized = true;
      console.log('CSRF Protection Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize CSRF protection:', error);
      throw new Error('CSRF protection initialization failed');
    }
  }

  /**
   * Get the current CSRF token, refreshing if necessary
   */
  async getToken(): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.currentToken) {
      return this.refreshToken();
    }

    // Validate current token before returning
    try {
      const isValid = await invoke<boolean>('validate_csrf_token', { token: this.currentToken });
      if (!isValid) {
        console.warn('Current CSRF token is invalid, refreshing...');
        return this.refreshToken();
      }
      return this.currentToken;
    } catch (error) {
      console.warn('Token validation failed, refreshing...', error);
      return this.refreshToken();
    }
  }

  /**
   * Refresh the CSRF token with rate limiting awareness
   */
  async refreshToken(): Promise<string> {
    // Prevent multiple concurrent refresh attempts
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = this.performTokenRefresh();
    
    try {
      const newToken = await this.tokenRefreshPromise;
      this.currentToken = newToken;
      return newToken;
    } finally {
      this.tokenRefreshPromise = null;
    }
  }

  private async performTokenRefresh(): Promise<string> {
    try {
      const newToken = await invoke<string>('refresh_csrf_token');
      console.log('CSRF token refreshed successfully');
      return newToken;
    } catch (error) {
      console.error('Failed to refresh CSRF token:', error);
      if (error instanceof Error && error.message.includes('rate limit')) {
        throw new Error('CSRF token refresh rate limited. Please wait before trying again.');
      }
      throw new Error('Failed to refresh CSRF token');
    }
  }

  /**
   * Execute a protected operation with automatic CSRF token handling
   */
  async executeProtectedOperation<T>(
    operation: (token: string) => Promise<T>,
    maxRetries: number = 1
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const token = await this.getToken();
        return await operation(token);
      } catch (error) {
        lastError = error as Error;
        
        // If it's a CSRF error and we have retries left, refresh token and try again
        if (lastError.message.includes('CSRF') && attempt < maxRetries) {
          console.warn(`CSRF error on attempt ${attempt + 1}, refreshing token...`);
          await this.refreshToken();
          continue;
        }
        
        // If it's a rate limit error, don't retry
        if (lastError.message.includes('rate limit')) {
          break;
        }
        
        throw error;
      }
    }

    throw lastError || new Error('Operation failed after retries');
  }

  /**
   * Get security events for monitoring
   */
  async getSecurityEvents(): Promise<SecurityEvent[]> {
    try {
      return await invoke<SecurityEvent[]>('get_security_events');
    } catch (error) {
      console.error('Failed to get security events:', error);
      return [];
    }
  }

  /**
   * Add a security event listener
   */
  addSecurityEventListener(listener: (event: SecurityEvent) => void): void {
    this.securityEventListeners.push(listener);
  }

  /**
   * Remove a security event listener
   */
  removeSecurityEventListener(listener: (event: SecurityEvent) => void): void {
    const index = this.securityEventListeners.indexOf(listener);
    if (index > -1) {
      this.securityEventListeners.splice(index, 1);
    }
  }

  /**
   * Start monitoring security events (call periodically)
   */
  async monitorSecurityEvents(): Promise<void> {
    try {
      const events = await this.getSecurityEvents();
      
      // Process new events (in a real implementation, you'd track which events are new)
      events.forEach(event => {
        this.securityEventListeners.forEach(listener => {
          try {
            listener(event);
          } catch (error) {
            console.error('Error in security event listener:', error);
          }
        });
      });
    } catch (error) {
      console.error('Failed to monitor security events:', error);
    }
  }

  /**
   * Clear the current token (useful for logout scenarios)
   */
  clearToken(): void {
    this.currentToken = null;
  }
}

// Export singleton instance
export const csrfService = new CSRFProtectionService();

/**
 * Helper function to wrap file operations with CSRF protection
 */
export async function withCSRFProtection<T>(
  operation: (token: string) => Promise<T>
): Promise<T> {
  return csrfService.executeProtectedOperation(operation);
}

/**
 * Utility functions for common protected operations
 */
export const protectedOperations = {
  saveSessionData: async (sessionName: string, subjectId: string, notes: string, data: unknown[], storagePath?: string) => {
    return withCSRFProtection(async (token) => {
      return invoke('save_session_data', {
        sessionName,
        subjectId,
        notes,
        data,
        storagePath,
        csrfToken: token
      });
    });
  },

  deleteSession: async (sessionId: string) => {
    return withCSRFProtection(async (token) => {
      return invoke('delete_session', {
        sessionId,
        csrfToken: token
      });
    });
  },

  copyFileToDownloads: async (filePath: string, fileName: string) => {
    return withCSRFProtection(async (token) => {
      return invoke('copy_file_to_downloads', {
        filePath,
        fileName,
        csrfToken: token
      });
    });
  },

  saveFilteredData: async (fileName: string, content: string) => {
    return withCSRFProtection(async (token) => {
      return invoke('save_filtered_data', {
        fileName,
        content,
        csrfToken: token
      });
    });
  },

  chooseStorageDirectory: async () => {
    return withCSRFProtection(async (token) => {
      return invoke('choose_storage_directory', {
        csrfToken: token
      });
    });
  }
};

// Security monitoring component
export class SecurityMonitor {
  private monitoringInterval: NodeJS.Timeout | null = null;

  startMonitoring(intervalMs: number = 30000): void {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    this.monitoringInterval = setInterval(async () => {
      await csrfService.monitorSecurityEvents();
    }, intervalMs);

    // Add security event listener for real-time alerts
    csrfService.addSecurityEventListener(this.handleSecurityEvent.bind(this));
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  private handleSecurityEvent(event: SecurityEvent): void {
    // Handle different types of security events
    if ('CSRFAttackDetected' in event) {
      console.warn('🚨 CSRF Attack Detected!', event);
      this.showSecurityAlert('CSRF attack detected', 'critical');
    } else if ('SuspiciousActivity' in event) {
      console.warn('⚠️ Suspicious Activity:', event);
      this.showSecurityAlert('Suspicious activity detected', 'warning');
    } else if ('RateLimitExceeded' in event) {
      console.warn('🚫 Rate Limit Exceeded:', event);
      this.showSecurityAlert('Rate limit exceeded', 'info');
    }
  }

  private showSecurityAlert(message: string, severity: 'info' | 'warning' | 'critical'): void {
    // In a real application, you'd integrate with your notification system
    console.log(`Security Alert [${severity.toUpperCase()}]: ${message}`);
    
    // Example: Show toast notification if available
    try {
      const globalWindow = window as unknown as Record<string, unknown>;
      const showToast = globalWindow.showToast;
      if (typeof showToast === 'function') {
        (showToast as (msg: string, type: string) => void)(message, severity === 'critical' ? 'error' : severity);
      }
    } catch {
      // Ignore toast errors
    }
  }
}

// Export the security monitor instance
export const securityMonitor = new SecurityMonitor();

// Auto-initialize the service when the module is imported
csrfService.initialize().catch(console.error);
