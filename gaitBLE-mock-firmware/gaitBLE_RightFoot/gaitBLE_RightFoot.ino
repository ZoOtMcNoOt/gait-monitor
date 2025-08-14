#include <ArduinoBLE.h>

// Right foot device configuration
BLEService gaitService("48877734-d012-40c4-81de-3ab006f71189");
BLECharacteristic gaitCharacteristic(
  "8c4711b4-571b-41ba-a240-73e6884a85eb",
  BLERead   | BLENotify,
  29,       // 5-byte timestamp + 6 floats
  true      // fixed length
);

typedef union {
  float   number;
  uint8_t bytes[4];
} FLOATUNION_t;

// Packet layout (29 bytes total):
// [0..4]  5-byte little-endian device timestamp (microseconds, lower 40 bits)
// [5..28] 6 floats (24 bytes)
uint8_t data_packet[29];
const int ledPin = LED_BUILTIN;

const unsigned long SAMPLE_INTERVAL_US = 10000UL; // 100 Hz
unsigned long lastSampleUs = 0; // updated incrementally to avoid drift
bool advertisingActive = true; // we start advertising in setup

void setup() {
  Serial.begin(9600);
  unsigned long startTime = millis();
  while (!Serial && (millis() - startTime < 3000)) {
    delay(10);
  }

  pinMode(ledPin, OUTPUT);
  if (!BLE.begin()) {
    Serial.println("BLE init failed");
    while (1);
  }

  // configure service & characteristic
  BLE.setConnectionInterval(30, 45);
  BLE.setLocalName("GaitBLE_RightFoot");
  BLE.setAdvertisedService(gaitService);
  gaitService.addCharacteristic(gaitCharacteristic);
  BLE.addService(gaitService);

  // initial advertising
  BLE.advertise();
  advertisingActive = true;
  Serial.println("Advertising as 'GaitBLE_RightFoot'");
}

void loop() {
  BLE.poll();
  BLEDevice central = BLE.central();
  if (!central) {
    if (!advertisingActive) {
      BLE.advertise();
      advertisingActive = true;
      Serial.println("Re-advertising 'GaitBLE_RightFoot'");
    }
    delay(5); // tiny idle delay prevents tight spin starving lower-level tasks
    return;
  }
  
  // connected!
  Serial.print("Right Foot Device Connected to ");
  Serial.println(central.address());
  digitalWrite(ledPin, HIGH);
  advertisingActive = false; // no longer advertising while connected

  unsigned long connectionStartTime = millis();
  
  lastSampleUs = micros();
  while (central.connected()) {
    BLE.poll();  // keep radio active & allow timely notifications

    unsigned long nowUs = micros();
    if ((long)(nowUs - lastSampleUs) >= (long)SAMPLE_INTERVAL_US) {
      // Increment by interval (not set to now) to minimize cumulative drift
      lastSampleUs += SAMPLE_INTERVAL_US;

      unsigned long currentTime = millis();
      float timeSeconds = (currentTime - connectionStartTime) / 1000.0f;

      // --- mock data for RIGHT FOOT (opposite phase) ---
      float walkCycle = sin(timeSeconds * 2.0f * PI + PI);  // 1 Hz walking cycle, opposite phase
      float stepPhase = sin(timeSeconds * 4.0f * PI + PI);  // 2 Hz step pattern, opposite phase
      
      FLOATUNION_t R1{ 8.0f + walkCycle * 9.0f + stepPhase * 2.5f };
      FLOATUNION_t R2{ 9.0f + walkCycle * 8.0f + stepPhase * 2.0f };
      FLOATUNION_t R3{ 10.0f + walkCycle * 7.0f + stepPhase * 1.5f };
      FLOATUNION_t X{ 0.5f + walkCycle * 0.8f + stepPhase * 0.3f };
      FLOATUNION_t Y{ -0.2f + sin(timeSeconds * 2.0f * PI - PI/4) * 0.6f };
      FLOATUNION_t Z{ 9.8f + sin(timeSeconds * 4.0f * PI + PI) * 1.5f + walkCycle * 0.5f };

  // High-resolution device timestamp handling
  unsigned long nowMicros = micros();
  static unsigned long lastMicros = 0;
  static uint32_t rolloverCount = 0;
  if (nowMicros < lastMicros) { rolloverCount++; }
  lastMicros = nowMicros;
  unsigned long long extended = ((unsigned long long)rolloverCount << 32) | (unsigned long long)nowMicros;
  unsigned long long ts40 = extended & 0xFFFFFFFFFFULL; // lower 40 bits
  for (int i = 0; i < 5; i++) { data_packet[i] = (uint8_t)((ts40 >> (8 * i)) & 0xFF); }
  memcpy(&data_packet[5],  &R1.bytes, 4);
  memcpy(&data_packet[9],  &R2.bytes, 4);
  memcpy(&data_packet[13], &R3.bytes, 4);
  memcpy(&data_packet[17], &X.bytes, 4);
  memcpy(&data_packet[21], &Y.bytes, 4);
  memcpy(&data_packet[25], &Z.bytes, 4);

  gaitCharacteristic.writeValue(data_packet, sizeof(data_packet)); // 29 bytes
    }
  }

  // disconnected → go back to advertising
  Serial.print("Right Foot Device Disconnected from ");
  Serial.println(central.address());
  digitalWrite(ledPin, LOW);
  // next loop iteration will call BLE.advertise() again
}