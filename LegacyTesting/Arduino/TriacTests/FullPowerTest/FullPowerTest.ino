#define ZC_PIN   14
#define DIM_PIN  17

// 60 Hz mains half-cycle = 8333 µs
static constexpr uint32_t HALF_CYCLE_US = 8333;

volatile uint32_t zcCount = 0;

void IRAM_ATTR onZeroCross() {
  zcCount++;

  // Assert DIM for almost the entire half-cycle
  digitalWrite(DIM_PIN, HIGH);
  delayMicroseconds(HALF_CYCLE_US - 300); // hold long enough to latch
  digitalWrite(DIM_PIN, LOW);
}

void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(DIM_PIN, OUTPUT);
  digitalWrite(DIM_PIN, LOW);

  pinMode(ZC_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ZC_PIN), onZeroCross, RISING);

  Serial.println("Pump forced to 100% power (full conduction).");
}

void loop() {
  static uint32_t last = 0;
  if (millis() - last >= 1000) {
    last = millis();
    Serial.printf("Zero-cross events: %lu / sec (pump FULL ON)\n",
                  (unsigned long)zcCount);
    zcCount = 0;
  }
}