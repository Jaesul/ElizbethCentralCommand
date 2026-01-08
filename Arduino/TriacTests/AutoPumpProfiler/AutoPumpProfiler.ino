/*
  AutoPumpProfiler.ino - Automated Pump Profiling System
  
  This sketch automatically profiles the pump at different power levels (30-100%)
  with automatic timing, pressure logging, and button control.
  
  Features:
  - Auto-increment power levels from 30% to 100% (10% steps)
  - 12 second recording period per power level
  - 40 second pause between power levels
  - Button control to start/stop profiling sequence
  - CSV output with timestamps, flow, and pressure (bar)
  
  Hardware Connections:
  - GPIO 14 (ZC): Zero-crossing detector input
  - GPIO 17 (DIM): Triac gate control output
  - GPIO 19 (OUT_PIN): Optocoupler output for button control
  - BLE: Acaia scale connection
  - GPIO 4 (PRESSURE_PIN): ADC input for pressure transducer (via divider)
*/

#include <Arduino.h>
#include "driver/gpio.h"
#include <AcaiaArduinoBLE.h>
#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include <ArduinoJson.h>

// ================== PINS ==================
#define ZC_PIN       14
#define DIM_PIN      17
#define OUT_PIN      19      // Optocoupler for button control
#define PRESSURE_PIN 4       // Pressure transducer ADC (matches stabilized firmware)

// ================== CONFIG ==================
static constexpr uint32_t HALF_CYCLE_US = 8333;      // 60 Hz
static constexpr uint32_t HOLD_US = HALF_CYCLE_US - 300;
static constexpr uint8_t  BUCKET_SIZE = 20;          // burst-fire resolution

// ================== WIFI / WEBSOCKET (match ShotStopperWithPressure) ==================
// NOTE: If you're flashing this onto the SAME ESP32-S3 you run ShotStopper on,
// keeping the same hostname/port makes your tooling/clients reusable.
// If you have TWO devices on the network simultaneously, change MDNS_HOSTNAME to avoid conflicts.
#define WIFI_SSID "Kenyon19"
#define WIFI_PASSWORD "Kenyon_1"
#define WS_SERVER_PORT 81
#define WS_SERVER_PATH "/ws"
#define MDNS_HOSTNAME "shotstopper-ws"

WebSocketsServer webSocket = WebSocketsServer(WS_SERVER_PORT);

// Timing configuration
static constexpr uint8_t  MIN_POWER_PCT = 30;
static constexpr uint8_t  MAX_POWER_PCT = 100;
static constexpr uint8_t  POWER_STEP_PCT = 10;
static constexpr uint32_t RECORDING_DURATION_MS = 12000;  // 12 seconds
static constexpr uint32_t PAUSE_DURATION_MS = 40000;      // 40 seconds

// Logging configuration
static constexpr uint32_t LOG_INTERVAL_MS = 100;     // 10 Hz logging
static constexpr float    FLOW_ALPHA = 0.25;         // EMA smoothing
static constexpr float    FLOW_DEADBAND_G = 0.03;

// ================== PRESSURE (same conversion as PressureReader/PressureProfileController) ==================
static constexpr uint32_t PRESSURE_READ_INTERVAL_MS = 50; // ~20 Hz
static constexpr float VOLTAGE_DIVIDER_RATIO = 1.4545f;   // ADC_V * ratio = sensor_V (10k/22k divider)
static constexpr float ADC_REFERENCE_VOLTAGE = 3.3f;
static constexpr int   ADC_RESOLUTION = 4095;
static constexpr float SENSOR_MIN_VOLTAGE = 0.5f;
static constexpr float SENSOR_MAX_VOLTAGE = 4.5f;
static constexpr float PRESSURE_MAX_MPA = 1.6f;
static constexpr float MPA_TO_BAR = 10.0f;
static constexpr float MIN_PRESSURE_BAR = 0.0f;
static constexpr float MAX_PRESSURE_BAR = 16.0f;

// Light filtering + jump clamp (reuse tuned values)
static constexpr float FILTER_ALPHA_DISPLAY = 0.15f;
static constexpr float MAX_PRESSURE_CHANGE_BAR = 3.0f;
static constexpr float PRESSURE_BIAS_BAR = 0.5f;

uint32_t lastPressureRead_ms = 0;
bool pressureFilterInitialized = false;
float filteredPressureBar_display = 0.0f;
float currentPressureBar = 0.0f;   // value we log (bar)

