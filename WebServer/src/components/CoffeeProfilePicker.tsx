"use client";

import type { PhaseProfile } from "~/types/profiles";
import { ProfileSelector } from "~/components/ProfileSelector";

const ignoreDelete = (_profileId: string) => undefined;

interface CoffeeProfilePickerProps {
  profiles: PhaseProfile[];
  onSelectProfile: (profileId: string) => void;
}

export function CoffeeProfilePicker({
  profiles,
  onSelectProfile,
}: CoffeeProfilePickerProps) {
  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-lg font-semibold">Profiles for this coffee</h3>
        <p className="text-sm text-muted-foreground">
          Pick the device profile you want to brew this bean with.
        </p>
      </div>
      <div className="p-4">
        <ProfileSelector
          profiles={profiles}
          onSelectProfile={onSelectProfile}
          onDeleteProfile={ignoreDelete}
          isConnected
          isBrewing={false}
          readOnly
          embedded
        />
      </div>
    </div>
  );
}
