"use client";

import { Badge } from "~/components/ui/badge";
import { CoffeeRotationStatusBadge } from "~/components/CoffeeRotationStatus";
import { CoffeeImage } from "~/components/CoffeeImage";
import { formatDateOnly } from "~/lib/coffeeUtils";
import { cn } from "~/lib/utils";
import type { CoffeeSummary } from "~/types/coffee";

interface CoffeeSummaryCardProps {
  coffee: CoffeeSummary;
  onClick: (coffeeId: number) => void;
  className?: string;
  dimWhenFinished?: boolean;
}

function getBagDateLabel(coffee: CoffeeSummary) {
  return coffee.rotationStatus === "active" ? "Pounding since" : "Pounded";
}

function getBagDateValue(coffee: CoffeeSummary) {
  if (coffee.rotationStatus === "active") {
    return formatDateOnly(coffee.currentBag?.openedAt ?? coffee.latestBag?.openedAt);
  }

  return formatDateOnly(
    coffee.latestBag?.finishedAt ?? coffee.latestBag?.openedAt,
  );
}

export function CoffeeSummaryCard({
  coffee,
  onClick,
  className,
  dimWhenFinished = false,
}: CoffeeSummaryCardProps) {
  return (
    <button
      type="button"
      className={cn(
        "w-[320px] shrink-0 rounded-xl border p-4 text-left transition hover:-translate-y-1 hover:border-primary/60 hover:shadow-md",
        dimWhenFinished &&
          coffee.rotationStatus === "finished" &&
          "opacity-60 grayscale",
        className,
      )}
      onClick={() => onClick(coffee.id)}
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
        <div className="flex flex-col items-end gap-1">
          <Badge variant="secondary">
            {coffee.defaultBrewMethod ?? "mixed"}
          </Badge>
          <CoffeeRotationStatusBadge status={coffee.rotationStatus} />
        </div>
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
          <span className="text-right text-foreground">{coffee.recipeCount}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Brewed</span>
          <span className="text-right text-foreground">{coffee.ledgerCount}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Bags</span>
          <span className="text-right text-foreground">{coffee.bagsConsumed}</span>
        </div>
        <div className="flex justify-between gap-3 border-t pt-2">
          <span>{getBagDateLabel(coffee)}</span>
          <span className="text-right text-foreground">{getBagDateValue(coffee)}</span>
        </div>
      </div>
    </button>
  );
}