// Debug/telemetry to compare against ShotStopperWithPressure
int   lastAdcValue = 0;
float lastAdcVoltage = 0.0f;
float lastSensorVoltage = 0.0f;
float lastPressureBar_raw = 0.0f;

static float clampf(float x, float lo, float hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

void readPressure() {
  const uint32_t now = millis();
  if (now - lastPressureRead_ms < PRESSURE_READ_INTERVAL_MS) return;
  lastPressureRead_ms = now;

  // Match ShotStopperWithPressure conversion (raw ADC -> assume 3.3V reference)
  const int adcValue = analogRead(PRESSURE_PIN);
  const float adcVoltage = (adcValue / (float)ADC_RESOLUTION) * ADC_REFERENCE_VOLTAGE;
  const float sensorVoltage = adcVoltage * VOLTAGE_DIVIDER_RATIO;
  lastAdcValue = adcValue;
  lastAdcVoltage = adcVoltage;
  lastSensorVoltage = sensorVoltage;

  float pressureMPA = 0.0f;
  if (sensorVoltage >= SENSOR_MIN_VOLTAGE && sensorVoltage <= SENSOR_MAX_VOLTAGE) {
    const float voltageRange = SENSOR_MAX_VOLTAGE - SENSOR_MIN_VOLTAGE;
    pressureMPA = (sensorVoltage - SENSOR_MIN_VOLTAGE) * (PRESSURE_MAX_MPA / voltageRange);
  } else if (sensorVoltage < SENSOR_MIN_VOLTAGE) {
    pressureMPA = 0.0f;
  } else {
    pressureMPA = PRESSURE_MAX_MPA;
  }

  float pressureBar_raw = pressureMPA * MPA_TO_BAR;
  lastPressureBar_raw = pressureBar_raw;
  pressureBar_raw = clampf(pressureBar_raw, MIN_PRESSURE_BAR, MAX_PRESSURE_BAR);

  float pressureBar_clamped = pressureBar_raw;
  if (pressureFilterInitialized) {
    const float change = pressureBar_raw - filteredPressureBar_display;
    const float maxChangeUp = MAX_PRESSURE_CHANGE_BAR * 1.5f;
    const float maxChangeDown = MAX_PRESSURE_CHANGE_BAR * 0.7f;
    if (change > maxChangeUp) {
      pressureBar_clamped = filteredPressureBar_display + maxChangeUp;
    } else if (change < -maxChangeDown) {
      pressureBar_clamped = filteredPressureBar_display - maxChangeDown;
    }
  }

  if (!pressureFilterInitialized) {
    filteredPressureBar_display = pressureBar_clamped;
    pressureFilterInitialized = true;
  } else {
    const float alphaDisplay =
      (pressureBar_clamped > filteredPressureBar_display) ? (FILTER_ALPHA_DISPLAY * 1.5f)
                                                          : (FILTER_ALPHA_DISPLAY * 0.7f);
    filteredPressureBar_display =
      alphaDisplay * pressureBar_clamped + (1.0f - alphaDisplay) * filteredPressureBar_display;
  }

  // IMPORTANT: For profiling, log the raw (clamped) pressure as "pressure_bar" to avoid filter lag.
  // Filtering is still computed (for optional STATUS debugging), but your CSV/analysis should use the raw value.
  currentPressureBar = pressureBar_raw;
}

// ================== TRIAC STATE ==================
volatile uint32_t zcCount = 0;
volatile uint32_t fireCount = 0;
volatile uint8_t  bucketIdx = 0;
volatile uint8_t  currentPowerPct = 0;

hw_timer_t* offTimer = nullptr;

// ================== SCALE ==================
AcaiaArduinoBLE scale(false);

// ================== FLOW STATE ==================
float lastWeight = NAN;
uint32_t lastWeightMs = 0;
float flowEMA = 0.0;

// ================== PROFILING STATE ==================
enum ProfilingState {
  IDLE,
  WAITING_FOR_BUTTON,
  RECORDING,
  PAUSING
};

ProfilingState profilingState = IDLE;
uint8_t currentPowerLevel = MIN_POWER_PCT;
uint32_t stateStartTime = 0;
bool buttonPressed = false;
bool buttonStopTriggered = false;
unsigned long lastOptocouplerPulse_ms = 0;
bool idleMessagePrinted = false;

// ================== LOGGING (Serial + WebSocket) ==================
void logLine(const String& s) {
  Serial.println(s);
  if (WiFi.status() == WL_CONNECTED && webSocket.connectedClients() > 0) {
    // WebSocketsServer::broadcastTXT expects a non-const String&
    String payload = s;
    webSocket.broadcastTXT(payload);
  }
}

// ================== WIFI HELPERS ==================
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

  // Match ShotStopper: advertise as http._tcp on the WS port
  MDNS.addService("http", "tcp", WS_SERVER_PORT);
  Serial.printf("mDNS service added: http._tcp on port %d\n", WS_SERVER_PORT);
}

