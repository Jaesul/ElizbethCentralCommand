"use client";

import { CoffeeFormDialog } from "~/components/CoffeeFormDialog";
import type { CoffeeDetail } from "~/types/coffee";

interface CoffeeCreateCardProps {
  onCreated?: (coffee: CoffeeDetail) => void;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline";
  showIcon?: boolean;
}

export function CoffeeCreateCard({
  onCreated,
  triggerLabel = "Add coffee",
  triggerVariant = "outline",
  showIcon = true,
}: CoffeeCreateCardProps) {
  return (
    <CoffeeFormDialog
      onSaved={onCreated}
      triggerLabel={triggerLabel}
      triggerVariant={triggerVariant}
      showIcon={showIcon}
    />
  );
}
