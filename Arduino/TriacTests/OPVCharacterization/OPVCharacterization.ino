/*
  OPVCharacterization.ino

  Purpose:
  - Blind-basket OPV / pump characterization with deterministic timing
  - Burst-fire triac control (RobotDyn dimmer) via pump power %
  - Pressure transducer reading + raw + filtered pressure reporting
  - WebSocket server for remote control + logging (no Serial dependency)

  IMPORTANT:
  - This sketch intentionally uses the SAME mDNS hostname and WS URL conventions as ShotStopper:
    ws://shotstopper-ws.local:81/ws
    Only one device using "shotstopper-ws" can be on the network at a time.

  Pins (same as other TriacTests sketches):
  - ZC_PIN       (GPIO14): Zero-cross input from dimmer module
  - DIM_PIN      (GPIO17): Triac gate output to dimmer module
  - OUT_PIN      (GPIO19): Optocoupler output to "press" the machine button (start/stop pump)
  - PRESSURE_PIN (GPIO4):  ADC input for pressure transducer (via 10k/22k divider)

  Commands (WebSocket JSON):
  - {"command":"setPower","powerPct":0..100}
  - {"command":"startPump"} / {"command":"stopPump"}
  - {"command":"status"}

  Telemetry (WebSocket JSON, broadcast every 50ms):
  - timestamp_ms
  - pumpPowerPct
  - pressureBar (filtered + bias, matches your stabilized logic)
  - pressureBarRaw (raw clamped, no bias)
  - adcValue, adcVoltage, sensorVoltage
*/

#include <Arduino.h>
#include "driver/gpio.h"
#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include <ArduinoJson.h>

// ================== PINS ==================
#define ZC_PIN        14
#define DIM_PIN       17
#define OUT_PIN       19
#define PRESSURE_PIN  4

// ================== WIFI / WEBSOCKET (match ShotStopper conventions) ==================
#define WIFI_SSID "Kenyon19"
#define WIFI_PASSWORD "Kenyon_1"
#define WS_SERVER_PORT 81
#define WS_SERVER_PATH "/ws"
#define MDNS_HOSTNAME "shotstopper-ws"

WebSocketsServer webSocket = WebSocketsServer(WS_SERVER_PORT);

// ================== TRIAC (PumpProfiler burst-fire pattern) ==================
static constexpr uint32_t HALF_CYCLE_US = 8333;           // 60 Hz
static constexpr uint32_t HOLD_US = HALF_CYCLE_US - 300;  // latch time
static constexpr uint8_t  BUCKET_SIZE = 20;               // burst-fire resolution

volatile uint32_t zcCount = 0;
volatile uint32_t fireCount = 0;
volatile uint8_t  bucketIdx = 0;
volatile uint8_t  pumpPowerPct = 0; // 0..100

hw_timer_t* offTimer = nullptr;

static inline uint8_t fireCyclesFor(uint8_t pct) {
  if (pct >= 100) return BUCKET_SIZE;
  return (uint16_t)pct * BUCKET_SIZE / 100;
}

void IRAM_ATTR onOffTimer() {
  gpio_set_level((gpio_num_t)DIM_PIN, 0);
  timerStop(offTimer);
}

void IRAM_ATTR onZeroCross() {
  zcCount++;

  bucketIdx++;
  if (bucketIdx >= BUCKET_SIZE) bucketIdx = 0;

  const uint8_t fireCycles = fireCyclesFor(pumpPowerPct);
  if (fireCycles == 0) return;
  if (bucketIdx >= fireCycles) return;

  gpio_set_level((gpio_num_t)DIM_PIN, 1);

  timerWrite(offTimer, 0);
  timerAlarm(offTimer, HOLD_US, false, 0);
  timerStart(offTimer);

  fireCount++;
}

// ================== PRESSURE (match ShotStopperWithPressure logic) ==================
static constexpr uint32_t PRESSURE_READ_INTERVAL_MS = 50;
static constexpr float VOLTAGE_DIVIDER_RATIO = 1.4545f;
static constexpr float ADC_REFERENCE_VOLTAGE = 3.3f;
static constexpr int   ADC_RESOLUTION = 4095;
static constexpr float SENSOR_MIN_VOLTAGE = 0.5f;
static constexpr float SENSOR_MAX_VOLTAGE = 4.5f;
static constexpr float PRESSURE_MAX_MPA = 1.6f;
static constexpr float MPA_TO_BAR = 10.0f;

static constexpr float FILTER_ALPHA_DISPLAY = 0.15f;
static constexpr float MAX_PRESSURE_CHANGE_BAR = 3.0f;
static constexpr float PRESSURE_BIAS_BAR = 0.5f;
static constexpr float MIN_PRESSURE_BAR = 0.0f;
static constexpr float MAX_PRESSURE_BAR = 16.0f;

