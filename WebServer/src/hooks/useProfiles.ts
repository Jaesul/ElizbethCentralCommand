import { useState, useEffect, useCallback } from "react";
import type { PressureProfile } from "~/types/profiles";
import { defaultProfiles } from "~/types/profiles";

const STORAGE_KEY = "shotstopper-profiles";
const SELECTED_KEY = "shotstopper-selected-profile";

export function useProfiles() {
  const [profiles, setProfiles] = useState<PressureProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load profiles from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as PressureProfile[];
        setProfiles(parsed);
      } else {
        // Initialize with default profiles
        setProfiles(defaultProfiles);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultProfiles));
      }

      const selected = localStorage.getItem(SELECTED_KEY);
      if (selected) {
        setSelectedProfileId(selected);
      } else if (defaultProfiles.length > 0) {
        // Default to first profile
        setSelectedProfileId(defaultProfiles[0]!.id);
        localStorage.setItem(SELECTED_KEY, defaultProfiles[0]!.id);
      }
    } catch (error) {
      console.error("Error loading profiles:", error);
      setProfiles(defaultProfiles);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save profiles to localStorage
  const saveProfiles = useCallback((newProfiles: PressureProfile[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfiles));
      setProfiles(newProfiles);
    } catch (error) {
      console.error("Error saving profiles:", error);
    }
  }, []);

  // Create a new profile
  const createProfile = useCallback(
    (profile: Omit<PressureProfile, "id">) => {
      const newProfile: PressureProfile = {
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
    (id: string, updates: Partial<PressureProfile>) => {
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

