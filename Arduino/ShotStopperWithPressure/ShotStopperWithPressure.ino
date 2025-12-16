/*
  ShotStopperWithPressure.ino - Full featured brewing by weight with predictive shot stopping
  WITH pressure transducer reading and WebSocket server for real-time data reporting
  
  Features:
  - Connects to Acaia scale via BLE
  - Shows current weight on OLED display
  - Predictive shot stopping using linear regression
  - Shot control via WebSocket commands (startShot/stopShot)
  - Auto-tare on shot start
  - Weight offset auto-correction
  - Goal weight adjustable via BLE characteristic
  - EEPROM stores goal weight and offset persistently
  - Reads pressure from transducer via GPIO 4 (ADC1_CH3)
  - WebSocket server for real-time data broadcasting to frontend clients
  - mDNS support for easy discovery (shotstopper-ws.local)
  
  Based on the original shotStopper by Tate Mazer, 2023.
  Adapted for ESP32-S3 with optimized memory usage.
  Extended with WiFi, WebSocket server, pressure reading, and mDNS for Elizabeth Central Command project.
  
  Hardware Connections:
  - Optocoupler Output: GPIO 19 (OUTPUT)
  - Pressure Transducer:
    * VCC: 5V
    * GND: Ground
    * Signal: Through 10k/22k voltage divider to GPIO 4 (ADC1_CH3)
*/

#include <AcaiaArduinoBLE.h>
#include <EEPROM.h>
#include <cstring>
#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ESPmDNS.h>
#include <ArduinoJson.h>

#define OUT_PIN 19  // Output pin for 12V optocoupler
#define PRESSURE_PIN 4  // GPIO 4 - ADC1_CH3 (analog input for pressure transducer) - matches PressureReader.ino

#define MAX_OFFSET 5                // In case an error in brewing occurred
#define MIN_SHOT_DURATION_S 3       // Useful for flushing the group
#define MAX_SHOT_DURATION_S 50      // Maximum shot duration to prevent runaway shots
#define DRIP_DELAY_S 3              // Time after shot ended to measure final weight

#define EEPROM_SIZE 2
#define WEIGHT_ADDR 0
#define OFFSET_ADDR 1

#define N 10                        // Number of datapoints used to calculate trend line
#define SHOT_DATA_CAPACITY 100

#define DEBUG false

// WiFi and WebSocket configuration
#define WIFI_SSID "Kenyon19"            // WiFi network name
#define WIFI_PASSWORD "Kenyon_1"        // WiFi password
#define WS_SERVER_PORT 81               // WebSocket server port
#define WS_SERVER_PATH "/ws"             // WebSocket server path
#define MDNS_HOSTNAME "shotstopper-ws"   // mDNS hostname for discovery

// User defined settings
#define AUTOTARE true               // Automatically tare when shot is started
#define TIMER_ONLY false            // Disables brew by weight, only automates timer/tare
#define WEBSOCKET_ENABLED true      // Enable WebSocket data reporting
#define DATA_REPORT_INTERVAL_MS 50  // How often to send data updates (ms) - ~20 updates/sec
#define PRESSURE_READ_INTERVAL_MS 50 // How often to read pressure (ms)

// Pressure sensor configuration
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

// Filtering configuration
#define FILTER_ALPHA_DISPLAY 0.15   // Exponential filter alpha for display/logging (increased for more responsiveness)
#define FILTER_ALPHA_CONTROL 0.25   // Exponential filter alpha for control (0.2-0.3)
#define MAX_PRESSURE_CHANGE_BAR 3.0 // Maximum allowed pressure change per reading (bar) - increased to handle noise
#define PRESSURE_BIAS_BAR 0.5       // Bias to add to filtered pressure (bar) - increased to compensate for filter lag
#define MIN_PRESSURE_BAR 0.0        // Minimum valid pressure reading (bar)
#define MAX_PRESSURE_BAR 16.0       // Maximum valid pressure reading (bar) - 1.6 MPa = 16 bar

