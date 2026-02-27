/*
  FlowProfilingArduino.ino

  Purpose:
  - Run a hardcoded Gaggiuino-style JSON profile (same schema as gaggiuino web UI)
  - Drive the ULKA EP5 pump via PSM.Library on ESP32 (full-cycle click semantics)
  - Stream telemetry over WebSockets using the same action names as gaggiuino webserver:
      - "sensor_data_update"
      - "shot_data_update"
      - "log_record"

  Notes:
  - Brew temperature is ignored (fields still sent as placeholder values).
  - Pressure ADC conversion reuses the stabilized conversion from existing sketches in this repo.
*/

#include <Arduino.h>
#include "driver/gpio.h"

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include <ArduinoJson.h>

#include <PSM.h>
#include <AcaiaArduinoBLE.h>

#include "profiling_phases.h"
#include "profile_storage.h"

// ================== WIFI / WEBSOCKET ==================
#define WIFI_SSID "Kenyon19"
#define WIFI_PASSWORD "Kenyon_1"
#define WS_SERVER_PORT 81
#define WS_SERVER_PATH "/ws"
#define MDNS_HOSTNAME "shotstopper-ws"

static constexpr const char* WS_MSG_SENSOR_DATA = "sensor_data_update";
static constexpr const char* WS_MSG_SHOT_DATA = "shot_data_update";
static constexpr const char* WS_MSG_LOG = "log_record";

WebSocketsServer webSocket(WS_SERVER_PORT);

static inline void wsBroadcastJson(const JsonDocument& doc) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (webSocket.connectedClients() == 0) return;

  String out;
  serializeJson(doc, out);
  webSocket.broadcastTXT(out);
}

static inline void wsLog(const String& msg, const char* source = "FlowProfilingArduino") {
  Serial.println(msg);

  StaticJsonDocument<256> doc;
  doc["action"] = WS_MSG_LOG;
  JsonObject data = doc.createNestedObject("data");
  data["source"] = source;
  data["log"] = msg;
  wsBroadcastJson(doc);
}

// ================== PINS ==================
#define ZC_PIN       14
#define DIM_PIN      17
#define PRESSURE_PIN 4
// Optocoupler output to simulate pressing the machine's brew button (matches TriacTests sketches)
#define OUT_PIN      19

// ================== PSM / PUMP ==================
static constexpr uint16_t PSM_RANGE = 100;
PSM pump(ZC_PIN, DIM_PIN, PSM_RANGE, RISING, 1, 6);

static constexpr uint16_t IDLE_PUMP_POWER_X10 = 1000; // set to 0 if you don't want refill behavior when idle

static inline void setPumpPowerX10(uint16_t pct_x10) {
  if (pct_x10 > 1000) pct_x10 = 1000;
  const uint16_t v = (uint32_t)pct_x10 * (uint32_t)PSM_RANGE / 1000u;
  pump.set(v);
}

// Hook invoked by PSM.Library on ZC interrupt (weak symbol in the library).
// We only use it to time ADC reads away from switching noise.
volatile uint32_t lastZcUs = 0;
void onPSMInterrupt() {
  lastZcUs = (uint32_t)micros();
}

// ================== PRESSURE ==================
// Match gaggiuino cadence: pressure refresh interval 10ms.
static constexpr uint32_t PRESSURE_READ_INTERVAL_MS = 10; // ~100 Hz

// Sensor outputs 0.5-4.5V; divider reduces it to ADC range.
static constexpr float VOLTAGE_DIVIDER_RATIO = 1.4545f;
static constexpr float SENSOR_MIN_VOLTAGE = 0.5f;
static constexpr float SENSOR_MAX_VOLTAGE = 4.5f;
static constexpr float PRESSURE_MAX_MPA = 1.6f;
static constexpr float MPA_TO_BAR = 10.0f;
static constexpr float MIN_PRESSURE_BAR = 0.0f;
static constexpr float MAX_PRESSURE_BAR = 16.0f;

static constexpr uint32_t QUIET_AFTER_ZC_US = 3000;

uint32_t lastPressureReadMs = 0;
float currentPressureBar = 0.0f;

// Robust per-sample filtering: oversample + median to reject switching spikes.
static constexpr int PRESSURE_OVERSAMPLE_N = 7; // odd number for median
static constexpr uint32_t PRESSURE_OVERSAMPLE_SPACING_US = 250;

