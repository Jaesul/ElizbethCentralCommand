/*
  PressureReader.ino - Pressure transducer reader with WebSocket data emission
  
  Reads analog voltage from pressure transducer via GPIO 4
  Sensor is 0.5-4.5V with 10k/22k voltage divider (outputs 0.344-3.094V to ESP32)
  Emits pressure data via WebSocket server for real-time monitoring
  
  Hardware Connections:
  - Pressure Transducer:
    * VCC: 5V
    * GND: Ground
    * Signal: Through 10k/22k voltage divider to GPIO 4
  
  Note: For ESP32-S3, use GPIO 1-10 (ADC1) or GPIO 11-20 (ADC2)
        GPIO 4 is ADC1_CH3 - safe for analog input
*/

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include <ArduinoJson.h>

#define PRESSURE_PIN 4  // GPIO 4 - ADC1_CH3 (analog input for pressure transducer)

// WiFi and WebSocket configuration
#define WIFI_SSID "Kenyon19"            // WiFi network name
#define WIFI_PASSWORD "Kenyon_1"        // WiFi password
#define WS_SERVER_PORT 82               // WebSocket server port (different from ShotStopper's port 81)
#define WS_SERVER_PATH "/ws"             // WebSocket server path
#define MDNS_HOSTNAME "pressure-reader" // mDNS hostname for discovery

// User defined settings
#define WEBSOCKET_ENABLED true      // Enable WebSocket data reporting
#define DATA_REPORT_INTERVAL_MS 50  // How often to send data updates (ms) - ~20 updates/sec

// Filtering configuration
#define FILTER_ALPHA_DISPLAY 0.15   // Exponential filter alpha for display/logging (increased for more responsiveness)
#define FILTER_ALPHA_CONTROL 0.25   // Exponential filter alpha for control (0.2-0.3)
#define MAX_PRESSURE_CHANGE_BAR 3.0 // Maximum allowed pressure change per reading (bar) - increased to handle noise
#define PRESSURE_BIAS_BAR 0.5       // Bias to add to filtered pressure (bar) - increased to compensate for filter lag
#define MIN_PRESSURE_BAR 0.0        // Minimum valid pressure reading (bar)
#define MAX_PRESSURE_BAR 16.0       // Maximum valid pressure reading (bar) - 1.6 MPa = 16 bar

// Voltage divider calculation
// Sensor outputs 0.5-4.5V, but voltage divider reduces it to 0.344-3.094V at ADC pin
// Voltage divider ratio: R2/(R1+R2) = 22k/(10k+22k) = 0.6875
// To get sensor voltage from ADC voltage: sensorVoltage = adcVoltage / 0.6875 = adcVoltage * 1.4545
#define VOLTAGE_DIVIDER_RATIO 1.4545    // Multiply ADC voltage by this to get sensor voltage
#define ADC_REFERENCE_VOLTAGE 3.3       // ESP32 ADC reference voltage
#define ADC_RESOLUTION 4095              // 12-bit ADC (0-4095)
#define SENSOR_MIN_VOLTAGE 0.5          // Minimum sensor output voltage (0 pressure)
#define SENSOR_MAX_VOLTAGE 4.5          // Maximum sensor output voltage (max pressure)
#define PRESSURE_MAX_MPA 1.6            // Maximum pressure in MPa (sensor spec: 0-1.6 MPa)
#define MPA_TO_BAR 10.0                 // Conversion factor: 1 MPa = 10 bar
#define MPA_TO_PSI 145.038              // Conversion factor: 1 MPa = 145.038 PSI

// WebSocket server
WebSocketsServer webSocket = WebSocketsServer(WS_SERVER_PORT);
unsigned long lastDataReport_ms = 0;

// Filtering state variables
float filteredPressureBar_display = 0.0;  // Filtered pressure for display/logging
float filteredPressureBar_control = 0.0;  // Filtered pressure for control
bool filterInitialized = false;

// WebSocket event handler
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("[%u] Disconnected!\n", num);
      break;
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("[%u] Connected from %d.%d.%d.%d url: %s\n", num, ip[0], ip[1], ip[2], ip[3], payload);
      break;
    }
    case WStype_TEXT:
      // Handle incoming text messages if needed
      Serial.printf("[%u] Received text: %s\n", num, payload);
      break;
    default:
      break;
  }
}

// Initialize WiFi
void initWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("WiFi connected! IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("WiFi connection failed!");
  }
}

// Initialize mDNS
void initMDNS() {
  if (!MDNS.begin(MDNS_HOSTNAME)) {
    Serial.println("Error setting up MDNS responder!");
    return;
  }
  Serial.printf("mDNS responder started. Hostname: %s.local\n", MDNS_HOSTNAME);
  
  // Add WebSocket service
  MDNS.addService("http", "tcp", WS_SERVER_PORT);
  Serial.printf("mDNS service added: http._tcp on port %d\n", WS_SERVER_PORT);
}