typedef enum {BUTTON, WEIGHT, TIME, DISCONNECT, UNDEF} ENDTYPE;

AcaiaArduinoBLE scale(DEBUG);

// BLE peripheral device
BLEService weightService("0x0FFE");
BLEByteCharacteristic weightCharacteristic("0xFF11", BLEWrite | BLERead);

// Global variables
float currentWeight = 0;
uint8_t goalWeight = 0;
float weightOffset = 0;
unsigned long lastOptocouplerPulse_ms = 0;
unsigned long lastHeapCheck_ms = 0;

// Pressure reading variables
float currentPressureBar = 0.0;
float currentPressurePSI = 0.0;
float currentPressureMPA = 0.0;
int currentAdcValue = 0;
float currentAdcVoltage = 0.0;
float currentSensorVoltage = 0.0;
unsigned long lastPressureRead_ms = 0;

// Filtering state variables
float filteredPressureBar_display = 0.0;  // Filtered pressure for display/logging
float filteredPressureBar_control = 0.0;  // Filtered pressure for control
bool filterInitialized = false;

// WebSocket server
WebSocketsServer webSocket = WebSocketsServer(WS_SERVER_PORT);
unsigned long lastDataReport_ms = 0;
unsigned long tareCompleteTime_ms = 0; // Timestamp when tare completed, to delay first data report
unsigned long lastWebSocketLoop_ms = 0; // Throttle webSocket.loop() calls

// Shot struct for tracking brewing trajectory
struct Shot {
  float start_timestamp_s;
  float shotTimer;
  float end_s;
  float expected_end_s;
  float weight[SHOT_DATA_CAPACITY];
  float time_s[SHOT_DATA_CAPACITY];
  int datapoints;
  int headIndex;
  bool brewing;
  ENDTYPE end;
};

Shot shot = {};

void clearShotBuffer(){
  shot.datapoints = 0;
  shot.headIndex = 0;
  memset(shot.weight, 0, sizeof(shot.weight));
  memset(shot.time_s, 0, sizeof(shot.time_s));
}

void monitorHeap(){
  const unsigned long CHECK_INTERVAL_MS = 2000;
  if(millis() - lastHeapCheck_ms < CHECK_INTERVAL_MS){
    return;
  }
  lastHeapCheck_ms = millis();

  size_t heapSize = ESP.getHeapSize();
  size_t freeHeap = ESP.getFreeHeap();
  size_t used = heapSize - freeHeap;
  uint8_t usedPercent = (heapSize > 0) ? (used * 100) / heapSize : 0;

  Serial.printf("Heap usage: %u / %u bytes (%u%%)\n", (unsigned)used, (unsigned)heapSize, usedPercent);

  if(usedPercent >= 80){
    Serial.println("Heap above 80% - clearing shot buffer");
    clearShotBuffer();
  }
}

