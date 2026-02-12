/*
  PressureProfileController.ino

  Purpose:
  - Burst-fire triac control (RobotDyn dimmer) using the proven PumpProfiler pattern
  - BLE scale weight -> flow (g/s)
  - Pressure transducer reading + filtering
  - Stage-based pressure profile (time + stop conditions)
  - PI pressure control -> pump power %
  - CSV logging for later analysis including resistance proxy R = P/Q

  Pins:
  - ZC_PIN  (GPIO14): Zero-cross input from dimmer module
  - DIM_PIN (GPIO17): Triac gate output to dimmer module
  - OUT_PIN (GPIO19): Optocoupler output to "press" the machine button (start/stop shot)
  - PRESSURE_PIN (GPIO4): ADC input for pressure transducer (via divider)

  Serial commands:
  - GO:   start running the profile
  - STOP: stop profile + set pump to 100% (boiler refill)
  - STATUS: print state
*/

#include <Arduino.h>
#include "driver/gpio.h"
#include <AcaiaArduinoBLE.h>

// Arduino IDE auto-generates function prototypes near the top of the file.
// Forward-declare types used in function signatures so the generated prototypes compile.
struct Stage;

// ================== PINS ==================
#define ZC_PIN        14
#define DIM_PIN       17
#define OUT_PIN       19
#define PRESSURE_PIN  4

// ================== TRIAC (PumpProfiler pattern) ==================
static constexpr uint32_t HALF_CYCLE_US = 8333;           // 60 Hz
static constexpr uint32_t HOLD_US = HALF_CYCLE_US - 300;  // latch time
static constexpr uint8_t  BUCKET_SIZE = 20;               // burst-fire resolution

volatile uint32_t zcCount = 0;
volatile uint32_t fireCount = 0;
volatile uint8_t  bucketIdx = 0;
volatile uint8_t  pumpPowerPct = 100; // default to boiler refill

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

// ================== SCALE / FLOW ==================
static constexpr uint32_t LOG_INTERVAL_MS = 50;    // 20 Hz logging
static constexpr float    FLOW_ALPHA = 0.25f;      // EMA
static constexpr float    FLOW_DEADBAND_G = 0.03f;

AcaiaArduinoBLE scale(false);

float lastWeight = NAN;
uint32_t lastWeightMs = 0;
float flowEMA = 0.0f;

float computeFlow(float weight, uint32_t nowMs) {
  if (isnan(lastWeight)) {
    lastWeight = weight;
    lastWeightMs = nowMs;
    return 0.0f;
  }

  uint32_t dtMs = nowMs - lastWeightMs;
  if (dtMs < 80) return flowEMA;

  float dw = weight - lastWeight;
  lastWeight = weight;
  lastWeightMs = nowMs;

  float rawFlow = 0.0f;
  if (fabsf(dw) >= FLOW_DEADBAND_G && dtMs > 0) {
    rawFlow = (dw * 1000.0f) / (float)dtMs;
  }

  flowEMA = isnan(flowEMA) ? rawFlow : (FLOW_ALPHA * rawFlow + (1.0f - FLOW_ALPHA) * flowEMA);
  if (flowEMA < 0) flowEMA = 0;
  return flowEMA;
}

// ================== PRESSURE (from ShotStopperWithPressure) ==================
static constexpr uint32_t PRESSURE_READ_INTERVAL_MS = 50;

// Sensor outputs 0.5-4.5V; divider reduces it to ADC range.
static constexpr float VOLTAGE_DIVIDER_RATIO = 1.4545f;
static constexpr float ADC_REFERENCE_VOLTAGE = 3.3f;
static constexpr int   ADC_RESOLUTION = 4095;
static constexpr float SENSOR_MIN_VOLTAGE = 0.5f;
static constexpr float SENSOR_MAX_VOLTAGE = 4.5f;
static constexpr float PRESSURE_MAX_MPA = 1.6f;
static constexpr float MPA_TO_BAR = 10.0f;

// Filtering config (same defaults as your stabilized firmware)
static constexpr float FILTER_ALPHA_DISPLAY = 0.15f;
static constexpr float FILTER_ALPHA_CONTROL = 0.25f;
static constexpr float MAX_PRESSURE_CHANGE_BAR = 3.0f;
static constexpr float PRESSURE_BIAS_BAR = 0.5f;
static constexpr float MIN_PRESSURE_BAR = 0.0f;
static constexpr float MAX_PRESSURE_BAR = 16.0f;

