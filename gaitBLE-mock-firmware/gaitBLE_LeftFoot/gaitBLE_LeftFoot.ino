#include <ArduinoBLE.h>

// Left foot device configuration
BLEService gaitService("48877734-d012-40c4-81de-3ab006f71189");
BLECharacteristic gaitCharacteristic(
  "8c4711b4-571b-41ba-a240-73e6884a85eb",
  BLERead   | BLENotify,
  24,       // 6 floats × 4 bytes each (R1, R2, R3, X, Y, Z)
  true      // fixed length
);

typedef union {
  float   number;
  uint8_t bytes[4];
} FLOATUNION_t;

uint8_t data_packet[24]; // 6 floats for R1, R2, R3, X, Y, Z
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
  BLE.setConnectionInterval(7.5, 15);
  BLE.setLocalName("GaitBLE_LeftFoot");
  BLE.setAdvertisedService(gaitService);
  gaitService.addCharacteristic(gaitCharacteristic);
  BLE.addService(gaitService);

  // initial advertising
  BLE.advertise();
  advertisingActive = true;
  Serial.println("Advertising as 'GaitBLE_LeftFoot'");
}

void loop() {
  BLE.poll();
  BLEDevice central = BLE.central();
  if (!central) {
    if (!advertisingActive) {
      BLE.advertise();
      advertisingActive = true;
      Serial.println("Re-advertising 'GaitBLE_LeftFoot'");
    }
    delay(5); // tiny idle delay prevents tight spin starving lower-level tasks
    return;
  }

  // connected!
  Serial.print("Left Foot Device Connected to ");
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

      // --- mock data generation (unchanged) ---
      float walkCycle = sin(timeSeconds * 2.0f * PI); // 1 Hz walking cycle
      float stepPhase = sin(timeSeconds * 4.0f * PI); // 2 Hz step pattern

      FLOATUNION_t R1{12.0f + walkCycle * 8.0f + stepPhase * 2.0f};
      FLOATUNION_t R2{13.0f + walkCycle * 7.0f + stepPhase * 1.5f};
      FLOATUNION_t R3{14.0f + walkCycle * 6.0f + stepPhase * 1.0f};
      FLOATUNION_t X {0.5f + walkCycle * 0.8f + stepPhase * 0.3f};
      FLOATUNION_t Y {0.2f + sin(timeSeconds * 2.0f * PI + PI/4) * 0.6f};
      FLOATUNION_t Z {9.8f + sin(timeSeconds * 4.0f * PI) * 1.5f + walkCycle * 0.5f};

      memcpy(&data_packet[ 0], &R1.bytes, 4);
      memcpy(&data_packet[ 4], &R2.bytes, 4);
      memcpy(&data_packet[ 8], &R3.bytes, 4);
      memcpy(&data_packet[12], &X.bytes, 4);
      memcpy(&data_packet[16], &Y.bytes, 4);
      memcpy(&data_packet[20], &Z.bytes, 4);

      gaitCharacteristic.writeValue(data_packet, sizeof(data_packet));
    }
  }

  // disconnected → go back to advertising
  Serial.print("Left Foot Device Disconnected from ");
  Serial.println(central.address());
  digitalWrite(ledPin, LOW);
  // next loop iteration will call BLE.advertise() again
}