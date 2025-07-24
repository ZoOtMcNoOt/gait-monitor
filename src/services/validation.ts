import { invoke } from '@tauri-apps/api/core';
import type { ValidatedSessionMetadata } from '../types/validation';

export interface ValidationService {
  validateSessionMetadata(
    sessionName: string,
    subjectId: string,
    notes: string,
    timestamp: string,
    devices: string[]
  ): Promise<ValidatedSessionMetadata>;
  
  validateSessionName(sessionName: string): Promise<string>;
  validateSubjectId(subjectId: string): Promise<string>;
  validateNotes(notes: string): Promise<string>;
  validateDeviceId(deviceId: string): Promise<string>;
  checkSessionUniqueness(sessionName: string, existingSessions: string[]): Promise<void>;
}

class BackendValidationService implements ValidationService {
  async validateSessionMetadata(
    sessionName: string,
    subjectId: string,
    notes: string,
    timestamp: string,
    devices: string[]
  ): Promise<ValidatedSessionMetadata> {
    try {
      const result = await invoke('validate_session_metadata_cmd', {
        sessionName,
        subjectId,
        notes,
        timestamp,
        devices
      });
      return result as ValidatedSessionMetadata;
    } catch (error) {
      throw new Error(`Validation failed: ${error}`);
    }
  }

  async validateSessionName(sessionName: string): Promise<string> {
    try {
      const result = await invoke('validate_session_name_cmd', { sessionName });
      return result as string;
    } catch (error) {
      throw new Error(`Session name validation failed: ${error}`);
    }
  }

  async validateSubjectId(subjectId: string): Promise<string> {
    try {
      const result = await invoke('validate_subject_id_cmd', { subjectId });
      return result as string;
    } catch (error) {
      throw new Error(`Subject ID validation failed: ${error}`);
    }
  }

  async validateNotes(notes: string): Promise<string> {
    try {
      const result = await invoke('validate_notes_cmd', { notes });
      return result as string;
    } catch (error) {
      throw new Error(`Notes validation failed: ${error}`);
    }
  }

  async validateDeviceId(deviceId: string): Promise<string> {
    try {
      const result = await invoke('validate_device_id_cmd', { deviceId });
      return result as string;
    } catch (error) {
      throw new Error(`Device ID validation failed: ${error}`);
    }
  }

  async checkSessionUniqueness(sessionName: string, existingSessions: string[]): Promise<void> {
    try {
      await invoke('check_session_uniqueness_cmd', { sessionName, existingSessions });
    } catch (error) {
      throw new Error(`Session uniqueness check failed: ${error}`);
    }
  }
}

// Export singleton instance
export const validationService: ValidationService = new BackendValidationService();

// Utility functions for frontend validation feedback
export const getValidationErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

export const isValidationError = (error: unknown): boolean => {
  if (error instanceof Error) {
    return error.message.includes('validation failed') || 
           error.message.includes('Validation failed');
  }
  return false;
};
