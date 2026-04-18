"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { CoffeeBagActionDialog } from "~/components/CoffeeBagActionDialog";
import { CoffeeFormDialog } from "~/components/CoffeeFormDialog";
import { CoffeeImage } from "~/components/CoffeeImage";
import { CoffeeLedgerTable } from "~/components/CoffeeLedgerTable";
import { CoffeeProfilePicker } from "~/components/CoffeeProfilePicker";
import {
  CoffeeRotationStatusIcon,
  getCoffeeRotationStatusLabel,
} from "~/components/CoffeeRotationStatus";
import { CoffeeRecipeCarousel } from "~/components/CoffeeRecipeCarousel";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useFlowConnection } from "~/components/FlowConnectionProvider";
import { useToast } from "~/components/ui/use-toast";
import {
  buildBrewHref,
  formatBrewRatio,
  formatDateTimeNoSeconds,
  formatMetric,
  formatDateOnly,
  formatSeconds,
  getLedgerProfileRef,
  getBrewMethodLabel,
} from "~/lib/coffeeUtils";
import { getDeviceProfilesAsPhaseProfiles } from "~/lib/deviceProfiles";
import type { BrewLedgerEntry, BrewLedgerPage, CoffeeDetail } from "~/types/coffee";

export function CoffeeHomePage({ coffeeId }: { coffeeId: number }) {
  const toDayBoundaryIso = useCallback(
    (value: string, boundary: "start" | "end") => {
      const suffix = boundary === "start" ? "T00:00:00" : "T23:59:59.999";
      return new Date(`${value}${suffix}`).toISOString();
    },
    [],
  );

  const router = useRouter();
  const handleBack = useCallback(() => {
    router.back();
  }, [router]);
  const { toast } = useToast();
  const {
    deviceProfiles,
    isConnected,
    sendRaw,
  } = useFlowConnection();
  const [coffee, setCoffee] = useState<CoffeeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ledgerEntries, setLedgerEntries] = useState<BrewLedgerEntry[]>([]);
  const [ledgerCursor, setLedgerCursor] = useState<string | null>(null);
  const [hasMoreLedger, setHasMoreLedger] = useState(false);
  const [isLedgerLoading, setIsLedgerLoading] = useState(true);
  const [isLedgerLoadingMore, setIsLedgerLoadingMore] = useState(false);
  const [ledgerFilterFrom, setLedgerFilterFrom] = useState("");
  const [ledgerFilterTo, setLedgerFilterTo] = useState("");
  const [ledgerSortOrder, setLedgerSortOrder] = useState<"desc" | "asc">("desc");

  const availableProfiles = useMemo(
    () => getDeviceProfilesAsPhaseProfiles(deviceProfiles),
    [deviceProfiles],
  );

  const latestLedgerEntry = useMemo(
    () => coffee?.latestLedgerEntry ?? null,
    [coffee?.latestLedgerEntry],
  );

  const loadCoffee = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/coffees/${coffeeId}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Coffee fetch failed");
      }

      const data = (await response.json()) as CoffeeDetail;
      setCoffee(data);
    } catch (error) {
      console.error(error);
      setCoffee(null);
    } finally {
      setIsLoading(false);
    }
  }, [coffeeId]);

  useEffect(() => {
    void loadCoffee();
  }, [loadCoffee]);

  const loadLedgerPage = useCallback(
    async (reset: boolean) => {
      if (!reset && (!hasMoreLedger || isLedgerLoadingMore)) return;

      if (reset) {
        setIsLedgerLoading(true);
      } else {
        setIsLedgerLoadingMore(true);
      }

      try {
        const params = new URLSearchParams();
        params.set("limit", "5");
        if (!reset && ledgerCursor) {
          params.set("cursor", ledgerCursor);
        }
        if (ledgerFilterFrom) {
          params.set("from", toDayBoundaryIso(ledgerFilterFrom, "start"));
        }
        if (ledgerFilterTo) {
          params.set("to", toDayBoundaryIso(ledgerFilterTo, "end"));
        }
        params.set("sort", ledgerSortOrder);

        const response = await fetch(`/api/coffees/${coffeeId}/ledger?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Ledger fetch failed");
        }

        const data = (await response.json()) as BrewLedgerPage;
        setLedgerEntries((current) =>
          reset ? data.entries : [...current, ...data.entries],
        );
        setLedgerCursor(data.nextCursor);
        setHasMoreLedger(data.nextCursor != null);
      } catch (error) {
        console.error(error);
        if (reset) {
          setLedgerEntries([]);
          setLedgerCursor(null);
          setHasMoreLedger(false);
        }
      } finally {
        if (reset) {
          setIsLedgerLoading(false);
        } else {
          setIsLedgerLoadingMore(false);
        }
      }
    },
    [
      coffeeId,
      hasMoreLedger,
      isLedgerLoadingMore,
      ledgerCursor,
      ledgerFilterFrom,
      ledgerFilterTo,
      ledgerSortOrder,
      toDayBoundaryIso,
    ],
  );

  useEffect(() => {
    void loadLedgerPage(true);
  }, [coffeeId, ledgerFilterFrom, ledgerFilterTo, ledgerSortOrder]);

  const handleLedgerRefresh = useCallback(() => {
    void loadCoffee();
    void loadLedgerPage(true);
  }, [loadCoffee, loadLedgerPage]);

  const handleBrewWithProfile = useCallback(
    (profileId: string) => {
      if (!coffee) return;
      router.push(
        buildBrewHref(profileId, {
          coffeeId: coffee.id,
        }),
      );
    },
    [coffee, router],
  );

  const handleRebrewLatest = useCallback(() => {
    if (!coffee || !latestLedgerEntry) return;

    const profileRef = getLedgerProfileRef(latestLedgerEntry, coffee);
    if (!profileRef) {
      toast({
        title: "No profile attached",
        description:
          "Pick a preferred profile for this bean before rebrewing the latest shot.",
        durationMs: 3000,
      });
      return;
    }

    router.push(
      buildBrewHref(profileRef, {
        coffeeId: coffee.id,
        ledgerEntryId: latestLedgerEntry.id,
      }),
    );
  }, [coffee, latestLedgerEntry, router, toast]);

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8 xl:max-w-6xl">
        <div className="mb-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-10 w-24" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-28" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
            <Skeleton className="aspect-[4/3] w-full rounded-xl" />
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-8 w-56" />
                <Skeleton className="h-4 w-full max-w-md" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div key={idx}>
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="mt-2 h-5 w-32" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-4/5" />
            </div>
            <div className="rounded-lg border p-3">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="mt-2 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-7 w-48" />
            <div className="mt-4 flex gap-4 overflow-hidden">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="w-[280px] shrink-0 space-y-3 rounded-lg border p-4">
                  <Skeleton className="aspect-[4/3] w-full rounded-lg" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-7 w-44" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>

          <div className="rounded-xl border bg-card p-6">
            <Skeleton className="h-7 w-56" />
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="rounded-lg border p-4 space-y-3">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!coffee) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8 xl:max-w-6xl">
        <Button variant="ghost" onClick={handleBack} className="mb-4 cursor-pointer">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Coffee not found.
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 xl:max-w-6xl">
      <div className="mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={handleBack} className="cursor-pointer">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <CoffeeBagActionDialog
              coffee={coffee}
              onUpdated={(updatedCoffee) => setCoffee(updatedCoffee)}
            />
            <CoffeeFormDialog
              coffee={coffee}
              onSaved={(updatedCoffee) => setCoffee(updatedCoffee)}
              triggerLabel="Edit coffee"
            />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
          <div className="overflow-hidden rounded-xl border">
            <CoffeeImage
              src={coffee.imageUrl}
              alt={coffee.name}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold">{coffee.name}</h1>
              <p className="text-sm text-muted-foreground">
                {coffee.roaster ?? "Unknown roaster"}
                {coffee.origin ? ` · ${coffee.origin}` : ""}
                {coffee.process ? ` · ${coffee.process}` : ""}
              </p>
            </div>

            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Roast level
                </div>
                <div className="mt-1 text-foreground">
                  {coffee.roastLevel ?? "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Roast date
                </div>
                <div className="mt-1 text-foreground">
                  {formatDateOnly(coffee.roastDate)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Purchase date
                </div>
                <div className="mt-1 text-foreground">
                  {formatDateOnly(coffee.purchaseDate)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Default brew method
                </div>
                <div className="mt-1 text-foreground">
                  {coffee.defaultBrewMethod
                    ? getBrewMethodLabel(coffee.defaultBrewMethod)
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Preferred profile
                </div>
                <div className="mt-1 text-foreground">
                  {coffee.preferredProfileName ?? "Not selected"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Totals
                </div>
                <div className="mt-1 text-foreground">
                  {coffee.recipeCount} recipes · {coffee.ledgerCount} ledger brews ·{" "}
                  {coffee.bagsConsumed} bags
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Rotation
                </div>
                <div className="mt-1 flex items-center gap-2 text-foreground">
                  <CoffeeRotationStatusIcon status={coffee.rotationStatus} />
                  {getCoffeeRotationStatusLabel(coffee.rotationStatus)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Bag date
                </div>
                <div className="mt-1 text-foreground">
                  {coffee.rotationStatus === "active"
                    ? formatDateOnly(
                        coffee.currentBag?.openedAt ?? coffee.latestBag?.openedAt,
                      )
                    : formatDateOnly(
                        coffee.latestBag?.finishedAt ?? coffee.latestBag?.openedAt,
                      )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {(coffee.notes ?? coffee.tastingNotes) && (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Bean notes
              </div>
              <p className="mt-1 text-sm text-foreground">
                {coffee.notes ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Tasting notes
              </div>
              <p className="mt-1 text-sm text-foreground">
                {coffee.tastingNotes ?? "—"}
              </p>
            </div>
          </div>
        )}

        {!isConnected && (
          <p className="mt-4 text-sm text-muted-foreground">
            Connect to the machine to load device profiles for this coffee.
          </p>
        )}
        {isConnected && !deviceProfiles && (
          <div className="mt-4">
            <Button
              variant="outline"
              onClick={() => sendRaw("PROFILES")}
              className="cursor-pointer"
            >
              Load device profiles
            </Button>
          </div>
        )}
      </div>

      {latestLedgerEntry ? (
        <div className="mt-6 rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <h3 className="text-lg font-semibold">Most recent</h3>
              <p className="text-sm text-muted-foreground">
                Quick shortcut for repeating the brew you have been running lately.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleRebrewLatest}
              className="h-8 cursor-pointer px-3 text-sm"
            >
              Rebrew
            </Button>
          </div>
          <div className="p-4">
            <div className="grid gap-x-2 gap-y-1.5 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex w-fit max-w-full flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Date
                </span>
                <span className="text-foreground">
                  {formatDateTimeNoSeconds(latestLedgerEntry.brewedAt)}
                </span>
              </div>
              <div className="flex w-fit max-w-full flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Method
                </span>
                <span className="text-foreground">
                  {getBrewMethodLabel(latestLedgerEntry.brewMethod)}
                </span>
              </div>
              <div className="flex w-fit max-w-full flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Profile
                </span>
                <span className="text-foreground">
                  {latestLedgerEntry.profileNameSnapshot ??
                    coffee.preferredProfileName ??
                    "—"}
                </span>
              </div>
              <div className="flex w-fit max-w-full flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Dose
                </span>
                <span className="text-foreground">
                  {formatMetric(latestLedgerEntry.doseGrams, "g")}
                </span>
              </div>
              <div className="flex w-fit max-w-full flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Yield
                </span>
                <span className="text-foreground">
                  {formatMetric(latestLedgerEntry.yieldGrams, "g")}
                </span>
              </div>
              <div className="flex w-fit max-w-full flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Ratio
                </span>
                <span className="text-foreground">
                  {formatBrewRatio(
                    latestLedgerEntry.brewRatio,
                    latestLedgerEntry.doseGrams,
                    latestLedgerEntry.yieldGrams,
                  ) ?? "—"}
                </span>
              </div>
              <div className="flex w-fit max-w-full flex-wrap items-baseline gap-x-1 gap-y-0">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  Extract
                </span>
                <span className="text-foreground">
                  {formatSeconds(latestLedgerEntry.brewTimeSeconds)}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 space-y-6">
        <CoffeeRecipeCarousel
          coffee={coffee}
          availableProfiles={availableProfiles}
          onRecipeCreated={loadCoffee}
          onBrewRecipe={(href) => router.push(href)}
        />

        <CoffeeLedgerTable
          coffee={coffee}
          availableProfiles={availableProfiles}
          entries={ledgerEntries}
          filterFrom={ledgerFilterFrom}
          filterTo={ledgerFilterTo}
          sortOrder={ledgerSortOrder}
          hasMore={hasMoreLedger}
          isLoading={isLedgerLoading}
          isLoadingMore={isLedgerLoadingMore}
          onFilterFromChange={setLedgerFilterFrom}
          onFilterToChange={setLedgerFilterTo}
          onSortOrderChange={setLedgerSortOrder}
          onLoadMore={() => void loadLedgerPage(false)}
          onRebrew={(href) => router.push(href)}
          onLedgerConverted={handleLedgerRefresh}
        />

        {availableProfiles.length > 0 ? (
          <CoffeeProfilePicker
            profiles={availableProfiles}
            onSelectProfile={handleBrewWithProfile}
          />
        ) : (
          <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
            {isConnected
              ? "Load device profiles to pair one with this coffee."
              : "Connect to the machine to pair this coffee with an available profile."}
          </div>
        )}
      </div>
    </div>
  );
}
