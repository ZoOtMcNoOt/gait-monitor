// Mock for @tauri-apps/api/core
export const invoke = jest.fn().mockImplementation((command: string, args?: unknown) => {
  console.log(`Mock invoke called: ${command}`, args)
  
  switch (command) {
    case 'scan_for_gait_devices':
      return Promise.resolve([
        { id: 'test-device-1', name: 'Test Gait Device 1', rssi: -45 },
        { id: 'test-device-2', name: 'Test Gait Device 2', rssi: -60 },
      ])
    
    case 'connect_to_device':
      return Promise.resolve({ success: true })
    
    case 'disconnect_from_device':
      return Promise.resolve({ success: true })
    
    case 'start_gait_notifications':
      return Promise.resolve({ success: true })
    
    case 'stop_gait_notifications':
      return Promise.resolve({ success: true })
    
    case 'save_session_data':
      return Promise.resolve({ 
        success: true, 
        file_path: '/mock/path/session_data.csv' 
      })
    
    default:
      return Promise.resolve({ success: true })
  }
})
