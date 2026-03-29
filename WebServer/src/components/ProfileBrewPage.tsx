"use client";

import { useState, useEffect, useMemo, useCallback, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useFlowConnection } from "~/components/FlowConnectionProvider";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { PhaseProfileGraph } from "~/components/PhaseProfileGraph";
import { LiveTelemetryChart } from "~/components/LiveTelemetryChart";
import { useFlowShotHistory } from "~/hooks/useFlowShotHistory";
import { useToast } from "~/components/ui/use-toast";
import { normalizeProfileForGraph } from "~/lib/profileUtils";
import { PROFILE_COLORS } from "~/lib/profileColors";
import type { PhaseProfile } from "~/types/profiles";

const LIVE_COLORS = {
  pressure: PROFILE_COLORS.pressure,
  pumpFlow: PROFILE_COLORS.flow,
  weight: "#16a34a",
  weightFlow: "#ca8a04",
};

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

export function ProfileBrewPage({ profileId }: { profileId: string }) {
  const router = useRouter();
  const { toast } = useToast();

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

  const isConnectionFresh = flowConnected && connectionState === "connected";
  const { points: livePoints, phaseMarkers } = useFlowShotHistory(
    flowSensor,
    flowShot,
    10000,
    isConnectionFresh,
  );

  const profile: PhaseProfile | null = useMemo(() => {
    if (!flowDeviceProfiles?.slots?.length || !profileId) return null;
    const match = /^device-slot-(\d+)$/.exec(profileId);
    const slotIndex = match ? parseInt(match[1]!, 10) : null;
    if (slotIndex == null) return null;
    const slot = flowDeviceProfiles.slots.find((s) => s.index === slotIndex);
    if (!slot?.profile?.trim()) return null;
    try {
      const raw = JSON.parse(slot.profile) as Parameters<typeof normalizeProfileForGraph>[0];
      if (!raw?.phases?.length) return null;
      return normalizeProfileForGraph({
        ...raw,
        id: `device-slot-${slot.index}`,
        name: slot.name ?? raw.name ?? `Slot ${slot.index}`,
      });
    } catch {
      return null;
    }
  }, [flowDeviceProfiles, profileId]);

  const slotIndex = useMemo(() => {
    const match = /^device-slot-(\d+)$/.exec(profileId);
    return match ? parseInt(match[1]!, 10) : null;
  }, [profileId]);

  const handleSetAsDefault = useCallback(() => {
    if (slotIndex == null) return;
    const cmd = `SET_ACTIVE ${slotIndex}`;
    flowSendRaw(cmd);
    // Refetch profiles so UI shows updated active slot
    setTimeout(() => flowSendRaw("PROFILES"), 300);
    toast({
      title: "Default profile updated",
      description: `“${profile?.name ?? `Slot ${slotIndex}`}” was set as the default profile.`,
      durationMs: 2000,
    });
  }, [slotIndex, flowSendRaw, toast, profile?.name]);

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
    refreshStatus(`brew-page:${profileId}`);
  }, [profileId, refreshStatus]);

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

  const pressure = flowShot?.pressure ?? flowSensor?.pressure;
  const pumpFlow = flowShot?.pumpFlow ?? flowSensor?.pumpFlow;
  const weightFlow = flowShot?.weightFlow ?? flowSensor?.weightFlow;
  const weight = flowShot?.shotWeight ?? flowSensor?.weight;
  const showTelemetryFirst = isBrewing && isConnectionFresh;
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

  if (!profile) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8 xl:max-w-6xl">
        <Button variant="ghost" onClick={() => router.push("/")} className="mb-4 cursor-pointer">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            {!flowConnected ? (
              <p className="text-sm text-muted-foreground">
                Connect to device to see this profile.
              </p>
            ) : !flowDeviceProfiles ? (
              <p className="text-sm text-muted-foreground">
                Load profiles from the device (Send PROFILES).
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Profile not found. It may have been removed or the slot is empty.
              </p>
            )}
            <Button variant="outline" className="mt-4 cursor-pointer" onClick={() => router.push("/")}>
              Back to home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 min-h-screen xl:max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.push("/")} className="cursor-pointer">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold truncate">{profile.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleEditProfile} className="cursor-pointer">
            Edit
          </Button>
          <Button variant="outline" onClick={handleSetAsDefault} disabled={!isConnectionFresh} className="cursor-pointer">
            Set as default
          </Button>
          <Button onClick={() => {
            setBrewState("starting");
            handleBrew();
          }} disabled={!isConnectionFresh || isBrewing} className="cursor-pointer">
            {brewState === "starting" ? "Starting..." : brewState === "brewing" ? "Brewing" : brewState === "stopping" ? "Stopping..." : "Brew"}
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

      <div className="flex flex-col gap-6">
        <div
          ref={profileCardRef}
          className={showTelemetryFirst ? "order-2 will-change-transform" : "order-1 will-change-transform"}
        >
          <Card className="transition-all duration-300 ease-out">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Profile</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <PhaseProfileGraph profile={profile} height={showTelemetryFirst ? 320 : 380} />
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
    </div>
  );
}