static inline float clampf(float x, float lo, float hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

// Treat non-finite and tiny denormal floats as clean 0.0 for telemetry/control stability.
static inline float sanitizeNearZeroFloat(float x, float eps = 1e-6f) {
  if (!isfinite(x)) return 0.0f;
  return (fabsf(x) < eps) ? 0.0f : x;
}

static void readPressure() {
  const uint32_t nowMs = millis();
  if (nowMs - lastPressureReadMs < PRESSURE_READ_INTERVAL_MS) return;
  lastPressureReadMs = nowMs;

  // Best-effort: avoid reading immediately after ZC/triac switching noise.
  if (QUIET_AFTER_ZC_US > 0) {
    const uint32_t nowUs = (uint32_t)micros();
    const uint32_t since = nowUs - lastZcUs;
    if (since < QUIET_AFTER_ZC_US) {
      delayMicroseconds(QUIET_AFTER_ZC_US - since);
    }
  }

  // Use calibrated mV on ESP32-S3. Oversample and take median to reduce triac noise spikes.
  float samples[PRESSURE_OVERSAMPLE_N];
  for (int i = 0; i < PRESSURE_OVERSAMPLE_N; i++) {
    (void)analogRead(PRESSURE_PIN);
    const uint32_t adcMv = analogReadMilliVolts(PRESSURE_PIN);
    const float adcVoltage = (float)adcMv / 1000.0f;
    samples[i] = adcVoltage;
    if (i + 1 < PRESSURE_OVERSAMPLE_N) delayMicroseconds(PRESSURE_OVERSAMPLE_SPACING_US);
  }
  // insertion sort (tiny N)
  for (int i = 1; i < PRESSURE_OVERSAMPLE_N; i++) {
    float key = samples[i];
    int j = i - 1;
    while (j >= 0 && samples[j] > key) {
      samples[j + 1] = samples[j];
      j--;
    }
    samples[j + 1] = key;
  }
  const float adcVoltageMedian = samples[PRESSURE_OVERSAMPLE_N / 2];
  const float sensorVoltage = adcVoltageMedian * VOLTAGE_DIVIDER_RATIO;

  float pressureMPA = 0.0f;
  if (sensorVoltage >= SENSOR_MIN_VOLTAGE && sensorVoltage <= SENSOR_MAX_VOLTAGE) {
    const float voltageRange = SENSOR_MAX_VOLTAGE - SENSOR_MIN_VOLTAGE;
    pressureMPA = (sensorVoltage - SENSOR_MIN_VOLTAGE) * (PRESSURE_MAX_MPA / voltageRange);
  } else if (sensorVoltage < SENSOR_MIN_VOLTAGE) {
    pressureMPA = 0.0f;
  } else {
    pressureMPA = PRESSURE_MAX_MPA;
  }

  float pressureBar = clampf(pressureMPA * MPA_TO_BAR, MIN_PRESSURE_BAR, MAX_PRESSURE_BAR);
  currentPressureBar = pressureBar;
}

// ================== SCALE / FLOW ==================
AcaiaArduinoBLE scale(false);

static constexpr float FLOW_ALPHA = 0.25f;
static constexpr float FLOW_DEADBAND_G = 0.03f;

float lastWeight = NAN;
uint32_t lastWeightMs = 0;
float weightFlowEma = 0.0f;

static void tareScaleForShotStart() {
  if (!scale.isConnected()) {
    wsLog("[scale] tare skipped (not connected)");
    return;
  }

  // Double-tare pattern reused from other sketches in this repo.
  scale.tare();
  delay(100);
  scale.tare();

  // Reset local flow/weight state so the shot starts from a clean baseline.
  lastWeight = NAN;
  lastWeightMs = 0;
  weightFlowEma = 0.0f;
  wsLog("[scale] tare done");
}

static float updateWeightFlowEma(float weight, uint32_t nowMs) {
  if (isnan(lastWeight)) {
    lastWeight = weight;
    lastWeightMs = nowMs;
    weightFlowEma = 0.0f;
    return 0.0f;
  }
  const uint32_t dtMs = nowMs - lastWeightMs;
  if (dtMs < 80) return weightFlowEma;

  const float dw = weight - lastWeight;
  lastWeight = weight;
  lastWeightMs = nowMs;

  float rawFlow = 0.0f;
  if (fabsf(dw) >= FLOW_DEADBAND_G && dtMs > 0) {
    rawFlow = (dw * 1000.0f) / (float)dtMs; // g/s
  }

  weightFlowEma = (FLOW_ALPHA * rawFlow + (1.0f - FLOW_ALPHA) * weightFlowEma);
  if (weightFlowEma < 0) weightFlowEma = 0;
  return weightFlowEma;
}

// ================== GAGGIUINO PUMP FLOW MODEL (ported from src/peripherals/pump.cpp) ==================
static constexpr float FLOW_PER_CLICK_AT_ZERO_BAR_DEFAULT = 0.27f; // ml/click @ ~0 bar

static constexpr float pressureInefficiencyCoefficient[7] = {
  0.045f, 0.015f, 0.0033f, 0.000685f, 0.000045f, 0.009f, -0.0018f
};

static uint32_t maxPumpClicksPerSecond = 60; // 60Hz default
static float flowPerClickAtZeroBar = FLOW_PER_CLICK_AT_ZERO_BAR_DEFAULT;
static float fpc_multiplier = 1.0f; // 60/maxCPS for 50Hz scaling

static void pumpInit(uint32_t powerLineFrequencyHz, float pumpFlowAtZeroBar) {
  maxPumpClicksPerSecond = powerLineFrequencyHz;
  flowPerClickAtZeroBar = pumpFlowAtZeroBar;
  fpc_multiplier = 60.0f / (float)maxPumpClicksPerSecond;
}

static float getPumpFlowPerClick(const float pressureBar) {
  // gaggiuino pump.cpp divides by pressure; avoid pressure=0 making NaN/Inf.
  const float p = fmaxf(pressureBar, 0.10f);

  // EXACT formula from gaggiuino/src/peripherals/pump.cpp (L111-L115 at time of port).
  float fpc = 0.f;
  fpc = (pressureInefficiencyCoefficient[5] / p + pressureInefficiencyCoefficient[6]) * (-p * p) +
        (flowPerClickAtZeroBar - pressureInefficiencyCoefficient[0]) -
        (pressureInefficiencyCoefficient[1] +
          (pressureInefficiencyCoefficient[2] -
            (pressureInefficiencyCoefficient[3] - pressureInefficiencyCoefficient[4] * p) * p) *
            p) *
          p;
  return fpc * fpc_multiplier;
}

static float getClicksPerSecondForFlow(const float flowMlPerS, const float pressureBar) {
  if (flowMlPerS <= 0.f) return 0.f;
  const float flowPerClick = getPumpFlowPerClick(pressureBar);
  if (flowPerClick <= 0.f) return 0.f;
  float cps = flowMlPerS / flowPerClick;
  if (cps > (float)maxPumpClicksPerSecond) cps = (float)maxPumpClicksPerSecond;
  return cps;
}

static float getPumpFlowMlPerS(const float clicksPerSecond, const float pressureBar) {
  return clicksPerSecond * getPumpFlowPerClick(pressureBar);
}

// ================== PROFILE JSON (schema matches gaggiuino web UI) ==================
// Blooming shot (hardcoded):
// - Hold 3 bar for 10 seconds (bloom)
// - Ramp up to 9 bar
// - Taper pressure down near the end
static const char* PROFILE_JSON = R"json(
{
  "phases": [
    {
      "type": "PRESSURE",
      "target": { "start": -1, "end": 3.0, "curve": "INSTANT", "time": 0 },
      "restriction": 6.0,
      "stopConditions": { "time": 10000 }
    },
    {
      "type": "PRESSURE",
      "target": { "start": -1, "end": 9.0, "curve": "LINEAR", "time": 6000 },
      "restriction": 9.0,
      "stopConditions": { "time": 6000 }
    },
    {
      "type": "PRESSURE",
      "target": { "start": -1, "end": 6.0, "curve": "EASE_OUT", "time": 12000 },
      "restriction": 9.0,
      "stopConditions": { "weight": 50.0 }
    }
  ],
  "globalStopConditions": { "weight": 40.0 }
}
)json";

