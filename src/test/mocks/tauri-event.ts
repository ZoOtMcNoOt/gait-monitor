// Mock for @tauri-apps/api/event
export const listen = jest.fn().mockImplementation((event: string) => {
  console.log(`Mock listen called for event: ${event}`)

  // Return a mock unlisten function
  return Promise.resolve(() => {
    console.log(`Mock unlisten called for event: ${event}`)
  })
})

export const emit = jest.fn().mockImplementation((event: string, payload?: unknown) => {
  console.log(`Mock emit called for event: ${event}`, payload)
  return Promise.resolve()
})

export const once = jest.fn().mockImplementation((event: string) => {
  console.log(`Mock once called for event: ${event}`)
  return Promise.resolve()
})