uint32_t lastPressureRead_ms = 0;
bool filterInitialized = false;
float filteredPressureBar_display = 0.0f;
float filteredPressureBar_control = 0.0f;

float currentPressureBar = 0.0f;        // display/logging
float currentPressureBar_control = 0.0f; // controller input

// Debug/telemetry: last raw sensor conversion values (helps verify we're not “logging volts as bar”)
int   lastAdcValue = 0;
float lastAdcVoltage = 0.0f;
float lastSensorVoltage = 0.0f;
float lastPressureBar_raw = 0.0f;

void readPressure() {
  uint32_t now = millis();
  if (now - lastPressureRead_ms < PRESSURE_READ_INTERVAL_MS) return;
  lastPressureRead_ms = now;

  // ESP32-S3 ADC is non-ideal; use calibrated millivolts instead of assuming 3.3V reference.
  // NOTE: analogReadMilliVolts() depends on attenuation being configured (we set ADC_11db in setup).
  int adcValue = analogRead(PRESSURE_PIN);
  uint32_t adcMv = analogReadMilliVolts(PRESSURE_PIN);
  float adcVoltage = (float)adcMv / 1000.0f;
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

  float pressureBar_raw = pressureMPA * MPA_TO_BAR;
  lastPressureBar_raw = pressureBar_raw;

  if (pressureBar_raw < MIN_PRESSURE_BAR) pressureBar_raw = MIN_PRESSURE_BAR;
  if (pressureBar_raw > MAX_PRESSURE_BAR) pressureBar_raw = MAX_PRESSURE_BAR;

  float pressureBar_clamped = pressureBar_raw;
  if (filterInitialized) {
    float change = pressureBar_raw - filteredPressureBar_display;
    float maxChangeUp = MAX_PRESSURE_CHANGE_BAR * 1.5f;
    float maxChangeDown = MAX_PRESSURE_CHANGE_BAR * 0.7f;
    if (change > maxChangeUp) {
      pressureBar_clamped = filteredPressureBar_display + maxChangeUp;
    } else if (change < -maxChangeDown) {
      pressureBar_clamped = filteredPressureBar_display - maxChangeDown;
    }
  }

  if (!filterInitialized) {
    filteredPressureBar_display = pressureBar_clamped;
    filteredPressureBar_control = pressureBar_clamped;
    filterInitialized = true;
  } else {
    float alphaDisplay = (pressureBar_clamped > filteredPressureBar_display)
                           ? (FILTER_ALPHA_DISPLAY * 1.5f)
                           : (FILTER_ALPHA_DISPLAY * 0.7f);
    filteredPressureBar_display =
      alphaDisplay * pressureBar_clamped + (1.0f - alphaDisplay) * filteredPressureBar_display;

    filteredPressureBar_control =
      FILTER_ALPHA_CONTROL * pressureBar_clamped + (1.0f - FILTER_ALPHA_CONTROL) * filteredPressureBar_control;
  }

  currentPressureBar = filteredPressureBar_display + PRESSURE_BIAS_BAR;
  currentPressureBar_control = filteredPressureBar_control; // no bias for control input
}

// ================== STAGES (time + stop conditions) ==================
enum class StageMode : uint8_t {
  Pressure = 0,
};

struct Stage {
  StageMode mode;
  float setpointStart;
  float setpointEnd;
  uint32_t durationMs;

  // Stop conditions (0 / disabled if not set)
  uint32_t minTimeMs;
  uint32_t maxTimeMs;           // 0 = use durationMs
  float advancePressureBar;     // 0 = disabled
  float advanceWeightG;         // 0 = disabled
};

// Example profile (edit later): preinfuse -> ramp -> hold -> decline
static constexpr Stage PROFILE[] = {
  { StageMode::Pressure, 2.0f, 2.0f, 7000, 2000, 0, 0, 0 },      // Stage 0: low pressure preinfusion
  { StageMode::Pressure, 2.0f, 9.0f, 6000, 0,    0, 0, 0 },      // Stage 1: ramp to 9 bar
  { StageMode::Pressure, 9.0f, 9.0f, 12000,0,    0, 0, 30.0f },  // Stage 2: hold until 30g
  { StageMode::Pressure, 9.0f, 6.0f, 8000, 0,    0, 0, 36.0f },  // Stage 3: decline, end at 36g
};
static constexpr size_t PROFILE_LEN = sizeof(PROFILE) / sizeof(PROFILE[0]);

