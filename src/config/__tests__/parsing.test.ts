// Tests for environment variable parsing functions from config/index.ts
import { parseBoolean, parseNumber, parseString } from '../test-index'

describe('Environment Variable Parsing', () => {
  // Store original environment
  const originalEnv = process.env

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv
  })

  describe('parseBoolean', () => {
    it('should return true for "true" string', () => {
      expect(parseBoolean('true')).toBe(true)
    })

    it('should return true for "TRUE" string (case insensitive)', () => {
      expect(parseBoolean('TRUE')).toBe(true)
    })

    it('should return false for "false" string', () => {
      expect(parseBoolean('false')).toBe(false)
    })

    it('should return false for any other string', () => {
      expect(parseBoolean('yes')).toBe(false)
      expect(parseBoolean('1')).toBe(false)
      expect(parseBoolean('on')).toBe(false)
    })

    it('should return default value for undefined', () => {
      expect(parseBoolean(undefined, true)).toBe(true)
      expect(parseBoolean(undefined, false)).toBe(false)
    })

    it('should return false for undefined when no default provided', () => {
      expect(parseBoolean(undefined)).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(parseBoolean('')).toBe(false)
    })
  })

  describe('parseNumber', () => {
    it('should parse valid integer strings', () => {
      expect(parseNumber('123', 0)).toBe(123)
      expect(parseNumber('0', 999)).toBe(0)
      expect(parseNumber('-456', 0)).toBe(-456)
    })

    it('should parse valid float strings', () => {
      expect(parseNumber('123.45', 0)).toBe(123.45)
      expect(parseNumber('0.5', 999)).toBe(0.5)
      expect(parseNumber('-456.78', 0)).toBe(-456.78)
    })

    it('should return default value for invalid strings', () => {
      expect(parseNumber('not-a-number', 100)).toBe(100)
      expect(parseNumber('123abc', 200)).toBe(200)
      expect(parseNumber('', 300)).toBe(300)
    })

    it('should return default value for undefined', () => {
      expect(parseNumber(undefined, 500)).toBe(500)
    })

    it('should handle scientific notation', () => {
      expect(parseNumber('1e3', 0)).toBe(1000)
      expect(parseNumber('1.5e2', 0)).toBe(150)
    })

    it('should handle edge cases', () => {
      expect(parseNumber('Infinity', 100)).toBe(100) // Infinity should return default
      expect(parseNumber('-Infinity', 100)).toBe(100) // -Infinity should return default
      expect(parseNumber('NaN', 100)).toBe(100) // NaN should return default
    })
  })

  describe('parseString', () => {
    it('should return valid value when it matches valid options', () => {
      const validValues = ['development', 'production', 'test']
      
      expect(parseString('development', validValues, 'development')).toBe('development')
      expect(parseString('production', validValues, 'development')).toBe('production')
      expect(parseString('test', validValues, 'development')).toBe('test')
    })

    it('should return default value when input is not in valid options', () => {
      const validValues = ['light', 'dark', 'auto']
      
      expect(parseString('invalid', validValues, 'auto')).toBe('auto')
      expect(parseString('bright', validValues, 'light')).toBe('light')
    })

    it('should return default value for undefined input', () => {
      const validValues = ['option1', 'option2']
      
      expect(parseString(undefined, validValues, 'option1')).toBe('option1')
    })

    it('should return default value for empty string', () => {
      const validValues = ['a', 'b', 'c']
      
      expect(parseString('', validValues, 'a')).toBe('a')
    })

    it('should be case sensitive', () => {
      const validValues = ['Development', 'Production']
      
      expect(parseString('development', validValues, 'Development')).toBe('Development')
      expect(parseString('DEVELOPMENT', validValues, 'Development')).toBe('Development')
    })
  })
})