void initWebSocket() {
  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);
  Serial.printf("WebSocket server started on port %d\n", WS_SERVER_PORT);
  Serial.printf("Connect to: ws://%s.local:%d%s\n", MDNS_HOSTNAME, WS_SERVER_PORT, WS_SERVER_PATH);
}

// ================== WEBSOCKET CONTROL ==================
// Commands (text):
//   GO / STOP / STATUS
//   PING (replies PONG)
void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      // Match ShotStopper logging style (payload contains URL)
      Serial.printf("[%u] Connected from %d.%d.%d.%d url: %s\n", num, ip[0], ip[1], ip[2], ip[3], payload);
      break;
    }
    case WStype_DISCONNECTED:
      Serial.printf("[ws] client %u disconnected\n", num);
      break;
    case WStype_TEXT: {
      String cmdRaw;
      cmdRaw.reserve(length);
      for (size_t i = 0; i < length; i++) cmdRaw += (char)payload[i];
      cmdRaw.trim();

      // Accept either plain text "GO" or JSON { "command": "GO" } (to match ShotStopper clients)
      String cmd = cmdRaw;
      if (cmdRaw.startsWith("{")) {
        StaticJsonDocument<128> doc;
        DeserializationError err = deserializeJson(doc, cmdRaw);
        if (!err && doc.containsKey("command")) {
          cmd = String((const char*)doc["command"]);
        }
      }
      cmd.trim();
      cmd.toUpperCase();

      if (cmd == "PING") {
        webSocket.sendTXT(num, "PONG");
        return;
      }

      // Mirror existing Serial command semantics
      if (cmd == "GO") {
        if (profilingState == IDLE) {
          profilingState = WAITING_FOR_BUTTON;
          currentPowerLevel = MIN_POWER_PCT;
          stateStartTime = millis();
          idleMessagePrinted = false;
          logLine("[PROFILE] Starting profiling sequence...");
          logLine("[PROFILE] Press button to start first test at 30%");
        } else {
          webSocket.sendTXT(num, "[PROFILE] Already running. Send STOP to abort.");
        }
      } else if (cmd == "STOP") {
        if (profilingState != IDLE) {
          profilingState = IDLE;
          currentPowerPct = 100; // boiler refill
          idleMessagePrinted = false;
          logLine("[PROFILE] Profiling stopped by user (pump at 100% for boiler refill)");
        }
      } else if (cmd == "STATUS") {
        String s = "[STATUS] State: ";
        s += (profilingState == IDLE ? "IDLE" :
              profilingState == WAITING_FOR_BUTTON ? "WAITING_FOR_BUTTON" :
              profilingState == RECORDING ? "RECORDING" : "PAUSING");
        s += ", Power: ";
        s += String((unsigned)currentPowerPct);
        s += "%, Current Level: ";
        s += String((unsigned)currentPowerLevel);
        s += "%";
        s += " | p_raw=";
        s += String(lastPressureBar_raw, 2);
        s += "bar adc=";
        s += String(lastAdcValue);
        s += " adcV=";
        s += String(lastAdcVoltage, 3);
        s += " sensorV=";
        s += String(lastSensorVoltage, 3);
        webSocket.sendTXT(num, s);
      } else {
        webSocket.sendTXT(num, "[ws] Unknown command. Use GO/STOP/STATUS/PING.");
      }
      break;
    }
    default:
      break;
  }
}

// ================== HELPER FUNCTIONS ==================
static inline uint8_t fireCyclesFor(uint8_t pct) {
  return (uint16_t)pct * BUCKET_SIZE / 100;
}

// ================== TIMER ISR ==================
void IRAM_ATTR onOffTimer() {
  gpio_set_level((gpio_num_t)DIM_PIN, 0);
  timerStop(offTimer);
}

