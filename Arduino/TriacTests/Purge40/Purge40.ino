/*
  Purge40.ino

  Purpose:
  - Hold triac drive at a fixed ~40% power using the proven PumpProfiler burst-fire pattern
  - You press the machine's manual button to run the pump; this sketch ensures the dimmer gates accordingly

  Wiring (RobotDyn dimmer):
  - ZC  -> GPIO 14
  - DIM -> GPIO 17
*/

#include <Arduino.h>
#include "driver/gpio.h"

// ================== PINS ==================
#define ZC_PIN   14
#define DIM_PIN  17

// ================== CONFIG ==================
static constexpr uint8_t  PUMP_POWER_PERCENT = 40;      // fixed purge power
static constexpr uint32_t HALF_CYCLE_US = 8333;         // 60 Hz
static constexpr uint32_t HOLD_US = HALF_CYCLE_US - 300;
static constexpr uint8_t  BUCKET_SIZE = 20;             // burst-fire resolution

// ================== TRIAC STATE ==================
volatile uint32_t zcCount = 0;
volatile uint32_t fireCount = 0;
volatile uint8_t  bucketIdx = 0;

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

  const uint8_t fireCycles = fireCyclesFor(PUMP_POWER_PERCENT);
  if (fireCycles == 0) return;
  if (bucketIdx >= fireCycles) return;

  gpio_set_level((gpio_num_t)DIM_PIN, 1);

  timerWrite(offTimer, 0);
  timerAlarm(offTimer, HOLD_US, false, 0);
  timerStart(offTimer);

  fireCount++;
}

void setup() {
  Serial.begin(115200);
  delay(500);

  // GPIO (ISR-safe)
  gpio_reset_pin((gpio_num_t)DIM_PIN);
  gpio_set_direction((gpio_num_t)DIM_PIN, GPIO_MODE_OUTPUT);
  gpio_set_level((gpio_num_t)DIM_PIN, 0);

  pinMode(ZC_PIN, INPUT_PULLUP);

  offTimer = timerBegin(1000000); // 1 MHz = 1 µs ticks
  timerAttachInterrupt(offTimer, &onOffTimer);
  timerStop(offTimer);

  attachInterrupt(digitalPinToInterrupt(ZC_PIN), onZeroCross, RISING);

  Serial.println("========================================");
  Serial.println("Purge40: Triac fixed at 40% (burst-fire)");
  Serial.println("========================================");
  Serial.println("Press the machine's manual pump button to purge.");
  Serial.println("This sketch only controls the dimmer gate; it does not start the pump.");
  Serial.println();
}

void loop() {
  static uint32_t last = 0;
  if (millis() - last >= 1000) {
    last = millis();
    Serial.printf("ZC/s=%lu  fires/s=%lu  (power=%u%%)\n",
                  (unsigned long)zcCount,
                  (unsigned long)fireCount,
                  (unsigned)PUMP_POWER_PERCENT);
    zcCount = 0;
    fireCount = 0;
  }
}