static bool parsePhaseType(const char* s, PHASE_TYPE& out) {
  if (!s) return false;
  if (!strcmp(s, "FLOW")) { out = PHASE_TYPE::PHASE_TYPE_FLOW; return true; }
  if (!strcmp(s, "PRESSURE")) { out = PHASE_TYPE::PHASE_TYPE_PRESSURE; return true; }
  return false;
}

static bool parseCurveStyle(const char* s, TransitionCurve& out) {
  if (!s) return false;
  if (!strcmp(s, "EASE_IN")) { out = TransitionCurve::EASE_IN; return true; }
  if (!strcmp(s, "EASE_OUT")) { out = TransitionCurve::EASE_OUT; return true; }
  if (!strcmp(s, "EASE_IN_OUT")) { out = TransitionCurve::EASE_IN_OUT; return true; }
  if (!strcmp(s, "LINEAR")) { out = TransitionCurve::LINEAR; return true; }
  if (!strcmp(s, "INSTANT")) { out = TransitionCurve::INSTANT; return true; }
  return false;
}

static bool parseProfileFromJson(Profile& profile, const char* json) {
  DynamicJsonDocument doc(4096);
  DeserializationError err = deserializeJson(doc, json);
  if (err) {
    wsLog(String("[profile] deserializeJson failed: ") + err.c_str());
    return false;
  }

  profile.clear();

  JsonArray phases = doc["phases"].as<JsonArray>();
  for (JsonObject p : phases) {
    PHASE_TYPE type;
    if (!parsePhaseType(p["type"], type)) {
      wsLog("[profile] invalid phase.type (expected FLOW/PRESSURE)");
      return false;
    }

    JsonObject target = p["target"];
    const float start = target.containsKey("start") ? (float)target["start"] : -1.f;
    const float end = target.containsKey("end") ? (float)target["end"] : 0.f;
    const long time = target.containsKey("time") ? (long)target["time"] : 0L;
    TransitionCurve curve = TransitionCurve::INSTANT;
    if (target.containsKey("curve") && !parseCurveStyle(target["curve"], curve)) {
      wsLog("[profile] invalid target.curve");
      return false;
    }

    PhaseStopConditions stop;
    if (p.containsKey("stopConditions") && p["stopConditions"].is<JsonObject>()) {
      JsonObject sc = p["stopConditions"];
      if (sc.containsKey("time")) stop.time = (long)sc["time"];
      if (sc.containsKey("pressureAbove")) stop.pressureAbove = (float)sc["pressureAbove"];
      if (sc.containsKey("pressureBelow")) stop.pressureBelow = (float)sc["pressureBelow"];
      if (sc.containsKey("flowAbove")) stop.flowAbove = (float)sc["flowAbove"];
      if (sc.containsKey("flowBelow")) stop.flowBelow = (float)sc["flowBelow"];
      if (sc.containsKey("weight")) stop.weight = (float)sc["weight"];
      if (sc.containsKey("waterPumpedInPhase")) stop.waterPumpedInPhase = (float)sc["waterPumpedInPhase"];
    }

    Phase phase{
      .type = type,
      .target = Transition(start, end, curve, time),
      .restriction = p.containsKey("restriction") ? (float)p["restriction"] : 0.f,
      .stopConditions = stop,
    };
    profile.addPhase(phase);
  }

  if (doc.containsKey("globalStopConditions") && doc["globalStopConditions"].is<JsonObject>()) {
    JsonObject g = doc["globalStopConditions"];
    if (g.containsKey("time")) profile.globalStopConditions.time = (long)g["time"];
    if (g.containsKey("weight")) profile.globalStopConditions.weight = (float)g["weight"];
    if (g.containsKey("waterPumped")) profile.globalStopConditions.waterPumped = (float)g["waterPumped"];
  }

  if (profile.phaseCount() == 0) {
    wsLog("[profile] no phases");
    return false;
  }

  return true;
}

// ================== PUMP CONTROL (ported from gaggiuino/src/peripherals/pump.cpp) ==================
static float pumpPowerPct = 0.0f; // 0..100 for STATUS telemetry only

static inline void setPumpToRawValue(uint8_t val) {
  if (val > PSM_RANGE) val = PSM_RANGE;
  pump.set(val);
  pumpPowerPct = (100.0f * (float)val) / (float)PSM_RANGE;
}

