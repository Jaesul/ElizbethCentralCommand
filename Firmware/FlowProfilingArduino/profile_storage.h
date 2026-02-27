/**
 * Persistent profile storage (NVS).
 * Uses ESP32 Preferences; one JSON blob per slot plus version and active index.
 */
#ifndef PROFILE_STORAGE_H
#define PROFILE_STORAGE_H

#include <stdint.h>
#include <stddef.h>

#define MAX_PROFILES 5
#define PROFILE_NAME_LENGTH 25
#define PROFILES_SCHEMA_VERSION 1
#define PROFILE_JSON_MAX_SIZE 1536

#define PROFILES_NVS_NAMESPACE "profiles"
#define PROFILES_NVS_KEY_VER "ver"
#define PROFILES_NVS_KEY_ACTIVE "active"

/**
 * Initialize profile storage. Load from NVS or write defaults if missing/wrong version.
 * Does not apply the active profile to runtime; caller should use profilesStorageGetActiveIndex()
 * and profilesStorageGetSlotJson() then parse and create PhaseProfiler.
 */
void profilesStorageInit(void);

/**
 * Get the current active profile index (0 .. MAX_PROFILES-1).
 */
uint8_t profilesStorageGetActiveIndex(void);

/**
 * Read profile JSON for a slot into the provided buffer.
 * Returns true if the slot contains valid JSON (buffer null-terminated); false if empty/invalid.
 * Buffer must be at least PROFILE_JSON_MAX_SIZE bytes.
 */
bool profilesStorageGetSlotJson(uint8_t index, char* buf, size_t bufSize);

/**
 * Write a profile JSON string to a slot and persist to NVS.
 * Returns true on success.
 */
bool profilesStorageWriteSlot(uint8_t index, const char* json);

/**
 * Set the active profile index and persist to NVS.
 * Does not load the profile into runtime; caller must apply if needed.
 */
void profilesStorageSetActive(uint8_t index);

/**
 * Write current in-memory state (ver, active, all slots) to NVS.
 * Used after writing defaults so next boot sees valid data.
 */
void profilesStorageWrite(void);

#endif
