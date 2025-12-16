/*
  FlowProfiler.ino - Pressure transducer reader with triac control
  
  Reads analog voltage from pressure transducer
  Sensor is 0.5-4.5V with 10k/10k voltage divider (outputs 0.25-2.25V to ESP32)
  Controls triac via phase-shift modulation for power control
  
  Hardware Connections:
  - Pressure Transducer:
    * VCC: 5V
    * GND: Ground
    * Signal: Through 10k/10k voltage divider to GPIO 1
  
  - Triac Control:
    * VCC: 3.3V or 5V (depending on optocoupler/triac driver)
    * GND: Ground
    * ZC (Zero-Crossing): GPIO 2 (interrupt pin, from zero-crossing detector)
    * PSM (Phase-Shift Modulation): GPIO 4 (triac gate trigger output)
    
  Note: GPIO 3 is a strapping pin and should be avoided. GPIO 4 is safe for output.
  
  Note: For ESP32-S3, use GPIO 1-10 (ADC1) or GPIO 11-20 (ADC2)
        GPIO 32 is NOT an ADC pin on ESP32-S3!
*/

#define PRESSURE_PIN 1  // GPIO 1 - ADC1_CH0 (analog input for pressure transducer)

// Triac control pins
// VCC: 3.3V or 5V (depending on your optocoupler/triac driver)
// GND: Ground
#define ZC_PIN 2        // GPIO 2 - Zero-crossing detector input (interrupt pin, safe for interrupts)
#define PSM_PIN 4       // GPIO 4 - Phase-shift modulation control (triac gate trigger, safe for output)
// Note: GPIO 3 is a strapping pin and should NOT be used for I/O

// Voltage divider calculation
// Sensor outputs 0.5-4.5V, but voltage divider reduces it to 0.25-2.25V at ADC pin
// V_adc = V_sensor * (R2 / (R1 + R2)) = V_sensor * (10k / (10k + 10k)) = V_sensor * 0.5
#define VOLTAGE_DIVIDER_RATIO 2.0  // Multiply ADC voltage by 2 to get sensor voltage
#define ADC_REFERENCE_VOLTAGE 3.3   // ESP32 ADC reference voltage
#define ADC_RESOLUTION 4095         // 12-bit ADC (0-4095)
#define SENSOR_MIN_VOLTAGE 0.5      // Minimum sensor output voltage (0 PSI)
#define SENSOR_MAX_VOLTAGE 4.5      // Maximum sensor output voltage (260 PSI)
#define PRESSURE_MAX_PSI 260.0      // Maximum pressure in PSI
#define PSI_TO_BAR 0.0689476        // Conversion factor: 1 PSI = 0.0689476 bar

// Triac control parameters
#define AC_FREQUENCY 60             // AC frequency in Hz (50Hz for Europe, 60Hz for US)
#define HALF_CYCLE_US 8333          // Half cycle in microseconds (1000000 / (2 * 60))
#define MIN_PHASE_DELAY_US 100     // Minimum phase delay in microseconds (safety)
#define MAX_PHASE_DELAY_US 8000    // Maximum phase delay in microseconds (near zero-crossing)

volatile bool zeroCrossDetected = false;
volatile unsigned long lastZeroCrossTime = 0;
unsigned long phaseDelayUs = 5000;  // Default phase delay (60% power)

// Zero-crossing interrupt handler
void IRAM_ATTR zeroCrossISR() {
  zeroCrossDetected = true;
  lastZeroCrossTime = micros();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // Configure triac control pins
  pinMode(ZC_PIN, INPUT_PULLUP);   // Zero-crossing detector (with pullup)
  pinMode(PSM_PIN, OUTPUT);         // Triac gate control
  digitalWrite(PSM_PIN, LOW);
  
  // Attach interrupt for zero-crossing detection
  attachInterrupt(digitalPinToInterrupt(ZC_PIN), zeroCrossISR, FALLING);
  
  Serial.println("Flow Profiler - Pressure Transducer Reader");
  Serial.println("==========================================");
  Serial.print("Reading from GPIO ");
  Serial.println(PRESSURE_PIN);
  Serial.print("ADC voltage will be multiplied by 2.0 to get sensor voltage (");
  Serial.print(SENSOR_MIN_VOLTAGE, 1);
  Serial.print("-");
  Serial.print(SENSOR_MAX_VOLTAGE, 1);
  Serial.println("V)");
  Serial.println("\nTriac Control:");
  Serial.print("  ZC Pin: GPIO ");
  Serial.println(ZC_PIN);
  Serial.print("  PSM Pin: GPIO ");
  Serial.println(PSM_PIN);
  Serial.print("  Phase Delay: ");
  Serial.print(phaseDelayUs);
  Serial.println(" microseconds");
  Serial.println("Starting readings...\n");
}

