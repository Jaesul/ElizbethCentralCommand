/*
  ESP32-S3 Minimal Sanity Check
  Quick test to verify board is working
*/

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("ESP32-S3 Test - Board is working!");
  Serial.printf("Free Heap: %u bytes\n", ESP.getFreeHeap());
  
  // Blink LED 3 times
  pinMode(LED_BUILTIN, OUTPUT);
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_BUILTIN, HIGH);
    delay(200);
    digitalWrite(LED_BUILTIN, LOW);
    delay(200);
  }
  
  Serial.println("Test complete!");
}

void loop() {
  // Blink LED every 2 seconds
  digitalWrite(LED_BUILTIN, HIGH);
  delay(100);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1900);
}
