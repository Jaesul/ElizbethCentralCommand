"use client";

import { BeanPounderFistLogo } from "~/components/BeanPounderLogo";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import type { CoffeeRotationStatus } from "~/types/coffee";

export function getCoffeeRotationStatusLabel(status: CoffeeRotationStatus) {
  return status === "active" ? "Pounding" : "Pounded";
}

export function CoffeeRotationStatusIcon({
  status,
  className,
}: {
  status: CoffeeRotationStatus;
  className?: string;
}) {
  return (
    <BeanPounderFistLogo
      className={cn("h-3.5 w-3.5", status === "finished" && "rotate-180", className)}
      aria-hidden
    />
  );
}

export function CoffeeRotationStatusBadge({
  status,
}: {
  status: CoffeeRotationStatus;
}) {
  return (
    <Badge variant={status === "active" ? "default" : "outline"}>
      <CoffeeRotationStatusIcon status={status} />
      {getCoffeeRotationStatusLabel(status)}
    </Badge>
  );
}
