"use client";

import { useRef, useState } from "react";

import { CoffeeRecipeFormDialog } from "~/components/CoffeeRecipeFormDialog";
import { LedgerShotSparkline } from "~/components/LedgerShotSparkline";
import { LiveTelemetryChart } from "~/components/LiveTelemetryChart";
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
  formatSeconds,
  getBrewMethodLabel,
  getLedgerProfileRef,
  toDateTimeLocalValue,
} from "~/lib/coffeeUtils";
import type { PhaseProfile } from "~/types/profiles";
import { BREW_METHODS, type BrewLedgerEntry, type CoffeeDetail } from "~/types/coffee";

interface CoffeeLedgerTableProps {
  coffee: CoffeeDetail;
  availableProfiles: PhaseProfile[];
  entries: BrewLedgerEntry[];
  filterFrom: string;
  filterTo: string;
  sortOrder: "desc" | "asc";
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  onFilterFromChange: (value: string) => void;
  onFilterToChange: (value: string) => void;
  onSortOrderChange: (value: "desc" | "asc") => void;
  onLoadMore: () => void;
  onRebrew: (href: string) => void;
  onLedgerConverted: () => void;
}

export function CoffeeLedgerTable({
  coffee,
  availableProfiles,
  entries,
  filterFrom,
  filterTo,
  sortOrder,
  hasMore,
  isLoading,
  isLoadingMore,
  onFilterFromChange,
  onFilterToChange,
  onSortOrderChange,
  onLoadMore,
  onRebrew,
  onLedgerConverted,
}: CoffeeLedgerTableProps) {
  const { toast } = useToast();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const maxFilterDate = new Date().toISOString().slice(0, 10);
  const [ledgerConvertSource, setLedgerConvertSource] =
    useState<BrewLedgerEntry | null>(null);
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

  const handleLedgerScroll = () => {
    const root = scrollContainerRef.current;
    if (!root || !hasMore || isLoading || isLoadingMore) return;
    const remaining = root.scrollHeight - root.scrollTop - root.clientHeight;
    if (remaining <= 120) {
      onLoadMore();
    }
  };

  const syncEditForm = (entry: BrewLedgerEntry) => {
    setEditForm({
      brewedAt: toDateTimeLocalValue(entry.brewedAt),
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

  const hasDateFilters = filterFrom !== "" || filterTo !== "";

  const buildEditPayload = () => ({
    brewedAt: editForm.brewedAt
      ? new Date(editForm.brewedAt).toISOString()
      : undefined,
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
      <CoffeeRecipeFormDialog
        coffee={coffee}
        availableProfiles={availableProfiles}
        open={ledgerConvertSource != null}
        onOpenChange={(open) => {
          if (!open) setLedgerConvertSource(null);
        }}
        recipeToEdit={null}
        ledgerPrefill={ledgerConvertSource}
        onSuccess={() => {
          setLedgerConvertSource(null);
          onLedgerConverted();
        }}
      />

      <div className="border-b px-4 py-3">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">Brew ledger</h3>
            <p className="text-sm text-muted-foreground">
              Historical brews for this bean.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
            <label className="grid gap-1 text-sm">
              <span>From</span>
              <input
                type="date"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                max={maxFilterDate}
                value={filterFrom}
                onChange={(event) => onFilterFromChange(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>To</span>
              <input
                type="date"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                max={maxFilterDate}
                value={filterTo}
                onChange={(event) => onFilterToChange(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Sort</span>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                value={sortOrder}
                onChange={(event) =>
                  onSortOrderChange(event.target.value as "desc" | "asc")
                }
              >
                <option value="desc">Most recent to oldest</option>
                <option value="asc">Oldest to most recent</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onFilterFromChange("");
                  onFilterToChange("");
                }}
              >
                {hasDateFilters ? "Clear filters" : "All dates"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-6 text-sm text-muted-foreground">Loading brew ledger...</div>
      ) : entries.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">
          {filterFrom || filterTo
            ? "No brews match the selected date/time range."
            : "No ledger entries yet. Save a brew from the brew page to start tracking this coffee."}
        </div>
      ) : (
        <div className="space-y-4">
          <div
            ref={scrollContainerRef}
            className="h-[420px] overflow-y-auto overflow-x-hidden overscroll-y-contain [touch-action:pan-y] [-webkit-overflow-scrolling:touch]"
            onScroll={handleLedgerScroll}
          >
            <table className="w-full table-fixed text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="w-[15%] px-3 py-2 font-medium">When</th>
                  <th className="w-[18%] px-3 py-2 font-medium">Shot</th>
                  <th className="w-[10%] px-3 py-2 font-medium">Method</th>
                  <th className="w-[8%] px-3 py-2 font-medium">Dose</th>
                  <th className="w-[8%] px-3 py-2 font-medium">Yield</th>
                  <th className="w-[8%] px-3 py-2 font-medium">Ratio</th>
                  <th className="w-[8%] px-3 py-2 font-medium">Extract</th>
                  <th className="w-[11%] px-3 py-2 font-medium">Profile</th>
                  <th className="w-[8%] px-3 py-2 font-medium">Notes</th>
                  <th className="w-[14%] px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
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
                        className="cursor-pointer px-3 py-3"
                        onClick={() => handleOpenEntry(entry)}
                      >
                        <LedgerShotSparkline trace={entry.telemetryTrace} />
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
                        {formatSeconds(entry.brewTimeSeconds)}
                      </td>
                      <td
                        className="cursor-pointer px-3 py-3"
                        onClick={() => handleOpenEntry(entry)}
                      >
                        {entry.profileNameSnapshot ??
                          coffee.preferredProfileName ??
                          "—"}
                      </td>
                      <td
                        className="cursor-pointer px-3 py-3"
                        onClick={() => handleOpenEntry(entry)}
                      >
                        <div className="space-y-1 break-words">
                          <div className="line-clamp-3">{entry.tastingNotes ?? "—"}</div>
                          {(entry.grindSetting ||
                            entry.waterTempC != null ||
                            entry.rating != null ||
                            entry.waterRecipe) && (
                            <div className="line-clamp-2 break-words text-xs text-muted-foreground">
                              {entry.grindSetting ? `Grind ${entry.grindSetting}` : null}
                              {entry.grindSetting &&
                              (entry.waterTempC != null ||
                                entry.rating != null ||
                                entry.waterRecipe)
                                ? " · "
                                : null}
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
                              {(entry.grindSetting ||
                                entry.waterTempC != null ||
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
                        <div className="flex flex-col gap-2">
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
                            onClick={() => setLedgerConvertSource(entry)}
                          >
                            Convert to recipe
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div
              className="sticky bottom-0 border-t bg-card/95 px-4 py-3 backdrop-blur-sm"
            >
              {isLoadingMore ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-2.5 w-24 animate-pulse rounded-full bg-muted" />
                  <div className="h-2.5 w-16 animate-pulse rounded-full bg-muted" />
                  <div className="h-2.5 w-20 animate-pulse rounded-full bg-muted" />
                </div>
              ) : hasMore ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-2.5 w-24 animate-pulse rounded-full bg-muted/80" />
                  <span className="text-sm text-muted-foreground">
                    Scroll for more brews
                  </span>
                </div>
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  End of brew ledger
                </div>
              )}
            </div>
          </div>
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
              {selectedEntry.telemetryTrace ? (
                <LiveTelemetryChart
                  points={selectedEntry.telemetryTrace.points}
                  phaseMarkers={selectedEntry.telemetryTrace.phaseMarkers}
                  height={240}
                />
              ) : (
                <div className="flex items-center justify-center rounded-lg border border-dashed px-3 py-10 text-sm text-muted-foreground">
                  No telemetry trace was saved for this brew.
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-1 text-sm">
                  <span>Brewed at</span>
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary"
                    type="datetime-local"
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