uint32_t lastPressureRead_ms = 0;
bool filterInitialized = false;
float filteredPressureBar_display = 0.0f;

float pressureBarFiltered = 0.0f; // filtered + bias (display)
float pressureBarRaw = 0.0f;      // raw clamped (no bias)

int   lastAdcValue = 0;
float lastAdcVoltage = 0.0f;
float lastSensorVoltage = 0.0f;

static float clampf(float x, float lo, float hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

void readPressure() {
  const uint32_t now = millis();
  if (now - lastPressureRead_ms < PRESSURE_READ_INTERVAL_MS) return;
  lastPressureRead_ms = now;

  int adcValue = analogRead(PRESSURE_PIN);
  float adcVoltage = (adcValue / (float)ADC_RESOLUTION) * ADC_REFERENCE_VOLTAGE;
  float sensorVoltage = adcVoltage * VOLTAGE_DIVIDER_RATIO;

  lastAdcValue = adcValue;
  lastAdcVoltage = adcVoltage;
  lastSensorVoltage = sensorVoltage;

  float pressureMPA = 0.0f;
  if (sensorVoltage >= SENSOR_MIN_VOLTAGE && sensorVoltage <= SENSOR_MAX_VOLTAGE) {
    float voltageRange = SENSOR_MAX_VOLTAGE - SENSOR_MIN_VOLTAGE;
    pressureMPA = (sensorVoltage - SENSOR_MIN_VOLTAGE) * (PRESSURE_MAX_MPA / voltageRange);
  } else if (sensorVoltage < SENSOR_MIN_VOLTAGE) {
    pressureMPA = 0.0f;
  } else {
    pressureMPA = PRESSURE_MAX_MPA;
  }

  float barRaw = pressureMPA * MPA_TO_BAR;
  barRaw = clampf(barRaw, MIN_PRESSURE_BAR, MAX_PRESSURE_BAR);
  pressureBarRaw = barRaw;

  // jump clamp relative to filtered display (asymmetric up/down)
  float barClamped = barRaw;
  if (filterInitialized) {
    float change = barRaw - filteredPressureBar_display;
    float maxChangeUp = MAX_PRESSURE_CHANGE_BAR * 1.5f;
    float maxChangeDown = MAX_PRESSURE_CHANGE_BAR * 0.7f;
    if (change > maxChangeUp) {
      barClamped = filteredPressureBar_display + maxChangeUp;
    } else if (change < -maxChangeDown) {
      barClamped = filteredPressureBar_display - maxChangeDown;
    }
  }

  if (!filterInitialized) {
    filteredPressureBar_display = barClamped;
    filterInitialized = true;
  } else {
    float alpha = (barClamped > filteredPressureBar_display) ? (FILTER_ALPHA_DISPLAY * 1.5f)
                                                            : (FILTER_ALPHA_DISPLAY * 0.7f);
    filteredPressureBar_display = alpha * barClamped + (1.0f - alpha) * filteredPressureBar_display;
  }

  pressureBarFiltered = filteredPressureBar_display + PRESSURE_BIAS_BAR;
}

// ================== MACHINE BUTTON (optocoupler) ==================
uint32_t lastOptoMs = 0;
bool pumpRunning = false;

void pulseOptoButton() {
  uint32_t now = millis();
  if (now - lastOptoMs < 700) return;
  lastOptoMs = now;
  digitalWrite(OUT_PIN, HIGH);
  delay(250);
  digitalWrite(OUT_PIN, LOW);
  yield();
}

// ================== TELEMETRY ==================
static constexpr uint32_t TELEMETRY_INTERVAL_MS = 50;
uint32_t lastTelemetryMs = 0;

void sendTelemetry() {
  if (webSocket.connectedClients() == 0) return;

  StaticJsonDocument<256> doc;
  doc["timestamp_ms"] = (uint32_t)millis();
  doc["pumpPowerPct"] = (uint8_t)pumpPowerPct;
  doc["pumpRunning"] = pumpRunning;
  doc["pressureBar"] = pressureBarFiltered;
  doc["pressureBarRaw"] = pressureBarRaw;
  doc["adcValue"] = lastAdcValue;
  doc["adcVoltage"] = lastAdcVoltage;
  doc["sensorVoltage"] = lastSensorVoltage;

  String json;
  serializeJson(doc, json);
  webSocket.broadcastTXT(json);
}

// ================== WIFI / MDNS / WS init (match ShotStopper printing) ==================
void initWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("");
    Serial.println("WiFi connection failed!");
  }
}

