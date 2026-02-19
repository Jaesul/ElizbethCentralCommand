/**
 * Profile storage implementation using ESP32 Preferences (NVS).
 */
#include "profile_storage.h"
#include <Preferences.h>
#include <Arduino.h>

static uint8_t s_activeIndex = 0;

static const char DEFAULT_SLOT0_JSON[] = R"json({"name":"Blooming","phases":[{"type":"PRESSURE","target":{"start":-1,"end":3.0,"curve":"INSTANT","time":0},"restriction":6.0,"stopConditions":{"time":10000}},{"type":"PRESSURE","target":{"start":-1,"end":9.0,"curve":"LINEAR","time":6000},"restriction":9.0,"stopConditions":{"time":6000}},{"type":"PRESSURE","target":{"start":-1,"end":6.0,"curve":"EASE_OUT","time":12000},"restriction":9.0,"stopConditions":{"weight":50.0}}],"globalStopConditions":{"weight":40.0}})json";

static void writeDefaultsToNVS(Preferences& prefs) {
  prefs.putUChar(PROFILES_NVS_KEY_VER, PROFILES_SCHEMA_VERSION);
  prefs.putUChar(PROFILES_NVS_KEY_ACTIVE, 0);
  s_activeIndex = 0;

  prefs.putString("0", String(DEFAULT_SLOT0_JSON));
  for (uint8_t i = 1; i < MAX_PROFILES; i++) {
    char key[2] = { (char)('0' + i), '\0' };
    prefs.putString(key, "");
  }
}

void profilesStorageInit(void) {
  Preferences prefs;
  if (!prefs.begin(PROFILES_NVS_NAMESPACE, false)) {
    return;
  }

  uint8_t ver = prefs.getUChar(PROFILES_NVS_KEY_VER, 0);
  if (ver != PROFILES_SCHEMA_VERSION) {
    writeDefaultsToNVS(prefs);
    prefs.end();
    return;
  }

  s_activeIndex = prefs.getUChar(PROFILES_NVS_KEY_ACTIVE, 0);
  if (s_activeIndex >= MAX_PROFILES) {
    s_activeIndex = 0;
    prefs.putUChar(PROFILES_NVS_KEY_ACTIVE, 0);
  }

  prefs.end();
}

uint8_t profilesStorageGetActiveIndex(void) {
  return s_activeIndex;
}

bool profilesStorageGetSlotJson(uint8_t index, char* buf, size_t bufSize) {
  if (index >= MAX_PROFILES || buf == nullptr || bufSize == 0) {
    return false;
  }

  Preferences prefs;
  if (!prefs.begin(PROFILES_NVS_NAMESPACE, true)) {
    return false;
  }

  char key[2] = { (char)('0' + index), '\0' };
  String val = prefs.getString(key, "");
  prefs.end();

  if (val.length() == 0) {
    return false;
  }

  size_t len = (size_t)val.length();
  if (len >= bufSize) {
    len = bufSize - 1;
  }
  memcpy(buf, val.c_str(), len);
  buf[len] = '\0';
  return true;
}

bool profilesStorageWriteSlot(uint8_t index, const char* json) {
  if (index >= MAX_PROFILES || json == nullptr) {
    return false;
  }

  size_t len = strlen(json);
  if (len >= PROFILE_JSON_MAX_SIZE) {
    return false;
  }

  Preferences prefs;
  if (!prefs.begin(PROFILES_NVS_NAMESPACE, false)) {
    return false;
  }

  char key[2] = { (char)('0' + index), '\0' };
  prefs.putString(key, json);
  prefs.end();
  return true;
}

void profilesStorageSetActive(uint8_t index) {
  if (index >= MAX_PROFILES) {
    return;
  }
  s_activeIndex = index;

  Preferences prefs;
  if (prefs.begin(PROFILES_NVS_NAMESPACE, false)) {
    prefs.putUChar(PROFILES_NVS_KEY_ACTIVE, index);
    prefs.end();
  }
}

void profilesStorageWrite(void) {
  Preferences prefs;
  if (!prefs.begin(PROFILES_NVS_NAMESPACE, false)) {
    return;
  }
  writeDefaultsToNVS(prefs);
  prefs.end();
}
