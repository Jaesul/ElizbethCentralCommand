"use client";

import { useMemo, useState } from "react";

import { BeanPounderFistLogo } from "~/components/BeanPounderLogo";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { useToast } from "~/components/ui/use-toast";
import { toDateTimeLocalValue } from "~/lib/coffeeUtils";
import type { CoffeeDetail } from "~/types/coffee";

const inputClassName =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary";

interface CoffeeBagActionDialogProps {
  coffee: CoffeeDetail;
  onUpdated: (coffee: CoffeeDetail) => void;
}

function getDefaultActionDate() {
  return toDateTimeLocalValue(new Date().toISOString());
}

export function CoffeeBagActionDialog({
  coffee,
  onUpdated,
}: CoffeeBagActionDialogProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [actionDate, setActionDate] = useState(getDefaultActionDate);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const mode = coffee.rotationStatus === "active" ? "finish" : "open";
  const dialogTitle = mode === "finish" ? "Mark bag as pounded" : "Open new bag";
  const dialogDescription = useMemo(() => {
    if (mode === "finish") {
      return `Are you sure you want to mark the current bag of ${coffee.name} as pounded? You can reopen it later by starting a new bag.`;
    }

    return `Open a fresh bag for ${coffee.name} and add it back into pounding.`;
  }, [coffee.name, mode]);

  const handleOpenChange = (nextOpen: boolean) => {
    setIsOpen(nextOpen);
    if (nextOpen) {
      setActionDate(getDefaultActionDate());
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const isoDate = new Date(actionDate).toISOString();
      const response = await fetch(`/api/coffees/${coffee.id}/bag`, {
        method: mode === "finish" ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          mode === "finish"
            ? { finishedAt: isoDate }
            : { openedAt: isoDate },
        ),
      });

      const payload = (await response.json()) as CoffeeDetail | { error?: string };
      if (!response.ok || !("id" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : mode === "finish"
              ? "Unable to finish bag"
              : "Unable to open new bag",
        );
      }

      onUpdated(payload);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("coffee-saved"));
      }

      toast({
        title: mode === "finish" ? "Bag pounded" : "New bag opened",
        description:
          mode === "finish"
            ? `${coffee.name} has been marked as pounded.`
            : `${coffee.name} is back to pounding.`,
        durationMs: 2500,
      });
      setIsOpen(false);
    } catch (error) {
      console.error(error);
      toast({
        title: mode === "finish" ? "Pound bag failed" : "Open bag failed",
        description:
          error instanceof Error
            ? error.message
            : "Please try again in a moment.",
        durationMs: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={mode === "finish" ? "outline" : "default"}>
          {mode === "finish" ? (
            <>
              <BeanPounderFistLogo className="h-4 w-4" aria-hidden />
              Mark bag as pounded
            </>
          ) : (
            "Open new bag"
          )}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <label className="grid gap-1 text-sm">
          <span>{mode === "finish" ? "Pounded at" : "Opened at"}</span>
          <input
            className={inputClassName}
            type="datetime-local"
            value={actionDate}
            onChange={(event) => setActionDate(event.target.value)}
          />
        </label>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsOpen(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting
              ? mode === "finish"
                ? "Pounding..."
                : "Opening..."
              : mode === "finish"
                ? "Confirm pounded"
                : "Confirm new bag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
