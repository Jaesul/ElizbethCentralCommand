/*
  PSMSanity.ino - Minimal sanity test for PSM.Library on ESP32

  Goal:
  - Verify that PSM.Library is receiving zero-cross interrupts and driving the triac gate output.
  - Log "clicks" (PSM counter), ZC ISR rate, and timing fields over Serial.

  Hardware:
  - ZC_PIN: zero-cross detector input
  - DIM_PIN: triac gate output

  Notes:
  - This sketch sets pump power to 100% immediately (range value).
  - PSM.Library exposes `getCounter()` which increments on non-skipped cycles.
  - We override the weak `onPSMInterrupt()` hook from the library to count ZC interrupts.
*/

#include <Arduino.h>
#include <PSM.h>

// Match your existing triac test wiring
#define ZC_PIN  14
#define DIM_PIN 17

static constexpr uint16_t PSM_RANGE = 100;

PSM pump(ZC_PIN, DIM_PIN, PSM_RANGE, RISING, 1, 6);

// ---- ZC interrupt telemetry (hooked via weak symbol in PSM.Library) ----
volatile uint32_t zcIsrCount = 0;
volatile uint32_t lastZcUs = 0;

void onPSMInterrupt() {
  zcIsrCount++;
  lastZcUs = (uint32_t)micros();
}

static inline void setPowerPct(uint16_t pct_x10) {
  if (pct_x10 > 1000) pct_x10 = 1000;
  const uint16_t v = (uint32_t)pct_x10 * (uint32_t)PSM_RANGE / 1000u;
  pump.set(v);
}

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("=== PSM Sanity (ESP32) ===");
  Serial.printf("ZC_PIN=%d DIM_PIN=%d RANGE=%u\n", ZC_PIN, DIM_PIN, (unsigned)PSM_RANGE);
#if defined(ESP32)
  Serial.println("Build: ESP32=1");
#else
  Serial.println("Build: ESP32=0");
#endif

  // Determine whether we should divide ZC rate (120/s -> ~60/s) like Gaggiuino does.
  Serial.println("[init] Measuring cps() for 1s...");
  const unsigned int cps = pump.cps();
  Serial.printf("[init] cps()=%u\n", cps);
  // For Gaggiuino compatibility we want "clicks" to be full-cycle semantics (~60/s max @ 60Hz),
  // even though ZC interrupts arrive at ~120/s (half-cycles).
  pump.setDivider(2);
  Serial.println("[init] setDivider(2) (full-cycle click semantics)");

  // Configure gate-pulse end timer (PSM.Library semantics)
  pump.initTimer(cps > 110u ? 5000u : 6000u);
  Serial.println("[init] initTimer(...) done");

  // Start at 100% immediately
  setPowerPct(1000);
  Serial.println("[init] power=100.0% (pump.set(range))");

  pump.resetCounter();
}

void loop() {
  static uint32_t lastPrintMs = 0;
  static uint32_t lastZcCount = 0;
  static long lastClicks = 0;
  static uint32_t lastMs = 0;

  const uint32_t nowMs = millis();
  if (nowMs - lastPrintMs < 500) return;
  lastPrintMs = nowMs;

  // Snapshot volatile counters
  const uint32_t zc = zcIsrCount;
  const uint32_t zcUs = lastZcUs;
  const long clicks = pump.getCounter();
  const unsigned long lastZcMsFromLib = pump.getLastMillis();

  float zcPerS = 0.0f;
  float clicksPerS = 0.0f;
  if (lastMs != 0 && nowMs > lastMs) {
    const float dt = (float)(nowMs - lastMs) / 1000.0f;
    zcPerS = (float)(zc - lastZcCount) / dt;
    clicksPerS = (float)(clicks - lastClicks) / dt;
  }

  lastZcCount = zc;
  lastClicks = clicks;
  lastMs = nowMs;

  Serial.printf(
    "t=%lu zc=%lu (%.1f/s) clicks=%ld (%.1f/s) libLastZcMs=%lu lastZcUs=%lu\n",
    (unsigned long)nowMs,
    (unsigned long)zc,
    zcPerS,
    clicks,
    clicksPerS,
    (unsigned long)lastZcMsFromLib,
    (unsigned long)zcUs
  );
}


