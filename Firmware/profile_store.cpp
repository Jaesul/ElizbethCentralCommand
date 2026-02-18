/*
  profile_store.cpp

  Implementation notes:
  - Uses ESP32 Preferences (NVS) for wear-leveling + atomic key updates.
  - Each slot is stored as a single blob: Header + nameBytes + jsonBytes.
  - Header includes schema version and CRC32 of JSON payload.
*/

#include "profile_store.h"

#include <Preferences.h>
#include <ArduinoJson.h>

#include <vector>

// Provided by FlowProfilingArduino.ino (compiled-in fallback profile).
extern const char* compiledDefaultProfileJson();
extern const char* compiledDefaultProfileName();

namespace {
  static constexpr const char* kPrefsNamespace = "flowprof";
  static constexpr const char* kKeySeeded = "seeded";
  static constexpr const char* kKeyActive = "active";

  static constexpr uint32_t kMagicPFJS = 0x534A4650u; // 'P''F''J''S' little-endian in memory
  static constexpr uint16_t kSchemaVersion = 1;

  Preferences prefs;
  bool prefsBegun = false;

  struct __attribute__((packed)) SlotHeader {
    uint32_t magic;
    uint16_t schemaVersion;
    uint8_t slotIndex;
    uint8_t reserved0;
    uint16_t nameLen;
    uint16_t jsonLen;
    uint32_t crc32Json;
  };

  static bool isValidSlot(uint8_t slot) {
    return slot < PROFILE_STORE_SLOT_COUNT;
  }

  static void makeSlotKey(uint8_t slot, char out[12]) {
    // "slot0" .. "slot9"
    snprintf(out, 12, "slot%u", (unsigned)slot);
  }

  // Simple CRC32 (IEEE 802.3 polynomial) - tableless.
  static uint32_t crc32_update(uint32_t crc, const uint8_t* data, size_t len) {
    crc = ~crc;
    for (size_t i = 0; i < len; i++) {
      crc ^= data[i];
      for (int b = 0; b < 8; b++) {
        const uint32_t mask = (uint32_t)-(int)(crc & 1u);
        crc = (crc >> 1) ^ (0xEDB88320u & mask);
      }
    }
    return ~crc;
  }

  static bool validateProfileJson(const String& json) {
    // Basic semantic validation: JSON parses and contains phases array.
    // Keep capacity conservative; callers cap json length.
    DynamicJsonDocument doc(8192);
    DeserializationError err = deserializeJson(doc, json);
    if (err) return false;
    if (!doc.containsKey("phases")) return false;
    JsonArray phases = doc["phases"].as<JsonArray>();
    return !phases.isNull() && phases.size() > 0;
  }

  static bool readSlotBlob(uint8_t slot, std::vector<uint8_t>& out) {
    if (!prefsBegun) return false;
    if (!isValidSlot(slot)) return false;

    char key[12];
    makeSlotKey(slot, key);
    const size_t n = prefs.getBytesLength(key);
    if (n == 0) return false;
    out.resize(n);
    const size_t got = prefs.getBytes(key, out.data(), out.size());
    return got == out.size();
  }

  static bool parseSlotBlob(
    uint8_t expectedSlot,
    const std::vector<uint8_t>& blob,
    String& outName,
    String& outJson
  ) {
    if (blob.size() < sizeof(SlotHeader)) return false;

    SlotHeader hdr{};
    memcpy(&hdr, blob.data(), sizeof(SlotHeader));

    if (hdr.magic != kMagicPFJS) return false;
    if (hdr.schemaVersion != kSchemaVersion) return false;
    if (hdr.slotIndex != expectedSlot) return false;

    if (hdr.nameLen > PROFILE_STORE_MAX_NAME_BYTES) return false;
    if (hdr.jsonLen == 0 || hdr.jsonLen > PROFILE_STORE_MAX_JSON_BYTES) return false;

    const size_t expectedLen = sizeof(SlotHeader) + (size_t)hdr.nameLen + (size_t)hdr.jsonLen;
    if (blob.size() != expectedLen) return false;

    const uint8_t* p = blob.data() + sizeof(SlotHeader);
    outName = String((const char*)p, hdr.nameLen);
    p += hdr.nameLen;
    outJson = String((const char*)p, hdr.jsonLen);

    const uint32_t crc = crc32_update(0u, (const uint8_t*)outJson.c_str(), (size_t)hdr.jsonLen);
    if (crc != hdr.crc32Json) return false;

    return true;
  }
}