// Initialize WebSocket server
void initWebSocket() {
  webSocket.begin();
  webSocket.onEvent(webSocketEvent);
  Serial.printf("WebSocket server started on port %d\n", WS_SERVER_PORT);
  Serial.printf("Connect to: ws://%s.local:%d%s\n", MDNS_HOSTNAME, WS_SERVER_PORT, WS_SERVER_PATH);
}

// Send pressure data via WebSocket (broadcast to all connected clients)
void sendPressureData(float pressurePSI, float pressureBar, int adcValue, float adcVoltage, float sensorVoltage, float pressureMPA) {
  if (!WEBSOCKET_ENABLED) {
    return;
  }

  // Check if any clients are connected
  if (webSocket.connectedClients() == 0) {
    return; // No clients connected, don't waste time creating JSON
  }

  // Create JSON document (increased size to accommodate serial log data)
  StaticJsonDocument<512> doc;
  
  // Add pressure values
  doc["currentPressure"] = pressureBar;  // Primary value in bar
  doc["pressurePSI"] = pressurePSI;
  doc["pressureBar"] = pressureBar;
  
  // Add timestamp (millis since boot in seconds)
  doc["timestamp"] = millis() / 1000.0;
  
  // Add serial log data
  doc["adcValue"] = adcValue;
  doc["adcVoltage"] = adcVoltage;
  doc["sensorVoltage"] = sensorVoltage;
  doc["pressureMPA"] = pressureMPA;
  
  // Create formatted serial log string (using filtered values)
  float pressureMPA_filtered = pressureBar / MPA_TO_BAR;  // Convert filtered bar back to MPa for log
  char logString[256];
  snprintf(logString, sizeof(logString), 
    "ADC: %d | ADC Voltage: %.3fV | Sensor Voltage: %.3fV | Pressure: %.3f MPa (%.2f bar, %.1f PSI) [filtered]",
    adcValue, adcVoltage, sensorVoltage, pressureMPA_filtered, pressureBar, pressurePSI);
  doc["serialLog"] = logString;

  // Serialize to string
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Broadcast to all connected WebSocket clients
  webSocket.broadcastTXT(jsonString);
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("Pressure Reader - Starting");
  Serial.println("==========================================");
  Serial.print("Reading from GPIO ");
  Serial.print(PRESSURE_PIN);
  Serial.println(" (ADC1_CH3)");
  Serial.print("Voltage divider: 10k/22k (ratio: 0.6875)");
  Serial.print(" | ADC voltage range: ");
  Serial.print(SENSOR_MIN_VOLTAGE / VOLTAGE_DIVIDER_RATIO, 3);
  Serial.print("-");
  Serial.print(SENSOR_MAX_VOLTAGE / VOLTAGE_DIVIDER_RATIO, 3);
  Serial.println("V");
  Serial.print("Sensor voltage range: ");
  Serial.print(SENSOR_MIN_VOLTAGE, 1);
  Serial.print("-");
  Serial.print(SENSOR_MAX_VOLTAGE, 1);
  Serial.println("V");
  Serial.print("Pressure range: 0-");
  Serial.print(PRESSURE_MAX_MPA, 1);
  Serial.print(" MPa (0-");
  Serial.print(PRESSURE_MAX_MPA * MPA_TO_BAR, 1);
  Serial.print(" bar, 0-");
  Serial.print(PRESSURE_MAX_MPA * MPA_TO_PSI, 1);
  Serial.println(" PSI)");
  Serial.println();
  
  // Initialize WiFi
  initWiFi();
  
  // Initialize mDNS (only if WiFi connected)
  if (WiFi.status() == WL_CONNECTED) {
    initMDNS();
  }
  
  // Initialize WebSocket server
  if (WEBSOCKET_ENABLED) {
    initWebSocket();
  }
  
  Serial.println("Starting pressure readings...\n");
}