// Read pressure from transducer
void readPressure() {
  if (millis() - lastPressureRead_ms < PRESSURE_READ_INTERVAL_MS) {
    return;
  }
  lastPressureRead_ms = millis();
  
  // Read ADC value (0-4095)
  int adcValue = analogRead(PRESSURE_PIN);
  
  // Convert ADC reading to voltage at ADC pin (0-3.3V)
  float adcVoltage = (adcValue / (float)ADC_RESOLUTION) * ADC_REFERENCE_VOLTAGE;
  
  // Convert to sensor voltage (accounting for voltage divider)
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
  currentPressureBar = filteredPressureBar_display + PRESSURE_BIAS_BAR;
  currentPressurePSI = currentPressureBar * (MPA_TO_PSI / MPA_TO_BAR);  // Convert filtered bar to PSI
  
  // Store detailed sensor data for WebSocket transmission
  currentPressureMPA = currentPressureBar / MPA_TO_BAR;  // Convert filtered bar back to MPa
  currentAdcValue = adcValue;
  currentAdcVoltage = adcVoltage;
  currentSensorVoltage = sensorVoltage;
  
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
  Serial.print(currentPressureBar, 2);
  Serial.print(" bar (");
  Serial.print(currentPressurePSI, 1);
  Serial.println(" PSI)");
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("ShotStopper with Pressure - Starting");
  Serial.println("==========================================");

  EEPROM.begin(EEPROM_SIZE);
  
  // Get stored setpoint and offset
  goalWeight = EEPROM.read(WEIGHT_ADDR);
  weightOffset = EEPROM.read(OFFSET_ADDR)/10.0;
  
  // If EEPROM isn't initialized and has unreasonable values, default to 36g/1.5g
  if ((goalWeight < 10) || (goalWeight > 200)) {
    goalWeight = 36;
  }
  if (weightOffset > MAX_OFFSET) {
    weightOffset = 1.5;
  }

  pinMode(OUT_PIN, OUTPUT);
  digitalWrite(OUT_PIN, LOW);  // Start with optocoupler off

  // Initialize WiFi, mDNS, and WebSocket server if enabled
  if(WEBSOCKET_ENABLED){
    initWiFi();
    if(WiFi.status() == WL_CONNECTED){
      initMDNS();
      initWebSocket();
    }
  }

  // initialize BLE
  BLE.begin();
  BLE.setLocalName("shotStopper");
  BLE.setAdvertisedService(weightService);
  weightService.addCharacteristic(weightCharacteristic);
  BLE.addService(weightService);
  weightCharacteristic.writeValue(goalWeight);
  BLE.advertise();
  Serial.println("BLE advertising");
  
  // connect to scale
  Serial.println("Connecting to scale...");
  
  if (scale.init()) {
    Serial.println("Connected!");
    
    // Initial tare if AUTOTARE enabled
    if (AUTOTARE) {
      scale.tare();
      scale.tare();
      Serial.println("Scale tared");
    }
  } else {
    Serial.println("Scale connection failed");
  }
  
  Serial.println("Pressure sensor initialized on GPIO 4 (ADC1_CH3)");
  Serial.println("Starting main loop...\n");
}

