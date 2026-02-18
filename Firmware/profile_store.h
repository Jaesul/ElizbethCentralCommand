/* 
  profile_store.h

  Persistent profile storage for FlowProfilingArduino (ESP32).
  Stores phase-based profile JSON blobs (and display names) in ESP32 NVS using Preferences.

  Design goals:
  - Multiple slots (0..9)
  - Versioned record format
  - CRC32 integrity over JSON payload
  - Basic JSON validation (must contain phases[])
*/

#ifndef FLOW_PROFILING_PROFILE_STORE_H
#define FLOW_PROFILING_PROFILE_STORE_H

#include <Arduino.h>

static constexpr uint8_t PROFILE_STORE_SLOT_COUNT = 10;
static constexpr size_t PROFILE_STORE_MAX_NAME_BYTES = 48;
static constexpr size_t PROFILE_STORE_MAX_JSON_BYTES = 8192;

bool profileStoreBegin();

bool profileStoreLoadSlot(uint8_t slot, String& outName, String& outJson);
bool profileStoreSaveSlot(uint8_t slot, const String& name, const String& json);
bool profileStoreSlotIsValid(uint8_t slot);

uint8_t profileStoreGetActiveSlot(uint8_t fallback = 0);
bool profileStoreSetActiveSlot(uint8_t slot);

// Seeds slot 0 from the compiled-in default JSON once.
bool profileStoreEnsureSeededDefaults();

#endif