// Function to set triac power level (0-100%)
void setTriacPower(float powerPercent) {
  // Clamp power to 0-100%
  if (powerPercent < 0.0) powerPercent = 0.0;
  if (powerPercent > 100.0) powerPercent = 100.0;
  
  // Calculate phase delay
  // 0% power = maximum delay (near zero-crossing, triac off)
  // 100% power = minimum delay (triac on immediately after zero-cross)
  phaseDelayUs = MAX_PHASE_DELAY_US - (powerPercent / 100.0) * (MAX_PHASE_DELAY_US - MIN_PHASE_DELAY_US);
}

// Function to trigger triac at calculated phase delay
void triggerTriac() {
  if (zeroCrossDetected) {
    zeroCrossDetected = false;
    
    // Wait for phase delay
    delayMicroseconds(phaseDelayUs);
    
    // Trigger triac gate
    digitalWrite(PSM_PIN, HIGH);
    delayMicroseconds(100);  // Pulse width (adjust based on your triac driver)
    digitalWrite(PSM_PIN, LOW);
  }
}

void loop() {
  // Handle triac control (trigger on zero-crossing)
  triggerTriac();
  
  // Read ADC value (0-4095)
  int adcValue = analogRead(PRESSURE_PIN);
  
  // Convert ADC reading to voltage at ADC pin (0-3.3V)
  float adcVoltage = (adcValue / (float)ADC_RESOLUTION) * ADC_REFERENCE_VOLTAGE;
  
  // Convert to sensor voltage (accounting for voltage divider)
  // Sensor voltage = ADC voltage * 2 (because of 10k/10k divider)
  float sensorVoltage = adcVoltage * VOLTAGE_DIVIDER_RATIO;
  
  // Calculate pressure (linear mapping: 0.5V = 0 PSI, 4.5V = 260 PSI)
  float pressurePSI = 0.0;
  if (sensorVoltage >= SENSOR_MIN_VOLTAGE && sensorVoltage <= SENSOR_MAX_VOLTAGE) {
    // Linear interpolation: pressure = (voltage - min_voltage) * (max_pressure / voltage_range)
    float voltageRange = SENSOR_MAX_VOLTAGE - SENSOR_MIN_VOLTAGE;
    pressurePSI = (sensorVoltage - SENSOR_MIN_VOLTAGE) * (PRESSURE_MAX_PSI / voltageRange);
  } else if (sensorVoltage < SENSOR_MIN_VOLTAGE) {
    pressurePSI = 0.0; // Below minimum voltage = 0 PSI
  } else {
    pressurePSI = PRESSURE_MAX_PSI; // Above maximum voltage = max PSI
  }
  
  // Convert PSI to bar
  float pressureBar = pressurePSI * PSI_TO_BAR;
  
  // Example: Control triac power based on pressure (optional - adjust as needed)
  // Higher pressure = lower power, lower pressure = higher power
  // float targetPressure = 9.0; // bar
  // float powerPercent = 100.0 - ((pressureBar / 18.0) * 100.0);
  // setTriacPower(powerPercent);
  
  // Print readings
  Serial.print("ADC: ");
  Serial.print(adcValue);
  Serial.print(" | Voltage: ");
  Serial.print(sensorVoltage, 3);
  Serial.print("V | Pressure: ");
  Serial.print(pressurePSI, 1);
  Serial.print(" PSI (");
  Serial.print(pressureBar, 2);
  Serial.print(" bar) | Phase Delay: ");
  Serial.print(phaseDelayUs);
  Serial.println(" us");
  
  delay(100); // Read 10 times per second
}