void loop() {
  
  static unsigned long lastHeartbeat_ms = 0;
  if(millis() - lastHeartbeat_ms > 500){
    Serial.println("loop heartbeat");
    lastHeartbeat_ms = millis();
  }

  if(!scale.isConnected()){
    Serial.println("Scale lost!");
    Serial.println("Scanning...");

    if(shot.brewing){
      shot.brewing = false;
      shot.end = ENDTYPE::DISCONNECT;
      setBrewingState(false);
    }

    currentWeight = 0;

    while(!scale.isConnected()){
      scale.init();
      if(!scale.isConnected()){
        delay(1000);
      }
    }

    Serial.println("Scale found");
    delay(500);

    scale.tare();
    delay(50);
    yield();
    scale.tare();
  }

  monitorHeap();

  // Read pressure sensor (independent of weight readings)
  readPressure();

  // Check for setpoint updates
  BLE.poll();
  if (weightCharacteristic.written()) {
    goalWeight = weightCharacteristic.value();
    Serial.println(goalWeight);
    EEPROM.write(WEIGHT_ADDR, goalWeight);
    EEPROM.commit();
  }

  // Send a heartbeat message to the scale periodically to maintain connection
  if(scale.heartbeatRequired()){
    scale.heartbeat();
  }

  // always call newWeightAvailable to actually receive the datapoint from the scale
  if(scale.newWeightAvailable()){
    currentWeight = scale.getWeight();

    // update shot trajectory
    if(shot.brewing && !TIMER_ONLY){
      float sampleTime = seconds_f() - shot.start_timestamp_s;
      int idx = shot.headIndex;
      shot.time_s[idx] = sampleTime;
      shot.weight[idx] = currentWeight;
      shot.headIndex = (shot.headIndex + 1) % SHOT_DATA_CAPACITY;
      if(shot.datapoints < SHOT_DATA_CAPACITY){
        shot.datapoints++;
      }
      shot.shotTimer = sampleTime;

      //get the likely end time of the shot
      calculateEndTime(&shot);
    }

    // Send data update via WebSocket if enough time has passed
    // Also ensure at least 100ms has passed since tare completion to avoid pre-tare weight
    if(WEBSOCKET_ENABLED && (millis() - lastDataReport_ms >= DATA_REPORT_INTERVAL_MS)){
      // Check if we just tared and need to wait 100ms for post-tare weight
      if(tareCompleteTime_ms > 0 && (millis() - tareCompleteTime_ms >= 100)){
        // Tare delay complete, allow data reporting
        tareCompleteTime_ms = 0; // Clear the flag
      }
      
      // Only send if tare delay has passed (or no tare was done)
      if(tareCompleteTime_ms == 0){
        sendShotData();
        lastDataReport_ms = millis();
      }
    }
  }

  // Handle WebSocket server and mDNS updates
  if(WEBSOCKET_ENABLED && WiFi.status() == WL_CONNECTED){
    // Only call webSocket.loop() every 100ms to avoid blocking BLE
    if(millis() - lastWebSocketLoop_ms >= 100){
      lastWebSocketLoop_ms = millis();
      webSocket.loop();
    }
  } else if(WEBSOCKET_ENABLED && WiFi.status() != WL_CONNECTED){
    // Reconnect WiFi if disconnected (but throttle to avoid BLE interference)
    static unsigned long lastWiFiReconnectAttempt = 0;
    if(millis() - lastWiFiReconnectAttempt > 30000){ // Try every 30 seconds (less frequent)
      lastWiFiReconnectAttempt = millis();
      initWiFi();
      if(WiFi.status() == WL_CONNECTED){
        initMDNS();
        initWebSocket();
      }
    }
  }

  // SHOT INITIATION/STOP EVENTS --------------------------------
  // (Shot start/stop now controlled via WebSocket commands only)
  
  //Max duration reached
  else if(!TIMER_ONLY 
  && shot.brewing 
  && shot.shotTimer > MAX_SHOT_DURATION_S ){
    shot.brewing = false;
    Serial.println("Max brew duration reached");
    shot.end = ENDTYPE::TIME;
    setBrewingState(shot.brewing);

  }

  //End shot (weight-based stopping)
  // Only execute if shot is brewing and conditions are met, and we haven't already triggered recently
  if(!TIMER_ONLY 
  && shot.brewing 
  && shot.shotTimer >= shot.expected_end_s
  && shot.shotTimer >  MIN_SHOT_DURATION_S
  && (millis() - lastOptocouplerPulse_ms > 700)  // Additional debounce: prevent rapid re-triggering
  ){
    Serial.println("weight achieved");
    shot.brewing = false;
    shot.end = ENDTYPE::WEIGHT;
    
    // Toggle optocoupler to stop shot (pulse) - with debounce protection
    digitalWrite(OUT_PIN, HIGH);
    delay(250);  // Button press simulation duration
    digitalWrite(OUT_PIN, LOW);
    yield();
    lastOptocouplerPulse_ms = millis();
    
    setBrewingState(shot.brewing);

  }

  // SHOT ANALYSIS  --------------------------------

  //Detect error of shot
  if(!TIMER_ONLY
  && shot.start_timestamp_s
  && shot.end_s
  && currentWeight >= (goalWeight - weightOffset)
  && seconds_f() > shot.start_timestamp_s + shot.end_s + DRIP_DELAY_S){
    shot.start_timestamp_s = 0;
    shot.end_s = 0;

    Serial.print("I detected a final weight of ");
    Serial.print(currentWeight);
    Serial.print("g. The goal was ");
    Serial.print(goalWeight);
    Serial.print("g with a negative offset of ");
    Serial.print(weightOffset);

    if( abs(currentWeight - goalWeight + weightOffset) > MAX_OFFSET ){
      Serial.print("g. Error assumed. Offset unchanged. ");
    }
    else{
      Serial.print("g. Next time I'll create an offset of ");
      weightOffset += currentWeight - goalWeight;
      Serial.print(weightOffset);

      EEPROM.write(OFFSET_ADDR, weightOffset*10);
      EEPROM.commit();
    }
    Serial.println();
  }
}

