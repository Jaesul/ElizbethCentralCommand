/* Ported/adapted from gaggiuino/lib/Common/sensors_state.h */
#ifndef FLOW_PROFILING_SENSORS_STATE_H
#define FLOW_PROFILING_SENSORS_STATE_H

struct SensorState {
  bool brewSwitchState = false;
  bool steamSwitchState = false;
  bool hotWaterSwitchState = false;
  bool isSteamForgottenON = false;
  bool scalesPresent = false;
  bool tarePending = false;

  float temperature = 0.f;      // unused here
  float waterTemperature = 0.f; // unused here

  float pressure = 0.f;            // bar
  float pressureChangeSpeed = 0.f; // bar/s

  float pumpFlow = 0.f;            // ml/s (modeled)
  float pumpFlowChangeSpeed = 0.f; // ml/s^2 (unused)
  float waterPumped = 0.f;         // ml

  float weightFlow = 0.f; // g/s
  float weight = 0.f;     // g
  float shotWeight = 0.f; // g

  float smoothedPressure = 0.f;
  float smoothedPumpFlow = 0.f;
  float smoothedWeightFlow = 0.f;

  float consideredFlow = 0.f; // unused
  long pumpClicks = 0;

  uint16_t waterLvl = 0; // unused
  bool tofReady = false; // unused
};

struct SensorStateSnapshot {
  bool brewActive = false;
  bool steamActive = false;
  bool scalesPresent = false;
  float temperature = 0.f;
  float pressure = 0.f;
  float pumpFlow = 0.f;
  float weightFlow = 0.f;
  float weight = 0.f;
  uint16_t waterLvl = 0;
};

#endif


