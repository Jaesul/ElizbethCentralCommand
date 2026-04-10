import { normalizeProfileForGraph } from "~/lib/profileUtils";
import type { DeviceProfilesPayload } from "~/hooks/useFlowProfilingWebSocket";
import type { PhaseProfile } from "~/types/profiles";

export function getDeviceProfileSlotIndex(profileId: string) {
  const match = /^device-slot-(\d+)$/.exec(profileId);
  const slotValue = match?.[1];
  if (!slotValue) return null;
  return Number.parseInt(slotValue, 10);
}

export function getDeviceProfilesAsPhaseProfiles(
  deviceProfiles: DeviceProfilesPayload | null | undefined,
) {
  if (!deviceProfiles?.slots?.length) return [] as PhaseProfile[];

  const result: PhaseProfile[] = [];
  for (const slot of deviceProfiles.slots) {
    if (!slot.profile?.trim()) continue;
    try {
      const raw = JSON.parse(
        slot.profile,
      ) as Parameters<typeof normalizeProfileForGraph>[0];
      if (!raw?.phases?.length) continue;
      result.push(
        normalizeProfileForGraph({
          ...raw,
          id: `device-slot-${slot.index}`,
          name: slot.name ?? raw.name ?? `Slot ${slot.index}`,
        }),
      );
    } catch {
      // Ignore malformed device profile payloads.
    }
  }

  return result;
}

export function getDeviceProfileById(
  deviceProfiles: DeviceProfilesPayload | null | undefined,
  profileId: string,
) {
  const slotIndex = getDeviceProfileSlotIndex(profileId);
  if (slotIndex == null || !deviceProfiles?.slots?.length) return null;

  const slot = deviceProfiles.slots.find((entry) => entry.index === slotIndex);
  if (!slot?.profile?.trim()) return null;

  try {
    const raw = JSON.parse(
      slot.profile,
    ) as Parameters<typeof normalizeProfileForGraph>[0];
    if (!raw?.phases?.length) return null;

    return normalizeProfileForGraph({
      ...raw,
      id: `device-slot-${slot.index}`,
      name: slot.name ?? raw.name ?? `Slot ${slot.index}`,
    });
  } catch {
    return null;
  }
}
