/*
  ButtonSimulator.ino - Simple button press simulator
  When the physical button is pressed, simulates a button press by pulsing the output pin
  
  Pin Configuration:
  - Button on pin 4 (INPUT_PULLDOWN - reads HIGH when pressed)
  - Output pin 19 (pulses LOW to simulate button press)
  
  Usage:
  Upload this to ESP32-S3. When you press the physical button, it will
  simulate a button press by pulsing pin 19 LOW for 250ms.
*/

#define BUTTON_PIN 4      // Physical button input pin
#define OUT_PIN 19        // Output pin to simulate button press (12V optocoupler)

#define BUTTON_PRESS_DURATION_MS 250  // Duration to hold the simulated button press

// Button debouncing
int buttonState = 0;
int lastButtonState = 0;
unsigned long lastDebounceTime = 0;
unsigned long debounceDelay = 50;  // 50ms debounce delay

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n========================================");
  Serial.println("Button Simulator");
  Serial.println("========================================\n");
  
  // Configure pins
  pinMode(BUTTON_PIN, INPUT_PULLDOWN);  // Button input with pull-down resistor
  pinMode(OUT_PIN, OUTPUT);
  digitalWrite(OUT_PIN, HIGH);  // Start with output HIGH (idle state)
  
  Serial.println("Button Simulator Ready");
  Serial.println("Press the physical button to trigger simulated button press\n");
}

void loop() {
  // Read button state
  int reading = digitalRead(BUTTON_PIN);
  
  // Debounce the button
  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }
  
  if ((millis() - lastDebounceTime) > debounceDelay) {
    // Button state has been stable for debounce delay
    
    if (reading != buttonState) {
      buttonState = reading;
      
      // Button was just pressed (transition from LOW to HIGH)
      if (buttonState == HIGH) {
        Serial.println("[Button] Physical button pressed - simulating button press...");
        simulateButtonPress();
        Serial.println("[Button] Simulated button press complete\n");
      }
      // Button was released (transition from HIGH to LOW)
      else {
        Serial.println("[Button] Physical button released");
      }
    }
  }
  
  lastButtonState = reading;
  
  delay(10);  // Small delay to prevent excessive loop iterations
}

void simulateButtonPress() {
  // Pulse the output pin LOW for the duration (simulates button press)
  digitalWrite(OUT_PIN, LOW);
  delay(BUTTON_PRESS_DURATION_MS);
  digitalWrite(OUT_PIN, HIGH);
}