void loop() {
  // Handle WebSocket server updates
  if (WEBSOCKET_ENABLED && WiFi.status() == WL_CONNECTED) {
    webSocket.loop();
  }
  
  // Read pressure and send data at specified interval
  if (millis() - lastDataReport_ms >= DATA_REPORT_INTERVAL_MS) {
    // Read ADC value (0-4095)
    int adcValue = analogRead(PRESSURE_PIN);
    
    // Convert ADC reading to voltage at ADC pin (0-3.3V)
    float adcVoltage = (adcValue / (float)ADC_RESOLUTION) * ADC_REFERENCE_VOLTAGE;
    
    // Convert to sensor voltage (accounting for voltage divider)
    // Sensor voltage = ADC voltage * VOLTAGE_DIVIDER_RATIO
    float sensorVoltage = adcVoltage * VOLTAGE_DIVIDER_RATIO;
    
    // Calculate pressure (linear mapping: 0.5V = 0 MPa, 4.5V = 1.6 MPa)
    float pressureMPA = 0.0;
    
    if (sensorVoltage >= SENSOR_MIN_VOLTAGE && sensorVoltage <= SENSOR_MAX_VOLTAGE) {
      // Linear interpolation: pressure = (voltage - min_voltage) * (max_pressure / voltage_range)
      float voltageRange = SENSOR_MAX_VOLTAGE - SENSOR_MIN_VOLTAGE;
      pressureMPA = (sensorVoltage - SENSOR_MIN_VOLTAGE) * (PRESSURE_MAX_MPA / voltageRange);
    } else if (sensorVoltage < SENSOR_MIN_VOLTAGE) {
      pressureMPA = 0.0; // Below minimum voltage = 0 MPa
    } else {
      pressureMPA = PRESSURE_MAX_MPA; // Above maximum voltage = max MPa
    }
    
    // Convert to bar and PSI (raw reading)
    float pressureBar_raw = pressureMPA * MPA_TO_BAR;
    float pressurePSI_raw = pressureMPA * MPA_TO_PSI;
    
    // Apply filtering
    // First, clamp to valid range
    if (pressureBar_raw < MIN_PRESSURE_BAR) pressureBar_raw = MIN_PRESSURE_BAR;
    if (pressureBar_raw > MAX_PRESSURE_BAR) pressureBar_raw = MAX_PRESSURE_BAR;
    
    // Clamp impossible jumps (but be more lenient on upward changes)
    float pressureBar_clamped = pressureBar_raw;
    if (filterInitialized) {
      float change = pressureBar_raw - filteredPressureBar_display;
      // More lenient on upward changes, stricter on downward
      float maxChangeUp = MAX_PRESSURE_CHANGE_BAR * 1.5;  // Allow bigger jumps up
      float maxChangeDown = MAX_PRESSURE_CHANGE_BAR * 0.7; // Stricter on drops
      
      if (change > maxChangeUp) {
        pressureBar_clamped = filteredPressureBar_display + maxChangeUp;
      } else if (change < -maxChangeDown) {
        pressureBar_clamped = filteredPressureBar_display - maxChangeDown;
      }
    }
    
    // Apply exponential filters
    if (!filterInitialized) {
      // Initialize filters with first reading
      filteredPressureBar_display = pressureBar_clamped;
      filteredPressureBar_control = pressureBar_clamped;
      filterInitialized = true;
    } else {
      // Exponential filter for display/logging with asymmetric response
      // More responsive to increases (higher alpha), less responsive to decreases
      float alpha = (pressureBar_clamped > filteredPressureBar_display) ? 
                     FILTER_ALPHA_DISPLAY * 1.5 :  // More responsive to increases
                     FILTER_ALPHA_DISPLAY * 0.7;  // Less responsive to decreases
      filteredPressureBar_display = alpha * pressureBar_clamped + 
                                     (1.0 - alpha) * filteredPressureBar_display;
      
      // Exponential filter for control (lighter filtering)
      filteredPressureBar_control = FILTER_ALPHA_CONTROL * pressureBar_clamped + 
                                     (1.0 - FILTER_ALPHA_CONTROL) * filteredPressureBar_control;
    }
    
    // Use filtered values for display/logging with bias to trend higher
    float pressureBar = filteredPressureBar_display + PRESSURE_BIAS_BAR;
    float pressurePSI = pressureBar * (MPA_TO_PSI / MPA_TO_BAR);  // Convert filtered bar to PSI
    
    // Print readings to Serial (for debugging) - show both raw and filtered
    Serial.print("ADC: ");
    Serial.print(adcValue);
    Serial.print(" | ADC Voltage: ");
    Serial.print(adcVoltage, 3);
    Serial.print("V | Sensor Voltage: ");
    Serial.print(sensorVoltage, 3);
    Serial.print("V | Raw: ");
    Serial.print(pressureBar_raw, 2);
    Serial.print(" bar | Filtered: ");
    Serial.print(pressureBar, 2);
    Serial.print(" bar (");
    Serial.print(pressurePSI, 1);
    Serial.println(" PSI)");
    
    // Send data via WebSocket (includes serial log data) - using filtered values
    if (WEBSOCKET_ENABLED && WiFi.status() == WL_CONNECTED) {
      float pressureMPA_filtered = pressureBar / MPA_TO_BAR;  // Convert filtered bar to MPa
      sendPressureData(pressurePSI, pressureBar, adcValue, adcVoltage, sensorVoltage, pressureMPA_filtered);
    }
    
    lastDataReport_ms = millis();
  }
  
  // Small delay to prevent watchdog issues
  delay(1);
}