enum class RunState : uint8_t {
  Idle = 0,
  Running = 1,
  Stopped = 2,
};

RunState runState = RunState::Idle;
size_t stageIdx = 0;
uint32_t stageStartMs = 0;

float targetPressureBar = 0.0f;

// NOTE: Don't name this `lerp` (conflicts with C++ std::lerp in <cmath> on ESP32 toolchains)
static float lerp_f(float a, float b, float t) { return a + (b - a) * t; }

float computeStageTargetPressure(const Stage& s, uint32_t stageElapsedMs) {
  if (s.durationMs == 0) return s.setpointEnd;
  float t = (float)stageElapsedMs / (float)s.durationMs;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  return lerp_f(s.setpointStart, s.setpointEnd, t);
}

bool shouldAdvanceStage(const Stage& s, uint32_t stageElapsedMs, float pressureBar, float weightG) {
  const uint32_t maxT = (s.maxTimeMs > 0) ? s.maxTimeMs : s.durationMs;

  if (maxT > 0 && stageElapsedMs >= maxT) return true;
  if (s.minTimeMs > 0 && stageElapsedMs < s.minTimeMs) return false;

  if (s.advancePressureBar > 0 && pressureBar >= s.advancePressureBar) return true;
  if (s.advanceWeightG > 0 && weightG >= s.advanceWeightG) return true;

  return false;
}

// ================== PRESSURE PI CONTROL ==================
static constexpr uint32_t CONTROL_INTERVAL_MS = 50; // 20 Hz

// Start conservative; tune later with logs.
static constexpr float KP = 7.0f;
static constexpr float KI = 0.9f;

static constexpr float POWER_SLEW_PCT_PER_SEC = 60.0f; // limit jumps

float iTerm = 0.0f;
uint32_t lastControlMs = 0;
float lastPowerCmd = 100.0f;

static float clampf(float x, float lo, float hi) {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}

uint8_t applyPressurePI(float pTarget, float pMeas, uint32_t nowMs) {
  const float dt = (nowMs - lastControlMs) / 1000.0f;
  if (dt <= 0) return (uint8_t)clampf(lastPowerCmd, 0, 100);

  float err = pTarget - pMeas;
  iTerm += (KI * err * dt);
  iTerm = clampf(iTerm, -40.0f, 40.0f); // anti-windup

  float u = (KP * err) + iTerm;
  float rawCmd = lastPowerCmd + u;
  rawCmd = clampf(rawCmd, 0.0f, 100.0f);

  // Slew limit
  const float maxStep = POWER_SLEW_PCT_PER_SEC * dt;
  float cmd = clampf(rawCmd, lastPowerCmd - maxStep, lastPowerCmd + maxStep);

  lastPowerCmd = cmd;
  lastControlMs = nowMs;
  return (uint8_t)lroundf(cmd);
}

// ================== MACHINE BUTTON (optocoupler) ==================
uint32_t lastOptoMs = 0;

void pulseOptoButton() {
  // Simple debounce and pulse, like your shot stopper
  uint32_t now = millis();
  if (now - lastOptoMs < 700) return;
  lastOptoMs = now;
  digitalWrite(OUT_PIN, HIGH);
  delay(250);
  digitalWrite(OUT_PIN, LOW);
  yield();
}

// ================== SETUP / LOOP ==================
bool printedIdle = false;
uint32_t lastLogMs = 0;

void startRun() {
  runState = RunState::Running;
  stageIdx = 0;
  stageStartMs = millis();
  iTerm = 0;
  lastPowerCmd = 60.0f; // start mid to avoid huge jump
  lastControlMs = stageStartMs;
  printedIdle = false;

  Serial.println("[RUN] GO received - starting run");
  Serial.println("[RUN] Pulsing machine button to start shot");
  pulseOptoButton();
}

