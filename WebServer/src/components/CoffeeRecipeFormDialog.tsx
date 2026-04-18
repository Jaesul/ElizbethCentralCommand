"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { SelectionDropdown } from "~/components/ui/selection-dropdown";
import { useToast } from "~/components/ui/use-toast";
import {
  calculateBrewRatio,
  formatBrewRatio,
  getBrewMethodLabel,
} from "~/lib/coffeeUtils";
import type { PhaseProfile } from "~/types/profiles";
import {
  BREW_METHODS,
  type BrewLedgerEntry,
  type CoffeeDetail,
  type CoffeeRecipe,
} from "~/types/coffee";

const inputClassName =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary";

export type CoffeeRecipeFormDialogProps = {
  coffee: CoffeeDetail;
  availableProfiles: PhaseProfile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, dialog PATCHes this recipe on save. */
  recipeToEdit: CoffeeRecipe | null;
  /** When set (and not editing), seed fields from a ledger row (e.g. Convert to recipe). */
  ledgerPrefill: BrewLedgerEntry | null;
  onSuccess: () => void;
};

function emptyForm(coffee: CoffeeDetail) {
  return {
    name: "",
    brewMethod: coffee.defaultBrewMethod ?? "espresso",
    doseGrams: "",
    yieldGrams: "",
    grindSetting: "",
    waterTempC: "",
    brewTimeSeconds: "",
    profileRef: coffee.preferredProfileRef ?? "",
    tastingNotes: "",
    notes: "",
  };
}

