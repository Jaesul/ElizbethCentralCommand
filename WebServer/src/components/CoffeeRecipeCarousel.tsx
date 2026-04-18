"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";

import { CoffeeRecipeFormDialog } from "~/components/CoffeeRecipeFormDialog";
import { Button } from "~/components/ui/button";
import { useToast } from "~/components/ui/use-toast";
import {
  buildBrewHref,
  formatBrewRatio,
  formatMetric,
  formatSeconds,
  getBrewMethodLabel,
  getRecipeProfileRef,
} from "~/lib/coffeeUtils";
import type { PhaseProfile } from "~/types/profiles";
import type { CoffeeDetail, CoffeeRecipe } from "~/types/coffee";

interface CoffeeRecipeCarouselProps {
  coffee: CoffeeDetail;
  availableProfiles: PhaseProfile[];
  onRecipeCreated: () => void;
  onBrewRecipe: (href: string) => void;
}

export function CoffeeRecipeCarousel({
  coffee,
  availableProfiles,
  onRecipeCreated,
  onBrewRecipe,
}: CoffeeRecipeCarouselProps) {
  const { toast } = useToast();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<CoffeeRecipe | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const scroll = (direction: "left" | "right") => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollBy({
      left: direction === "left" ? -320 : 320,
      behavior: "smooth",
    });
  };

  const openNewRecipe = () => {
    setEditingRecipe(null);
    setDialogOpen(true);
  };

  const openEditRecipe = (recipe: CoffeeRecipe) => {
    setEditingRecipe(recipe);
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingRecipe(null);
  };

  const handleDeleteRecipe = async (recipe: CoffeeRecipe) => {
    if (
      !window.confirm(
        `Delete recipe “${recipe.name}”? This cannot be undone.`,
      )
    ) {
      return;
    }

    setDeletingId(recipe.id);
    try {
      const response = await fetch(`/api/recipes/${recipe.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Delete failed");
      }
      onRecipeCreated();
      toast({
        title: "Recipe deleted",
        description: `“${recipe.name}” was removed.`,
        durationMs: 2500,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Delete failed",
        description: "The recipe could not be removed.",
        durationMs: 3000,
      });
    } finally {
      setDeletingId(null);
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

  const profileOptionsEmpty = useMemo(
    () => availableProfiles.length === 0,
    [availableProfiles.length],
  );

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-lg font-semibold">Recipe book</h3>
          <p className="text-sm text-muted-foreground">
            Save repeatable brews per bean and launch directly into the brew page.
          </p>
        </div>
        <Button variant="outline" type="button" onClick={openNewRecipe}>
          New recipe
        </Button>
      </div>

      <CoffeeRecipeFormDialog
        coffee={coffee}
        availableProfiles={availableProfiles}
        open={dialogOpen}
        onOpenChange={handleDialogOpenChange}
        recipeToEdit={editingRecipe}
        ledgerPrefill={null}
        onSuccess={onRecipeCreated}
      />

      {coffee.recipes.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          No saved recipes yet for this coffee.
          {profileOptionsEmpty && (
            <span className="mt-2 block">
              Load machine profiles to attach a profile to new recipes.
            </span>
          )}
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
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-semibold">{recipe.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {getBrewMethodLabel(recipe.brewMethod)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-start gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 cursor-pointer"
                      onClick={() => openEditRecipe(recipe)}
                      aria-label={`Edit ${recipe.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 cursor-pointer text-destructive hover:text-destructive"
                      onClick={() => void handleDeleteRecipe(recipe)}
                      disabled={deletingId === recipe.id}
                      aria-label={`Delete ${recipe.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="mt-2">
                  <span className="inline-block rounded-full bg-muted px-2 py-1 text-xs">
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
