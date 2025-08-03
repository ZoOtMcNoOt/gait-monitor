/**
 * Color generation utilities for multi-device charts with unique colors per channel
 */

export interface ColorScheme {
  primary: string
  light: string
  dark: string
  background: string
}

export type ChannelType = 'R1' | 'R2' | 'R3' | 'X' | 'Y' | 'Z'

/**
 * Base color palette with high contrast and accessibility in mind
 * Colors are specifically chosen to be maximally distinct from each other
 */
const BASE_DEVICE_COLORS: string[] = [
  '#e11d48', // red (more vibrant)
  '#2563eb', // blue (deeper)  
  '#059669', // emerald (deeper)
  '#d97706', // amber (more orange)
  '#7c3aed', // violet (deeper)
  '#db2777', // pink (more vibrant)
  '#0891b2', // cyan (deeper)
  '#65a30d', // lime (more green)
  '#ea580c', // orange (more red)
  '#4f46e5', // indigo (deeper)
  '#0d9488', // teal (more blue-green)
  '#ca8a04', // yellow (more golden)
  '#be123c', // rose (additional color)
  '#1d4ed8', // blue-600 (additional color)
  '#047857', // emerald-700 (additional color)
  '#92400e', // amber-800 (additional color)
]

/**
 * Channel-specific color modifications to ensure each channel has a distinct appearance
 * while maintaining the device's base color theme
 * Increased differences for better visual separation - using larger hue shifts for single device
 */
const CHANNEL_MODIFIERS: Record<ChannelType, { hueShift: number; saturationMod: number; lightnessMod: number }> = {
  R1: { hueShift: -60, saturationMod: 1.2, lightnessMod: 0.9 },   // Significant hue shift (purple direction)
  R2: { hueShift: -30, saturationMod: 0.8, lightnessMod: 1.1 },  // Medium hue shift (blue direction)  
  R3: { hueShift: 30, saturationMod: 1.3, lightnessMod: 0.8 },   // Shift towards orange/yellow
  X: { hueShift: -90, saturationMod: 1.1, lightnessMod: 0.7 },   // Major shift (blue direction)
  Y: { hueShift: 0, saturationMod: 1.0, lightnessMod: 1.0 },     // Base color (no modification)
  Z: { hueShift: 60, saturationMod: 1.4, lightnessMod: 1.2 },    // Major shift (green direction)
}

/**
 * Convert hex color to HSL
 */
function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max === min) {
    h = s = 0 // achromatic
  } else {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }

  return [h * 360, s * 100, l * 100]
}

/**
 * Convert HSL to hex color
 */
