import DeviceList from './DeviceList'
import ScrollableContainer from './ScrollableContainer'

export default function ConnectTab() {
  return (
    <ScrollableContainer id="connect-tab" className="tab-content">
      <div className="tab-header">
        <h1>Connect to Devices</h1>
        <p>Scan for and connect to Bluetooth devices for data collection.</p>
      </div>
      <DeviceList />
    </ScrollableContainer>
  )
}
