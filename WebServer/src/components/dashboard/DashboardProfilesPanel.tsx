"use client";

import { Edit, Plus } from "lucide-react";
import { PhaseProfileGraph } from "~/components/PhaseProfileGraph";
import { SafeLucide } from "~/components/SafeLucide";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import type { DeviceProfilesPayload } from "~/hooks/useFlowProfilingWebSocket";
import { calculatePhaseProfileDuration } from "~/lib/profileUtils";
import type { PhaseProfile } from "~/types/profiles";

interface DashboardProfilesPanelProps {
  flowConnected: boolean;
  flowDeviceProfiles: DeviceProfilesPayload | null;
  onSendProfiles: () => void;
  profiles: PhaseProfile[];
  onSelectProfile: (profileId: string) => void;
  onEditProfile: (profile: PhaseProfile) => void;
  onNewProfile: () => void;
}

function formatGlobalStopSummary(profile: PhaseProfile) {
  const { weight, time, waterPumped } = profile.globalStopConditions;
  if (weight != null) return `Stop at ${weight}g`;
  if (time != null) return `Stop at ${time}s`;
  if (waterPumped != null) return `Stop at ${waterPumped}ml`;
  return "No global stop";
}

function ProfileCardsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index}>
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-40" />
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <Skeleton className="h-40 w-full rounded-lg" />
            <div className="space-y-2 border-t pt-3">
              <div className="flex justify-between gap-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
              </div>
              <div className="flex justify-between gap-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </CardContent>
          <CardFooter className="grid gap-2 border-t pt-4 sm:grid-cols-3">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

export function DashboardProfilesPanel({
  flowConnected,
  flowDeviceProfiles,
  onSendProfiles,
  profiles,
  onSelectProfile,
  onEditProfile,
  onNewProfile,
}: DashboardProfilesPanelProps) {
  if (!flowConnected) {
    return <ProfileCardsSkeleton />;
  }

  if (!flowDeviceProfiles) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
          <p className="text-center text-sm text-muted-foreground">
            Click &quot;Send PROFILES&quot; to load profiles from the device.
          </p>
          <Button variant="outline" size="sm" onClick={onSendProfiles}>
            Send PROFILES
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (profiles.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-sm text-muted-foreground">No profiles saved on device.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={onNewProfile}>
            <SafeLucide icon={Plus} className="mr-2 h-4 w-4" />
            New profile
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {profiles.map((profile) => {
        const phases = profile.phases?.length ?? 0;
        const duration = calculatePhaseProfileDuration(profile);
        return (
          <Card key={profile.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{profile.name}</CardTitle>
              <CardDescription>
                {phases} phase{phases === 1 ? "" : "s"} · ~{duration.toFixed(1)}s total
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              <div className="rounded-lg border bg-muted/20 p-3">
                <PhaseProfileGraph profile={profile} height={160} inline />
              </div>
              <div className="space-y-2 border-t pt-3 text-sm text-muted-foreground">
                <div className="flex justify-between gap-3">
                  <span>Phases</span>
                  <span className="text-right font-medium text-foreground">{phases}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Est. total</span>
                  <span className="text-right font-medium text-foreground">{duration.toFixed(1)}s</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Global stop</span>
                  <span className="text-right font-medium text-foreground">
                    {formatGlobalStopSummary(profile)}
                  </span>
                </div>
              </div>
            </CardContent>
            <CardFooter className="grid gap-2 border-t pt-4 sm:grid-cols-2">
              <Button size="sm" variant="default" onClick={() => onSelectProfile(profile.id)}>
                Open brew
              </Button>
              <Button size="sm" variant="outline" onClick={() => onEditProfile(profile)}>
                <SafeLucide icon={Edit} className="mr-1 h-3.5 w-3.5" />
                Edit
              </Button>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
