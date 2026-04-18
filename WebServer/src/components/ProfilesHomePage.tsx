"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { AllCoffeesPage } from "~/components/AllCoffeesPage";
import { BeanPounderLogo } from "~/components/BeanPounderLogo";
import { CoffeeCreateCard } from "~/components/CoffeeCreateCard";
import { DashboardProfilesPanel } from "~/components/dashboard/DashboardProfilesPanel";
import { DashboardShell } from "~/components/dashboard/DashboardShell";
import {
  isDashboardSection,
  type DashboardSection,
} from "~/components/dashboard/types";
import {
  ProfileBrewPage,
  type EmbeddedBrewHeaderActions,
} from "~/components/ProfileBrewPage";
import { Button } from "~/components/ui/button";
import { SafeLucide } from "~/components/SafeLucide";
import { Skeleton } from "~/components/ui/skeleton";
import { useFlowConnection } from "~/components/FlowConnectionProvider";
import { buildBrewHref } from "~/lib/coffeeUtils";
import { getDeviceProfilesAsPhaseProfiles } from "~/lib/deviceProfiles";
import type { PhaseProfile } from "~/types/profiles";

function BrewPanelFallback() {
  return (
    <div className="space-y-4 p-4">
      <Skeleton className="h-10 w-full max-w-md" />
      <Skeleton className="h-[320px] w-full rounded-xl" />
    </div>
  );
}

export function ProfilesHomePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [brewHeaderActions, setBrewHeaderActions] = useState<EmbeddedBrewHeaderActions | null>(null);
  const sectionParam = searchParams.get("tab");
  const section: DashboardSection = isDashboardSection(sectionParam) ? sectionParam : "brew";

  const {
    isConnected: flowConnected,
    deviceProfiles: flowDeviceProfiles,
    sendRaw: flowSendRaw,
    sendCommand: flowSendCommand,
  } = useFlowConnection();

  const deviceProfilesAsPhaseProfiles: PhaseProfile[] = useMemo(() => {
    return getDeviceProfilesAsPhaseProfiles(flowDeviceProfiles);
  }, [flowDeviceProfiles]);

  const handleDeviceSelectProfile = useCallback(
    (profileId: string) => {
      router.push(buildBrewHref(profileId));
    },
    [router],
  );

  const handleDeviceStartShot = useCallback(
    (_profileId: string) => {
      flowSendCommand("GO");
    },
    [flowSendCommand],
  );

  const handleEditDeviceProfile = useCallback(
    (profile: PhaseProfile) => {
      sessionStorage.setItem("elizbeth-profile-edit-initial", JSON.stringify(profile));
      router.push("/profiles/new");
    },
    [router],
  );

  const handleSectionChange = useCallback(
    (nextSection: DashboardSection) => {
      if (nextSection === section) return;

      const nextParams = new URLSearchParams(searchParams.toString());
      if (nextSection === "brew") {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", nextSection);
      }

      const nextQuery = nextParams.toString();
      router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    },
    [pathname, router, searchParams, section],
  );

  const headerMeta: Record<
    DashboardSection,
    { title: string; description: string }
  > = {
    brew: {
      title: "Brew",
      description: "Dial a profile, pick a bean, and pull with live telemetry.",
    },
    beans: {
      title: "Beans",
      description: "Browse and filter your coffee library.",
    },
    profiles: {
      title: "Profiles",
      description: "Shot profiles saved on the ESP.",
    },
  };

  const meta = headerMeta[section];

  const headerActions =
    section === "brew" && brewHeaderActions ? (
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button size="sm" onClick={brewHeaderActions.onStart} disabled={brewHeaderActions.startDisabled}>
          {brewHeaderActions.startLabel === "Start Bean Pound" ? (
            <>
              <BeanPounderLogo className="aspect-[54/24] h-4 w-auto" aria-hidden />
              Start Bean Pound
            </>
          ) : (
            brewHeaderActions.startLabel
          )}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={brewHeaderActions.onStop}
          disabled={brewHeaderActions.stopDisabled}
        >
          {brewHeaderActions.stopLabel}
        </Button>
      </div>
    ) : section === "beans" ? (
      <CoffeeCreateCard triggerLabel="Add coffee" />
    ) : section === "profiles" ? (
      <Button size="sm" variant="outline" onClick={() => router.push("/profiles/new")}>
        <SafeLucide icon={Plus} className="mr-2 h-4 w-4" />
        New profile
      </Button>
    ) : null;

  return (
    <DashboardShell
      active={section}
      onSectionChange={handleSectionChange}
      headerTitle={meta.title}
      headerDescription={meta.description}
      headerActions={headerActions}
    >
      {section === "brew" ? (
        <Suspense fallback={<BrewPanelFallback />}>
          <ProfileBrewPage embedded onEmbeddedHeaderActionsChange={setBrewHeaderActions} />
        </Suspense>
      ) : null}
      <div className={section === "beans" ? "min-h-0 flex-1" : "hidden"} aria-hidden={section !== "beans"}>
        <AllCoffeesPage embedded />
      </div>
      {section === "profiles" ? (
        <div className="p-4 lg:p-6">
          <DashboardProfilesPanel
            flowConnected={flowConnected}
            flowDeviceProfiles={flowDeviceProfiles}
            onSendProfiles={() => flowSendRaw("PROFILES")}
            profiles={deviceProfilesAsPhaseProfiles}
            onSelectProfile={handleDeviceSelectProfile}
            onEditProfile={handleEditDeviceProfile}
            onNewProfile={() => router.push("/profiles/new")}
          />
        </div>
      ) : null}
    </DashboardShell>
  );
}
