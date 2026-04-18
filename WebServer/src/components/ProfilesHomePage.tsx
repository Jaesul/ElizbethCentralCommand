"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { SafeLucide } from "~/components/SafeLucide";
import { BeanPounderLogo } from "~/components/BeanPounderLogo";
import { CoffeeSelector } from "~/components/CoffeeSelector";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { useFlowConnection } from "~/components/FlowConnectionProvider";
import { ProfileSelector } from "~/components/ProfileSelector";
import { buildBrewHref } from "~/lib/coffeeUtils";
import { getDeviceProfilesAsPhaseProfiles } from "~/lib/deviceProfiles";
import type { CoffeeSummary } from "~/types/coffee";
import type { PhaseProfile } from "~/types/profiles";

const ignoreProfileDelete = (_profileId: string) => undefined;

export function ProfilesHomePage() {
  const router = useRouter();
  const [coffees, setCoffees] = useState<CoffeeSummary[]>([]);
  const [isCoffeeLoading, setIsCoffeeLoading] = useState(true);

  const {
    isConnected: flowConnected,
    deviceProfiles: flowDeviceProfiles,
    sendRaw: flowSendRaw,
    sendCommand: flowSendCommand,
  } = useFlowConnection();

  const loadCoffees = useCallback(async () => {
    setIsCoffeeLoading(true);
    try {
      const response = await fetch("/api/coffees?status=all", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Coffee load failed");
      }

      const data = (await response.json()) as CoffeeSummary[];
      setCoffees(data.slice(0, 5));
    } catch (error) {
      console.error(error);
      setCoffees([]);
    } finally {
      setIsCoffeeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCoffees();
  }, [loadCoffees]);

  useEffect(() => {
    const handleCoffeeSaved = () => {
      void loadCoffees();
    };

    window.addEventListener("coffee-saved", handleCoffeeSaved);
    return () => {
      window.removeEventListener("coffee-saved", handleCoffeeSaved);
    };
  }, [loadCoffees]);

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
      <div className="mb-6 space-y-4">
        <div className="rounded-xl border bg-card">
          <div className="flex flex-col items-center justify-center gap-8 px-4 py-20 text-center sm:gap-10 sm:py-28">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Let&apos;s pound a bean or two{" "}
                <BeanPounderLogo
                  className="ml-0.5 inline-block aspect-[54/24] h-[1.15em] w-auto align-text-bottom text-primary"
                  aria-hidden
                />
              </h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Add beans, dial recipes, and log shots—then jump in when you are ready to pull.
              </p>
            </div>
            <Button
              size="lg"
              className="inline-flex h-auto cursor-pointer items-center gap-3 px-6 py-3 text-2xl font-bold tracking-tight"
              onClick={() => router.push(buildBrewHref(null))}
              aria-label="Open brew page"
            >
              <BeanPounderLogo
                className="aspect-[54/24] h-8 w-auto text-primary-foreground"
                aria-hidden
              />
              <span className="text-primary-foreground">Bean Pounder</span>
            </Button>
          </div>
        </div>

        <CoffeeSelector
          coffees={coffees}
          isLoading={isCoffeeLoading}
          onSelectCoffee={(coffeeId) => router.push(`/coffees/${coffeeId}`)}
          onCreated={() => void loadCoffees()}
        />
      </div>

      {/* Device profiles carousel (ESP saved profiles) */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">Profiles</h2>
            <p className="text-sm text-muted-foreground">
              Pick a machine profile to brew immediately or pair with a coffee.
            </p>
          </div>
          <Button onClick={() => router.push("/profiles/new")} size="sm" variant="outline">
            <SafeLucide icon={Plus} className="mr-2 h-4 w-4" />
            New Profile
          </Button>
        </div>
        <div className="p-4">
          {!flowConnected ? (
            <div className="flex gap-6 overflow-x-auto px-1 py-2 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
              {[1, 2, 3].map((i) => (
                <Card key={i} className="h-full w-[320px] shrink-0 border rounded-xl">
                  <CardContent className="p-4 pt-4">
                    <div className="space-y-4">
                      <Skeleton className="h-6 w-32" />
                      <Skeleton className="h-[180px] w-full rounded-md" />
                      <div className="space-y-2 border-t pt-3">
                        <Skeleton className="h-4 w-full max-w-[80%]" />
                        <Skeleton className="h-4 w-full max-w-[60%]" />
                        <Skeleton className="h-4 w-full max-w-[70%]" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : !flowDeviceProfiles ? (
            <Card className="rounded-xl">
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
            <Card className="rounded-xl">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <p className="text-sm text-muted-foreground">
                  No profiles saved on device.
                </p>
              </CardContent>
            </Card>
          ) : (
            <ProfileSelector
              profiles={deviceProfilesAsPhaseProfiles}
              onSelectProfile={handleDeviceSelectProfile}
              onDeleteProfile={ignoreProfileDelete}
              onStartShot={handleDeviceStartShot}
              onEditProfile={handleEditDeviceProfile}
              isConnected={flowConnected}
              isBrewing={false}
              readOnly
              embedded
            />
          )}
        </div>
      </div>
    </div>
  );
}
