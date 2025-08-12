// Test script to verify color generation
import { generateMultiDeviceColors } from './colorGeneration'
import type { ColorScheme } from './colorGeneration'

// Test with multiple devices
const testDevices = ['device1', 'device2', 'device3']
const colors = generateMultiDeviceColors(testDevices)

console.log('=== COLOR GENERATION TEST ===')
testDevices.forEach((device) => {
  const palette = colors.get(device)!
  console.log(`\nDevice: ${device}`)
  console.log(`  R1: ${palette.R1.primary}`)
  console.log(`  R2: ${palette.R2.primary}`)
  console.log(`  R3: ${palette.R3.primary}`)
  console.log(`  X:  ${palette.X.primary}`)
  console.log(`  Y:  ${palette.Y.primary}`)
  console.log(`  Z:  ${palette.Z.primary}`)
})

// Check if colors are unique across devices
const allColors = new Set()
testDevices.forEach((device) => {
  const palette = colors.get(device)!
  Object.values(palette).forEach((scheme: ColorScheme) => {
    allColors.add(scheme.primary)
  })
})

console.log(`\nTotal unique colors: ${allColors.size}`)
console.log('All colors:', Array.from(allColors))
