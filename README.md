# 🚶‍♂️ Gait Monitor

A professional real-time gait analysis application built with **Tauri**, **React**, and **Rust** for collecting and visualizing biomechanical sensor data via Bluetooth Low Energy (BLE).

## ✨ Features

- **🎨 Modern UI**: Dark theme with fixed sidebar navigation
- **📊 Real-time Visualization**: 6-channel gait data charting (R1, R2, R3, X, Y, Z) at 100Hz
- **📡 BLE Integration**: Complete Bluetooth Low Energy support for sensor devices
- **🔧 Professional Architecture**: Rust backend with React TypeScript frontend
- **⚡ High Performance**: Optimized for continuous data streaming
- **📱 Responsive Design**: Works across different screen sizes

## 🏗️ Architecture

### Frontend (React + TypeScript)

- **Vite** - Fast build tool and dev server
- **React 19** - UI framework with hooks
- **Chart.js** - Real-time data visualization
- **Tauri API** - Native system integration

### Backend (Rust)

- **Tauri** - Cross-platform desktop framework
- **btleplug** - Bluetooth Low Energy library
- **async-std** - Async runtime for concurrent operations
- **serde** - Serialization framework

### Data Flow

```
BLE Sensor Device → Rust Backend → Tauri Events → React Frontend → Live Chart
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or later)
- **Rust** (latest stable)
- **npm** or **yarn**
- **Bluetooth adapter** (for BLE functionality)

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd gait-monitor
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Install Tauri CLI**
   ```bash
   npm install -g @tauri-apps/cli
   ```

### Development

**Start development server:**

```bash
npm run tauri dev
```

This will:

- Start the Vite development server
- Compile and run the Rust backend
- Launch the desktop application
- Enable hot-reload for both frontend and backend

### Production Build

**Build for production:**

```bash
npm run tauri build
```

This generates:

- **Windows**: `.msi` installer and `.exe` executable
- **macOS**: `.dmg` disk image and `.app` bundle
- **Linux**: `.deb`, `.rpm`, and `.AppImage` packages

## 📁 Project Structure

```
gait-monitor/
├── src/                    # React frontend source
│   ├── components/         # React components
│   │   ├── ConnectTab.tsx     # BLE device connection
│   │   ├── CollectTab.tsx     # Data collection controls
│   │   ├── LiveChart.tsx      # Real-time data visualization
│   │   ├── DeviceList.tsx     # BLE device management
│   │   └── ...
│   ├── styles/            # CSS and styling
│   └── main.tsx          # Application entry point
├── src-tauri/            # Rust backend
│   ├── src/
│   │   ├── main.rs       # Tauri commands and BLE logic
│   │   └── lib.rs        # Library configuration
│   ├── Cargo.toml        # Rust dependencies
│   └── tauri.conf.json   # Tauri configuration
├── public/               # Static assets
├── dist/                 # Built frontend (generated)
└── package.json          # Node.js dependencies and scripts
```

## 🔌 BLE Integration

### Supported Data Format

- **Packet Size**: 24 bytes (6 × 4-byte floats)
- **Data Channels**: R1, R2, R3, X, Y, Z
- **Byte Order**: Little-endian
- **Sample Rate**: Up to 100Hz

### Arduino/ESP32 Compatibility

Compatible with sensors using the standard gait monitoring format:

```cpp
// Example Arduino BLE characteristic
// Service UUID: 48877734-d012-40c4-81de-3ab006f71189
// Characteristic UUID: 8c4711b4-571b-41ba-a240-73e6884a85eb
```

## 🎯 Usage

1. **Connect Tab**: Scan for and connect to BLE gait sensors
2. **Collect Tab**: Start/stop data collection from connected devices
3. **Live Chart**: View real-time 6-channel sensor data
4. **Logs Tab**: Monitor system events and diagnostics
5. **Settings Tab**: Configure application preferences

## 🛠️ Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm run tauri dev

# Build frontend only
npm run build

# Build production application
npm run tauri build

# Lint code
npm run lint

# Type check
npm run type-check
```

## 📊 Data Visualization

The LiveChart component provides:

- **6 color-coded channels** for different sensor readings
- **Scrolling time window** with configurable duration
- **100Hz update rate** for smooth real-time display
- **Automatic scaling** based on data range
- **Performance optimized** for continuous streaming

## 🔧 Configuration

### Tauri Configuration (`src-tauri/tauri.conf.json`)

- Application metadata and build settings
- Window configuration and permissions
- Bundle identifier and version info

### Rust Dependencies (`src-tauri/Cargo.toml`)

- BLE functionality via `btleplug`
- Async runtime with `async-std`
- UUID handling and futures support

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### BLE Issues

- Ensure Bluetooth adapter is enabled
- Check device permissions on your OS
- Verify sensor device compatibility

### Build Issues

- Update Rust to latest stable version
- Clear node_modules and reinstall dependencies
- Check Tauri prerequisites for your platform

### Performance Issues

- Monitor memory usage during data collection
- Adjust chart update frequency if needed
- Check for background processes interfering with BLE

## 📞 Support

For issues and questions:

- Check the [Issues](./issues) section
- Review the troubleshooting guide above
- Consult Tauri documentation for platform-specific help