static inline float getPumpPct(const float targetPressure, const float flowRestriction, const SensorState& currentState) {
  if (targetPressure == 0.f) return 0.f;

  const float diff = targetPressure - currentState.smoothedPressure;
  const float maxPumpPct =
    (flowRestriction <= 0.f) ? 1.f : (getClicksPerSecondForFlow(flowRestriction, currentState.smoothedPressure) / (float)maxPumpClicksPerSecond);
  const float pumpPctToMaintainFlow =
    getClicksPerSecondForFlow(currentState.smoothedPumpFlow, currentState.smoothedPressure) / (float)maxPumpClicksPerSecond;

  if (diff > 2.f) {
    return fminf(maxPumpPct, 0.25f + 0.2f * diff);
  }

  if (diff > 0.f) {
    return fminf(maxPumpPct, pumpPctToMaintainFlow * 0.95f + 0.1f + 0.2f * diff);
  }

  if (currentState.pressureChangeSpeed < 0.f) {
    return fminf(maxPumpPct, pumpPctToMaintainFlow * 0.2f);
  }

  return 0.f;
}

static inline void setPumpPressure(const float targetPressure, const float flowRestriction, const SensorState& currentState) {
  const float pumpPct = getPumpPct(targetPressure, flowRestriction, currentState);
  setPumpToRawValue((uint8_t)lroundf(pumpPct * (float)PSM_RANGE));
}

static inline void setPumpFlow(const float targetFlow, const float pressureRestriction, const SensorState& currentState) {
  // Matches gaggiuino: switch into pressure control once we approach the pressure limit.
  if (pressureRestriction > 0.f && currentState.smoothedPressure > pressureRestriction * 0.5f) {
    setPumpPressure(pressureRestriction, targetFlow, currentState);
  } else {
    const float pumpPct = getClicksPerSecondForFlow(targetFlow, currentState.smoothedPressure) / (float)maxPumpClicksPerSecond;
    setPumpToRawValue((uint8_t)lroundf(pumpPct * (float)PSM_RANGE));
  }
}

// ================== STATE ==================
Profile profile;
PhaseProfiler* phaseProfiler = nullptr;
static char profileJsonBuf[PROFILE_JSON_MAX_SIZE];

SensorState currentState;
bool brewActive = false;
uint32_t brewingStartedMs = 0;
bool profileActive = false;
uint32_t profileStartedMs = 0; // when we actually start profile timing (after pre-bleed)

// Diagnostic override: force pump to 100% regardless of profile.
// Intended for sensor bring-up / sanity checks.

// Ghost purge: after GO opens brew path, keep pump OFF for a fixed period BEFORE starting
// the profile timer/telemetry. This makes the purge not part of the recorded/profiled shot.
static constexpr uint32_t GHOST_PURGE_MS = 1500;

// Legacy: previously used as a fixed startup grace. We now do pre-bleed + start profile timing from zero-pressure.
static constexpr uint32_t STARTUP_GRACE_MS = 0;

// Telemetry cadence:
// - shot_data_update: higher rate for better chart resolution
// - sensor_data_update: ~1Hz (1000ms)
static constexpr uint32_t SHOT_TELEMETRY_INTERVAL_MS = 20;
static constexpr uint32_t SENSOR_TELEMETRY_INTERVAL_MS = 1000;
uint32_t lastShotTelemetryMs = 0;
uint32_t lastSensorTelemetryMs = 0;

static constexpr float SMOOTH_ALPHA = 0.25f;

// Avoid spamming telemetry when idle; clients can use STATUS if they need a snapshot.
static constexpr bool SEND_TELEMETRY_WHEN_IDLE = false;

// Clicks per second
long lastClicks = 0;
uint32_t lastClicksMs = 0;
float clicksPerSecond = 0.0f;

static void updateClicksPerSecond(uint32_t nowMs) {
  // Compute cps at a modest rate. If we run multiple times within the same ms tick,
  // do NOT overwrite cps with 0.
  static uint32_t lastCpsCalcMs = 0;
  static constexpr uint32_t CPS_CALC_INTERVAL_MS = 200;

  const long clicksNow = pump.getCounter();
  currentState.pumpClicks = clicksNow;

  if (lastCpsCalcMs != 0 && (nowMs - lastCpsCalcMs) < CPS_CALC_INTERVAL_MS) {
    return;
  }
  lastCpsCalcMs = nowMs;

  if (lastClicksMs != 0) {
    const uint32_t dtMs = nowMs - lastClicksMs;
    if (dtMs > 0) {
      clicksPerSecond = ((float)(clicksNow - lastClicks) * 1000.0f) / (float)dtMs;
    }
  }
  lastClicks = clicksNow;
  lastClicksMs = nowMs;
}

static void updatePressureChangeSpeed(uint32_t nowMs) {
  static uint32_t lastMs = 0;
  static float lastP = 0.0f;
  if (lastMs == 0) {
    lastMs = nowMs;
    lastP = currentState.smoothedPressure;
    currentState.pressureChangeSpeed = 0.0f;
    return;
  }
  const uint32_t dtMs = nowMs - lastMs;
  if (dtMs == 0) return;
  const float dtS = (float)dtMs / 1000.0f;
  const float dp = currentState.smoothedPressure - lastP;
  currentState.pressureChangeSpeed = dp / dtS;
  lastMs = nowMs;
  lastP = currentState.smoothedPressure;
}

