"use client";

import { useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { useFlowConnection } from "~/components/FlowConnectionProvider";
import { ProfileSelector } from "~/components/ProfileSelector";
import { normalizeProfileForGraph } from "~/lib/profileUtils";
import type { PhaseProfile } from "~/types/profiles";

export function ProfilesHomePage() {
  const router = useRouter();

  const {
    isConnected: flowConnected,
    deviceProfiles: flowDeviceProfiles,
    sendRaw: flowSendRaw,
    sendCommand: flowSendCommand,
  } = useFlowConnection();

  const deviceProfilesAsPhaseProfiles: PhaseProfile[] = useMemo(() => {
    if (!flowDeviceProfiles?.slots?.length) return [];
    const result: PhaseProfile[] = [];
    for (const slot of flowDeviceProfiles.slots) {
      if (!slot.profile?.trim()) continue;
      try {
        const raw = JSON.parse(slot.profile) as Parameters<typeof normalizeProfileForGraph>[0];
        if (!raw?.phases?.length) continue;
        result.push(
          normalizeProfileForGraph({
            ...raw,
            id: `device-slot-${slot.index}`,
            name: slot.name || raw.name || `Slot ${slot.index}`,
          })
        );
      } catch {
        // skip invalid JSON
      }
    }
    return result;
  }, [flowDeviceProfiles]);

  const activeDeviceProfileId: string | null =
    flowDeviceProfiles == null ? null : `device-slot-${flowDeviceProfiles.active}`;

  const handleDeviceSelectProfile = useCallback(
    (profileId: string) => {
      router.push(`/brew/${profileId}`);
    },
    [router]
  );

  const handleDeviceStartShot = useCallback(
    (_profileId: string) => {
      flowSendCommand("GO");
    },
    [flowSendCommand]
  );

  const handleEditDeviceProfile = useCallback(
    (profile: PhaseProfile) => {
      sessionStorage.setItem("elizbeth-profile-edit-initial", JSON.stringify(profile));
      router.push("/profiles/new");
    },
    [router]
  );

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 xl:max-w-6xl">
      {/* Device profiles carousel (ESP saved profiles + active) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Profiles on device</h2>
          <Button onClick={() => router.push("/profiles/new")} size="sm" variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            New Profile
          </Button>
        </div>
        {!flowConnected ? (
          <div className="flex gap-6 overflow-x-auto px-1 py-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
            {[1, 2, 3].map((i) => (
              <Card key={i} className="h-full w-[370px] shrink-0 border">
                <CardContent className="p-4 pt-4">
                  <div className="space-y-4">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-[180px] w-full rounded-md" />
                    <div className="space-y-2 border-t pt-3">
                      <Skeleton className="h-4 w-full max-w-[80%]" />
                      <Skeleton className="h-4 w-full max-w-[60%]" />
                      <Skeleton className="h-4 w-full max-w-[70%]" />
                    </div>
                    <Skeleton className="h-9 w-full rounded-md" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !flowDeviceProfiles ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">
                Click &quot;Send PROFILES&quot; to load profiles from the device.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => flowSendRaw("PROFILES")}
              >
                Send PROFILES
              </Button>
            </CardContent>
          </Card>
        ) : deviceProfilesAsPhaseProfiles.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">
                No profiles saved on device.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ProfileSelector
            profiles={deviceProfilesAsPhaseProfiles}
            selectedProfileId={activeDeviceProfileId}
            onSelectProfile={handleDeviceSelectProfile}
            onDeleteProfile={() => {}}
            onStartShot={handleDeviceStartShot}
            onEditProfile={handleEditDeviceProfile}
            isConnected={flowConnected}
            isBrewing={false}
            readOnly
          />
        )}
      </div>
    </div>
  );
}
