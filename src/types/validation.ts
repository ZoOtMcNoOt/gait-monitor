// Validation types that match the Rust backend

export interface ValidationError {
  type: 'InvalidSessionName' | 'InvalidSubjectId' | 'InvalidNotes' | 'InvalidDeviceId' | 'DuplicateSession' | 'InvalidPath' | 'InvalidTimestamp';
  message: string;
}

export interface ValidatedSessionMetadata {
  session_name: string;
  subject_id: string;
  notes: string;
  timestamp: string;
  devices: string[];
}

// Validation rules (for frontend display)
export interface ValidationRules {
  sessionName: {
    minLength: number;
    maxLength: number;
    pattern: string;
    description: string;
  };
  subjectId: {
    minLength: number;
    maxLength: number;
    pattern: string;
    description: string;
  };
  notes: {
    maxLength: number;
    description: string;
  };
  deviceId: {
    pattern: string;
    description: string;
  };
}

export const VALIDATION_RULES: ValidationRules = {
  sessionName: {
    minLength: 1,
    maxLength: 100,
    pattern: '^[a-zA-Z0-9_\\-\\s]+$',
    description: 'Session name can only contain letters, numbers, spaces, hyphens, and underscores (1-100 characters)'
  },
  subjectId: {
    minLength: 1,
    maxLength: 50,
    pattern: '^[a-zA-Z0-9_\\-]+$',
    description: 'Subject ID can only contain letters, numbers, hyphens, and underscores (1-50 characters)'
  },
  notes: {
    maxLength: 1000,
    description: 'Notes can be up to 1000 characters long'
  },
  deviceId: {
    pattern: '^[a-fA-F0-9\\-:]+$',
    description: 'Device ID must be in UUID or MAC address format'
  }
};

// Forbidden characters and reserved words for display
export const FORBIDDEN_CHARS = ['<', '>', ':', '"', '|', '?', '*', '\\', '/', '\0'];
export const RESERVED_KEYWORDS = [
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
];
