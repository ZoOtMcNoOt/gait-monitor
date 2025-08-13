# Gait Monitor Arduino Sketches

This directory contains Arduino sketches for the Gait Monitor BLE devices.

## Files

- `gaitBLE_LeftFoot.ino` - Left foot device sketch
- `gaitBLE_RightFoot.ino` - Right foot device sketch

## Device Identification

Each sketch advertises with a unique BLE local name to make device identification easier:

- **Left Foot Device**: Advertises as "GaitBLE_LeftFoot"
- **Right Foot Device**: Advertises as "GaitBLE_RightFoot"

## Mock Data Patterns

To help distinguish between devices during testing, each sketch generates slightly different mock data patterns:

### Left Foot Device

- R1: 12.0 + k \* 0.8
- R2: 13.0 + k \* 0.9
- R3: 14.0 + k \* 1.1
- X: 16.0 + k \* 0.7
- Y: 17.0 + k \* 0.6
- Z: 18.0 + k \* 0.5

### Right Foot Device

- R1: 8.0 + k \* 1.2
- R2: 9.0 + k \* 1.1
- R3: 10.0 + k \* 0.9
- X: 12.0 + k \* 0.8
- Y: 13.0 + k \* 0.9
- Z: 14.0 + k \* 1.0

## Usage

1. Upload `gaitBLE_LeftFoot.ino` to your left foot sensor device
2. Upload `gaitBLE_RightFoot.ino` to your right foot sensor device
3. Both devices will appear in the Gait Monitor app with their respective names
4. The app can connect to and collect data from both devices simultaneously

## Hardware Requirements

- Arduino-compatible board with BLE capability (e.g., Arduino Nano 33 BLE)
- ArduinoBLE library installed
- Built-in LED for connection status indication

## BLE Service Details

Both sketches use the same BLE service and characteristic UUIDs for consistency:

- Service UUID: `48877734-d012-40c4-81de-3ab006f71189`
- Characteristic UUID: `8c4711b4-571b-41ba-a240-73e6884a85eb`

The characteristic supports:

- Read operations
- Notify operations
- 24-byte fixed-length packets (6 floats × 4 bytes each)
- ~100Hz data transmission rate

## Next Steps

Replace the mock data generation with actual sensor readings from your gait monitoring hardware (accelerometers, gyroscopes, pressure sensors, etc.).