bool profileStoreBegin() {
  if (prefsBegun) return true;
  prefsBegun = prefs.begin(kPrefsNamespace, false /* readwrite */);
  return prefsBegun;
}

uint8_t profileStoreGetActiveSlot(uint8_t fallback) {
  if (!prefsBegun) return fallback;
  const uint8_t v = prefs.getUChar(kKeyActive, fallback);
  return isValidSlot(v) ? v : fallback;
}

bool profileStoreSetActiveSlot(uint8_t slot) {
  if (!prefsBegun) return false;
  if (!isValidSlot(slot)) return false;
  return prefs.putUChar(kKeyActive, slot) == sizeof(uint8_t);
}

bool profileStoreLoadSlot(uint8_t slot, String& outName, String& outJson) {
  outName = "";
  outJson = "";
  std::vector<uint8_t> blob;
  if (!readSlotBlob(slot, blob)) return false;
  return parseSlotBlob(slot, blob, outName, outJson);
}

bool profileStoreSaveSlot(uint8_t slot, const String& name, const String& json) {
  if (!prefsBegun) return false;
  if (!isValidSlot(slot)) return false;

  const size_t nameLen = name.length();
  const size_t jsonLen = json.length();
  if (nameLen == 0 || nameLen > PROFILE_STORE_MAX_NAME_BYTES) return false;
  if (jsonLen == 0 || jsonLen > PROFILE_STORE_MAX_JSON_BYTES) return false;

  // Validate JSON shape before persisting.
  if (!validateProfileJson(json)) return false;

  SlotHeader hdr{};
  hdr.magic = kMagicPFJS;
  hdr.schemaVersion = kSchemaVersion;
  hdr.slotIndex = slot;
  hdr.nameLen = (uint16_t)nameLen;
  hdr.jsonLen = (uint16_t)jsonLen;
  hdr.crc32Json = crc32_update(0u, (const uint8_t*)json.c_str(), jsonLen);

  const size_t totalLen = sizeof(SlotHeader) + nameLen + jsonLen;
  std::vector<uint8_t> blob;
  blob.resize(totalLen);

  uint8_t* p = blob.data();
  memcpy(p, &hdr, sizeof(SlotHeader));
  p += sizeof(SlotHeader);
  memcpy(p, name.c_str(), nameLen);
  p += nameLen;
  memcpy(p, json.c_str(), jsonLen);

  char key[12];
  makeSlotKey(slot, key);
  const size_t written = prefs.putBytes(key, blob.data(), blob.size());
  return written == blob.size();
}

bool profileStoreSlotIsValid(uint8_t slot) {
  String name;
  String json;
  if (!profileStoreLoadSlot(slot, name, json)) return false;
  return validateProfileJson(json);
}

bool profileStoreEnsureSeededDefaults() {
  if (!prefsBegun) return false;
  const bool seeded = prefs.getBool(kKeySeeded, false);
  if (seeded) return true;

  const char* defJson = compiledDefaultProfileJson();
  const char* defName = compiledDefaultProfileName();
  if (!defJson || !defName) return false;

  const bool ok = profileStoreSaveSlot(0, String(defName), String(defJson));
  if (!ok) return false;

  (void)profileStoreSetActiveSlot(0);
  prefs.putBool(kKeySeeded, true);
  return true;
}

