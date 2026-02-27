/**
 * Profile storage implementation using ESP32 Preferences (NVS).
 * Valid profile index is 0 .. MAX_PROFILES-1; requests for index >= MAX_PROFILES are rejected.
 */
#include "profile_storage.h"
#include <Preferences.h>
#include <Arduino.h>

// NVS slot keys are "0".."9"; if MAX_PROFILES > 10 the key format must change
static_assert(MAX_PROFILES <= 10, "slot keys are single-digit; update key format if MAX_PROFILES > 10");

static uint8_t s_activeIndex = 0;

// Slot 0: Blooming (pre-infusion hold, ramp to 9 bar, taper)
static const char DEFAULT_SLOT0_JSON[] = R"json({"name":"Blooming","phases":[{"type":"PRESSURE","target":{"start":-1,"end":3.0,"curve":"INSTANT","time":10000},"restriction":6.0,"stopConditions":{"time":10000}},{"type":"PRESSURE","target":{"start":3.0,"end":9.0,"curve":"LINEAR","time":6000},"restriction":9.0,"stopConditions":{"time":6000}},{"type":"PRESSURE","target":{"start":9.0,"end":6.0,"curve":"EASE_OUT","time":12000},"restriction":9.0,"stopConditions":{"weight":50.0}}],"globalStopConditions":{"weight":40.0}})json";

// Slot 1: Conventional – classic 9 bar, minimal pre-infusion, ~25–30 s
static const char DEFAULT_SLOT1_JSON[] = R"json({"name":"Conventional","phases":[{"type":"PRESSURE","target":{"start":-1,"end":2.0,"curve":"INSTANT","time":3000},"restriction":4.0,"stopConditions":{"time":3000}},{"type":"PRESSURE","target":{"start":2.0,"end":9.0,"curve":"LINEAR","time":4000},"restriction":9.0,"stopConditions":{"time":25000}},{"type":"PRESSURE","target":{"start":9.0,"end":6.0,"curve":"EASE_OUT","time":5000},"restriction":9.0,"stopConditions":{"weight":45.0}}],"globalStopConditions":{"weight":38.0}})json";

// Slot 2: Turbo – ~6 bar, coarser grind, shorter extraction (turbo shot style)
static const char DEFAULT_SLOT2_JSON[] = R"json({"name":"Turbo","phases":[{"type":"PRESSURE","target":{"start":0,"end":6.0,"curve":"LINEAR","time":3000},"restriction":6.0,"stopConditions":{"time":20000}},{"type":"PRESSURE","target":{"start":6.0,"end":4.0,"curve":"EASE_OUT","time":5000},"restriction":6.0,"stopConditions":{"weight":55.0}}],"globalStopConditions":{"weight":50.0}})json";

// Slot 3: Allongé – long pull, lower pressure, higher yield
static const char DEFAULT_SLOT3_JSON[] = R"json({"name":"Allonge","phases":[{"type":"PRESSURE","target":{"start":-1,"end":2.0,"curve":"INSTANT","time":8000},"restriction":4.0,"stopConditions":{"time":8000}},{"type":"PRESSURE","target":{"start":2.0,"end":6.0,"curve":"LINEAR","time":5000},"restriction":7.0,"stopConditions":{"time":25000}},{"type":"PRESSURE","target":{"start":6.0,"end":4.0,"curve":"EASE_OUT","time":15000},"restriction":6.0,"stopConditions":{"weight":100.0}}],"globalStopConditions":{"weight":90.0}})json";

// Slot 4: Classic Italian – ramp to 9 bar, hold, then decline (lever-style)
static const char DEFAULT_SLOT4_JSON[] = R"json({"name":"Classic Italian","phases":[{"type":"PRESSURE","target":{"start":0,"end":9.0,"curve":"LINEAR","time":5000},"restriction":9.0,"stopConditions":{"time":15000}},{"type":"PRESSURE","target":{"start":9.0,"end":5.0,"curve":"EASE_OUT","time":8000},"restriction":9.0,"stopConditions":{"weight":42.0}}],"globalStopConditions":{"weight":40.0}})json";

static const char* const DEFAULT_SLOT_JSONS[] = {
  DEFAULT_SLOT0_JSON,
  DEFAULT_SLOT1_JSON,
  DEFAULT_SLOT2_JSON,
  DEFAULT_SLOT3_JSON,
  DEFAULT_SLOT4_JSON,
};
static constexpr uint8_t NUM_DEFAULT_SLOTS = sizeof(DEFAULT_SLOT_JSONS) / sizeof(DEFAULT_SLOT_JSONS[0]);

static void writeDefaultsToNVS(Preferences& prefs) {
  prefs.putUChar(PROFILES_NVS_KEY_VER, PROFILES_SCHEMA_VERSION);
  prefs.putUChar(PROFILES_NVS_KEY_ACTIVE, 0);
  s_activeIndex = 0;

  for (uint8_t i = 0; i < MAX_PROFILES; i++) {
    char key[2] = { (char)('0' + i), '\0' };
    if (i < NUM_DEFAULT_SLOTS) {
      prefs.putString(key, String(DEFAULT_SLOT_JSONS[i]));
    }
    // Slots 5..9 left unwritten (empty) so user can fill them later
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
