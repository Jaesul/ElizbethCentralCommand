"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { SelectionDropdown } from "~/components/ui/selection-dropdown";
import { useToast } from "~/components/ui/use-toast";
import {
  buildBrewHref,
  formatBrewRatio,
  formatDateTimeNoSeconds,
  formatMetric,
  getBrewMethodLabel,
  getLedgerProfileRef,
} from "~/lib/coffeeUtils";
import { BREW_METHODS, type BrewLedgerEntry, type CoffeeDetail } from "~/types/coffee";

interface CoffeeLedgerTableProps {
  coffee: CoffeeDetail;
  onRebrew: (href: string) => void;
  onLedgerConverted: () => void;
}

export function CoffeeLedgerTable({
  coffee,
  onRebrew,
  onLedgerConverted,
}: CoffeeLedgerTableProps) {
  const { toast } = useToast();
  const [convertingId, setConvertingId] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<BrewLedgerEntry | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    brewedAt: "",
    brewMethod: "espresso",
    doseGrams: "",
    yieldGrams: "",
    brewRatio: "",
    grindSetting: "",
    waterTempC: "",
    brewTimeSeconds: "",
    grinder: "",
    rating: "",
    waterRecipe: "",
    tastingNotes: "",
    notes: "",
  });

  const brewMethodOptions = BREW_METHODS.map((method) => ({
    value: method,
    label: getBrewMethodLabel(method),
  }));

  const syncEditForm = (entry: BrewLedgerEntry) => {
    setEditForm({
      brewedAt: entry.brewedAt.slice(0, 10),
      brewMethod: entry.brewMethod,
      doseGrams: entry.doseGrams?.toString() ?? "",
      yieldGrams: entry.yieldGrams?.toString() ?? "",
      brewRatio: entry.brewRatio?.toString() ?? "",
      grindSetting: entry.grindSetting ?? "",
      waterTempC: entry.waterTempC?.toString() ?? "",
      brewTimeSeconds: entry.brewTimeSeconds?.toString() ?? "",
      grinder: entry.grinder ?? "",
      rating: entry.rating?.toString() ?? "",
      waterRecipe: entry.waterRecipe ?? "",
      tastingNotes: entry.tastingNotes ?? "",
      notes: entry.notes ?? "",
    });
  };

  const handleOpenEntry = (entry: BrewLedgerEntry) => {
    setSelectedEntry(entry);
    syncEditForm(entry);
  };

  const handleConvert = async (ledgerEntryId: number) => {
    setConvertingId(ledgerEntryId);
    try {
      const response = await fetch(
        `/api/ledger/${ledgerEntryId}/convert-to-recipe`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );

      if (!response.ok) {
        throw new Error("Convert failed");
      }

      onLedgerConverted();
      toast({
        title: "Recipe created",
        description: "The ledger brew is now available in the recipe book.",
        durationMs: 2500,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Convert failed",
        description: "The ledger entry could not be turned into a recipe.",
        durationMs: 3000,
      });
    } finally {
      setConvertingId(null);
    }
  };

  const handleRebrew = (ledgerEntryId: number, profileRef: string | null) => {
    if (!profileRef) {
      toast({
        title: "No profile attached",
        description:
          "Choose a preferred profile for this bean before using rebrew.",
        durationMs: 3000,
      });
      return;
    }

    onRebrew(
      buildBrewHref(profileRef, {
        coffeeId: coffee.id,
        ledgerEntryId,
      }),
    );
  };

  const handleEditField = (key: keyof typeof editForm, value: string) => {
    setEditForm((current) => ({ ...current, [key]: value }));
  };

  const buildEditPayload = () => ({
    brewedAt: editForm.brewedAt || undefined,
    brewMethod: editForm.brewMethod,
    doseGrams: editForm.doseGrams || null,
    yieldGrams: editForm.yieldGrams || null,
    brewRatio: editForm.brewRatio || null,
    grindSetting: editForm.grindSetting || null,
    waterTempC: editForm.waterTempC || null,
    brewTimeSeconds: editForm.brewTimeSeconds || null,
    grinder: editForm.grinder || null,
    rating: editForm.rating || null,
    waterRecipe: editForm.waterRecipe || null,
    tastingNotes: editForm.tastingNotes || null,
    notes: editForm.notes || null,
  });

  const handleSaveEdit = async () => {
    if (!selectedEntry) return;

    setIsSavingEdit(true);
    try {
      const response = await fetch(`/api/ledger/${selectedEntry.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildEditPayload()),
      });

      if (!response.ok) {
        throw new Error("Ledger update failed");
      }

      const updated = (await response.json()) as BrewLedgerEntry;
      setSelectedEntry(updated);
      syncEditForm(updated);
      onLedgerConverted();
      toast({
        title: "Ledger entry updated",
        description: "The brew ledger details were saved.",
        durationMs: 2500,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Update failed",
        description: "The ledger entry could not be updated.",
        durationMs: 3000,
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-lg font-semibold">Brew ledger</h3>
        <p className="text-sm text-muted-foreground">
          Historical brews for this bean. Rebrew a prior shot or promote it into a recipe.
        </p>
      </div>

      {coffee.ledgerEntries.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          No ledger entries yet. Save a brew from the brew page to start tracking this coffee.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Method</th>
                <th className="px-3 py-2 font-medium">Dose</th>
                <th className="px-3 py-2 font-medium">Yield</th>
                <th className="px-3 py-2 font-medium">Ratio</th>
                <th className="px-3 py-2 font-medium">Grind</th>
                <th className="px-3 py-2 font-medium">Profile</th>
                <th className="px-3 py-2 font-medium">Tasting notes</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {coffee.ledgerEntries.map((entry) => {
                const profileRef = getLedgerProfileRef(entry, coffee);
                return (
                  <tr
                    key={entry.id}
                    className="border-t align-top transition hover:bg-muted/30"
                  >
                    <td
                      className="cursor-pointer px-3 py-3 whitespace-nowrap"
                      onClick={() => handleOpenEntry(entry)}
                    >
                      {formatDateTimeNoSeconds(entry.brewedAt)}
                    </td>
                    <td
                      className="cursor-pointer px-3 py-3 whitespace-nowrap"
                      onClick={() => handleOpenEntry(entry)}
                    >
                      {getBrewMethodLabel(entry.brewMethod)}
                    </td>
                    <td
                      className="cursor-pointer px-3 py-3 whitespace-nowrap"
                      onClick={() => handleOpenEntry(entry)}
                    >
                      {formatMetric(entry.doseGrams, "g")}
                    </td>
                    <td
                      className="cursor-pointer px-3 py-3 whitespace-nowrap"
                      onClick={() => handleOpenEntry(entry)}
                    >
                      {formatMetric(entry.yieldGrams, "g")}
                    </td>
                    <td
                      className="cursor-pointer px-3 py-3 whitespace-nowrap"
                      onClick={() => handleOpenEntry(entry)}
                    >
                      {formatBrewRatio(
                        entry.brewRatio,
                        entry.doseGrams,
                        entry.yieldGrams,
                      ) ?? "—"}
                    </td>
                    <td
                      className="cursor-pointer px-3 py-3 whitespace-nowrap"
                      onClick={() => handleOpenEntry(entry)}
                    >
                      {entry.grindSetting ?? "—"}
                    </td>
                    <td
                      className="cursor-pointer px-3 py-3 whitespace-nowrap"
                      onClick={() => handleOpenEntry(entry)}
                    >
                      {entry.profileNameSnapshot ??
                        coffee.preferredProfileName ??
                        "—"}
                    </td>
                    <td
                      className="max-w-xs cursor-pointer px-3 py-3"
                      onClick={() => handleOpenEntry(entry)}
                    >
                      <div className="space-y-1">
                        <div>{entry.tastingNotes ?? "—"}</div>
                        {(entry.waterTempC != null ||
                          entry.rating != null ||
                          entry.waterRecipe) && (
                          <div className="text-xs text-muted-foreground">
                            {entry.waterTempC != null
                              ? `${entry.waterTempC.toFixed(1)} C`
                              : null}
                            {entry.waterTempC != null &&
                            entry.rating != null
                              ? " · "
                              : null}
                            {entry.rating != null
                              ? `Rating ${entry.rating}/10`
                              : null}
                            {(entry.waterTempC != null ||
                              entry.rating != null) &&
                            entry.waterRecipe
                              ? " · "
                              : null}
                            {entry.waterRecipe ?? null}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-40 flex-col gap-2">
                        <button
                          type="button"
                          className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                          onClick={() => handleRebrew(entry.id, profileRef)}
                        >
                          Rebrew
                        </button>
                        <button
                          type="button"
                          className="rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-muted"
                          onClick={() => handleConvert(entry.id)}
                          disabled={convertingId === entry.id}
                        >
                          {convertingId === entry.id
                            ? "Converting..."
                            : "Convert to recipe"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={selectedEntry != null}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Brew ledger entry</DialogTitle>
            <DialogDescription>
              Review the full brew details and update them if needed.
            </DialogDescription>
          </DialogHeader>

          {selectedEntry && (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-1 text-sm">
                  <span>Brewed at</span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    type="date"
                    value={editForm.brewedAt}
                    onChange={(event) =>
                      handleEditField("brewedAt", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Method</span>
                  <SelectionDropdown
                    value={editForm.brewMethod}
                    placeholder="Select method"
                    options={brewMethodOptions}
                    onChange={(value) => handleEditField("brewMethod", value)}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Dose (g)</span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    value={editForm.doseGrams}
                    onChange={(event) =>
                      handleEditField("doseGrams", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Yield (g)</span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    value={editForm.yieldGrams}
                    onChange={(event) =>
                      handleEditField("yieldGrams", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Ratio</span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    value={editForm.brewRatio}
                    onChange={(event) =>
                      handleEditField("brewRatio", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Grind setting</span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    value={editForm.grindSetting}
                    onChange={(event) =>
                      handleEditField("grindSetting", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Water temp (C)</span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    value={editForm.waterTempC}
                    onChange={(event) =>
                      handleEditField("waterTempC", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Brew time (s)</span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    value={editForm.brewTimeSeconds}
                    onChange={(event) =>
                      handleEditField("brewTimeSeconds", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Grinder</span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    value={editForm.grinder}
                    onChange={(event) =>
                      handleEditField("grinder", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Water recipe</span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    value={editForm.waterRecipe}
                    onChange={(event) =>
                      handleEditField("waterRecipe", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Rating</span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    value={editForm.rating}
                    onChange={(event) =>
                      handleEditField("rating", event.target.value)
                    }
                  />
                </label>
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  <div className="text-muted-foreground">Profile</div>
                  <div className="font-medium">
                    {selectedEntry.profileNameSnapshot ??
                      coffee.preferredProfileName ??
                      "—"}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span>Tasting notes</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    value={editForm.tastingNotes}
                    onChange={(event) =>
                      handleEditField("tastingNotes", event.target.value)
                    }
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span>Notes</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    value={editForm.notes}
                    onChange={(event) =>
                      handleEditField("notes", event.target.value)
                    }
                  />
                </label>
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedEntry(null)}
              className="cursor-pointer"
            >
              Close
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={isSavingEdit || selectedEntry == null}
              className="cursor-pointer"
            >
              {isSavingEdit ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
