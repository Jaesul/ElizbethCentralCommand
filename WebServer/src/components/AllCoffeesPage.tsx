"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";

import { CoffeeCreateCard } from "~/components/CoffeeCreateCard";
import {
  CoffeeRotationStatusIcon,
  getCoffeeRotationStatusLabel,
} from "~/components/CoffeeRotationStatus";
import { CoffeeSummaryCard } from "~/components/CoffeeSummaryCard";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "~/components/ui/drawer";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import type { CoffeeRotationFilter, CoffeeSummary } from "~/types/coffee";

type CoffeeBrowseFilters = {
  status: CoffeeRotationFilter;
  from: string;
  to: string;
  minRecipes: string;
  maxRecipes: string;
  minBrews: string;
  maxBrews: string;
  minBagsConsumed: string;
  maxBagsConsumed: string;
};

const initialFilters: CoffeeBrowseFilters = {
  status: "all",
  from: "",
  to: "",
  minRecipes: "",
  maxRecipes: "",
  minBrews: "",
  maxBrews: "",
  minBagsConsumed: "",
  maxBagsConsumed: "",
};

const inputClassName =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary";

function buildCoffeeBrowseQuery(filters: CoffeeBrowseFilters) {
  const params = new URLSearchParams();
  params.set("status", filters.status);

  if (filters.from) {
    params.set("from", new Date(`${filters.from}T00:00:00`).toISOString());
  }
  if (filters.to) {
    params.set("to", new Date(`${filters.to}T23:59:59`).toISOString());
  }
  if (filters.minRecipes) params.set("minRecipes", filters.minRecipes);
  if (filters.maxRecipes) params.set("maxRecipes", filters.maxRecipes);
  if (filters.minBrews) params.set("minBrews", filters.minBrews);
  if (filters.maxBrews) params.set("maxBrews", filters.maxBrews);
  if (filters.minBagsConsumed) {
    params.set("minBagsConsumed", filters.minBagsConsumed);
  }
  if (filters.maxBagsConsumed) {
    params.set("maxBagsConsumed", filters.maxBagsConsumed);
  }

  return params.toString();
}

function CoffeeBrowseSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="rounded-xl border bg-card p-4">
          <Skeleton className="mb-4 aspect-[4/3] w-full rounded-lg" />
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
            {Array.from({ length: 6 }).map((__, row) => (
              <div
                key={row}
                className={row === 5 ? "flex justify-between gap-3 border-t pt-2" : "flex justify-between gap-3"}
              >
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function hasExtraFilters(filters: CoffeeBrowseFilters) {
  return (
    filters.from !== "" ||
    filters.to !== "" ||
    filters.minRecipes !== "" ||
    filters.maxRecipes !== "" ||
    filters.minBrews !== "" ||
    filters.maxBrews !== "" ||
    filters.minBagsConsumed !== "" ||
    filters.maxBagsConsumed !== ""
  );
}

interface AllCoffeesPageProps {
  /** When true, used inside dashboard inset: scrollable column, no page hero. */
  embedded?: boolean;
}

const COFFEE_LIST_TIMEOUT_MS = 60_000;

export function AllCoffeesPage({ embedded = false }: AllCoffeesPageProps) {
  const router = useRouter();
  const [coffees, setCoffees] = useState<CoffeeSummary[]>([]);
  const [filters, setFilters] = useState<CoffeeBrowseFilters>(initialFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);

  const loadCoffees = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setIsLoading(true);
    setLoadError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), COFFEE_LIST_TIMEOUT_MS);

    try {
      const response = await fetch(`/api/coffees?${buildCoffeeBrowseQuery(filters)}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (requestId !== loadRequestIdRef.current) return;

      if (!response.ok) {
        throw new Error("Coffee browse fetch failed");
      }

      const data = (await response.json()) as CoffeeSummary[];
      setCoffees(data);
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) return;

      console.error(error);
      setCoffees([]);
      if (error instanceof DOMException && error.name === "AbortError") {
        setLoadError(
          "Loading coffees timed out (the server query was taking too long). Try again after a moment.",
        );
      } else {
        setLoadError("Could not load coffees. Check the network or server logs, then retry.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (requestId === loadRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [filters]);

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

  const setFilter = <K extends keyof CoffeeBrowseFilters>(
    key: K,
    value: CoffeeBrowseFilters[K],
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const resetExtraFilters = () => {
    setFilters((current) => ({
      ...current,
      from: "",
      to: "",
      minRecipes: "",
      maxRecipes: "",
      minBrews: "",
      maxBrews: "",
      minBagsConsumed: "",
      maxBagsConsumed: "",
    }));
  };

  const outerClass = embedded
    ? "flex min-h-0 w-full flex-1 flex-col overflow-auto px-4 py-4"
    : "container mx-auto max-w-6xl px-4 py-8";

  return (
    <div className={outerClass}>
      {!embedded ? (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">All coffees</h1>
            <p className="text-sm text-muted-foreground">
              Browse beans in rotation, retired bags, and your full coffee history.
            </p>
          </div>
          <CoffeeCreateCard onCreated={() => void loadCoffees()} triggerLabel="Add coffee" />
        </div>
      ) : null}

      <div
        className={cn(
          "flex flex-col rounded-xl border bg-card p-4",
          embedded && "min-h-0 flex-1",
        )}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Drawer direction="right">
              <DrawerTrigger asChild>
                <Button type="button" variant="outline">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {hasExtraFilters(filters) ? " active" : ""}
                </Button>
              </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Filters</DrawerTitle>
                <DrawerDescription>
                  Narrow the coffee history by dates, recipe count, brew count, and bags consumed.
                </DrawerDescription>
              </DrawerHeader>

              <div className="grid gap-3 px-4 pb-4">
                <label className="grid gap-1 text-sm">
                  <span>Date from</span>
                  <input
                    className={inputClassName}
                    type="date"
                    value={filters.from}
                    onChange={(event) => setFilter("from", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Date to</span>
                  <input
                    className={inputClassName}
                    type="date"
                    value={filters.to}
                    onChange={(event) => setFilter("to", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Min recipes</span>
                  <input
                    className={inputClassName}
                    type="number"
                    min="0"
                    value={filters.minRecipes}
                    onChange={(event) => setFilter("minRecipes", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Max recipes</span>
                  <input
                    className={inputClassName}
                    type="number"
                    min="0"
                    value={filters.maxRecipes}
                    onChange={(event) => setFilter("maxRecipes", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Min brews</span>
                  <input
                    className={inputClassName}
                    type="number"
                    min="0"
                    value={filters.minBrews}
                    onChange={(event) => setFilter("minBrews", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Max brews</span>
                  <input
                    className={inputClassName}
                    type="number"
                    min="0"
                    value={filters.maxBrews}
                    onChange={(event) => setFilter("maxBrews", event.target.value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Min bags consumed</span>
                  <input
                    className={inputClassName}
                    type="number"
                    min="0"
                    value={filters.minBagsConsumed}
                    onChange={(event) =>
                      setFilter("minBagsConsumed", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Max bags consumed</span>
                  <input
                    className={inputClassName}
                    type="number"
                    min="0"
                    value={filters.maxBagsConsumed}
                    onChange={(event) =>
                      setFilter("maxBagsConsumed", event.target.value)
                    }
                  />
                </label>
              </div>

              <DrawerFooter>
                <Button type="button" variant="outline" onClick={resetExtraFilters}>
                  Reset filters
                </Button>
                <DrawerClose asChild>
                  <Button type="button">Done</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
            {(["all", "active", "finished"] as const).map((status) => (
              <Button
                key={status}
                type="button"
                variant={filters.status === status ? "default" : "outline"}
                onClick={() => setFilter("status", status)}
                className="capitalize"
              >
                {status === "all" ? (
                  "All"
                ) : (
                  <>
                    <CoffeeRotationStatusIcon status={status} />
                    {getCoffeeRotationStatusLabel(status)}
                  </>
                )}
              </Button>
            ))}
          </div>
        </div>

        <div
          className={cn(
            embedded ? "mt-2 flex min-h-0 flex-1 flex-col overflow-auto" : "mt-4",
          )}
        >
          {isLoading ? (
            <CoffeeBrowseSkeleton />
          ) : loadError ? (
            <div className="rounded-lg border border-destructive/40 bg-muted/20 p-8 text-center text-sm">
              <p className="text-destructive">{loadError}</p>
              <Button type="button" className="mt-4" onClick={() => void loadCoffees()}>
                Retry
              </Button>
            </div>
          ) : coffees.length === 0 ? (
            <div className="rounded-lg border border-border bg-muted/10 p-8 text-center text-sm text-muted-foreground">
              No coffees match the current filters.
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {coffees.map((coffee) => (
                <CoffeeSummaryCard
                  key={coffee.id}
                  coffee={coffee}
                  onClick={(coffeeId) => router.push(`/coffees/${coffeeId}`)}
                  className="w-full"
                  dimWhenFinished
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