static void sendTelemetry(uint32_t nowMs) {
  // sensor_data_update (matches gaggiuino webserver/websocket.cpp keys)
  if ((brewActive || SEND_TELEMETRY_WHEN_IDLE)
      && (lastSensorTelemetryMs == 0 || (nowMs - lastSensorTelemetryMs) >= SENSOR_TELEMETRY_INTERVAL_MS)) {
    lastSensorTelemetryMs = nowMs;
    StaticJsonDocument<384> doc;
    doc["action"] = WS_MSG_SENSOR_DATA;
    JsonObject data = doc.createNestedObject("data");
    data["brewActive"] = brewActive;
    data["steamActive"] = false;
    data["scalesPresent"] = currentState.scalesPresent;
    data["temperature"] = 0.0;
    data["waterLvl"] = 0;
    data["pressure"] = currentState.smoothedPressure;
    data["pumpFlow"] = currentState.smoothedPumpFlow;
    data["weightFlow"] = currentState.smoothedWeightFlow;
    data["weight"] = currentState.weight;
    // Extra debug fields (safe for clients to ignore)
    data["pumpClicks"] = (long)currentState.pumpClicks;
    data["pumpCps"] = clicksPerSecond;
    data["pumpPowerPct"] = pumpPowerPct;
    wsBroadcastJson(doc);
  }

  // shot_data_update (matches gaggiuino webserver/websocket.cpp keys)
  // Do not emit shot telemetry until pre-bleed is finished (profileActive),
  // so the UI graph begins after purge with each sample visible.
  if (brewActive && profileActive && phaseProfiler
      && (lastShotTelemetryMs == 0 || (nowMs - lastShotTelemetryMs) >= SHOT_TELEMETRY_INTERVAL_MS)) {
    lastShotTelemetryMs = nowMs;
    const uint32_t timeInShot = nowMs - brewingStartedMs;
    const uint32_t profileTimeInShot = profileActive ? (nowMs - profileStartedMs) : 0;
    CurrentPhase& cp = phaseProfiler->getCurrentPhase();
    ShotSnapshot snap = buildShotSnapshot(profileTimeInShot, currentState, cp);

    StaticJsonDocument<512> doc;
    doc["action"] = WS_MSG_SHOT_DATA;
    JsonObject data = doc.createNestedObject("data");
    // Keep "timeInShot" as wall time since GO for plots/log readability.
    data["timeInShot"] = timeInShot;
    // And include the internal profile timebase (starts after STARTUP_GRACE_MS).
    data["profileTimeInShot"] = snap.timeInShot;
    data["profileActive"] = profileActive;
    data["pressure"] = snap.pressure;
    data["pumpFlow"] = snap.pumpFlow;
    data["weightFlow"] = snap.weightFlow;
    data["temperature"] = 0.0;
    data["shotWeight"] = snap.shotWeight;
    data["waterPumped"] = snap.waterPumped;
    data["targetTemperature"] = -1;
    data["targetPumpFlow"] = snap.targetPumpFlow;
    data["targetPressure"] = snap.targetPressure;
    // Extra debug fields (safe for clients to ignore)
    data["phaseIdx"] = cp.getIndex();
    data["phaseType"] = (cp.getType() == PHASE_TYPE::PHASE_TYPE_PRESSURE) ? "PRESSURE" : "FLOW";
    data["timeInPhase"] = cp.getTimeInPhase();
    data["pumpClicks"] = (long)currentState.pumpClicks;
    data["pumpCps"] = clicksPerSecond;
    data["pumpPowerPct"] = pumpPowerPct;
    wsBroadcastJson(doc);
  }
}

// ================== WIFI HELPERS ==================
static void initWiFi() {
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
    Serial.println();
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi connection failed!");
  }
}

static void initMDNS() {
  if (!MDNS.begin(MDNS_HOSTNAME)) {
    Serial.println("Error setting up MDNS responder!");
    return;
  }
  Serial.printf("mDNS responder started. Hostname: %s.local\n", MDNS_HOSTNAME);
  MDNS.addService("http", "tcp", WS_SERVER_PORT);
}

static void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length);

static void initWebSocket() {
  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);
  Serial.printf("WebSocket server started on port %d\n", WS_SERVER_PORT);
  Serial.printf("Connect to: ws://%s.local:%d%s\n", MDNS_HOSTNAME, WS_SERVER_PORT, WS_SERVER_PATH);
}

static void startShot() {
  if (!phaseProfiler) return;

  // Tare scale before we start the shot so weight/flow begin from ~0.
  tareScaleForShotStart();
  // Reset the exported state fields too (tareScaleForShotStart() can't reference currentState due to Arduino preprocessing order).
  currentState.weight = 0.0f;
  currentState.shotWeight = 0.0f;
  currentState.weightFlow = 0.0f;
  currentState.smoothedWeightFlow = 0.0f;

  // Physically start the machine brew (open valve, etc.)
  pulseMachineBrewButton();
  brewActive = true;
  // IMPORTANT: force pump OFF immediately at GO so the purge actually happens,
  // even if the loop hasn't run yet (and regardless of any idle pump behavior).
  setPumpToRawValue(0);

  brewingStartedMs = millis();
  profileActive = false;
  profileStartedMs = 0;
  pump.resetCounter();
  lastClicks = 0;
  lastClicksMs = 0;
  clicksPerSecond = 0.0f;
  currentState.waterPumped = 0.0f;
  pumpPowerPct = 0.0f;
  wsLog("[shot] GO (purge started)");
}

static void stopShot(const char* reason) {
  brewActive = false;
  profileActive = false;
  profileStartedMs = 0;
  setPumpPowerX10(IDLE_PUMP_POWER_X10);
  // Physically stop the machine brew
  pulseMachineBrewButton();
  wsLog(String("[shot] STOP (") + reason + ")");
}

/** Load the currently active profile from NVS into runtime (profile + phaseProfiler). */
static void loadActiveProfileIntoRuntime() {
  const uint8_t activeIdx = profilesStorageGetActiveIndex();
  const bool hasStored = profilesStorageGetSlotJson(activeIdx, profileJsonBuf, sizeof(profileJsonBuf));
  const char* jsonToLoad = hasStored ? profileJsonBuf : PROFILE_JSON;
  if (!parseProfileFromJson(profile, jsonToLoad)) {
    wsLog("[profile] load failed; GO will do nothing until active profile is valid");
    if (phaseProfiler) {
      delete phaseProfiler;
      phaseProfiler = nullptr;
    }
    return;
  }
  if (phaseProfiler) {
    delete phaseProfiler;
    phaseProfiler = nullptr;
  }
  phaseProfiler = new PhaseProfiler(profile);
  wsLog(String("[profile] loaded slot ") + (int)activeIdx + " phases=" + (int)profile.phaseCount());
}

