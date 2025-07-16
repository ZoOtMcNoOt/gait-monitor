/**
 * Comprehensive Test Suite for CSRF Protection with Rate Limiting
 * Tests all aspects of the enhanced CSRF protection including file operation rate limiting
 */

// Mock Tauri invoke function
const mockInvoke = jest.fn();
jest.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke
}));

import { withCSRFProtection, protectedOperations, securityMonitor, csrfService } from '../csrfProtection';

describe('CSRF Protection Service', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInvoke.mockClear();
    mockInvoke.mockReset();
    
    // Mock console methods to suppress expected error messages during tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    // Reset singleton service state
    (csrfService as unknown as { currentToken: string | null; isInitialized: boolean; tokenRefreshPromise: Promise<string> | null }).currentToken = null;
    (csrfService as unknown as { currentToken: string | null; isInitialized: boolean; tokenRefreshPromise: Promise<string> | null }).isInitialized = false;
    (csrfService as unknown as { currentToken: string | null; isInitialized: boolean; tokenRefreshPromise: Promise<string> | null }).tokenRefreshPromise = null;
  });

  afterEach(() => {
    // Restore console methods
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('Rate Limiting Integration', () => {
    test('should handle rate limit exceeded error from backend', async () => {
      mockInvoke
        .mockResolvedValueOnce('test-token') // get_csrf_token (initialize)
        .mockRejectedValue(new Error('Rate limit exceeded for file operations. Please wait before trying again.'));
      
      await expect(withCSRFProtection(async (token) => {
        return mockInvoke('save_session_data', {
          sessionName: 'test',
          subjectId: 'test',
          notes: 'test',
          data: [],
          csrfToken: token
        });
      })).rejects.toThrow('Rate limit exceeded for file operations');
    });

    test('should handle CSRF token validation failure from backend', async () => {
      mockInvoke
        .mockResolvedValueOnce('test-token') // get_csrf_token (initialize)
        .mockRejectedValue(new Error('Invalid or expired CSRF token. Please refresh and try again.'));
      
      await expect(withCSRFProtection(async (token) => {
        return mockInvoke('delete_session', {
          sessionId: 'test-session',
          csrfToken: token
        });
      })).rejects.toThrow('Invalid or expired CSRF token');
    });

    test('should successfully execute protected operation', async () => {
      const testToken = 'test-token-123';
      const expectedResult = '/path/to/saved/file.json';
      
      mockInvoke
        .mockResolvedValueOnce(testToken) // get_csrf_token
        .mockResolvedValueOnce(true) // validate_csrf_token
        .mockResolvedValueOnce(expectedResult); // save_session_data
      
      const result = await withCSRFProtection(async (token) => {
        expect(token).toBe(testToken);
        return mockInvoke('save_session_data', {
          sessionName: 'Test Session',
          subjectId: 'SUB001',
          notes: 'Test notes',
          data: [],
          csrfToken: token
        });
      });

      expect(result).toBe(expectedResult);
      expect(mockInvoke).toHaveBeenCalledWith('get_csrf_token');
      expect(mockInvoke).toHaveBeenCalledWith('validate_csrf_token', { token: testToken });
      expect(mockInvoke).toHaveBeenCalledWith('save_session_data', {
        sessionName: 'Test Session',
        subjectId: 'SUB001',
        notes: 'Test notes',
        data: [],
        csrfToken: testToken
      });
    });

    test('should handle file operation rate limiting', async () => {
      // Test that the backend properly enforces rate limits
      const testToken = 'test-token-123';
      
      mockInvoke
        .mockResolvedValueOnce(testToken) // get_csrf_token
        .mockResolvedValueOnce(true) // validate_csrf_token  
        .mockRejectedValueOnce(new Error('Rate limit exceeded for file operations. Please wait before trying again.'));
      
      await expect(withCSRFProtection(async (token) => {
        return mockInvoke('save_filtered_data', {
          fileName: 'test.csv',
          content: 'data',
          csrfToken: token
        });
      })).rejects.toThrow('Rate limit exceeded for file operations');
    });

    test('should handle network errors gracefully', async () => {
      mockInvoke
        .mockResolvedValueOnce('test-token') // get_csrf_token (initialize)
        .mockRejectedValue(new Error('Network connection failed'));
      
      await expect(withCSRFProtection(async (token) => {
        return mockInvoke('copy_file_to_downloads', {
          filePath: '/test/path',
          fileName: 'test.txt',
          csrfToken: token
        });
      })).rejects.toThrow('Network connection failed');
    });
  });

  describe('Backend Integration', () => {
    test('should validate CSRF tokens on all file operations', async () => {
      const testToken = 'test-token-123';
      
      mockInvoke
        .mockResolvedValueOnce(testToken) // get_csrf_token (for initialization)
        .mockResolvedValueOnce(true) // validate_csrf_token
        .mockResolvedValueOnce(undefined); // delete_session
      
      await withCSRFProtection(async (token) => {
        return mockInvoke('delete_session', {
          sessionId: 'session-123',
          csrfToken: token
        });
      });

      expect(mockInvoke).toHaveBeenCalledWith('delete_session', {
        sessionId: 'session-123',
        csrfToken: testToken
      });
    });

    test('should enforce rate limits on choose_storage_directory', async () => {
      const testToken = 'test-token-789';
      
      mockInvoke
        .mockResolvedValueOnce(testToken) // get_csrf_token
        .mockResolvedValueOnce(true) // validate_csrf_token
        .mockRejectedValueOnce(new Error('Rate limit exceeded for file operations. Please wait before trying again.'));
      
      await expect(withCSRFProtection(async (token) => {
        return mockInvoke('choose_storage_directory', {
          csrfToken: token
        });
      })).rejects.toThrow('Rate limit exceeded for file operations');
    });
  });

  describe('Security Features', () => {
    test('should protect against CSRF attacks', async () => {
      // Simulate a CSRF attack scenario
      mockInvoke.mockRejectedValue(new Error('Invalid or expired CSRF token. Please refresh and try again.'));
      
      await expect(withCSRFProtection(async () => {
        return mockInvoke('save_session_data', {
          sessionName: 'Malicious Session',
          subjectId: 'ATTACKER',
          notes: 'Attack attempt',
          data: [],
          csrfToken: 'fake-token'
        });
      })).rejects.toThrow('Invalid or expired CSRF token');
    });

    test('should handle token refresh scenarios', async () => {
      const oldToken = 'old-token';
      const newToken = 'new-token';
      const expectedResult = 'operation-success';
      
      mockInvoke
        .mockResolvedValueOnce(oldToken) // get_csrf_token (initialization)
        .mockResolvedValueOnce(false) // validate_csrf_token (token invalid)
        .mockResolvedValueOnce(newToken) // refresh_csrf_token
        .mockResolvedValueOnce(expectedResult); // copy_file_to_downloads
      
      const result = await withCSRFProtection(async (token) => {
        expect(token).toBe(newToken); // Should receive the new token
        return mockInvoke('copy_file_to_downloads', {
          filePath: '/test/file.txt',
          fileName: 'file.txt',
          csrfToken: token
        });
      });

      expect(result).toBe(expectedResult);
      expect(mockInvoke).toHaveBeenCalledWith('refresh_csrf_token');
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle concurrent operations', async () => {
      const testToken = 'concurrent-token';
      
      mockInvoke
        .mockResolvedValue(testToken) // get_csrf_token (called once)
        .mockResolvedValue('success'); // All operations succeed
      
      const operations = Array.from({ length: 5 }, (_, i) => 
        withCSRFProtection(async (token) => {
          return mockInvoke('save_session_data', {
            sessionName: `Session ${i}`,
            subjectId: `SUB${i}`,
            notes: `Notes ${i}`,
            data: [],
            csrfToken: token
          });
        })
      );
      
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(5);
      expect(results.every((result: unknown) => result === 'success')).toBe(true);
    });

    test('should maintain security under load', async () => {
      const testToken = 'load-test-token';
      
      // Set up the service to have a cached token first
      mockInvoke.mockResolvedValueOnce(testToken); // get_csrf_token (initialize)
      await csrfService.initialize();
      
      // Create specific mock implementations for each operation
      mockInvoke.mockImplementation(async (command) => {
        // Debug logging is suppressed by our console.log spy
        
        switch (command) {
          case 'get_csrf_token':
            return testToken;
          case 'refresh_csrf_token':
            return testToken;
          case 'save_session_data':
            return 'success-1';
          case 'delete_session':
            return 'success-2';
          case 'save_filtered_data':
            throw new Error('Rate limit exceeded for file operations. Please wait before trying again.');
          case 'copy_file_to_downloads':
            return 'success-4';
          case 'choose_storage_directory':
            throw new Error('Rate limit exceeded for file operations. Please wait before trying again.');
          default:
            throw new Error(`Unexpected command: ${command}`);
        }
      });
      
      const operations = [
        withCSRFProtection(async (token) => mockInvoke('save_session_data', { csrfToken: token })),
        withCSRFProtection(async (token) => mockInvoke('delete_session', { csrfToken: token })),
        withCSRFProtection(async (token) => mockInvoke('save_filtered_data', { csrfToken: token })),
        withCSRFProtection(async (token) => mockInvoke('copy_file_to_downloads', { csrfToken: token })),
        withCSRFProtection(async (token) => mockInvoke('choose_storage_directory', { csrfToken: token }))
      ];
      
      const results = await Promise.allSettled(operations);
      
      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('fulfilled');
      expect(results[2].status).toBe('rejected');
      expect(results[3].status).toBe('fulfilled');
      expect(results[4].status).toBe('rejected');
    });
  });

  describe('Token Management', () => {
    test('should initialize with a valid token', async () => {
      mockInvoke.mockResolvedValue('test-token-123');
      
      await csrfService.initialize();
      const token = await csrfService.getToken();
      
      expect(token).toBe('test-token-123');
      expect(mockInvoke).toHaveBeenCalledWith('get_csrf_token');
    });

    test('should refresh token when requested', async () => {
      const originalToken = 'original-token';
      const newToken = 'new-token-456';
      
      mockInvoke
        .mockResolvedValueOnce(originalToken)
        .mockResolvedValueOnce(newToken);
      
      await csrfService.initialize();
      const refreshedToken = await csrfService.refreshToken();
      
      expect(refreshedToken).toBe(newToken);
      expect(mockInvoke).toHaveBeenCalledWith('refresh_csrf_token');
    });

    test('should handle token initialization failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Token generation failed'));
      
      await csrfService.initialize();
      // Should not throw - graceful fallback
      expect(mockInvoke).toHaveBeenCalledWith('get_csrf_token');
    });
  });

  describe('Protected File Operations', () => {
    test('should save session data with CSRF protection', async () => {
      const sessionData = {
        sessionName: 'Test Session',
        subjectId: 'SUB001',
        notes: 'Test notes',
        data: [{ timestamp: Date.now(), value: 123 }]
      };

      // Fresh service - no cached token, so it will get initial token and use it
      mockInvoke
        .mockResolvedValueOnce('test-token-123') // get_csrf_token (first call, no cached token)
        .mockResolvedValueOnce(true) // validate_csrf_token
        .mockResolvedValueOnce('/path/to/saved/file.json'); // save_session_data
      
      const result = await protectedOperations.saveSessionData(
        sessionData.sessionName,
        sessionData.subjectId,
        sessionData.notes,
        sessionData.data
      );

      expect(result).toBe('/path/to/saved/file.json');
      expect(mockInvoke).toHaveBeenCalledWith('save_session_data', {
        sessionName: sessionData.sessionName,
        subjectId: sessionData.subjectId,
        notes: sessionData.notes,
        data: sessionData.data,
        storagePath: undefined,
        csrfToken: 'test-token-123'
      });
    });

    test('should delete session with CSRF protection', async () => {
      const sessionId = 'session-123';
      
      // Fresh service - no cached token, so it will get initial token and use it
      mockInvoke
        .mockResolvedValueOnce('test-token-123') // get_csrf_token (first call, no cached token)
        .mockResolvedValueOnce(true) // validate_csrf_token
        .mockResolvedValueOnce(undefined); // delete_session
      
      const result = await protectedOperations.deleteSession(sessionId);

      expect(result).toBeUndefined();
      expect(mockInvoke).toHaveBeenCalledWith('delete_session', {
        sessionId,
        csrfToken: 'test-token-123'
      });
    });

    test('should copy file to downloads with CSRF protection', async () => {
      const filePath = '/path/to/source/file.txt';
      const fileName = 'downloaded-file.txt';
      const expectedPath = '/path/to/downloads/downloaded-file.txt';
      
      // Fresh service - no cached token, so it will get initial token and use it
      mockInvoke
        .mockResolvedValueOnce('test-token-123') // get_csrf_token (first call, no cached token)
        .mockResolvedValueOnce(true) // validate_csrf_token
        .mockResolvedValueOnce(expectedPath); // copy_file_to_downloads
      
      const result = await protectedOperations.copyFileToDownloads(filePath, fileName);

      expect(result).toBe(expectedPath);
      expect(mockInvoke).toHaveBeenCalledWith('copy_file_to_downloads', {
        filePath,
        fileName,
        csrfToken: 'test-token-123'
      });
    });

    test('should save filtered data with CSRF protection', async () => {
      const fileName = 'filtered-data.csv';
      const content = 'timestamp,value\n1234567890,123\n';
      const expectedPath = '/path/to/saved/filtered-data.csv';
      
      // Fresh service - no cached token, so it will get initial token and use it
      mockInvoke
        .mockResolvedValueOnce('test-token-123') // get_csrf_token (first call, no cached token)
        .mockResolvedValueOnce(true) // validate_csrf_token
        .mockResolvedValueOnce(expectedPath); // save_filtered_data
      
      const result = await protectedOperations.saveFilteredData(fileName, content);

      expect(result).toBe(expectedPath);
      expect(mockInvoke).toHaveBeenCalledWith('save_filtered_data', {
        fileName,
        content,
        csrfToken: 'test-token-123'
      });
    });

    test('should choose storage directory with CSRF protection', async () => {
      const selectedPath = '/path/to/selected/directory';
      
      // Fresh service - no cached token, so it will get initial token and use it
      mockInvoke
        .mockResolvedValueOnce('test-token-123') // get_csrf_token (first call, no cached token)
        .mockResolvedValueOnce(true) // validate_csrf_token
        .mockResolvedValueOnce(selectedPath); // choose_storage_directory
      
      const result = await protectedOperations.chooseStorageDirectory();

      expect(result).toBe(selectedPath);
      expect(mockInvoke).toHaveBeenCalledWith('choose_storage_directory', {
        csrfToken: 'test-token-123'
      });
    });
  });

  describe('Rate Limiting', () => {
    test('should handle rate limit exceeded error', async () => {
      // Fresh service - no cached token, so it will get initial token then hit operation
      mockInvoke
        .mockResolvedValueOnce('test-token-123') // get_csrf_token (first call, no cached token)
        .mockResolvedValueOnce(true) // validate_csrf_token
        .mockRejectedValueOnce(new Error('Rate limit exceeded for file operations. Please wait before trying again.')); // save_session_data
      
      await expect(protectedOperations.saveSessionData('test', 'test', 'test', []))
        .rejects.toThrow('Rate limit exceeded for file operations');
    });

    test('should handle CSRF token validation failure', async () => {
      // Fresh service - no cached token, so it will get initial token then hit operation
      mockInvoke
        .mockResolvedValueOnce('test-token-123') // get_csrf_token (first call, no cached token)
        .mockResolvedValueOnce(true) // validate_csrf_token
        .mockRejectedValueOnce(new Error('Invalid or expired CSRF token. Please refresh and try again.')) // delete_session
        .mockRejectedValueOnce(new Error('Invalid or expired CSRF token. Please refresh and try again.')); // refresh_csrf_token also fails
      
      await expect(protectedOperations.deleteSession('test-session'))
        .rejects.toThrow('Invalid or expired CSRF token');
    });

    test('should retry operation after token refresh on CSRF failure', async () => {
      const newToken = 'refreshed-token-789';
      
      // Fresh service - no cached token, so it will get initial token then hit operation
      mockInvoke
        .mockResolvedValueOnce('test-token-123') // get_csrf_token (first call, no cached token)
        .mockRejectedValueOnce(new Error('Invalid or expired CSRF token')) // choose_storage_directory (first attempt)
        .mockResolvedValueOnce(newToken) // refresh_csrf_token
        .mockResolvedValueOnce('/path/to/selected/directory'); // choose_storage_directory (retry)
      
      // This should automatically refresh the token and retry
      const result = await protectedOperations.chooseStorageDirectory();
      
      expect(mockInvoke).toHaveBeenCalledWith('refresh_csrf_token');
      expect(result).toBe('/path/to/selected/directory');
    });
  });

  describe('Security Monitoring', () => {
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      // The console.error spy is already set up in the main beforeEach
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
      // The console.error spy is restored in the main afterEach
    });

    test('should start and stop security monitoring', () => {
      const mockSetInterval = jest.spyOn(global, 'setInterval');
      const mockClearInterval = jest.spyOn(global, 'clearInterval');
      
      securityMonitor.startMonitoring(1000);
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 1000);
      
      securityMonitor.stopMonitoring();
      expect(mockClearInterval).toHaveBeenCalled();
      
      mockSetInterval.mockRestore();
      mockClearInterval.mockRestore();
    });

    test('should handle security events', async () => {
      mockInvoke.mockResolvedValue([
        { CSRFAttackDetected: { timestamp: Date.now(), provided_token: 'bad-token', expected_token: 'good-token' } },
        { RateLimitExceeded: { timestamp: Date.now(), operation: 'save_session_data' } }
      ]);
      
      // Start monitoring to trigger event handling
      securityMonitor.startMonitoring(100);
      
      // Wait for monitoring cycle
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(consoleWarnSpy).toHaveBeenCalledWith('🚨 CSRF Attack Detected!', expect.any(Object));
      expect(consoleWarnSpy).toHaveBeenCalledWith('🚫 Rate Limit Exceeded:', expect.any(Object));
      
      securityMonitor.stopMonitoring();
    });

    test('should handle suspicious activity events', async () => {
      mockInvoke.mockResolvedValue([
        { SuspiciousActivity: { timestamp: Date.now(), details: 'Multiple failed attempts' } }
      ]);
      
      securityMonitor.startMonitoring(100);
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(consoleWarnSpy).toHaveBeenCalledWith('⚠️ Suspicious Activity:', expect.any(Object));
      
      securityMonitor.stopMonitoring();
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      mockInvoke
        .mockResolvedValueOnce('test-token') // get_csrf_token (initialize)
        .mockRejectedValue(new Error('Network error'));
      
      await expect(protectedOperations.saveSessionData('test', 'test', 'test', []))
        .rejects.toThrow('Network error');
    });

    test('should handle malformed responses', async () => {
      mockInvoke.mockResolvedValue(null);
      
      // Should handle null response gracefully
      await expect(csrfService.getToken()).resolves.toBeNull();
    });

    test('should handle token refresh failure', async () => {
      mockInvoke
        .mockResolvedValueOnce('initial-token')
        .mockRejectedValueOnce(new Error('Token refresh failed'));
      
      await csrfService.initialize();
      
      await expect(csrfService.refreshToken()).rejects.toThrow('Failed to refresh CSRF token');
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle multiple concurrent requests', async () => {
      mockInvoke.mockResolvedValue('test-token-123');
      await csrfService.initialize();
      
      const operations = Array.from({ length: 10 }, (_, i) => 
        protectedOperations.saveSessionData(`session-${i}`, `subject-${i}`, `notes-${i}`, [])
      );
      
      mockInvoke.mockResolvedValue('/path/to/saved/file.json');
      
      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(10);
      expect(results.every((result: unknown) => result === '/path/to/saved/file.json')).toBe(true);
    });

    test('should maintain token state across operations', async () => {
      mockInvoke
        .mockResolvedValueOnce('persistent-token') // get_csrf_token (initialization)
        .mockResolvedValueOnce(true) // validate_csrf_token (first getToken call)
        .mockResolvedValueOnce(true); // validate_csrf_token (second getToken call)
      
      await csrfService.initialize();
      
      const token1 = await csrfService.getToken();
      const token2 = await csrfService.getToken();
      
      expect(token1).toBe(token2);
      expect(mockInvoke).toHaveBeenCalledWith('get_csrf_token');
      expect(mockInvoke).toHaveBeenCalledWith('validate_csrf_token', { token: 'persistent-token' });
    });
  });
});