export function CoffeeRecipeFormDialog({
  coffee,
  availableProfiles,
  open,
  onOpenChange,
  recipeToEdit,
  ledgerPrefill,
  onSuccess,
}: CoffeeRecipeFormDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(() => emptyForm(coffee));

  const profileNameById = useMemo(
    () =>
      new Map(
        availableProfiles.map((profile) => [profile.id, profile.name] as const),
      ),
    [availableProfiles],
  );

  const calculatedBrewRatio = useMemo(() => {
    const dose =
      form.doseGrams.trim().length > 0 ? Number(form.doseGrams) : null;
    const yieldValue =
      form.yieldGrams.trim().length > 0 ? Number(form.yieldGrams) : null;
    return calculateBrewRatio(dose, yieldValue);
  }, [form.doseGrams, form.yieldGrams]);

  const brewMethodOptions = useMemo(
    () =>
      BREW_METHODS.map((option) => ({
        value: option,
        label: getBrewMethodLabel(option),
      })),
    [],
  );

  const profileOptions = useMemo(
    () =>
      availableProfiles.map((profile) => ({
        value: profile.id,
        label: profile.name,
      })),
    [availableProfiles],
  );

  useEffect(() => {
    if (!open) return;

    if (recipeToEdit) {
      setForm({
        name: recipeToEdit.name,
        brewMethod: recipeToEdit.brewMethod,
        doseGrams: recipeToEdit.doseGrams?.toString() ?? "",
        yieldGrams: recipeToEdit.yieldGrams?.toString() ?? "",
        grindSetting: recipeToEdit.grindSetting ?? "",
        waterTempC: recipeToEdit.waterTempC?.toString() ?? "",
        brewTimeSeconds: recipeToEdit.brewTimeSeconds?.toString() ?? "",
        profileRef: recipeToEdit.profileRef ?? "",
        tastingNotes: recipeToEdit.tastingNotes ?? "",
        notes: recipeToEdit.notes ?? "",
      });
      return;
    }

    if (ledgerPrefill) {
      setForm({
        name: `${coffee.name} ${new Date(ledgerPrefill.brewedAt).toLocaleDateString()} recipe`,
        brewMethod: ledgerPrefill.brewMethod,
        doseGrams: ledgerPrefill.doseGrams?.toString() ?? "",
        yieldGrams: ledgerPrefill.yieldGrams?.toString() ?? "",
        grindSetting: ledgerPrefill.grindSetting ?? "",
        waterTempC: ledgerPrefill.waterTempC?.toString() ?? "",
        brewTimeSeconds: ledgerPrefill.brewTimeSeconds?.toString() ?? "",
        profileRef:
          ledgerPrefill.profileRef ?? coffee.preferredProfileRef ?? "",
        tastingNotes: ledgerPrefill.tastingNotes ?? "",
        notes: ledgerPrefill.notes ?? "",
      });
      return;
    }

    setForm(emptyForm(coffee));
  }, [
    open,
    recipeToEdit,
    ledgerPrefill,
    coffee.id,
    coffee.name,
    coffee.defaultBrewMethod,
    coffee.preferredProfileRef,
  ]);

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const title = recipeToEdit
    ? "Edit recipe"
    : ledgerPrefill
      ? "Save brew as recipe"
      : "New recipe";

  const description = recipeToEdit
    ? "Update this recipe’s parameters or tasting notes."
    : ledgerPrefill
      ? "Review and adjust fields, then save—nothing is created until you confirm."
      : "Save a repeatable recipe for this bean with dose, yield, grind, temperature, and profile.";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const profileRefTrim = form.profileRef.trim();
    const bodyBase = {
      name: form.name.trim(),
      brewMethod: form.brewMethod,
      doseGrams: form.doseGrams,
      yieldGrams: form.yieldGrams,
      brewRatio: calculatedBrewRatio,
      grindSetting: form.grindSetting,
      waterTempC: form.waterTempC,
      brewTimeSeconds: form.brewTimeSeconds,
      profileRef: profileRefTrim.length > 0 ? profileRefTrim : null,
      profileNameSnapshot: profileRefTrim
        ? (profileNameById.get(profileRefTrim) ?? null)
        : null,
      tastingNotes: form.tastingNotes,
      notes: form.notes,
    };

    try {
      if (recipeToEdit) {
        const response = await fetch(`/api/recipes/${recipeToEdit.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyBase),
        });
        if (!response.ok) throw new Error("Recipe update failed");
        onOpenChange(false);
        onSuccess();
        toast({
          title: "Recipe updated",
          description: `“${form.name.trim()}” was saved.`,
          durationMs: 2500,
        });
      } else {
        const response = await fetch("/api/recipes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            coffeeId: coffee.id,
            ...bodyBase,
          }),
        });
        if (!response.ok) throw new Error("Recipe creation failed");
        onOpenChange(false);
        onSuccess();
        toast({
          title: "Recipe saved",
          description: `“${form.name.trim()}” is in the recipe book.`,
          durationMs: 2500,
        });
      }
    } catch (error) {
      console.error(error);
      toast({
        title: recipeToEdit ? "Update failed" : "Save failed",
        description: "Please check the recipe fields and try again.",
        durationMs: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="grid gap-1 text-sm">
            <span>Recipe name</span>
            <input
              className={inputClassName}
              required
              value={form.name}
              onChange={(event) => handleChange("name", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Method</span>
            <SelectionDropdown
              value={form.brewMethod}
              placeholder="Select method"
              options={brewMethodOptions}
              onChange={(value) => handleChange("brewMethod", value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Dose (g)</span>
            <input
              className={inputClassName}
              inputMode="decimal"
              value={form.doseGrams}
              onChange={(event) => handleChange("doseGrams", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Yield (g)</span>
            <input
              className={inputClassName}
              inputMode="decimal"
              value={form.yieldGrams}
              onChange={(event) =>
                handleChange("yieldGrams", event.target.value)
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Brew ratio</span>
            <input
              className={`${inputClassName} bg-muted`}
              value={formatBrewRatio(calculatedBrewRatio) ?? ""}
              placeholder="Calculated from dose and yield"
              readOnly
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Grind setting</span>
            <input
              className={inputClassName}
              value={form.grindSetting}
              onChange={(event) =>
                handleChange("grindSetting", event.target.value)
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Water temp (C)</span>
            <input
              className={inputClassName}
              inputMode="decimal"
              value={form.waterTempC}
              onChange={(event) =>
                handleChange("waterTempC", event.target.value)
              }
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Brew time (s)</span>
            <input
              className={inputClassName}
              inputMode="numeric"
              value={form.brewTimeSeconds}
              onChange={(event) =>
                handleChange("brewTimeSeconds", event.target.value)
              }
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Profile</span>
            <SelectionDropdown
              value={form.profileRef}
              placeholder="Use coffee default / none"
              options={profileOptions}
              onChange={(value) => handleChange("profileRef", value)}
              emptyMessage="No profiles available"
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Tasting notes</span>
            <textarea
              className={`${inputClassName} min-h-20`}
              value={form.tastingNotes}
              onChange={(event) =>
                handleChange("tastingNotes", event.target.value)
              }
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Notes</span>
            <textarea
              className={`${inputClassName} min-h-20`}
              value={form.notes}
              onChange={(event) => handleChange("notes", event.target.value)}
            />
          </label>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting
                ? "Saving..."
                : recipeToEdit
                  ? "Save changes"
                  : "Save recipe"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