static void maybeStartProfileAfterPrebleed(uint32_t nowMs) {
  if (!brewActive || !phaseProfiler) return;
  if (profileActive) return;

  // Keep pump OFF while we ghost-purge.
  setPumpToRawValue(0);

  // IMPORTANT: don't trust the loop's captured nowMs here.
  // GO can arrive mid-loop (via webSocket.loop()), updating brewingStartedMs to a time
  // *after* the loop's nowMs, which would underflow this subtraction and end the purge instantly.
  const uint32_t sinceGoMs = millis() - brewingStartedMs;
  if (sinceGoMs < GHOST_PURGE_MS) return;

  profileActive = true;
  const uint32_t startMs = millis();
  profileStartedMs = startMs;
  // Start shot timer/recording AFTER ghost purge completes.
  brewingStartedMs = startMs;
  lastShotTelemetryMs = 0;
  phaseProfiler->resetWithCurrentState(currentState);
  wsLog("[profile] START (after ghost purge)");
}

// ================== MACHINE BREW BUTTON (optocoupler pulse) ==================
static unsigned long lastOptoPulseMs = 0;
static void pulseMachineBrewButton() {
  // Simple debounce: don't allow back-to-back pulses too quickly
  if (millis() - lastOptoPulseMs < 700) return;
  digitalWrite(OUT_PIN, HIGH);
  delay(250);
  digitalWrite(OUT_PIN, LOW);
  lastOptoPulseMs = millis();
}

static void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
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

      // Accept plain text "GO"/"STOP"/"STATUS" or JSON { "command": "GO" }
      String cmd = cmdRaw;
      if (cmdRaw.startsWith("{")) {
        StaticJsonDocument<256> doc;
        DeserializationError err = deserializeJson(doc, cmdRaw);
        if (!err) {
          if (doc.containsKey("command")) cmd = String((const char*)doc["command"]);
          else if (doc.containsKey("data")) cmd = String((const char*)doc["data"]);
        }
      }
      cmd.trim();
      cmd.toUpperCase();

      if (cmd == "PING") {
        webSocket.sendTXT(num, "PONG");
        return;
      }
      if (cmd == "GO") {
        if (!brewActive) startShot();
        else {
          webSocket.sendTXT(num, "[shot] already active");
          wsLog("[shot] already active");
        }
        return;
      }
      if (cmd == "STOP") {
        if (brewActive) stopShot("user");
        else {
          webSocket.sendTXT(num, "[shot] not active");
          wsLog("[shot] not active");
        }
        return;
      }
      if (cmd == "STATUS") {
        String s = "[status] brewActive=";
        s += (brewActive ? "1" : "0");
        s += " activeProfile=";
        s += String((int)profilesStorageGetActiveIndex());
        s += " p=";
        s += String(currentState.smoothedPressure, 2);
        s += "bar pumpFlow=";
        s += String(currentState.smoothedPumpFlow, 2);
        s += "ml/s weight=";
        s += String(currentState.weight, 2);
        s += "g weightFlow=";
        s += String(currentState.smoothedWeightFlow, 2);
        s += "g/s clicks=";
        s += String((long)currentState.pumpClicks);
        s += " cps=";
        s += String(clicksPerSecond, 1);
        s += " power=";
        s += String(pumpPowerPct, 1);
        s += "%";
        webSocket.sendTXT(num, s);
        wsLog(s);
        return;
      }
      if (cmd == "PROFILES") {
        const uint8_t activeIdx = profilesStorageGetActiveIndex();
        DynamicJsonDocument doc(10240);
        doc["active"] = (int)activeIdx;
        JsonArray slots = doc.createNestedArray("slots");
        for (uint8_t i = 0; i < MAX_PROFILES; i++) {
          JsonObject slot = slots.add<JsonObject>();
          slot["index"] = (int)i;
          slot["isActive"] = (i == activeIdx);
          if (profilesStorageGetSlotJson(i, profileJsonBuf, sizeof(profileJsonBuf))) {
            slot["profile"] = profileJsonBuf;
            StaticJsonDocument<256> slotDoc;
            if (!deserializeJson(slotDoc, profileJsonBuf)) {
              if (slotDoc.containsKey("name") && slotDoc["name"].is<const char*>())
                slot["name"] = slotDoc["name"].as<const char*>();
              else
                slot["name"] = "";
            } else {
              slot["name"] = "";
            }
          } else {
            slot["name"] = "";
            slot["profile"] = "";
          }
        }
        String out;
        serializeJson(doc, out);
        webSocket.sendTXT(num, out);
        wsLog("[ws] PROFILES sent");
        return;
      }
      if (cmd == "SET_ACTIVE") {
        int idx = -1;
        if (cmdRaw.startsWith("{")) {
          StaticJsonDocument<256> doc;
          if (!deserializeJson(doc, cmdRaw) && doc.containsKey("index"))
            idx = (int)doc["index"];
        } else {
          int space = cmdRaw.indexOf(' ');
          if (space >= 0) {
            String part = cmdRaw.substring(space + 1);
            part.trim();
            idx = part.toInt();
          }
        }
        if (idx < 0 || idx >= (int)MAX_PROFILES) {
          String errMsg = "[profile] SET_ACTIVE requires index 0.." + String((int)MAX_PROFILES - 1);
          webSocket.sendTXT(num, errMsg);
          wsLog(errMsg);
          return;
        }
        profilesStorageSetActive((uint8_t)idx);
        loadActiveProfileIntoRuntime();
        String namePart = "";
        if (profilesStorageGetSlotJson((uint8_t)idx, profileJsonBuf, sizeof(profileJsonBuf))) {
          StaticJsonDocument<256> slotDoc;
          if (!deserializeJson(slotDoc, profileJsonBuf) && slotDoc.containsKey("name") && slotDoc["name"].is<const char*>())
            namePart = String(" (") + slotDoc["name"].as<const char*>() + ")";
        }
        String setActiveMsg = "[profile] active set to " + String(idx) + namePart;
        webSocket.sendTXT(num, setActiveMsg);
        wsLog(setActiveMsg);
        return;
      }
      if (cmd == "WRITE_PROFILE") {
        // Payload must be JSON: { "command": "WRITE_PROFILE", "index": 0..4, "profile": "<string>" }
        if (!cmdRaw.startsWith("{")) {
          webSocket.sendTXT(num, "[profile] write failed: WRITE_PROFILE requires JSON payload");
          wsLog("[profile] write failed: WRITE_PROFILE requires JSON payload");
          return;
        }
        DynamicJsonDocument doc(2048);
        DeserializationError err = deserializeJson(doc, cmdRaw);
        if (err) {
          String emsg = String("[profile] write failed: parse error ") + err.c_str();
          webSocket.sendTXT(num, emsg);
          wsLog(emsg);
          return;
        }
        if (!doc.containsKey("index") || !doc.containsKey("profile")) {
          webSocket.sendTXT(num, "[profile] write failed: missing index or profile");
          wsLog("[profile] write failed: missing index or profile");
          return;
        }
        int idx = (int)doc["index"];
        const char* profileStr = doc["profile"].as<const char*>();
        if (profileStr == nullptr) {
          webSocket.sendTXT(num, "[profile] write failed: profile must be a string");
          wsLog("[profile] write failed: profile must be a string");
          return;
        }
        size_t plen = strlen(profileStr);
        if (idx < 0 || idx >= (int)MAX_PROFILES) {
          webSocket.sendTXT(num, "[profile] write failed: invalid index");
          wsLog("[profile] write failed: invalid index");
          return;
        }
        if (plen >= PROFILE_JSON_MAX_SIZE) {
          webSocket.sendTXT(num, "[profile] write failed: profile too long");
          wsLog("[profile] write failed: profile too long");
          return;
        }
        Profile tempProfile;
        if (!parseProfileFromJson(tempProfile, profileStr)) {
          webSocket.sendTXT(num, "[profile] write failed: invalid profile JSON");
          wsLog("[profile] write failed: invalid profile JSON");
          return;
        }
        if (!profilesStorageWriteSlot((uint8_t)idx, profileStr)) {
          webSocket.sendTXT(num, "[profile] write failed: NVS write error");
          wsLog("[profile] write failed: NVS write error");
          return;
        }
        String msg = "[profile] slot " + String(idx) + " written";
        if ((uint8_t)idx == profilesStorageGetActiveIndex()) {
          loadActiveProfileIntoRuntime();
          msg += " and reloaded";
        }
        webSocket.sendTXT(num, msg);
        wsLog(msg);
        return;
      }

      String unknownMsg = "[ws] Unknown command. Use GO/STOP/STATUS/PING/PROFILES/SET_ACTIVE/WRITE_PROFILE.";
      webSocket.sendTXT(num, unknownMsg);
      wsLog(unknownMsg);
      break;
    }
    default:
      break;
  }
}

