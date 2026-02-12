#include <Arduino.h>
#include "driver/gpio.h"
#include <AcaiaArduinoBLE.h>

// ================== PINS ==================
#define ZC_PIN   14
#define DIM_PIN  17

// ================== CONFIG ==================
static constexpr uint8_t  PUMP_POWER_PERCENT = 100;   // <<< CHANGE THIS
static constexpr uint32_t HALF_CYCLE_US = 8333;      // 60 Hz
static constexpr uint32_t HOLD_US = HALF_CYCLE_US - 300;
static constexpr uint8_t  BUCKET_SIZE = 20;          // burst-fire resolution

static constexpr uint32_t LOG_INTERVAL_MS = 100;     // 10 Hz logging
static constexpr float    FLOW_ALPHA = 0.25;         // EMA smoothing
static constexpr float    FLOW_DEADBAND_G = 0.03;

// ================== TRIAC STATE ==================
volatile uint32_t zcCount = 0;
volatile uint32_t fireCount = 0;
volatile uint8_t  bucketIdx = 0;

hw_timer_t* offTimer = nullptr;

// ================== SCALE ==================
AcaiaArduinoBLE scale(false);

// ================== FLOW STATE ==================
float lastWeight = NAN;
uint32_t lastWeightMs = 0;
float flowEMA = 0.0;

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

  const uint8_t fireCycles = fireCyclesFor(PUMP_POWER_PERCENT);
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

// ================== SETUP ==================
void setup() {
  Serial.begin(115200);
  delay(1000);

  // GPIO (ISR-safe)
  gpio_reset_pin((gpio_num_t)DIM_PIN);
  gpio_set_direction((gpio_num_t)DIM_PIN, GPIO_MODE_OUTPUT);
  gpio_set_level((gpio_num_t)DIM_PIN, 0);

  pinMode(ZC_PIN, INPUT_PULLUP);

  offTimer = timerBegin(1000000); // 1 MHz = 1 µs ticks
  timerAttachInterrupt(offTimer, &onOffTimer);
  timerStop(offTimer);

  attachInterrupt(digitalPinToInterrupt(ZC_PIN), onZeroCross, RISING);

  BLE.begin();
  scale.init();
  scale.tare();
  delay(100);
  scale.tare();

  Serial.println("time_ms,power_pct,weight_g,flow_gps");
}

// ================== LOOP ==================
void loop() {
  static uint32_t lastLogMs = 0;

  if (!scale.isConnected()) {
    static uint32_t lastRetry = 0;
    if (millis() - lastRetry > 3000) {
      lastRetry = millis();
      scale.init();
    }
    return;
  }

  if (scale.heartbeatRequired()) {
    scale.heartbeat();
  }

  if (scale.newWeightAvailable()) {
    float weight = scale.getWeight();
    uint32_t now = millis();
    float flow = computeFlow(weight, now);

    if (now - lastLogMs >= LOG_INTERVAL_MS) {
      lastLogMs = now;
      Serial.printf("%lu,%u,%.2f,%.3f\n",
                    (unsigned long)now,
                    PUMP_POWER_PERCENT,
                    weight,
                    flow);
    }
  }
}
