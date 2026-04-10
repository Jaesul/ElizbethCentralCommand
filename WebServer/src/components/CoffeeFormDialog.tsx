"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";

import { useFlowConnection } from "~/components/FlowConnectionProvider";
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
import { getDeviceProfilesAsPhaseProfiles } from "~/lib/deviceProfiles";
import {
  BREW_METHODS,
  ROAST_LEVELS,
  type CoffeeDetail,
} from "~/types/coffee";

interface CoffeeFormDialogProps {
  coffee?: CoffeeDetail;
  onSaved?: (coffee: CoffeeDetail) => void;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost";
  showIcon?: boolean;
}

const inputClassName =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary";

function buildInitialForm(coffee?: CoffeeDetail) {
  return {
    name: coffee?.name ?? "",
    imageUrl: coffee?.imageUrl ?? "",
    roaster: coffee?.roaster ?? "",
    origin: coffee?.origin ?? "",
    process: coffee?.process ?? "",
    roastLevel: coffee?.roastLevel ?? "",
    roastDate: coffee?.roastDate?.slice(0, 10) ?? "",
    purchaseDate: coffee?.purchaseDate?.slice(0, 10) ?? "",
    defaultBrewMethod: coffee?.defaultBrewMethod ?? "",
    preferredProfileRef: coffee?.preferredProfileRef ?? "",
    notes: coffee?.notes ?? "",
    tastingNotes: coffee?.tastingNotes ?? "",
  };
}

export function CoffeeFormDialog({
  coffee,
  onSaved,
  triggerLabel,
  triggerVariant = "outline",
  showIcon = true,
}: CoffeeFormDialogProps) {
  const { toast } = useToast();
  const { deviceProfiles, isConnected, sendRaw } = useFlowConnection();
  const isEditMode = coffee != null;
  const defaultLabel = isEditMode ? "Edit coffee" : "Add coffee";
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(buildInitialForm(coffee));

  const availableProfiles = useMemo(
    () => getDeviceProfilesAsPhaseProfiles(deviceProfiles),
    [deviceProfiles],
  );

  const preferredProfileOptions = useMemo(() => {
    const options = availableProfiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
    }));

    if (
      coffee?.preferredProfileRef &&
      !options.some((option) => option.id === coffee.preferredProfileRef)
    ) {
      options.unshift({
        id: coffee.preferredProfileRef,
        name: coffee.preferredProfileName ?? coffee.preferredProfileRef,
      });
    }

    return options;
  }, [availableProfiles, coffee?.preferredProfileName, coffee?.preferredProfileRef]);

  const roastLevelOptions = useMemo(
    () =>
      ROAST_LEVELS.map((option) => ({
        value: option,
        label: option,
      })),
    [],
  );

  const brewMethodOptions = useMemo(
    () =>
      BREW_METHODS.map((option) => ({
        value: option,
        label: option,
      })),
    [],
  );

  useEffect(() => {
    setForm(buildInitialForm(coffee));
  }, [coffee]);

  const dialogTitle = useMemo(
    () => (isEditMode ? "Edit coffee" : "Add coffee"),
    [isEditMode],
  );

  const dialogDescription = isEditMode
    ? "Update this bean's details, photo, and default settings."
    : "Create a bean entry so recipes and ledger brews can be tracked together.";

  const handleChange = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const selectedPreferredProfile =
        preferredProfileOptions.find(
          (option) => option.id === form.preferredProfileRef,
        ) ?? null;

      const response = await fetch(
        isEditMode ? `/api/coffees/${coffee.id}` : "/api/coffees",
        {
          method: isEditMode ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            ...form,
            preferredProfileName: selectedPreferredProfile?.name ?? "",
          }),
        },
      );

      if (!response.ok) {
        throw new Error(isEditMode ? "Unable to update coffee" : "Unable to create coffee");
      }

      const saved = (await response.json()) as CoffeeDetail;
      toast({
        title: isEditMode ? "Coffee updated" : "Coffee added",
        description: isEditMode
          ? `${saved.name} was updated successfully.`
          : `${saved.name} is now available on the home carousel.`,
        durationMs: 2500,
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("coffee-saved"));
      }
      setForm(buildInitialForm(saved));
      setIsOpen(false);
      onSaved?.(saved);
    } catch (error) {
      console.error(error);
      toast({
        title: isEditMode ? "Coffee update failed" : "Coffee add failed",
        description: "Please check the fields and try again.",
        durationMs: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant}>
          {showIcon ? (
            isEditMode ? (
              <Pencil className="mr-2 h-4 w-4" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )
          ) : null}
          {triggerLabel ?? defaultLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="grid gap-1 text-sm">
            <span>Bean name</span>
            <input
              className={inputClassName}
              required
              value={form.name}
              onChange={(event) => handleChange("name", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Photo URL</span>
            <input
              className={inputClassName}
              placeholder="https://..."
              value={form.imageUrl}
              onChange={(event) => handleChange("imageUrl", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Roaster</span>
            <input
              className={inputClassName}
              value={form.roaster}
              onChange={(event) => handleChange("roaster", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Origin</span>
            <input
              className={inputClassName}
              value={form.origin}
              onChange={(event) => handleChange("origin", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Process</span>
            <input
              className={inputClassName}
              value={form.process}
              onChange={(event) => handleChange("process", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Roast level</span>
            <SelectionDropdown
              value={form.roastLevel}
              placeholder="Not set"
              options={roastLevelOptions}
              onChange={(value) => handleChange("roastLevel", value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Default brew method</span>
            <SelectionDropdown
              value={form.defaultBrewMethod}
              placeholder="Not set"
              options={brewMethodOptions}
              onChange={(value) => handleChange("defaultBrewMethod", value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Preferred profile</span>
            <SelectionDropdown
              value={form.preferredProfileRef}
              placeholder="Not selected"
              options={preferredProfileOptions.map((option) => ({
                value: option.id,
                label: option.name,
              }))}
              onChange={(value) => handleChange("preferredProfileRef", value)}
              emptyMessage="No profiles available"
            />
            {isConnected && preferredProfileOptions.length === 0 ? (
              <button
                type="button"
                className="w-fit text-xs text-muted-foreground underline underline-offset-4"
                onClick={() => sendRaw("PROFILES")}
              >
                Load device profiles
              </button>
            ) : !isConnected ? (
              <span className="text-xs text-muted-foreground">
                Connect to the machine to pick a preferred profile.
              </span>
            ) : null}
          </label>
          <label className="grid gap-1 text-sm">
            <span>Roast date</span>
            <input
              className={inputClassName}
              type="date"
              value={form.roastDate}
              onChange={(event) => handleChange("roastDate", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span>Purchase date</span>
            <input
              className={inputClassName}
              type="date"
              value={form.purchaseDate}
              onChange={(event) => handleChange("purchaseDate", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Notes</span>
            <textarea
              className={`${inputClassName} min-h-24`}
              value={form.notes}
              onChange={(event) => handleChange("notes", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">
            <span>Tasting notes</span>
            <textarea
              className={`${inputClassName} min-h-24`}
              value={form.tastingNotes}
              onChange={(event) =>
                handleChange("tastingNotes", event.target.value)
              }
            />
          </label>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : isEditMode
                  ? "Save changes"
                  : "Create coffee"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