void stopRun(const char* reason) {
  runState = RunState::Idle;
  pumpPowerPct = 100; // boiler refill
  printedIdle = false;
  Serial.print("[RUN] STOP: ");
  Serial.println(reason);
  Serial.println("[RUN] Pulsing machine button to stop shot");
  pulseOptoButton();
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

  // Pressure pin
  pinMode(PRESSURE_PIN, INPUT);
  // ADC config (ESP32-S3): ensure full-scale range matches divider output (~0.34–3.09V).
  // Without correct attenuation, readings can appear “too low” and look like we're logging volts.
  analogReadResolution(12);
  analogSetPinAttenuation(PRESSURE_PIN, ADC_11db);
  analogSetAttenuation(ADC_11db);

  offTimer = timerBegin(1000000); // 1MHz tick
  timerAttachInterrupt(offTimer, &onOffTimer);
  timerStop(offTimer);
  attachInterrupt(digitalPinToInterrupt(ZC_PIN), onZeroCross, RISING);

  BLE.begin();
  scale.init();
  scale.tare();
  delay(100);
  scale.tare();

  Serial.println("t_ms,stage_idx,power_pct,pressure_bar,target_pressure_bar,weight_g,flow_gps,resistance_bar_per_gps");
  Serial.println("[READY] Send GO to start, STOP to abort, STATUS for state.");
}

void loop() {
  const uint32_t now = millis();

  // Serial commands
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();
    if (cmd == "GO") {
      if (runState == RunState::Running) {
        Serial.println("[RUN] Already running");
      } else {
        startRun();
      }
    } else if (cmd == "STOP") {
      stopRun("user");
    } else if (cmd == "STATUS") {
      Serial.print("[STATUS] state=");
      Serial.print((runState == RunState::Running) ? "RUNNING" : "IDLE");
      Serial.print(" stage=");
      Serial.print((unsigned)stageIdx);
      Serial.print("/");
      Serial.print((unsigned)PROFILE_LEN);
      Serial.print(" power=");
      Serial.print((unsigned)pumpPowerPct);
      Serial.print("% p=");
      Serial.print(currentPressureBar, 2);
      Serial.print("bar");
      Serial.print(" (raw=");
      Serial.print(lastPressureBar_raw, 2);
      Serial.print("bar adc=");
      Serial.print(lastAdcValue);
      Serial.print(" adcV=");
      Serial.print(lastAdcVoltage, 3);
      Serial.print(" sensorV=");
      Serial.print(lastSensorVoltage, 3);
      Serial.println(")");
    }
  }

  // BLE scale connection management
  if (!scale.isConnected()) {
    static uint32_t lastRetry = 0;
    if (now - lastRetry > 3000) {
      lastRetry = now;
      scale.init();
    }
    // If we lose scale mid-run, abort to safe state
    if (runState == RunState::Running) {
      stopRun("scale disconnected");
    }
    return;
  }

  if (scale.heartbeatRequired()) {
    scale.heartbeat();
  }

  // Always keep pressure updated for control/telemetry
  readPressure();

  // Read weight sample (flow derives from it)
  static float weight = 0.0f;
  static float flow = 0.0f;
  if (scale.newWeightAvailable()) {
    weight = scale.getWeight();
    flow = computeFlow(weight, now);
  }

  // IDLE behavior: allow boiler refill at 100%
  if (runState != RunState::Running) {
    pumpPowerPct = 100;
    if (!printedIdle) {
      Serial.println("[IDLE] Pump at 100% for boiler refill. Send GO to run profile.");
      printedIdle = true;
    }
    return;
  }

  // Stage engine
  if (stageIdx >= PROFILE_LEN) {
    stopRun("profile complete");
    return;
  }

  const Stage& s = PROFILE[stageIdx];
  uint32_t stageElapsed = now - stageStartMs;
  targetPressureBar = computeStageTargetPressure(s, stageElapsed);

  if (shouldAdvanceStage(s, stageElapsed, currentPressureBar, weight)) {
    stageIdx++;
    stageStartMs = now;
    if (stageIdx >= PROFILE_LEN) {
      stopRun("profile complete");
      return;
    }
  }

  // Control loop (pressure -> power)
  if (now - lastControlMs >= CONTROL_INTERVAL_MS) {
    uint8_t cmd = applyPressurePI(targetPressureBar, currentPressureBar_control, now);
    pumpPowerPct = cmd;
  }

  // CSV logging (only while running)
  if (now - lastLogMs >= LOG_INTERVAL_MS) {
    lastLogMs = now;
    const float eps = 0.05f;
    float R = currentPressureBar / fmaxf(flow, eps);
    Serial.printf("%lu,%u,%u,%.2f,%.2f,%.2f,%.3f,%.3f\n",
                  (unsigned long)now,
                  (unsigned)stageIdx,
                  (unsigned)pumpPowerPct,
                  currentPressureBar,
                  targetPressureBar,
                  weight,
                  flow,
                  R);
  }
}