void initMDNS() {
  if (!MDNS.begin(MDNS_HOSTNAME)) {
    Serial.println("Error setting up MDNS responder!");
    return;
  }
  Serial.printf("mDNS responder started. Hostname: %s.local\n", MDNS_HOSTNAME);
  MDNS.addService("http", "tcp", WS_SERVER_PORT);
  Serial.printf("mDNS service added: http._tcp on port %d\n", WS_SERVER_PORT);
}

void initWebSocket() {
  webSocket.begin();
  // event handler below
  Serial.printf("WebSocket server started on port %d\n", WS_SERVER_PORT);
  Serial.printf("Connect to: ws://%s.local:%d%s\n", MDNS_HOSTNAME, WS_SERVER_PORT, WS_SERVER_PATH);
}

// ================== WS event handler ==================
void webSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WebSocket] Client #%u disconnected\n", num);
      break;
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[WebSocket] Client #%u connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
      // Send one immediate telemetry snapshot
      sendTelemetry();
      break;
    }
    case WStype_TEXT: {
      StaticJsonDocument<192> doc;
      DeserializationError err = deserializeJson(doc, payload, length);
      if (err) {
        Serial.printf("[WebSocket] JSON parse error: %s\n", err.c_str());
        break;
      }

      const char* cmd = doc["command"] | "";
      if (strcmp(cmd, "setPower") == 0) {
        int p = doc["powerPct"] | 0;
        if (p < 0) p = 0;
        if (p > 100) p = 100;
        pumpPowerPct = (uint8_t)p;
        StaticJsonDocument<128> resp;
        resp["command"] = "setPower";
        resp["success"] = true;
        resp["powerPct"] = pumpPowerPct;
        String out;
        serializeJson(resp, out);
        webSocket.sendTXT(num, out.c_str());
      } else if (strcmp(cmd, "startPump") == 0) {
        pumpRunning = true;
        pulseOptoButton();
        StaticJsonDocument<128> resp;
        resp["command"] = "startPump";
        resp["success"] = true;
        String out;
        serializeJson(resp, out);
        webSocket.sendTXT(num, out.c_str());
      } else if (strcmp(cmd, "stopPump") == 0) {
        pumpRunning = false;
        pulseOptoButton();
        StaticJsonDocument<128> resp;
        resp["command"] = "stopPump";
        resp["success"] = true;
        String out;
        serializeJson(resp, out);
        webSocket.sendTXT(num, out.c_str());
      } else if (strcmp(cmd, "status") == 0) {
        StaticJsonDocument<256> resp;
        resp["command"] = "status";
        resp["success"] = true;
        resp["pumpPowerPct"] = (uint8_t)pumpPowerPct;
        resp["pumpRunning"] = pumpRunning;
        resp["pressureBar"] = pressureBarFiltered;
        resp["pressureBarRaw"] = pressureBarRaw;
        resp["adcValue"] = lastAdcValue;
        resp["adcVoltage"] = lastAdcVoltage;
        resp["sensorVoltage"] = lastSensorVoltage;
        String out;
        serializeJson(resp, out);
        webSocket.sendTXT(num, out.c_str());
      }
      break;
    }
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(800);

  // Triac GPIO (ISR-safe)
  gpio_reset_pin((gpio_num_t)DIM_PIN);
  gpio_set_direction((gpio_num_t)DIM_PIN, GPIO_MODE_OUTPUT);
  gpio_set_level((gpio_num_t)DIM_PIN, 0);
  pinMode(ZC_PIN, INPUT_PULLUP);

  // Opto button
  pinMode(OUT_PIN, OUTPUT);
  digitalWrite(OUT_PIN, LOW);

  // Pressure ADC
  pinMode(PRESSURE_PIN, INPUT);
  analogReadResolution(12);
  // Use attenuation so the ADC pin range can cover ~0.34–3.09V if needed
  analogSetPinAttenuation(PRESSURE_PIN, ADC_11db);
  analogSetAttenuation(ADC_11db);

  offTimer = timerBegin(1000000); // 1MHz tick
  timerAttachInterrupt(offTimer, &onOffTimer);
  timerStop(offTimer);
  attachInterrupt(digitalPinToInterrupt(ZC_PIN), onZeroCross, RISING);

  // WiFi + WS
  initWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    initMDNS();
    initWebSocket();
    webSocket.onEvent(webSocketEvent);
  }

  Serial.println("[READY] OPVCharacterization running");
}

void loop() {
  const uint32_t now = millis();

  if (WiFi.status() == WL_CONNECTED) {
    webSocket.loop();
  }

  readPressure();

  if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = now;
    sendTelemetry();
  }
}



