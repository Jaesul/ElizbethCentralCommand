/*
  shotStopper.ino - Full featured brewing by weight with predictive shot stopping
  
  Features:
  - Connects to Acaia scale via BLE
  - Shows current weight on OLED display
  - Predictive shot stopping using linear regression
  - Button on pin 13 triggers shot start/stop
  - Auto-tare on shot start
  - Weight offset auto-correction
  - Goal weight adjustable via BLE characteristic
  - EEPROM stores goal weight and offset persistently
  
  Based on the original shotStopper by Tate Mazer, 2023.
  Adapted for ESP32-S3 with optimized memory usage.
*/

#include <AcaiaArduinoBLE.h>
#include <EEPROM.h>
#include <cstring>

#define BUTTON_PIN 4
#define OUT_PIN 19  // Output pin for 12V optocoupler

#define MAX_OFFSET 5                // In case an error in brewing occurred
#define MIN_SHOT_DURATION_S 3       // Useful for flushing the group
#define MAX_SHOT_DURATION_S 50      // Maximum shot duration to prevent runaway shots
#define BUTTON_READ_PERIOD_MS 5
#define DRIP_DELAY_S 3              // Time after shot ended to measure final weight

#define EEPROM_SIZE 2
#define WEIGHT_ADDR 0
#define OFFSET_ADDR 1

#define N 10                        // Number of datapoints used to calculate trend line
#define SHOT_DATA_CAPACITY 100
#define BUTTON_STATE_ARRAY_LENGTH 31

#define DEBUG false

// User defined settings
#define AUTOTARE true               // Automatically tare when shot is started
#define TIMER_ONLY false            // Disables brew by weight, only automates timer/tare

typedef enum {BUTTON, WEIGHT, TIME, DISCONNECT, UNDEF} ENDTYPE;

AcaiaArduinoBLE scale(DEBUG);

// BLE peripheral device
BLEService weightService("0x0FFE");
BLEByteCharacteristic weightCharacteristic("0xFF11", BLEWrite | BLERead);

// Global variables
float currentWeight = 0;
uint8_t goalWeight = 0;
float weightOffset = 0;
int buttonArr[BUTTON_STATE_ARRAY_LENGTH];
bool buttonPressed = false;
unsigned long lastButtonRead_ms = 0;
int newButtonState = 0;
bool buttonStopTriggered = false;  // Flag to prevent start after manual stop
unsigned long lastOptocouplerPulse_ms = 0;
unsigned long lastHeapCheck_ms = 0;

// Shot struct for tracking brewing trajectory (50 data points for memory optimization)

struct Shot {
  float start_timestamp_s;
  float shotTimer;
  float end_s;
  float expected_end_s;
  float weight[SHOT_DATA_CAPACITY];     // Full array size - ESP32-S3 has enough RAM
  float time_s[SHOT_DATA_CAPACITY];     // Full array size
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

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("ShotStopper Starting");

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

  pinMode(BUTTON_PIN, INPUT_PULLDOWN);
  pinMode(OUT_PIN, OUTPUT);
  digitalWrite(OUT_PIN, LOW);  // Start with optocoupler off

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

  }

  // Read button every period with debouncing
  if(millis() > (lastButtonRead_ms + BUTTON_READ_PERIOD_MS) ){
    lastButtonRead_ms = millis();

    //push back for new entry
    for(int i = BUTTON_STATE_ARRAY_LENGTH - 2;i>=0;i--){
      buttonArr[i+1] = buttonArr[i];
    }
    buttonArr[0] = digitalRead(BUTTON_PIN);

    //only return 1 if contains 1
    newButtonState = 0;
    for(int i=0; i<BUTTON_STATE_ARRAY_LENGTH; i++){
      if(buttonArr[i]){
        newButtonState = 1;          
      }
    }
  }

  // SHOT INITIATION/STOP EVENTS --------------------------------
  
  //button press and release - start shot if not brewing OR stop if brewing
  if(newButtonState && buttonPressed == false){
    // If already brewing, stop it immediately on press
    if(shot.brewing){
      Serial.println("Button press detected - stopping shot");
      // Trigger optocoupler to stop the shot
      if(millis() - lastOptocouplerPulse_ms > 700) {  // Debounce: only pulse once per 700ms
        digitalWrite(OUT_PIN, HIGH);
        delay(250);  // Button press simulation duration
        digitalWrite(OUT_PIN, LOW);
        yield();
        lastOptocouplerPulse_ms = millis();
      }
      
      shot.brewing = false;
      shot.end = ENDTYPE::BUTTON;
      setBrewingState(shot.brewing);
      
      // Set flag to ignore the upcoming button release AND mark button as pressed
      buttonStopTriggered = true;
      buttonPressed = true;  // Must set this to prevent re-entering this block

    }
    else if(!buttonStopTriggered){
      Serial.println("Button press detected - preparing to start shot");
      // Trigger optocoupler for normal button press (to start shot)
      if(millis() - lastOptocouplerPulse_ms > 700) {  // Debounce: only pulse once per 700ms
        digitalWrite(OUT_PIN, HIGH);
        delay(250);  // Button press simulation duration
        digitalWrite(OUT_PIN, LOW);
        yield();
        lastOptocouplerPulse_ms = millis();
      }
      buttonPressed = true;
    }
  }
  
  // Button released after being pressed - start new shot if not brewing
  else if(!newButtonState && buttonPressed == true && !shot.brewing && !buttonStopTriggered){
    Serial.println("Button release detected - starting shot");
    buttonPressed = false;
    shot.brewing = true;
    setBrewingState(shot.brewing);

  }
  
  // Button released - just update button state
  else if(!newButtonState && buttonPressed == true){
    Serial.println("Button released (no action)");
    buttonPressed = false;
    buttonStopTriggered = false;  // Clear flag
  }
  
  // Handle release when buttonStopTriggered is set
  else if(!newButtonState && buttonStopTriggered){
    buttonStopTriggered = false;  // Clear the flag
  }
  
  // Debug: catch any button states we're missing
  // else if(newButtonState){
  //   Serial.print("DEBUG: newButtonState=1, buttonPressed=");
  //   Serial.print(buttonPressed);
  //   Serial.print(", brewing=");
  //   Serial.println(shot.brewing);
  // }
    
  //Max duration reached
  else if(!TIMER_ONLY 
  && shot.brewing 
  && shot.shotTimer > MAX_SHOT_DURATION_S ){
    shot.brewing = false;
    Serial.println("Max brew duration reached");
    shot.end = ENDTYPE::TIME;
    setBrewingState(shot.brewing);

  }

  //End shot
  if(!TIMER_ONLY 
  && shot.brewing 
  && shot.shotTimer >= shot.expected_end_s
  && shot.shotTimer >  MIN_SHOT_DURATION_S
  ){
    Serial.println("weight achieved");
    shot.brewing = false;
    shot.end = ENDTYPE::WEIGHT;
    setBrewingState(shot.brewing);
    
    // Toggle optocoupler to stop shot (pulse)
    digitalWrite(OUT_PIN, HIGH);
    delay(250);  // Button press simulation duration
    digitalWrite(OUT_PIN, LOW);
    yield();

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