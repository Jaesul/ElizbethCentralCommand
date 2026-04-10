"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { SelectionDropdown } from "~/components/ui/selection-dropdown";
import { useToast } from "~/components/ui/use-toast";
import {
  buildBrewHref,
  calculateBrewRatio,
  formatBrewRatio,
  formatMetric,
  formatSeconds,
  getBrewMethodLabel,
  getRecipeProfileRef,
} from "~/lib/coffeeUtils";
import type { PhaseProfile } from "~/types/profiles";
import {
  BREW_METHODS,
  type CoffeeDetail,
  type CoffeeRecipe,
} from "~/types/coffee";

interface CoffeeRecipeCarouselProps {
  coffee: CoffeeDetail;
  availableProfiles: PhaseProfile[];
  onRecipeCreated: () => void;
  onBrewRecipe: (href: string) => void;
}

const inputClassName =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary";

export function CoffeeRecipeCarousel({
  coffee,
  availableProfiles,
  onRecipeCreated,
  onBrewRecipe,
}: CoffeeRecipeCarouselProps) {
  const { toast } = useToast();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    brewMethod: coffee.defaultBrewMethod ?? "espresso",
    doseGrams: "",
    yieldGrams: "",
    brewRatio: "",
    grindSetting: "",
    waterTempC: "",
    brewTimeSeconds: "",
    profileRef: coffee.preferredProfileRef ?? "",
    tastingNotes: "",
    notes: "",
  });

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
        label: option,
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

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollBy({
      left: direction === "left" ? -320 : 320,
      behavior: "smooth",
    });
  };

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm({
      name: "",
      brewMethod: coffee.defaultBrewMethod ?? "espresso",
      doseGrams: "",
      yieldGrams: "",
      brewRatio: "",
      grindSetting: "",
      waterTempC: "",
      brewTimeSeconds: "",
      profileRef: coffee.preferredProfileRef ?? "",
      tastingNotes: "",
      notes: "",
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coffeeId: coffee.id,
          name: form.name,
          brewMethod: form.brewMethod,
          doseGrams: form.doseGrams,
          yieldGrams: form.yieldGrams,
          brewRatio: calculatedBrewRatio,
          grindSetting: form.grindSetting,
          waterTempC: form.waterTempC,
          brewTimeSeconds: form.brewTimeSeconds,
          profileRef: form.profileRef,
          profileNameSnapshot: form.profileRef
            ? profileNameById.get(form.profileRef) ?? null
            : null,
          tastingNotes: form.tastingNotes,
          notes: form.notes,
        }),
      });

      if (!response.ok) {
        throw new Error("Recipe creation failed");
      }

      resetForm();
      setIsCreateOpen(false);
      onRecipeCreated();
      toast({
        title: "Recipe saved",
        description: `${form.name} is ready in the recipe carousel.`,
        durationMs: 2500,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Recipe save failed",
        description: "Please check the recipe fields and try again.",
        durationMs: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUseRecipe = (recipe: CoffeeRecipe) => {
    const profileRef = getRecipeProfileRef(recipe, coffee);
    if (!profileRef) {
      toast({
        title: "Recipe needs a profile",
        description:
          "Choose a preferred profile for this coffee or save one on the recipe before brewing.",
        durationMs: 3000,
      });
      return;
    }

    onBrewRecipe(
      buildBrewHref(profileRef, {
        coffeeId: coffee.id,
        recipeId: recipe.id,
      }),
    );
  };

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-lg font-semibold">Recipe book</h3>
          <p className="text-sm text-muted-foreground">
            Save repeatable brews per bean and launch directly into the brew page.
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">New recipe</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New recipe</DialogTitle>
              <DialogDescription>
                Save a repeatable recipe for this bean with dose, yield, grind, temperature, and profile.
              </DialogDescription>
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
                  onChange={(event) => handleChange("yieldGrams", event.target.value)}
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
                  onChange={(event) => handleChange("waterTempC", event.target.value)}
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
              <div className="md:col-span-2 flex justify-end">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save recipe"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {coffee.recipes.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          No saved recipes yet for this coffee.
        </div>
      ) : (
        <div className="relative">
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
            {coffee.recipes.map((recipe) => (
              <div
                key={recipe.id}
                className="w-[320px] shrink-0 rounded-xl border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{recipe.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {getBrewMethodLabel(recipe.brewMethod)}
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-xs">
                    {recipe.profileNameSnapshot ??
                      coffee.preferredProfileName ??
                      "No profile"}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <span>Dose</span>
                    <span className="text-right text-foreground">
                      {formatMetric(recipe.doseGrams, "g")}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Yield</span>
                    <span className="text-right text-foreground">
                      {formatMetric(recipe.yieldGrams, "g")}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Ratio</span>
                    <span className="text-right text-foreground">
                      {formatBrewRatio(
                        recipe.brewRatio,
                        recipe.doseGrams,
                        recipe.yieldGrams,
                      ) ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Grind</span>
                    <span className="text-right text-foreground">
                      {recipe.grindSetting ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Temp</span>
                    <span className="text-right text-foreground">
                      {formatMetric(recipe.waterTempC, "C")}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 border-t pt-2">
                    <span>Time</span>
                    <span className="text-right text-foreground">
                      {formatSeconds(recipe.brewTimeSeconds)}
                    </span>
                  </div>
                </div>

                {recipe.tastingNotes && (
                  <p className="mt-4 line-clamp-3 text-sm text-muted-foreground">
                    {recipe.tastingNotes}
                  </p>
                )}

                <button
                  type="button"
                  className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                  onClick={() => handleUseRecipe(recipe)}
                >
                  Brew this recipe
                </button>
              </div>
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
      )}
    </div>
  );
}