// ================== SETUP / LOOP ==================
void setup() {
  Serial.begin(115200);
  delay(800);

  Serial.println();
  Serial.println("========================================");
  Serial.println("FlowProfilingArduino (Gaggiuino JSON)");
  Serial.println("========================================");

  pinMode(ZC_PIN, INPUT_PULLUP);
  pinMode(OUT_PIN, OUTPUT);
  digitalWrite(OUT_PIN, LOW);

  // Pressure ADC config (ESP32-S3): divider output range ~0.34–3.09V
  pinMode(PRESSURE_PIN, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(PRESSURE_PIN, ADC_11db);
  analogSetAttenuation(ADC_11db);

  // PSM init: enforce full-cycle click semantics (~60 clicks/s max @ 60Hz).
  const unsigned int cps = pump.cps();
  pump.setDivider(2);
  pump.initTimer(cps > 110u ? 5000u : 6000u);

  // Initialize Gaggiuino pump model scaling
  pumpInit(60, FLOW_PER_CLICK_AT_ZERO_BAR_DEFAULT);

  // BLE scale
  BLE.begin();
  scale.init();
  scale.tare();
  delay(100);
  scale.tare();

  // Load profiles from NVS (or defaults), then apply active profile.
  profilesStorageInit();
  loadActiveProfileIntoRuntime();

  // WiFi + WebSocket
  initWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    initMDNS();
    initWebSocket();
  }

  setPumpPowerX10(IDLE_PUMP_POWER_X10);
  wsLog("Ready. Send 'GO' via WebSocket (or Serial) to run the hardcoded JSON profile.");
}

