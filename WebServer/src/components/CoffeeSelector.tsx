"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { CoffeeCreateCard } from "~/components/CoffeeCreateCard";
import { CoffeeImage } from "~/components/CoffeeImage";
import { Skeleton } from "~/components/ui/skeleton";
import { formatDateOnly } from "~/lib/coffeeUtils";
import type { CoffeeSummary } from "~/types/coffee";

interface CoffeeSelectorProps {
  coffees: CoffeeSummary[];
  onSelectCoffee: (coffeeId: number) => void;
  onCreated?: () => void;
  isLoading?: boolean;
}

export function CoffeeSelector({
  coffees,
  onSelectCoffee,
  onCreated,
  isLoading = false,
}: CoffeeSelectorProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.scrollBy({
      left: direction === "left" ? -320 : 320,
      behavior: "smooth",
    });
  };

  if (isLoading) {
    return (
      <div className="relative rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-lg font-semibold">Coffee</h3>
            <p className="text-sm text-muted-foreground">
              Pick a bean to open its recipe book, ledger, and profile pairing.
            </p>
          </div>
          <CoffeeCreateCard onCreated={onCreated} triggerLabel="Add coffee" />
        </div>

        <button
          type="button"
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border bg-background/90 p-2 backdrop-blur-sm"
          disabled
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex gap-5 overflow-x-auto px-12 py-6 [&::-webkit-scrollbar]:hidden">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="w-[320px] shrink-0 rounded-xl border p-4"
            >
              <Skeleton className="mb-4 aspect-[4/3] w-full rounded-lg" />
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <Skeleton className="h-6 w-36" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>

              <div className="mt-4 space-y-3">
                {[1, 2, 3, 4, 5].map((row) => (
                  <div
                    key={row}
                    className={row === 5 ? "flex justify-between gap-3 border-t pt-3" : "flex justify-between gap-3"}
                  >
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border bg-background/90 p-2 backdrop-blur-sm"
          disabled
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (coffees.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto mb-3 h-20 w-20 overflow-hidden rounded-full border">
          <CoffeeImage alt="No coffee selected" />
        </div>
        <h3 className="text-lg font-semibold">No coffees yet</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Add your first bean to start tracking recipes, notes, and brew history.
        </p>
        <div className="mt-4 flex justify-center">
          <CoffeeCreateCard
            onCreated={onCreated}
            triggerLabel="Add your first coffee"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-lg font-semibold">Coffee</h3>
          <p className="text-sm text-muted-foreground">
            Pick a bean to open its recipe book, ledger, and profile pairing.
          </p>
        </div>
        <CoffeeCreateCard onCreated={onCreated} triggerLabel="Add coffee" />
      </div>

      <button
        type="button"
        className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border bg-background/90 p-2 backdrop-blur-sm"
        onClick={() => scroll("left")}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div
        ref={scrollContainerRef}
        className="flex gap-5 overflow-x-auto px-12 py-6 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {coffees.map((coffee) => (
          <button
            key={coffee.id}
            type="button"
            className="w-[320px] shrink-0 rounded-xl border p-4 text-left transition hover:-translate-y-1 hover:border-primary/60 hover:shadow-md"
            onClick={() => onSelectCoffee(coffee.id)}
          >
            <div className="mb-4 overflow-hidden rounded-lg border">
              <CoffeeImage
                src={coffee.imageUrl}
                alt={coffee.name}
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{coffee.name}</div>
                <div className="text-sm text-muted-foreground">
                  {coffee.roaster ?? "Unknown roaster"}
                </div>
              </div>
              <span className="rounded-full bg-muted px-2 py-1 text-xs">
                {coffee.defaultBrewMethod ?? "mixed"}
              </span>
            </div>

            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between gap-3">
                <span>Origin</span>
                <span className="text-right text-foreground">
                  {coffee.origin ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Process</span>
                <span className="text-right text-foreground">
                  {coffee.process ?? "—"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Recipes</span>
                <span className="text-right text-foreground">
                  {coffee.recipeCount}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Brewed</span>
                <span className="text-right text-foreground">
                  {coffee.ledgerCount}
                </span>
              </div>
              <div className="flex justify-between gap-3 border-t pt-2">
                <span>Last brew</span>
                <span className="text-right text-foreground">
                  {formatDateOnly(coffee.lastBrewedAt)}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border bg-background/90 p-2 backdrop-blur-sm"
        onClick={() => scroll("right")}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
