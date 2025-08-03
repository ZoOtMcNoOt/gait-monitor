import { 
  generateChannelColor, 
  generateDeviceColorPalette, 
  generateMultiDeviceColors,
  getDeviceLabel,
  validateColorContrast,
  getAvailableDeviceColors,
  type ChannelType 
} from '../colorGeneration'

describe('Color Generation Utilities', () => {
  describe('generateChannelColor', () => {
    test('generates consistent colors for same device and channel', () => {
      const device1Color1 = generateChannelColor('device123', 'R1')
      const device1Color2 = generateChannelColor('device123', 'R1')
      
      expect(device1Color1.primary).toBe(device1Color2.primary)
    })

    test('generates different colors for different channels on same device', () => {
      const r1Color = generateChannelColor('device123', 'R1')
      const r2Color = generateChannelColor('device123', 'R2')
      const xColor = generateChannelColor('device123', 'X')
      
      expect(r1Color.primary).not.toBe(r2Color.primary)
      expect(r1Color.primary).not.toBe(xColor.primary)
      expect(r2Color.primary).not.toBe(xColor.primary)
    })

    test('generates different colors for same channel on different devices', () => {
      const device1R1 = generateChannelColor('device123', 'R1', 0)
      const device2R1 = generateChannelColor('device456', 'R1', 1)
      
      expect(device1R1.primary).not.toBe(device2R1.primary)
    })

    test('returns valid hex colors', () => {
      const color = generateChannelColor('device123', 'R1')
      
      expect(color.primary).toMatch(/^#[0-9a-f]{6}$/i)
      expect(color.light).toMatch(/^#[0-9a-f]{6}$/i)
      expect(color.dark).toMatch(/^#[0-9a-f]{6}$/i)
      expect(color.background).toMatch(/^#[0-9a-f]{6}20$/i) // includes alpha
    })
  })

  describe('generateDeviceColorPalette', () => {
    test('generates colors for all channels', () => {
      const palette = generateDeviceColorPalette('device123')
      
      const expectedChannels: ChannelType[] = ['R1', 'R2', 'R3', 'X', 'Y', 'Z']
      expectedChannels.forEach(channel => {
        expect(palette[channel]).toBeDefined()
        expect(palette[channel].primary).toMatch(/^#[0-9a-f]{6}$/i)
      })
    })

    test('maintains device consistency with explicit index', () => {
      const palette1 = generateDeviceColorPalette('device123', 0)
      const palette2 = generateDeviceColorPalette('differentdevice', 0)
      
      // Same device index should produce colors from same base palette
      // but channels should still be different within the device
      expect(palette1.R1.primary).not.toBe(palette1.R2.primary)
      expect(palette2.R1.primary).not.toBe(palette2.R2.primary)
    })
  })

  describe('generateMultiDeviceColors', () => {
    test('generates unique color palettes for multiple devices', () => {
      const devices = ['device1', 'device2', 'device3']
      const colorMap = generateMultiDeviceColors(devices)
      
      expect(colorMap.size).toBe(3)
      
      devices.forEach(deviceId => {
        expect(colorMap.has(deviceId)).toBe(true)
        const palette = colorMap.get(deviceId)!
        expect(palette.R1).toBeDefined()
        expect(palette.X).toBeDefined()
      })
    })

    test('ensures different base colors for different devices', () => {
      const devices = ['device1', 'device2']
      const colorMap = generateMultiDeviceColors(devices)
      
      const device1R1 = colorMap.get('device1')!.R1.primary
      const device2R1 = colorMap.get('device2')!.R1.primary
      
      expect(device1R1).not.toBe(device2R1)
    })
  })

  describe('getDeviceLabel', () => {
    test('returns "Sim" for simulation device', () => {
      expect(getDeviceLabel('simulation')).toBe('Sim')
    })

    test('returns device with last 4 characters for regular devices', () => {
      expect(getDeviceLabel('device123456')).toBe('Device 3456')
      expect(getDeviceLabel('abc')).toBe('Device abc')
    })
  })

  describe('validateColorContrast', () => {
    test('validates color contrast correctly', () => {
      // These should have good contrast (red vs blue)
      expect(validateColorContrast('#ff0000', '#0000ff')).toBe(true)
      
      // These should have poor contrast (similar colors)
      expect(validateColorContrast('#ff0000', '#ff3333')).toBe(false)
    })
  })

  describe('getAvailableDeviceColors', () => {
    test('returns array of valid hex colors', () => {
      const colors = getAvailableDeviceColors()
      
      expect(Array.isArray(colors)).toBe(true)
      expect(colors.length).toBeGreaterThan(0)
      
      colors.forEach(color => {
        expect(color).toMatch(/^#[0-9a-f]{6}$/i)
      })
    })
  })

  describe('Color consistency across scenarios', () => {
    test('same device generates consistent colors in different sessions', () => {
      // Simulate multiple "sessions" by generating colors for same devices
      const session1 = generateMultiDeviceColors(['deviceA', 'deviceB'])
      const session2 = generateMultiDeviceColors(['deviceA', 'deviceB'])
      
      expect(session1.get('deviceA')!.R1.primary).toBe(session2.get('deviceA')!.R1.primary)
      expect(session1.get('deviceB')!.X.primary).toBe(session2.get('deviceB')!.X.primary)
    })

    test('adding new device does not change existing device colors', () => {
      const initial = generateMultiDeviceColors(['device1', 'device2'])
      const expanded = generateMultiDeviceColors(['device1', 'device2', 'device3'])
      
      expect(initial.get('device1')!.R1.primary).toBe(expanded.get('device1')!.R1.primary)
      expect(initial.get('device2')!.R1.primary).toBe(expanded.get('device2')!.R1.primary)
    })

    test('handles large number of devices gracefully', () => {
      const manyDevices = Array.from({ length: 20 }, (_, i) => `device${i}`)
      const colorMap = generateMultiDeviceColors(manyDevices)
      
      expect(colorMap.size).toBe(20)
      
      // Verify all devices have valid color palettes
      manyDevices.forEach(deviceId => {
        const palette = colorMap.get(deviceId)!
        expect(palette.R1.primary).toMatch(/^#[0-9a-f]{6}$/i)
        expect(palette.Z.primary).toMatch(/^#[0-9a-f]{6}$/i)
      })
    })
  })
})
