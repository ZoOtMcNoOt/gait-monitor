import DeviceList from './DeviceList'

export default function ConnectTab() {
  return (
    <div className="tab-content">
      <div className="tab-header">
        <h1>Connect to Devices</h1>
        <p>Scan for and connect to Bluetooth devices for data collection.</p>
      </div>
      <DeviceList />
    </div>
  )
}
