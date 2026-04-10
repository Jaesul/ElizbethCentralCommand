"use client";

import { useState, useEffect, useMemo, useCallback, useLayoutEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Edit, Hand, Loader2, Trash2 } from "lucide-react";
import { CoffeeImage } from "~/components/CoffeeImage";
import { useFlowConnection } from "~/components/FlowConnectionProvider";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { SelectionDropdown } from "~/components/ui/selection-dropdown";
import { PhaseProfileGraph } from "~/components/PhaseProfileGraph";
import { LiveTelemetryChart } from "~/components/LiveTelemetryChart";
import { useFlowShotHistory } from "~/hooks/useFlowShotHistory";
import { useToast } from "~/components/ui/use-toast";
import { PROFILE_COLORS } from "~/lib/profileColors";
import {
  buildBrewHref,
  calculateBrewRatio,
  formatBrewRatio,
  getBrewMethodLabel,
  toDateInputValue,
} from "~/lib/coffeeUtils";
import { calculatePhaseProfileDuration } from "~/lib/profileUtils";
import {
  getDeviceProfileById,
  getDeviceProfilesAsPhaseProfiles,
  getDeviceProfileSlotIndex,
} from "~/lib/deviceProfiles";
import {
  BREW_METHODS,
} from "~/types/coffee";
import type {
  BrewLedgerEntry,
  BrewMethod,
  CoffeeDetail,
  CoffeeRecipe,
  CoffeeSummary,
} from "~/types/coffee";
import type { PhaseProfile } from "~/types/profiles";

const LIVE_COLORS = {
  pressure: PROFILE_COLORS.pressure,
  pumpFlow: PROFILE_COLORS.flow,
  weight: "#16a34a",
  weightFlow: "#ca8a04",
};

const inputClassName =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary";

function MetricRow({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number | undefined;
  unit: string;
  color: string;
}) {
  const display =
    value != null && Number.isFinite(value) ? value.toFixed(2) : "—";
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">
        {display} {unit}
      </span>
    </div>
  );
}