// Helper functions for WebSocket commands
void startShot() {
  if (shot.brewing) {
    Serial.println("[WebSocket] Shot already brewing, ignoring start command");
    return;
  }
  
  Serial.println("[WebSocket] Starting shot via command");
  
  // Trigger optocoupler to start the shot (simulate button press)
  if(millis() - lastOptocouplerPulse_ms > 700) {  // Debounce: only pulse once per 700ms
    digitalWrite(OUT_PIN, HIGH);
    delay(250);  // Button press simulation duration
    digitalWrite(OUT_PIN, LOW);
    yield();
    lastOptocouplerPulse_ms = millis();
  }
  
  // Start the shot
  shot.brewing = true;
  shot.end = ENDTYPE::UNDEF;  // Reset end type
  setBrewingState(shot.brewing);
}

void stopShot() {
  if (!shot.brewing) {
    Serial.println("[WebSocket] Shot not brewing, ignoring stop command");
    return;
  }
  
  Serial.println("[WebSocket] Stopping shot via command");
  
  // Trigger optocoupler to stop the shot (simulate button press)
  if(millis() - lastOptocouplerPulse_ms > 700) {  // Debounce: only pulse once per 700ms
    digitalWrite(OUT_PIN, HIGH);
    delay(250);  // Button press simulation duration
    digitalWrite(OUT_PIN, LOW);
    yield();
    lastOptocouplerPulse_ms = millis();
  }
  
  // Stop the shot
  shot.brewing = false;
  shot.end = ENDTYPE::BUTTON;
  setBrewingState(shot.brewing);
}

void setBrewingState(bool brewing){
  if(brewing){
    Serial.println("shot started");
    shot.start_timestamp_s = seconds_f();
    shot.shotTimer = 0;
    clearShotBuffer();
    scale.tare();
    delay(50);
    yield();
    scale.tare();  // double-tare for reliability
    Serial.println("Scale tared on brew start");
    
    // Reset weight to 0 after tare to prevent pre-tare contamination
    currentWeight = 0;
    
    // Record tare completion time and delay first data report by 100ms
    // This ensures the scale has time to report the post-tare weight
    tareCompleteTime_ms = millis();
    
    // Reset data report timer so first message is sent after delay
    lastDataReport_ms = 0;
    
    // Make sure optocoupler starts off
    digitalWrite(OUT_PIN, LOW);
    Serial.println("Weight Timer End");
  }else{
    Serial.print("ShotEnded by ");
    switch (shot.end) {
      case ENDTYPE::TIME:
        Serial.println("time");
        break;
      case ENDTYPE::WEIGHT:
        Serial.println("weight");
        break;
      case ENDTYPE::BUTTON:
        Serial.println("button");
        break;
      case ENDTYPE::DISCONNECT:
        Serial.println("disconnect");
        break;
      case ENDTYPE::UNDEF:
        Serial.println("undef");
        break;
    }

    shot.end_s = seconds_f() - shot.start_timestamp_s;
  } 

  // Reset
  shot.end = ENDTYPE::UNDEF;

  // Report state change via WebSocket
  // Only send immediately when stopping a shot (brewing=false)
  // When starting (brewing=true), wait for first post-tare weight reading
  if(WEBSOCKET_ENABLED && !brewing){
    sendShotData();
  }
  // When starting a shot, data will be sent on next weight update cycle
  // which will have the correct post-tare weight (currentWeight = 0)
}