void loop() {
  const uint32_t nowMs = millis();

  if (WiFi.status() == WL_CONNECTED) {
    webSocket.loop();
  }

  // Keep scale connected
  if (!scale.isConnected()) {
    static uint32_t lastRetry = 0;
    if (nowMs - lastRetry > 3000) {
      lastRetry = nowMs;
      scale.init();
    }
    currentState.scalesPresent = false;
  } else {
    currentState.scalesPresent = true;
    if (scale.heartbeatRequired()) scale.heartbeat();
  }

  // Update sensors
  readPressure();
  currentState.pressure = currentPressureBar;

  // Pressure smoothing: do NOT reuse SMOOTH_ALPHA (that is tuned for flow/weight).
  // We want something closer to gaggiuino's "fast read + Kalman-like smoothing".
  // Keep it responsive while damping spikes.
  static constexpr float PRESSURE_SMOOTH_ALPHA = 0.12f;
  if (!isnan(currentState.smoothedPressure)) {
    currentState.smoothedPressure =
      PRESSURE_SMOOTH_ALPHA * currentState.pressure + (1.0f - PRESSURE_SMOOTH_ALPHA) * currentState.smoothedPressure;
  } else {
    currentState.smoothedPressure = currentState.pressure;
  }

  if (scale.isConnected() && scale.newWeightAvailable()) {
    const float w = scale.getWeight();
    currentState.weight = w;
    currentState.shotWeight = w;
    currentState.weightFlow = updateWeightFlowEma(w, nowMs);
  }

  currentState.smoothedWeightFlow = SMOOTH_ALPHA * currentState.weightFlow + (1.0f - SMOOTH_ALPHA) * currentState.smoothedWeightFlow;

  // Update pump clicks + modeled pump flow
  updateClicksPerSecond(nowMs);
  clicksPerSecond = sanitizeNearZeroFloat(clicksPerSecond, 0.05f);
  currentState.pumpFlow = sanitizeNearZeroFloat(
    getPumpFlowMlPerS(clicksPerSecond, currentState.smoothedPressure),
    1e-4f
  );
  currentState.smoothedPumpFlow = sanitizeNearZeroFloat(
    SMOOTH_ALPHA * currentState.pumpFlow + (1.0f - SMOOTH_ALPHA) * currentState.smoothedPumpFlow,
    1e-4f
  );
  updatePressureChangeSpeed(nowMs);

  // Integrate water pumped (ml)
  static uint32_t lastIntegrateMs = 0;
  if (lastIntegrateMs != 0) {
    const float dtS = (float)(nowMs - lastIntegrateMs) / 1000.0f;
    if (brewActive) {
      currentState.waterPumped += currentState.smoothedPumpFlow * dtS;
    }
  }
  lastIntegrateMs = nowMs;

  // Commands via Serial (same semantics as WS)
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    String cmdUpper = cmd;
    cmdUpper.toUpperCase();
    if (cmdUpper == "GO") startShot();
    else if (cmdUpper == "STOP") stopShot("serial");
    else if (cmdUpper == "STATUS") {
      Serial.printf(
        "[status] brewActive=%d activeProfile=%d p=%.2fbar pumpFlow=%.2fml/s weight=%.2fg weightFlow=%.2fg/s clicks=%ld cps=%.1f power=%.1f%%\n",
        brewActive ? 1 : 0,
        (int)profilesStorageGetActiveIndex(),
        currentState.smoothedPressure,
        currentState.smoothedPumpFlow,
        currentState.weight,
        currentState.smoothedWeightFlow,
        (long)currentState.pumpClicks,
        clicksPerSecond,
        pumpPowerPct
      );
    }
    else if (cmdUpper == "PROFILES") {
      const uint8_t activeIdx = profilesStorageGetActiveIndex();
      DynamicJsonDocument doc(10240);
      doc["active"] = (int)activeIdx;
      JsonArray slots = doc.createNestedArray("slots");
      for (uint8_t i = 0; i < MAX_PROFILES; i++) {
        JsonObject slot = slots.add<JsonObject>();
        slot["index"] = (int)i;
        slot["isActive"] = (i == activeIdx);
        if (profilesStorageGetSlotJson(i, profileJsonBuf, sizeof(profileJsonBuf))) {
          slot["profile"] = profileJsonBuf;
          StaticJsonDocument<256> slotDoc;
          if (!deserializeJson(slotDoc, profileJsonBuf)) {
            if (slotDoc.containsKey("name") && slotDoc["name"].is<const char*>())
              slot["name"] = slotDoc["name"].as<const char*>();
            else
              slot["name"] = "";
          } else {
            slot["name"] = "";
          }
        } else {
          slot["name"] = "";
          slot["profile"] = "";
        }
      }
      String out;
      serializeJson(doc, out);
      Serial.println(out);
    }
    else if (cmdUpper.startsWith("SET_ACTIVE")) {
      int idx = -1;
      int space = cmd.indexOf(' ');
      if (space >= 0) {
        String part = cmd.substring(space + 1);
        part.trim();
        idx = part.toInt();
      }
      if (idx < 0 || idx >= (int)MAX_PROFILES) {
        Serial.printf("[profile] SET_ACTIVE requires index 0..%d\n", (int)MAX_PROFILES - 1);
      } else {
        profilesStorageSetActive((uint8_t)idx);
        loadActiveProfileIntoRuntime();
        Serial.printf("[profile] active set to %d\n", idx);
      }
    }
  }

  // Pump control
  // Run profile if active
  if (brewActive && phaseProfiler) {
    // Use fresh time here; GO can arrive mid-loop.
    maybeStartProfileAfterPrebleed(millis());

    if (profileActive) {
      // Use a fresh timestamp here too; profileStartedMs can be set mid-loop in maybeStartProfileAfterPrebleed().
      const uint32_t profileTimeInShot = millis() - profileStartedMs;
      phaseProfiler->updatePhase(profileTimeInShot, currentState);

      if (phaseProfiler->isFinished()) {
        stopShot("profile_finished");
      } else {
        CurrentPhase& cp = phaseProfiler->getCurrentPhase();
        if (cp.getType() == PHASE_TYPE::PHASE_TYPE_PRESSURE) {
          setPumpPressure(cp.getTarget(), cp.getRestriction(), currentState);
        } else {
          setPumpFlow(cp.getTarget(), cp.getRestriction(), currentState);
        }
      }
    } else {
      // Pre-bleed: pump is held off above; do not advance profile timers.
    }
  } else {
    setPumpPowerX10(IDLE_PUMP_POWER_X10);
  }

  // Use fresh time; GO/profile start can happen mid-loop.
  sendTelemetry(millis());
}