export function ProfileBrewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const brewProfileId = searchParams.get("profileId")?.trim() || null;
  const initialCoffeeIdParam = searchParams.get("coffeeId");
  const initialCoffeeId = initialCoffeeIdParam
    ? Number.parseInt(initialCoffeeIdParam, 10)
    : Number.NaN;
  const hasInitialCoffeeId = Number.isFinite(initialCoffeeId);
  const hasInitialSearchContext =
    searchParams.get("coffeeId") != null ||
    searchParams.get("recipeId") != null ||
    searchParams.get("ledgerEntryId") != null;
  const [coffees, setCoffees] = useState<CoffeeSummary[]>([]);
  const [selectedCoffeeId, setSelectedCoffeeId] = useState<number | null>(
    hasInitialCoffeeId ? initialCoffeeId : null,
  );
  const [selectedCoffee, setSelectedCoffee] = useState<CoffeeDetail | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [isCoffeeDetailLoading, setIsCoffeeDetailLoading] = useState(
    hasInitialCoffeeId,
  );
  const [isApplyingSearchContext, setIsApplyingSearchContext] = useState(
    hasInitialSearchContext,
  );
  const [isSavingLedger, setIsSavingLedger] = useState(false);
  const [isLedgerDialogOpen, setIsLedgerDialogOpen] = useState(false);
  const [isPreparingLedgerDialog, setIsPreparingLedgerDialog] = useState(false);
  const [brewForm, setBrewForm] = useState({
    brewedAt: "",
    brewMethod: "espresso",
    doseGrams: "",
    yieldGrams: "",
    brewRatio: "",
    grindSetting: "",
    waterTempC: "",
    brewTimeSeconds: "",
    tastingNotes: "",
    notes: "",
    grinder: "",
    waterRecipe: "",
    rating: "",
  });

  const {
    isConnected: flowConnected,
    connectionState,
    lastMessageAgeMs,
    deviceProfiles: flowDeviceProfiles,
    sensor: flowSensor,
    shot: flowShot,
    logs: flowLogs,
    refreshStatus,
    sendRaw: flowSendRaw,
    sendCommand: flowSendCommand,
  } = useFlowConnection();

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const setBrewFormField = useCallback(
    (key: keyof typeof brewForm, value: string) => {
      setBrewForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const dismissMobileKeyboard = useCallback(() => {
    if (typeof document === "undefined") return;
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }, []);

  const isConnectionFresh = flowConnected && connectionState === "connected";
  const { points: livePoints, phaseMarkers } = useFlowShotHistory(
    flowSensor,
    flowShot,
    10000,
    isConnectionFresh,
  );

  const loadCoffees = useCallback(async () => {
    try {
      const response = await fetch("/api/coffees", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Coffee list fetch failed");
      }

      const data = (await response.json()) as CoffeeSummary[];
      setCoffees(data);
    } catch (error) {
      console.error(error);
      setCoffees([]);
    }
  }, []);

  const loadCoffeeDetail = useCallback(async (coffeeId: number) => {
    setIsCoffeeDetailLoading(true);
    try {
      const response = await fetch(`/api/coffees/${coffeeId}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Coffee detail fetch failed");
      }

      const data = (await response.json()) as CoffeeDetail;
      setSelectedCoffee(data);
      return data;
    } catch (error) {
      console.error(error);
      setSelectedCoffee(null);
      return null;
    } finally {
      setIsCoffeeDetailLoading(false);
    }
  }, []);

  const applyRecipeToForm = useCallback((recipe: CoffeeRecipe) => {
    setSelectedRecipeId(recipe.id);
    setBrewForm((current) => ({
      ...current,
      brewMethod: recipe.brewMethod,
      doseGrams: recipe.doseGrams?.toString() ?? "",
      yieldGrams: recipe.yieldGrams?.toString() ?? "",
      brewRatio: recipe.brewRatio?.toString() ?? "",
      grindSetting: recipe.grindSetting ?? "",
      waterTempC: recipe.waterTempC?.toString() ?? "",
      brewTimeSeconds: recipe.brewTimeSeconds?.toString() ?? "",
      tastingNotes: recipe.tastingNotes ?? current.tastingNotes,
      notes: recipe.notes ?? current.notes,
    }));
  }, []);

  const applyLedgerToForm = useCallback((entry: BrewLedgerEntry) => {
    setSelectedRecipeId(entry.recipeId ?? null);
    setBrewForm((current) => ({
      ...current,
      brewedAt: toDateInputValue(entry.brewedAt),
      brewMethod: entry.brewMethod,
      doseGrams: entry.doseGrams?.toString() ?? "",
      yieldGrams: entry.yieldGrams?.toString() ?? "",
      brewRatio: entry.brewRatio?.toString() ?? "",
      grindSetting: entry.grindSetting ?? "",
      waterTempC: entry.waterTempC?.toString() ?? "",
      brewTimeSeconds: entry.brewTimeSeconds?.toString() ?? "",
      tastingNotes: entry.tastingNotes ?? current.tastingNotes,
      notes: entry.notes ?? current.notes,
      grinder: entry.grinder ?? current.grinder,
      waterRecipe: entry.waterRecipe ?? current.waterRecipe,
      rating: entry.rating?.toString() ?? current.rating,
    }));
  }, []);

  useEffect(() => {
    void loadCoffees();
  }, [loadCoffees]);

  useEffect(() => {
    if (selectedCoffeeId == null) {
      setSelectedCoffee(null);
      setIsCoffeeDetailLoading(false);
      return;
    }

    setSelectedCoffee(null);
    void loadCoffeeDetail(selectedCoffeeId);
  }, [loadCoffeeDetail, selectedCoffeeId]);

  useEffect(() => {
    const coffeeIdParam = searchParams.get("coffeeId");
    const recipeIdParam = searchParams.get("recipeId");
    const ledgerEntryIdParam = searchParams.get("ledgerEntryId");

    const applySearchContext = async () => {
      setIsApplyingSearchContext(true);
      try {
        if (ledgerEntryIdParam) {
          const response = await fetch(`/api/ledger/${ledgerEntryIdParam}`, {
            cache: "no-store",
          });
          if (!response.ok) return;
          const entry = (await response.json()) as BrewLedgerEntry;
          setSelectedCoffeeId(entry.coffeeId);
          applyLedgerToForm(entry);
          return;
        }

        if (recipeIdParam) {
          const response = await fetch(`/api/recipes/${recipeIdParam}`, {
            cache: "no-store",
          });
          if (!response.ok) return;
          const recipe = (await response.json()) as CoffeeRecipe;
          setSelectedCoffeeId(recipe.coffeeId);
          applyRecipeToForm(recipe);
          return;
        }

        if (coffeeIdParam) {
          const parsedCoffeeId = Number.parseInt(coffeeIdParam, 10);
          if (Number.isFinite(parsedCoffeeId)) {
            setSelectedCoffeeId(parsedCoffeeId);
            setSelectedRecipeId(null);
          }
        }
      } finally {
        setIsApplyingSearchContext(false);
      }
    };

    void applySearchContext();
  }, [applyLedgerToForm, applyRecipeToForm, searchParams]);

  useEffect(() => {
    if (!selectedCoffee?.defaultBrewMethod || selectedRecipeId != null) return;

    setBrewForm((current) => {
      if (current.brewMethod && current.brewMethod !== "espresso") return current;
      return {
        ...current,
        brewMethod: selectedCoffee.defaultBrewMethod ?? current.brewMethod,
      };
    });
  }, [selectedCoffee?.defaultBrewMethod, selectedRecipeId]);

  const profile: PhaseProfile | null = useMemo(() => {
    if (brewProfileId == null) return null;
    return getDeviceProfileById(flowDeviceProfiles, brewProfileId);
  }, [flowDeviceProfiles, brewProfileId]);

  const slotIndex = useMemo(() => {
    if (brewProfileId == null) return null;
    return getDeviceProfileSlotIndex(brewProfileId);
  }, [brewProfileId]);

  const brewProfileSummary = useMemo(() => {
    if (profile == null) return null;
    const n = profile.phases.length;
    const dur = calculatePhaseProfileDuration(profile);
    const pressureCount = profile.phases.filter((p) => p.type === "PRESSURE").length;
    const flowCount = profile.phases.filter((p) => p.type === "FLOW").length;
    const g = profile.globalStopConditions;
    const stops: string[] = [];
    if (g.weight != null) stops.push(`weight ≤${g.weight}g`);
    if (g.time != null) stops.push(`time ≤${g.time}s`);
    if (g.waterPumped != null) stops.push(`water ≤${g.waterPumped}ml`);
    return {
      headline: `${n} phase${n === 1 ? "" : "es"} · ~${dur.toFixed(1)}s`,
      detail: `${pressureCount} pressure · ${flowCount} flow${
        stops.length > 0 ? ` · ${stops.join(" · ")}` : ""
      }`,
    };
  }, [profile]);

  const handleBrew = useCallback(() => {
    if (slotIndex == null) return;

    const startShot = () => {
      flowSendCommand("GO");
      setTimeout(() => flowSendRaw("PROFILES"), 300);
    };

    if (flowDeviceProfiles?.active === slotIndex) {
      startShot();
      return;
    }

    flowSendRaw(`SET_ACTIVE ${slotIndex}`);
    setTimeout(startShot, 150);
  }, [flowDeviceProfiles?.active, flowSendCommand, flowSendRaw, slotIndex]);

  const [brewState, setBrewState] = useState<"idle" | "starting" | "brewing" | "stopping">("idle");
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStop = useCallback(() => {
    flowSendCommand("STOP");
    setBrewState("stopping");
  }, [flowSendCommand]);

  useEffect(() => {
    if (connectionState !== "connected") {
      setBrewState("idle");
      return;
    }

    if (flowSensor?.brewActive === true) {
      setBrewState("brewing");
      return;
    }

    if (flowSensor?.brewActive === false) {
      setBrewState("idle");
    }
  }, [connectionState, flowSensor?.brewActive]);

  useEffect(() => {
    if (connectionState !== "connected") return;
    const lastLog = flowLogs.at(-1);
    if (lastLog?.includes("[shot] STOP")) {
      setBrewState("idle");
    }
  }, [connectionState, flowLogs]);

  useEffect(() => {
    refreshStatus(`brew-page:${brewProfileId ?? "none"}`);
  }, [brewProfileId, refreshStatus]);

  useEffect(() => {
    if (brewState !== "starting") {
      if (startTimeoutRef.current != null) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
      return;
    }

    startTimeoutRef.current = setTimeout(() => {
      setBrewState((current) => {
        if (current !== "starting") return current;
        refreshStatus("brew-start-timeout");
        toast({
          title: "Still waiting for brew confirmation",
          description: "Refreshing machine status because the ESP did not confirm the shot start.",
          durationMs: 2500,
        });
        return "idle";
      });
    }, 6000);

    return () => {
      if (startTimeoutRef.current != null) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }
    };
  }, [brewState, refreshStatus, toast]);

  const isBrewing = brewState !== "idle";

  const handleEditProfile = useCallback(() => {
    if (!profile) return;
    const initial = {
      id: profile.id,
      name: profile.name,
      phases: profile.phases,
      globalStopConditions: profile.globalStopConditions,
    };
    if (typeof window !== "undefined") {
      sessionStorage.setItem("elizbeth-profile-edit-initial", JSON.stringify(initial));
    }
    router.push("/profiles/new");
  }, [profile, router]);

  const measuredYield = flowShot?.shotWeight ?? flowSensor?.weight ?? null;
  const measuredBrewSeconds =
    flowShot?.timeInShot != null ? Math.round(flowShot.timeInShot / 1000) : null;

  const activeRecipe = useMemo(
    () =>
      selectedRecipeId != null
        ? selectedCoffee?.recipes.find((recipe) => recipe.id === selectedRecipeId) ?? null
        : null,
    [selectedCoffee, selectedRecipeId],
  );

  const coffeeOptions = useMemo(
    () =>
      coffees.map((coffee) => ({
        value: String(coffee.id),
        label: coffee.name,
      })),
    [coffees],
  );

  const recipeOptions = useMemo(
    () =>
      (selectedCoffee?.recipes ?? []).map((recipe) => ({
        value: String(recipe.id),
        label: recipe.name,
      })),
    [selectedCoffee?.recipes],
  );

  const deviceProfileOptions = useMemo(
    () =>
      getDeviceProfilesAsPhaseProfiles(flowDeviceProfiles).map((p) => ({
        value: p.id,
        label: p.name,
      })),
    [flowDeviceProfiles],
  );

  const pushBrewUrl = useCallback(
    (
      nextProfileId: string | null,
      query: { coffeeId?: number | null; recipeId?: number | null } = {},
    ) => {
      router.replace(
        buildBrewHref(nextProfileId, {
          coffeeId: query.coffeeId,
          recipeId: query.recipeId,
        }),
      );
    },
    [router],
  );

  const brewMethodOptions = useMemo(
    () =>
      BREW_METHODS.map((method) => ({
        value: method,
        label: getBrewMethodLabel(method),
      })),
    [],
  );

  const isCoffeeCardLoading =
    selectedCoffeeId != null && (isCoffeeDetailLoading || selectedCoffee == null);
  const isRecipeCardLoading =
    isCoffeeCardLoading ||
    (isApplyingSearchContext && selectedRecipeId == null) ||
    (selectedRecipeId != null && activeRecipe == null);

  const computedRatioLabel = formatBrewRatio(
    brewForm.brewRatio ? Number(brewForm.brewRatio) : null,
    brewForm.doseGrams ? Number(brewForm.doseGrams) : null,
    brewForm.yieldGrams ? Number(brewForm.yieldGrams) : measuredYield,
  );

  const primeLedgerFormDefaults = useCallback(() => {
    setBrewForm((current) => ({
      ...current,
      brewedAt:
        current.brewedAt ||
        new Date().toISOString().slice(0, 10),
      yieldGrams:
        measuredYield != null ? measuredYield.toFixed(1) : current.yieldGrams,
      brewTimeSeconds:
        measuredBrewSeconds != null
          ? String(measuredBrewSeconds)
          : current.brewTimeSeconds,
      brewRatio:
        measuredYield != null
          ? (calculateBrewRatio(
              current.doseGrams ? Number(current.doseGrams) : null,
              measuredYield,
            )?.toFixed(2) ?? current.brewRatio)
          : current.brewRatio,
    }));
  }, [measuredBrewSeconds, measuredYield]);

  const handleCoffeeSelect = useCallback(
    (coffeeIdValue: string) => {
      if (!coffeeIdValue) {
        setSelectedCoffeeId(null);
        setSelectedRecipeId(null);
        pushBrewUrl(brewProfileId, {});
        return;
      }

      const parsedCoffeeId = Number.parseInt(coffeeIdValue, 10);
      if (!Number.isFinite(parsedCoffeeId)) return;

      setSelectedCoffeeId(parsedCoffeeId);
      setSelectedRecipeId(null);
      pushBrewUrl(brewProfileId, { coffeeId: parsedCoffeeId });
    },
    [brewProfileId, pushBrewUrl],
  );

  const handleRecipeSelect = useCallback(
    (recipeIdValue: string) => {
      if (!selectedCoffee) return;
      if (!recipeIdValue) {
        setSelectedRecipeId(null);
        setBrewForm((current) => ({
          ...current,
          doseGrams: "",
          yieldGrams: "",
          brewRatio: "",
          grindSetting: "",
          waterTempC: "",
          brewTimeSeconds: "",
          tastingNotes: "",
          notes: "",
        }));
        pushBrewUrl(brewProfileId, { coffeeId: selectedCoffee.id });
        return;
      }

      const parsedRecipeId = Number.parseInt(recipeIdValue, 10);
      if (!Number.isFinite(parsedRecipeId)) return;

      const recipe = selectedCoffee.recipes.find((entry) => entry.id === parsedRecipeId);
      if (!recipe) return;
      applyRecipeToForm(recipe);
      pushBrewUrl(brewProfileId, {
        coffeeId: selectedCoffee.id,
        recipeId: parsedRecipeId,
      });
    },
    [applyRecipeToForm, brewProfileId, pushBrewUrl, selectedCoffee],
  );

  const handleClearCoffee = useCallback(() => {
    setSelectedCoffeeId(null);
    setSelectedCoffee(null);
    setSelectedRecipeId(null);
    pushBrewUrl(brewProfileId, {});
  }, [brewProfileId, pushBrewUrl]);

  const handleClearRecipe = useCallback(() => {
    setSelectedRecipeId(null);
    setBrewForm((current) => ({
      ...current,
      doseGrams: "",
      yieldGrams: "",
      brewRatio: "",
      grindSetting: "",
      waterTempC: "",
      brewTimeSeconds: "",
      tastingNotes: "",
      notes: "",
    }));
    pushBrewUrl(brewProfileId, { coffeeId: selectedCoffeeId });
  }, [brewProfileId, pushBrewUrl, selectedCoffeeId]);

  const handleClearProfile = useCallback(() => {
    pushBrewUrl(null, {
      coffeeId: selectedCoffeeId,
      recipeId: selectedRecipeId,
    });
  }, [pushBrewUrl, selectedCoffeeId, selectedRecipeId]);

  const handleProfileSelect = useCallback(
    (nextProfileIdValue: string) => {
      if (!nextProfileIdValue || nextProfileIdValue === brewProfileId) return;
      pushBrewUrl(nextProfileIdValue, {
        coffeeId: selectedCoffeeId,
        recipeId: selectedRecipeId,
      });
    },
    [brewProfileId, pushBrewUrl, selectedCoffeeId, selectedRecipeId],
  );

  const shotWasActiveRef = useRef(false);
  const ledgerDialogQueuedRef = useRef(false);
  const ledgerDialogTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queueLedgerDialog = useCallback(() => {
    if (ledgerDialogQueuedRef.current) return;

    ledgerDialogQueuedRef.current = true;
    shotWasActiveRef.current = false;
    primeLedgerFormDefaults();
    setIsPreparingLedgerDialog(true);

    if (ledgerDialogTimeoutRef.current != null) {
      clearTimeout(ledgerDialogTimeoutRef.current);
    }

    ledgerDialogTimeoutRef.current = setTimeout(() => {
      setIsPreparingLedgerDialog(false);
      setIsLedgerDialogOpen(true);
      ledgerDialogTimeoutRef.current = null;
    }, 500);
  }, [primeLedgerFormDefaults]);

  useEffect(() => {
    const shotIsActive =
      flowSensor?.brewActive === true ||
      brewState === "brewing" ||
      brewState === "stopping";

    if (shotIsActive) {
      shotWasActiveRef.current = true;
      ledgerDialogQueuedRef.current = false;
      return;
    }

    if (shotWasActiveRef.current) {
      queueLedgerDialog();
    }
  }, [brewState, flowSensor?.brewActive, queueLedgerDialog]);

  useEffect(() => {
    const lastLog = flowLogs.at(-1);
    if (!lastLog?.includes("[shot] STOP")) return;
    if (!shotWasActiveRef.current) return;

    queueLedgerDialog();
  }, [flowLogs, queueLedgerDialog]);

  useEffect(() => {
    return () => {
      if (ledgerDialogTimeoutRef.current != null) {
        clearTimeout(ledgerDialogTimeoutRef.current);
      }
    };
  }, []);

  const handleSaveLedger = useCallback(async () => {
    if (selectedCoffeeId == null) {
      toast({
        title: "Select a coffee first",
        description: "Choose the bean used for this brew before saving to the ledger.",
        durationMs: 3000,
      });
      return;
    }

    if (brewProfileId == null || profile == null) {
      toast({
        title: "Select a machine profile",
        description: "Choose a profile from the device before saving this brew to the ledger.",
        durationMs: 3000,
      });
      return;
    }

    setIsSavingLedger(true);
    try {
      const response = await fetch("/api/ledger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coffeeId: selectedCoffeeId,
          recipeId: selectedRecipeId,
          brewedAt: brewForm.brewedAt || new Date().toISOString(),
          brewMethod: brewForm.brewMethod,
          doseGrams: brewForm.doseGrams,
          yieldGrams: brewForm.yieldGrams || measuredYield,
          brewRatio:
            brewForm.brewRatio ||
            calculateBrewRatio(
              brewForm.doseGrams ? Number(brewForm.doseGrams) : null,
              brewForm.yieldGrams ? Number(brewForm.yieldGrams) : measuredYield,
            ),
          grindSetting: brewForm.grindSetting,
          waterTempC: brewForm.waterTempC,
          brewTimeSeconds: brewForm.brewTimeSeconds || measuredBrewSeconds,
          profileRef: brewProfileId,
          profileNameSnapshot: profile?.name ?? null,
          grinder: brewForm.grinder,
          rating: brewForm.rating,
          waterRecipe: brewForm.waterRecipe,
          tastingNotes: brewForm.tastingNotes,
          notes: brewForm.notes,
        }),
      });

      if (!response.ok) {
        throw new Error("Ledger save failed");
      }

      toast({
        title: "Saved to ledger",
        description:
          selectedCoffee?.name != null
            ? `This brew is now logged under ${selectedCoffee.name}.`
            : "This brew was added to the ledger.",
        durationMs: 2500,
      });
      setIsPreparingLedgerDialog(false);
      setIsLedgerDialogOpen(false);
    } catch (error) {
      console.error(error);
      toast({
        title: "Ledger save failed",
        description: "The brew could not be saved. Check the required fields and try again.",
        durationMs: 3000,
      });
    } finally {
      setIsSavingLedger(false);
    }
  }, [
    brewForm,
    measuredBrewSeconds,
    measuredYield,
    profile,
    brewProfileId,
    selectedCoffee?.name,
    selectedCoffeeId,
    selectedRecipeId,
    toast,
  ]);

  const pressure = flowShot?.pressure ?? flowSensor?.pressure;
  const pumpFlow = flowShot?.pumpFlow ?? flowSensor?.pumpFlow;
  const weightFlow = flowShot?.weightFlow ?? flowSensor?.weightFlow;
  const weight = flowShot?.shotWeight ?? flowSensor?.weight;
  const showTelemetryFirst = isBrewing && isConnectionFresh;
  const profileGraphHeight = showTelemetryFirst ? 168 : 188;
  const profileCardRef = useRef<HTMLDivElement | null>(null);
  const telemetryCardRef = useRef<HTMLDivElement | null>(null);
  const previousCardTopsRef = useRef<{ profile?: number; telemetry?: number }>({});

  useLayoutEffect(() => {
    const cards = [
      { key: "profile" as const, element: profileCardRef.current },
      { key: "telemetry" as const, element: telemetryCardRef.current },
    ];

    for (const { key, element } of cards) {
      if (!element) continue;
      const currentTop = element.getBoundingClientRect().top;
      const previousTop = previousCardTopsRef.current[key];

      if (previousTop != null) {
        const deltaY = previousTop - currentTop;
        if (Math.abs(deltaY) > 1) {
          element.style.position = "relative";
          element.style.zIndex = key === "telemetry" && showTelemetryFirst ? "2" : "1";

          const animation = element.animate(
            [
              {
                transform: `translateY(${deltaY}px) scale(0.985)`,
                opacity: 0.92,
              },
              {
                transform: "translateY(0) scale(1)",
                opacity: 1,
              },
            ],
            {
              duration: 380,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            }
          );

          animation.onfinish = () => {
            element.style.position = "";
            element.style.zIndex = "";
          };
        }
      }

      previousCardTopsRef.current[key] = currentTop;
    }
  }, [showTelemetryFirst]);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 min-h-screen xl:max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Button variant="ghost" onClick={handleBack} className="cursor-pointer">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setBrewState("starting");
              handleBrew();
            }}
            disabled={!isConnectionFresh || isBrewing || !profile}
            className="cursor-pointer"
          >
            {brewState === "starting" ? (
              "Starting..."
            ) : brewState === "brewing" ? (
              "Brewing"
            ) : brewState === "stopping" ? (
              "Stopping..."
            ) : (
              <>
                <Hand className="h-4 w-4" aria-hidden />
                Start Bean Pound
              </>
            )}
          </Button>
          <Button
            variant="destructive"
            onClick={handleStop}
            disabled={!isConnectionFresh || brewState !== "starting" && brewState !== "brewing"}
            className="cursor-pointer"
          >
            {brewState === "stopping" ? "Stopping..." : "Stop"}
          </Button>
        </div>
      </div>

      {isPreparingLedgerDialog && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border bg-background/80 p-4 backdrop-blur-sm">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <div>
            <p className="font-medium text-foreground">Brew completed</p>
            <p className="text-sm text-muted-foreground">
              Preparing this shot so it can be saved in the brew ledger.
            </p>
          </div>
        </div>
      )}

      <Dialog
        open={isLedgerDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            dismissMobileKeyboard();
          }
          setIsLedgerDialogOpen(open);
        }}
      >
        <DialogContent
          className="max-h-[85vh] overflow-y-auto"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
          onPointerDownOutside={() => {
            dismissMobileKeyboard();
          }}
          onEscapeKeyDown={() => {
            dismissMobileKeyboard();
          }}
        >
          <DialogHeader>
            <DialogTitle>Brew completed</DialogTitle>
            <DialogDescription>
              This shot is ready to be saved in the brew ledger. Review the details below and save it.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end sm:hidden">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={dismissMobileKeyboard}
              className="cursor-pointer"
            >
              Done typing
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1 text-sm">
              <span>Brewed at</span>
              <input
                className={inputClassName}
                type="date"
                value={brewForm.brewedAt}
                onChange={(event) => setBrewFormField("brewedAt", event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Method</span>
              <SelectionDropdown
                value={brewForm.brewMethod}
                placeholder="Select method"
                options={brewMethodOptions}
                onChange={(value) => setBrewFormField("brewMethod", value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Dose (g)</span>
              <input
                className={inputClassName}
                inputMode="decimal"
                value={brewForm.doseGrams}
                onChange={(event) => setBrewFormField("doseGrams", event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Yield (g)</span>
              <input
                className={inputClassName}
                inputMode="decimal"
                value={brewForm.yieldGrams}
                placeholder={measuredYield != null ? measuredYield.toFixed(1) : ""}
                onChange={(event) => setBrewFormField("yieldGrams", event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Ratio</span>
              <input
                className={inputClassName}
                inputMode="decimal"
                value={brewForm.brewRatio}
                placeholder={computedRatioLabel ?? ""}
                onChange={(event) => setBrewFormField("brewRatio", event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Grind setting</span>
              <input
                className={inputClassName}
                value={brewForm.grindSetting}
                onChange={(event) =>
                  setBrewFormField("grindSetting", event.target.value)
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Water temp (C)</span>
              <input
                className={inputClassName}
                inputMode="decimal"
                value={brewForm.waterTempC}
                onChange={(event) => setBrewFormField("waterTempC", event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Brew time (s)</span>
              <input
                className={inputClassName}
                inputMode="numeric"
                value={brewForm.brewTimeSeconds}
                placeholder={measuredBrewSeconds?.toString() ?? ""}
                onChange={(event) =>
                  setBrewFormField("brewTimeSeconds", event.target.value)
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Grinder</span>
              <input
                className={inputClassName}
                value={brewForm.grinder}
                onChange={(event) => setBrewFormField("grinder", event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Water recipe</span>
              <input
                className={inputClassName}
                value={brewForm.waterRecipe}
                onChange={(event) =>
                  setBrewFormField("waterRecipe", event.target.value)
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Rating (0-10)</span>
              <input
                className={inputClassName}
                inputMode="numeric"
                value={brewForm.rating}
                onChange={(event) => setBrewFormField("rating", event.target.value)}
              />
            </label>
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <div className="text-muted-foreground">Loaded profile</div>
              <div className="font-medium">
                {profile?.name ?? "Missing profile"}
              </div>
              <div className="mt-1 text-muted-foreground">
                {getBrewMethodLabel(brewForm.brewMethod as BrewMethod)}
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span>Tasting notes</span>
              <textarea
                className={`${inputClassName} min-h-24`}
                value={brewForm.tastingNotes}
                onChange={(event) =>
                  setBrewFormField("tastingNotes", event.target.value)
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span>Ledger notes</span>
              <textarea
                className={`${inputClassName} min-h-24`}
                value={brewForm.notes}
                onChange={(event) => setBrewFormField("notes", event.target.value)}
              />
            </label>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                dismissMobileKeyboard();
                setIsLedgerDialogOpen(false);
              }}
              className="cursor-pointer"
            >
              Close
            </Button>
            <Button
              onClick={() => {
                dismissMobileKeyboard();
                void handleSaveLedger();
              }}
              disabled={isSavingLedger || selectedCoffeeId == null || brewProfileId == null || profile == null}
              className="cursor-pointer"
            >
              {isSavingLedger ? "Saving..." : "Save to ledger"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col gap-6">
        <div
          className={
            showTelemetryFirst ? "order-2 will-change-transform" : "order-1 will-change-transform"
          }
        >
          <Card className="transition-all duration-300 ease-out">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Shot setup</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
                <div
                  ref={profileCardRef}
                  className="flex min-h-0 h-full min-w-0 flex-col rounded-lg border bg-muted/20 p-4 will-change-transform"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Profile
                      </div>
                      {profile ? (
                        <div className="mt-2 text-lg font-semibold text-foreground">{profile.name}</div>
                      ) : brewProfileId ? (
                        <div className="mt-2 text-lg font-semibold text-muted-foreground">
                          Not available on device
                        </div>
                      ) : (
                        <div className="mt-2 text-lg font-semibold text-muted-foreground">
                          No profile selected
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-start gap-0.5">
                      {profile != null && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditProfile();
                          }}
                          aria-label="Edit profile"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {brewProfileId != null && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearProfile();
                          }}
                          aria-label="Clear profile"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {deviceProfileOptions.length > 0 ? (
                    profile == null ? (
                      <div className="mb-3">
                        <SelectionDropdown
                          value={brewProfileId ?? ""}
                          placeholder="Machine profile"
                          options={deviceProfileOptions}
                          onChange={handleProfileSelect}
                          emptyMessage="No profiles on device"
                        />
                      </div>
                    ) : null
                  ) : (
                    <p className="mb-3 text-xs text-muted-foreground">
                      {flowConnected
                        ? "No profiles loaded on the device yet."
                        : "Connect to the device to load machine profiles."}
                    </p>
                  )}

                  {profile != null ? (
                    <div className="space-y-2">
                      <PhaseProfileGraph profile={profile} inline height={profileGraphHeight} />
                      {brewProfileSummary != null && (
                        <div className="space-y-0.5 border-t border-border/50 pt-2 text-xs leading-snug text-muted-foreground">
                          <p className="text-foreground/90">{brewProfileSummary.headline}</p>
                          <p>{brewProfileSummary.detail}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-center rounded-lg border border-dashed bg-muted/10 px-3 text-center text-sm text-muted-foreground"
                      style={{ minHeight: profileGraphHeight }}
                    >
                      Select a machine profile to preview the curve.
                    </div>
                  )}
                  <div className="min-h-0 min-w-0 flex-1" aria-hidden />
                </div>

                <div
                  className={`flex min-h-0 h-full min-w-0 flex-col rounded-lg border bg-muted/20 p-4${
                    selectedCoffee && !isCoffeeCardLoading
                      ? " cursor-pointer transition-colors hover:bg-muted/30"
                      : ""
                  }`}
                  onClick={
                    selectedCoffee && !isCoffeeCardLoading
                      ? () => router.push(`/coffees/${selectedCoffee.id}`)
                      : undefined
                  }
                  onKeyDown={
                    selectedCoffee && !isCoffeeCardLoading
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            router.push(`/coffees/${selectedCoffee.id}`);
                          }
                        }
                      : undefined
                  }
                  role={selectedCoffee && !isCoffeeCardLoading ? "link" : undefined}
                  tabIndex={selectedCoffee && !isCoffeeCardLoading ? 0 : undefined}
                  aria-label={
                    selectedCoffee && !isCoffeeCardLoading
                      ? `Open ${selectedCoffee.name} coffee page`
                      : undefined
                  }
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Bean
                      </div>
                      {isCoffeeCardLoading ? (
                        <Skeleton className="mt-2 h-7 w-40" />
                      ) : (
                        <div className="mt-2 text-lg font-semibold text-foreground">
                          {selectedCoffee?.name ?? "No bean selected"}
                        </div>
                      )}
                    </div>
                    {selectedCoffee && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClearCoffee();
                        }}
                        aria-label="Clear bean"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {isCoffeeCardLoading ? (
                    <div className="mb-3">
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ) : (
                    !selectedCoffee && (
                      <div className="mb-3" onClick={(e) => e.stopPropagation()}>
                        <SelectionDropdown
                          value={selectedCoffeeId != null ? String(selectedCoffeeId) : ""}
                          placeholder="No bean selected"
                          options={coffeeOptions}
                          onChange={handleCoffeeSelect}
                          emptyMessage="No coffees available"
                        />
                      </div>
                    )
                  )}

                  <div className="overflow-hidden rounded-lg border">
                    {isCoffeeCardLoading ? (
                      <Skeleton className="aspect-[4/3] w-full rounded-none" />
                    ) : (
                      <CoffeeImage
                        src={selectedCoffee?.imageUrl}
                        alt={selectedCoffee?.name ?? "No bean selected"}
                        className="aspect-[4/3] w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-h-0 min-w-0 flex-1" aria-hidden />
                </div>

                <div className="flex min-h-0 h-full min-w-0 flex-col rounded-lg border bg-muted/20 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Recipe
                      </div>
                      {isRecipeCardLoading ? (
                        <Skeleton className="mt-2 h-7 w-40" />
                      ) : (
                        <div className="mt-2 text-lg font-semibold text-foreground">
                          {activeRecipe?.name ?? "No recipe selected"}
                        </div>
                      )}
                    </div>
                    {activeRecipe && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={handleClearRecipe}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {isRecipeCardLoading ? (
                    <div className="mb-3">
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ) : (
                    !activeRecipe && (
                      <div
                        className="mb-3"
                        title={
                          !selectedCoffee
                            ? "Select a bean first to enable recipe selection."
                            : undefined
                        }
                      >
                        <SelectionDropdown
                          value={selectedRecipeId != null ? String(selectedRecipeId) : ""}
                          placeholder={
                            !selectedCoffee
                              ? "Select a bean first to enable recipe selection."
                              : "No recipe selected"
                          }
                          options={recipeOptions}
                          onChange={handleRecipeSelect}
                          disabled={!selectedCoffee || selectedCoffee.recipes.length === 0}
                          emptyMessage="No recipes available"
                        />
                        {!selectedCoffee && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Select a bean first to choose a recipe.
                          </p>
                        )}
                      </div>
                    )
                  )}

                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex justify-between gap-3">
                      <span>Dose</span>
                      <span className="text-foreground">
                        {brewForm.doseGrams ? `${brewForm.doseGrams} g` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Grind setting</span>
                      <span className="text-foreground">
                        {brewForm.grindSetting || "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Water temp</span>
                      <span className="text-foreground">
                        {brewForm.waterTempC ? `${brewForm.waterTempC} C` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Ratio</span>
                      <span className="text-foreground">
                        {computedRatioLabel ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Final amount</span>
                      <span className="text-foreground">
                        {brewForm.yieldGrams
                          ? `${brewForm.yieldGrams} g`
                          : measuredYield != null
                            ? `${measuredYield.toFixed(1)} g`
                            : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div
          ref={telemetryCardRef}
          className={showTelemetryFirst ? "order-1 will-change-transform" : "order-2 will-change-transform"}
        >
          <Card className={showTelemetryFirst ? "border-primary/40 shadow-md transition-all duration-300 ease-out" : "transition-all duration-300 ease-out"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Live telemetry</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <MetricRow
                    label="Pressure"
                    value={pressure}
                    unit="bar"
                    color={LIVE_COLORS.pressure}
                  />
                  <MetricRow
                    label="Pump flow"
                    value={pumpFlow}
                    unit="ml/s"
                    color={LIVE_COLORS.pumpFlow}
                  />
                  <MetricRow
                    label="Weight flow"
                    value={weightFlow}
                    unit="g/s"
                    color={LIVE_COLORS.weightFlow}
                  />
                  <MetricRow
                    label="Weight"
                    value={weight}
                    unit="g"
                    color={LIVE_COLORS.weight}
                  />
                  {!isConnectionFresh && (
                    <p className="pt-1 text-xs text-muted-foreground">
                      {connectionState === "stale"
                        ? `ESP data is stale${lastMessageAgeMs != null ? ` (${Math.round(lastMessageAgeMs / 1000)}s old)` : ""}. Reconnect or wait for refresh.`
                        : "Connect to device to see live data and brew."}
                    </p>
                  )}
                </div>
                <LiveTelemetryChart
                  points={livePoints}
                  phaseMarkers={phaseMarkers}
                  height={showTelemetryFirst ? 420 : 360}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
        <div>
          When the shot completes, the ledger form will open in a modal so you can save this brew.
        </div>
        <div className="flex gap-2">
          {selectedCoffee && (
            <Button
              variant="outline"
              onClick={() => router.push(`/coffees/${selectedCoffee.id}`)}
              className="cursor-pointer"
            >
              Open coffee page
            </Button>
          )}
          <Button
            onClick={() => {
              setIsPreparingLedgerDialog(false);
              primeLedgerFormDefaults();
              setIsLedgerDialogOpen(true);
            }}
            disabled={selectedCoffeeId == null}
            className="cursor-pointer"
          >
            Open ledger form
          </Button>
        </div>
      </div>
    </div>
  );
}