// ================== ZERO CROSS ISR ==================
void IRAM_ATTR onZeroCross() {
  zcCount++;

  bucketIdx++;
  if (bucketIdx >= BUCKET_SIZE) bucketIdx = 0;

  const uint8_t fireCycles = fireCyclesFor(currentPowerPct);
  if (fireCycles == 0) return;
  if (bucketIdx >= fireCycles) return;

  gpio_set_level((gpio_num_t)DIM_PIN, 1);

  timerWrite(offTimer, 0);
  timerAlarm(offTimer, HOLD_US, false, 0);
  timerStart(offTimer);

  fireCount++;
}

// ================== FLOW CALC ==================
float computeFlow(float weight, uint32_t nowMs) {
  if (isnan(lastWeight)) {
    lastWeight = weight;
    lastWeightMs = nowMs;
    return 0.0;
  }

  uint32_t dtMs = nowMs - lastWeightMs;
  if (dtMs < 80) return flowEMA;

  float dw = weight - lastWeight;
  lastWeight = weight;
  lastWeightMs = nowMs;

  float rawFlow = 0.0;
  if (fabs(dw) >= FLOW_DEADBAND_G && dtMs > 0) {
    rawFlow = (dw * 1000.0f) / dtMs;
  }

  flowEMA = isnan(flowEMA)
              ? rawFlow
              : (FLOW_ALPHA * rawFlow + (1.0f - FLOW_ALPHA) * flowEMA);

  if (flowEMA < 0) flowEMA = 0;
  return flowEMA;
}

// ================== BUTTON CONTROL ==================
void triggerButton() {
  if (millis() - lastOptocouplerPulse_ms > 700) {  // Debounce: only pulse once per 700ms
    digitalWrite(OUT_PIN, HIGH);
    delay(250);  // Button press simulation duration
    digitalWrite(OUT_PIN, LOW);
    yield();
    lastOptocouplerPulse_ms = millis();
  }
}

void handleButton() {
  // Read button state (assuming button is connected to a pin - adjust as needed)
  // For now, we'll use Serial command or auto-start
  // You can add actual button reading here if needed
  
  // For button control, we'll use a simple approach:
  // Press button to start profiling, press again to stop
  // This can be implemented with actual hardware button or Serial command
}

// ================== SETUP ==================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("========================================");
  Serial.println("Auto Pump Profiler (WebSocket-controlled)");
  Serial.println("========================================");
  Serial.println();
  Serial.println("Power levels: 30% to 100% (10% steps)");
  Serial.println("Recording: 12 seconds per level");
  Serial.println("Pause: 40 seconds between levels");
  Serial.println();
  
  // GPIO (ISR-safe)
  gpio_reset_pin((gpio_num_t)DIM_PIN);
  gpio_set_direction((gpio_num_t)DIM_PIN, GPIO_MODE_OUTPUT);
  gpio_set_level((gpio_num_t)DIM_PIN, 0);

  pinMode(ZC_PIN, INPUT_PULLUP);
  pinMode(OUT_PIN, OUTPUT);
  digitalWrite(OUT_PIN, LOW);

  // Pressure ADC config (ESP32-S3): match divider output range (~0.34–3.09V)
  pinMode(PRESSURE_PIN, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(PRESSURE_PIN, ADC_11db);
  analogSetAttenuation(ADC_11db);

  offTimer = timerBegin(1000000); // 1 MHz = 1 µs ticks
  timerAttachInterrupt(offTimer, &onOffTimer);
  timerStop(offTimer);

  attachInterrupt(digitalPinToInterrupt(ZC_PIN), onZeroCross, RISING);

  BLE.begin();
  scale.init();
  scale.tare();
  delay(100);
  scale.tare();

  // WiFi + WebSocket (match ShotStopperWithPressure)
  initWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    initMDNS();
    initWebSocket();
  }

  // Print CSV header (pressure appended; existing analyzers still work by reading first 4 cols)
  logLine("time_ms,power_pct,weight_g,flow_gps,pressure_bar");
  logLine("Ready. Send 'GO' via WebSocket (or Serial) to begin profiling sequence.");
}