void calculateEndTime(Shot* s){
  
  // Do not predict end time if there aren't enough espresso measurements yet
  if(s->datapoints == 0){
    s->expected_end_s = MAX_SHOT_DURATION_S;
    return;
  }

  int latestIndex = (s->headIndex - 1 + SHOT_DATA_CAPACITY) % SHOT_DATA_CAPACITY;

  if( (s->datapoints < N) || (s->weight[latestIndex] < 10) ){
    s->expected_end_s = MAX_SHOT_DURATION_S;
  }
  else{
    //Get line of best fit (y=mx+b) from the last 10 measurements 
    float sumXY = 0, sumX = 0, sumY = 0, sumSquaredX = 0, m = 0, b = 0, meanX = 0, meanY = 0;

    int count = min(N, s->datapoints);
    for(int i = 0; i < count; i++){
      int idx = (s->headIndex - count + i + SHOT_DATA_CAPACITY) % SHOT_DATA_CAPACITY;
      float t = s->time_s[idx];
      float w = s->weight[idx];
      sumXY += t * w;
      sumX  += t;
      sumY  += w;
      sumSquaredX += (t * t);
    }

    m = (count*sumXY-sumX*sumY) / (count*sumSquaredX-(sumX*sumX));
    meanX = sumX/count;
    meanY = sumY/count;
    b = meanY-m*meanX;

    //Calculate time at which goal weight will be reached (x = (y-b)/m)
    // if M is negative (which can happen during a blooming shot when the flow stops) assume max duration
    s->expected_end_s = (m < 0) ? MAX_SHOT_DURATION_S : (goalWeight - weightOffset - b)/m;
  }
}

float seconds_f(){
  return millis()/1000.0;
}

// WebSocket server event handler
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("[WebSocket] Client #%u disconnected\n", num);
      break;
    case WStype_CONNECTED:
      {
        IPAddress ip = webSocket.remoteIP(num);
        Serial.printf("[WebSocket] Client #%u connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
        // Send initial data to newly connected client
        sendShotData();
      }
      break;
    case WStype_TEXT:
      {
        Serial.printf("[WebSocket] Received from client #%u: %s\n", num, payload);
        
        // Parse JSON command
        StaticJsonDocument<256> doc;
        DeserializationError error = deserializeJson(doc, payload, length);
        
        if (error) {
          Serial.printf("[WebSocket] JSON parse error: %s\n", error.c_str());
          break;
        }
        
        // Handle setGoalWeight command
        if (doc.containsKey("command") && strcmp(doc["command"], "setGoalWeight") == 0) {
          if (doc.containsKey("goalWeight")) {
            uint8_t newGoalWeight = doc["goalWeight"];
            
            // Validate range (10-200g)
            if (newGoalWeight >= 10 && newGoalWeight <= 200) {
              goalWeight = newGoalWeight;
              
              // Save to EEPROM
              EEPROM.write(WEIGHT_ADDR, goalWeight);
              EEPROM.commit();
              
              // Update BLE characteristic
              weightCharacteristic.writeValue(goalWeight);
              
              Serial.printf("[WebSocket] Goal weight updated to %u g\n", goalWeight);
              
              // Send confirmation back to client
              StaticJsonDocument<128> response;
              response["command"] = "setGoalWeight";
              response["success"] = true;
              response["goalWeight"] = goalWeight;
              
              String responseStr;
              serializeJson(response, responseStr);
              webSocket.sendTXT(num, responseStr);
            } else {
              Serial.printf("[WebSocket] Invalid goal weight: %u (must be 10-200g)\n", newGoalWeight);
              
              // Send error response
              StaticJsonDocument<128> response;
              response["command"] = "setGoalWeight";
              response["success"] = false;
              response["error"] = "Goal weight must be between 10 and 200g";
              
              String responseStr;
              serializeJson(response, responseStr);
              webSocket.sendTXT(num, responseStr);
            }
          }
        }
        // Handle startShot command
        else if (doc.containsKey("command") && strcmp(doc["command"], "startShot") == 0) {
          startShot();
          
          // Send confirmation back to client
          StaticJsonDocument<128> response;
          response["command"] = "startShot";
          response["success"] = true;
          response["brewing"] = shot.brewing;
          
          String responseStr;
          serializeJson(response, responseStr);
          webSocket.sendTXT(num, responseStr);
        }
        // Handle stopShot command
        else if (doc.containsKey("command") && strcmp(doc["command"], "stopShot") == 0) {
          stopShot();
          
          // Send confirmation back to client
          StaticJsonDocument<128> response;
          response["command"] = "stopShot";
          response["success"] = true;
          response["brewing"] = shot.brewing;
          
          String responseStr;
          serializeJson(response, responseStr);
          webSocket.sendTXT(num, responseStr);
        }
      }
      break;
    case WStype_ERROR:
      Serial.printf("[WebSocket] Error from client #%u\n", num);
      break;
    default:
      break;
  }
}

