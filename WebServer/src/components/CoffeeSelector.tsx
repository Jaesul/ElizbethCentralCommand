"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SafeLucide } from "~/components/SafeLucide";

import { CoffeeCreateCard } from "~/components/CoffeeCreateCard";
import { CoffeeImage } from "~/components/CoffeeImage";
import { CoffeeSummaryCard } from "~/components/CoffeeSummaryCard";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
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
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/coffees">View all coffees</Link>
            </Button>
            <CoffeeCreateCard onCreated={onCreated} triggerLabel="Add coffee" />
          </div>
        </div>

        <button
          type="button"
          className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border bg-background/90 p-2 backdrop-blur-sm"
          disabled
        >
          <SafeLucide icon={ChevronLeft} className="h-4 w-4" />
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
          <SafeLucide icon={ChevronRight} className="h-4 w-4" />
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
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/coffees">View all coffees</Link>
          </Button>
          <CoffeeCreateCard onCreated={onCreated} triggerLabel="Add coffee" />
        </div>
      </div>

      <button
        type="button"
        className="absolute left-3 top-1/2 z-10 -translate-y-1/2 rounded-full border bg-background/90 p-2 backdrop-blur-sm"
        onClick={() => scroll("left")}
      >
        <SafeLucide icon={ChevronLeft} className="h-4 w-4" />
      </button>

      <div
        ref={scrollContainerRef}
        className="flex gap-5 overflow-x-auto px-12 py-6 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: "none" }}
      >
        {coffees.map((coffee) => (
          <CoffeeSummaryCard
            key={coffee.id}
            coffee={coffee}
            onClick={onSelectCoffee}
            dimWhenFinished
          />
        ))}
      </div>

      <button
        type="button"
        className="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full border bg-background/90 p-2 backdrop-blur-sm"
        onClick={() => scroll("right")}
      >
        <SafeLucide icon={ChevronRight} className="h-4 w-4" />
      </button>
    </div>
  );
}