// ================== LOOP ==================
void loop() {
  static uint32_t lastLogMs = 0;
  uint32_t now = millis();

  // WebSocket server loop
  if (WiFi.status() == WL_CONNECTED) {
    webSocket.loop();
  }

  // Handle scale connection
  if (!scale.isConnected()) {
    static uint32_t lastRetry = 0;
    if (now - lastRetry > 3000) {
      lastRetry = now;
      scale.init();
    }
    return;
  }

  if (scale.heartbeatRequired()) {
    scale.heartbeat();
  }

  // Keep pressure updated (cheap; internal rate limit)
  readPressure();

  // Handle Serial commands
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();
    
    if (cmd == "GO") {
      if (profilingState == IDLE) {
        profilingState = WAITING_FOR_BUTTON;
        currentPowerLevel = MIN_POWER_PCT;
        stateStartTime = now;
        idleMessagePrinted = false; // Reset idle message flag
        logLine("[PROFILE] Starting profiling sequence...");
        logLine("[PROFILE] Press button to start first test at 30%");
      } else {
        logLine("[PROFILE] Already running. Send STOP to abort.");
      }
    } else if (cmd == "STOP") {
      if (profilingState != IDLE) {
        profilingState = IDLE;
        currentPowerPct = 100; // 100% power to allow boiler refill
        idleMessagePrinted = false; // Reset so it prints "idling" again
        logLine("[PROFILE] Profiling stopped by user (pump at 100% for boiler refill)");
      }
    } else if (cmd == "STATUS") {
      String s = "[STATUS] State: ";
      s += (profilingState == IDLE ? "IDLE" :
            profilingState == WAITING_FOR_BUTTON ? "WAITING_FOR_BUTTON" :
            profilingState == RECORDING ? "RECORDING" : "PAUSING");
      s += ", Power: ";
      s += String((unsigned)currentPowerPct);
      s += "%, Current Level: ";
      s += String((unsigned)currentPowerLevel);
      s += "%";
      logLine(s);
    }
  }

  // State machine for profiling
  switch (profilingState) {
    case IDLE:
      currentPowerPct = 100;  // 100% power to allow boiler refill
      if (!idleMessagePrinted) {
        logLine("[PROFILE] Idling - waiting for GO command (pump at 100% for boiler refill)");
        idleMessagePrinted = true;
      }
      break;
      
    case WAITING_FOR_BUTTON:
      // Wait for button press to start recording
      // For now, auto-start after 1 second (you can add actual button reading)
      if (now - stateStartTime > 1000) {
        // Simulate button press to start shot
        triggerButton();
        delay(100);
        triggerButton(); // Release
        
        // Start recording
        profilingState = RECORDING;
        stateStartTime = now;
        currentPowerPct = currentPowerLevel;
        
        logLine("[PROFILE] Recording started at " + String((unsigned)currentPowerLevel) + "% power (" + String((unsigned long)now) + " ms)");
      }
      break;
      
    case RECORDING:
      // Check if recording period is complete
      if (now - stateStartTime >= RECORDING_DURATION_MS) {
        logLine("[PROFILE] Recording ended at " + String((unsigned)currentPowerLevel) + "% power (" + String((unsigned long)now) + " ms)");
        
        // Move to pause state
        profilingState = PAUSING;
        stateStartTime = now;
        currentPowerPct = 100; // 100% power during pause to allow boiler refill
        
        // Trigger button to stop shot
        triggerButton();
        delay(100);
        triggerButton(); // Release
      }
      break;
      
    case PAUSING:
      // Check if pause period is complete
      if (now - stateStartTime >= PAUSE_DURATION_MS) {
        // Move to next power level
        currentPowerLevel += POWER_STEP_PCT;
        
        if (currentPowerLevel > MAX_POWER_PCT) {
          // Profiling complete
          profilingState = IDLE;
          currentPowerPct = 100; // 100% power to allow boiler refill
          idleMessagePrinted = false; // Reset so it prints "idling" again
          logLine("[PROFILE] Profiling sequence complete!");
        } else {
          // Start next recording
          profilingState = WAITING_FOR_BUTTON;
          stateStartTime = now;
          logLine("[PROFILE] Next power level: " + String((unsigned)currentPowerLevel) + "%");
        }
      }
      break;
  }

  // Read weight and log data (ONLY log during RECORDING state)
  if (scale.newWeightAvailable() && profilingState == RECORDING) {
    float weight = scale.getWeight();
    float flow = computeFlow(weight, now);

    if (now - lastLogMs >= LOG_INTERVAL_MS) {
      lastLogMs = now;
      
      char buf[96];
      snprintf(buf, sizeof(buf), "%lu,%u,%.2f,%.3f,%.2f",
               (unsigned long)now,
               (unsigned)currentPowerPct,
               weight,
               flow,
               currentPressureBar);
      logLine(String(buf));
    }
  }
}