// Initialize WiFi connection
void initWiFi() {
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
    Serial.println("");
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("");
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

// Send shot data via WebSocket (broadcast to all connected clients)
// Now includes pressure data
void sendShotData() {
  if (!WEBSOCKET_ENABLED) {
    return;
  }

  // Check if any clients are connected
  if (webSocket.connectedClients() == 0) {
    return; // No clients connected, don't waste time creating JSON
  }

  // Create JSON document (increased size to accommodate pressure data)
  StaticJsonDocument<768> doc;
  
  // Add current weight
  if (currentWeight != 0) {
    doc["currentWeight"] = currentWeight;
  }
  
  // Add shot timer
  if (shot.brewing || shot.shotTimer > 0) {
    doc["shotTimer"] = shot.shotTimer;
  }
  
  // Add brewing state
  doc["brewing"] = shot.brewing;
  
  // Add goal weight
  doc["goalWeight"] = goalWeight;
  
  // Add weight offset
  doc["weightOffset"] = weightOffset;
  
  // Add expected end time
  if (shot.brewing && shot.expected_end_s > 0) {
    doc["expectedEndTime"] = shot.expected_end_s;
  }
  
  // Add end type
  if (shot.end != ENDTYPE::UNDEF) {
    const char* endTypes[] = {"BUTTON", "WEIGHT", "TIME", "DISCONNECT", "UNDEF"};
    doc["endType"] = endTypes[shot.end];
  }
  
  // Add datapoints
  doc["datapoints"] = shot.datapoints;
  
  // Add pressure data
  doc["currentPressure"] = currentPressureBar;
  doc["pressureBar"] = currentPressureBar;
  doc["pressurePSI"] = currentPressurePSI;
  doc["pressureMPA"] = currentPressureMPA;
  
  // Add detailed pressure sensor data
  doc["adcValue"] = currentAdcValue;
  doc["adcVoltage"] = currentAdcVoltage;
  doc["sensorVoltage"] = currentSensorVoltage;
  
  // Create formatted serial log string (using filtered values)
  char logString[256];
  snprintf(logString, sizeof(logString), 
    "ADC: %d | ADC Voltage: %.3fV | Sensor Voltage: %.3fV | Pressure: %.3f MPa (%.2f bar, %.1f PSI) [filtered]",
    currentAdcValue, currentAdcVoltage, currentSensorVoltage, currentPressureMPA, currentPressureBar, currentPressurePSI);
  doc["serialLog"] = logString;
  
  // Add timestamp (millis since boot in seconds)
  doc["timestamp"] = millis() / 1000.0;

  // Serialize to string
  String jsonString;
  serializeJson(doc, jsonString);
  
  // Broadcast to all connected WebSocket clients
  webSocket.broadcastTXT(jsonString);
}