function hslToHex(h: number, s: number, l: number): string {
  h = h / 360
  s = s / 100
  l = l / 100

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1/6) return p + (q - p) * 6 * t
    if (t < 1/2) return q
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
    return p
  }

  let r: number, g: number, b: number

  if (s === 0) {
    r = g = b = l // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }

  const toHex = (c: number) => {
    const hex = Math.round(c * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Generate a unique color for a specific device and channel combination
 */
export function generateChannelColor(deviceId: string, channel: ChannelType, deviceIndex?: number): ColorScheme {
  // Use provided device index or compute hash-based index
  let devIndex = deviceIndex
  if (devIndex === undefined) {
    // Generate consistent index from device ID hash
    let hash = 0
    for (let i = 0; i < deviceId.length; i++) {
      const char = deviceId.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    devIndex = Math.abs(hash) % BASE_DEVICE_COLORS.length
  }

  // Get base color for this device
  const baseColor = BASE_DEVICE_COLORS[devIndex % BASE_DEVICE_COLORS.length]
  
  // Get channel modifier
  const modifier = CHANNEL_MODIFIERS[channel]
  
  // Convert to HSL and apply modifications
  const [h, s, l] = hexToHsl(baseColor)
  
  const modifiedH = (h + modifier.hueShift) % 360
  const modifiedS = Math.min(100, Math.max(0, s * modifier.saturationMod))
  const modifiedL = Math.min(100, Math.max(0, l * modifier.lightnessMod))
  
  const primary = hslToHex(modifiedH, modifiedS, modifiedL)
  
  // Generate related colors
  const light = hslToHex(modifiedH, modifiedS * 0.7, Math.min(100, modifiedL * 1.3))
  const dark = hslToHex(modifiedH, Math.min(100, modifiedS * 1.2), modifiedL * 0.7)
  const background = hslToHex(modifiedH, modifiedS * 0.3, Math.min(100, modifiedL * 1.6))
  
  return {
    primary,
    light,
    dark,
    background: background + '20' // Add alpha for background
  }
}

/**
 * Generate a full color palette for all channels of a device
 */
export function generateDeviceColorPalette(deviceId: string, deviceIndex?: number): Record<ChannelType, ColorScheme> {
  const palette: Record<ChannelType, ColorScheme> = {} as Record<ChannelType, ColorScheme>
  
  const channels: ChannelType[] = ['R1', 'R2', 'R3', 'X', 'Y', 'Z']
  
  channels.forEach(channel => {
    palette[channel] = generateChannelColor(deviceId, channel, deviceIndex)
  })
  
  return palette
}

/**
 * Get a list of available device colors (for UI previews, etc.)
 */
export function getAvailableDeviceColors(): string[] {
  return [...BASE_DEVICE_COLORS]
}

/**
 * Generate colors for multiple devices ensuring maximum contrast between devices
 * Uses a smart selection algorithm to maximize visual separation
 */
export function generateMultiDeviceColors(deviceIds: string[]): Map<string, Record<ChannelType, ColorScheme>> {
  const deviceColorMap = new Map<string, Record<ChannelType, ColorScheme>>()
  
  if (deviceIds.length === 0) return deviceColorMap
  
  // For optimal contrast, use a more sophisticated selection strategy
  const selectedIndices: number[] = []
  
  if (deviceIds.length === 1) {
    selectedIndices.push(0)
  } else if (deviceIds.length === 2) {
    // For 2 devices, use colors that are maximally apart
    selectedIndices.push(0, Math.floor(BASE_DEVICE_COLORS.length / 2))
  } else {
    // For multiple devices, distribute evenly around the color wheel
    const step = Math.floor(BASE_DEVICE_COLORS.length / deviceIds.length)
    for (let i = 0; i < deviceIds.length; i++) {
      selectedIndices.push((i * step) % BASE_DEVICE_COLORS.length)
    }
    
    // If we have more devices than base colors, start over but with offset
    if (deviceIds.length > BASE_DEVICE_COLORS.length) {
      for (let i = BASE_DEVICE_COLORS.length; i < deviceIds.length; i++) {
        const offset = Math.floor((i - BASE_DEVICE_COLORS.length) / BASE_DEVICE_COLORS.length) + 1
        selectedIndices[i] = ((i * step) + offset) % BASE_DEVICE_COLORS.length
      }
    }
  }
  
  deviceIds.forEach((deviceId, index) => {
    const deviceIndex = selectedIndices[index]
    const palette = generateDeviceColorPalette(deviceId, deviceIndex)
    deviceColorMap.set(deviceId, palette)
  })
  
  return deviceColorMap
}

/**
 * Get a friendly device label for display purposes
 */
export function getDeviceLabel(deviceId: string): string {
  if (deviceId === 'simulation') {
    return 'Sim'
  }
  // Use last 4 characters for compact display
  return `Device ${deviceId.slice(-4)}`
}

/**
 * Validate that a color has sufficient contrast for accessibility
 * Enhanced validation with stricter requirements
 */
export function validateColorContrast(color1: string, color2: string): boolean {
  const [h1, , l1] = hexToHsl(color1)
  const [h2, , l2] = hexToHsl(color2)
  
  // Ensure at least 45 degrees of hue separation for better distinction
  const hueDiff = Math.abs(h1 - h2)
  const minHueDiff = Math.min(hueDiff, 360 - hueDiff)
  
  // Also check lightness difference for additional contrast
  const lightnessDiff = Math.abs(l1 - l2)
  
  // Color is considered sufficiently different if it has good hue separation
  // OR significant lightness difference
  return minHueDiff >= 45 || lightnessDiff >= 25
}
