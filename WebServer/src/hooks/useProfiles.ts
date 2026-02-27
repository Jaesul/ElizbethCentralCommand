import { useState, useEffect, useCallback } from "react";
import type { PhaseProfile } from "~/types/profiles";
import { defaultPhaseProfiles } from "~/types/profiles";
import { pressureProfileToPhaseProfile } from "~/lib/profileUtils";

const STORAGE_KEY = "shotstopper-profiles";
const SELECTED_KEY = "shotstopper-selected-profile";

function isPhaseProfile(p: unknown): p is PhaseProfile {
  return (
    typeof p === "object" &&
    p !== null &&
    "phases" in p &&
    Array.isArray((p as PhaseProfile).phases)
  );
}

function migrateLegacy(parsed: unknown): PhaseProfile[] {
  if (Array.isArray(parsed) && parsed.length > 0) {
    const first = parsed[0];
    if (first && typeof first === "object" && "preInfusion" in first) {
      return parsed.map((p) => pressureProfileToPhaseProfile(p as Parameters<typeof pressureProfileToPhaseProfile>[0]));
    }
    if (first && isPhaseProfile(first)) {
      return parsed as PhaseProfile[];
    }
  }
  return defaultPhaseProfiles;
}

export function useProfiles() {
  const [profiles, setProfiles] = useState<PhaseProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load profiles from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let list: PhaseProfile[];
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        const isLegacy = Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "object" && parsed[0] !== null && "preInfusion" in parsed[0];
        list = Array.isArray(parsed)
          ? parsed.every((p) => isPhaseProfile(p))
            ? (parsed as PhaseProfile[])
            : migrateLegacy(parsed)
          : defaultPhaseProfiles;
        if (isLegacy) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        }
      } else {
        list = defaultPhaseProfiles;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultPhaseProfiles));
      }
      setProfiles(list);

      const selected = localStorage.getItem(SELECTED_KEY);
      if (list.length > 0 && selected && list.some((p) => p.id === selected)) {
        setSelectedProfileId(selected);
      } else if (list.length > 0) {
        const firstId = list[0]!.id;
        setSelectedProfileId(firstId);
        localStorage.setItem(SELECTED_KEY, firstId);
      }
    } catch (error) {
      console.error("Error loading profiles:", error);
      setProfiles(defaultPhaseProfiles);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save profiles to localStorage
  const saveProfiles = useCallback((newProfiles: PhaseProfile[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfiles));
      setProfiles(newProfiles);
    } catch (error) {
      console.error("Error saving profiles:", error);
    }
  }, []);

  // Create a new profile
  const createProfile = useCallback(
    (profile: Omit<PhaseProfile, "id">) => {
      const newProfile: PhaseProfile = {
        ...profile,
        id: `profile-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      };
      const newProfiles = [...profiles, newProfile];
      saveProfiles(newProfiles);
      return newProfile;
    },
    [profiles, saveProfiles]
  );

  // Update an existing profile
  const updateProfile = useCallback(
    (id: string, updates: Partial<PhaseProfile>) => {
      const newProfiles = profiles.map((p) => (p.id === id ? { ...p, ...updates } : p));
      saveProfiles(newProfiles);
    },
    [profiles, saveProfiles]
  );

  // Delete a profile
  const deleteProfile = useCallback(
    (id: string) => {
      if (profiles.length <= 1) {
        throw new Error("Cannot delete the last profile");
      }
      const newProfiles = profiles.filter((p) => p.id !== id);
      saveProfiles(newProfiles);
      if (selectedProfileId === id) {
        // Select first available profile
        const newSelected = newProfiles[0]?.id ?? null;
        setSelectedProfileId(newSelected);
        if (newSelected) {
          localStorage.setItem(SELECTED_KEY, newSelected);
        }
      }
    },
    [profiles, selectedProfileId, saveProfiles]
  );

  // Select a profile
  const selectProfile = useCallback((id: string) => {
    setSelectedProfileId(id);
    localStorage.setItem(SELECTED_KEY, id);
  }, []);

  // Get the currently selected profile
  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) ?? null;

  return {
    profiles,
    selectedProfile,
    selectedProfileId,
    isLoaded,
    createProfile,
    updateProfile,
    deleteProfile,
    selectProfile,
  };
}

