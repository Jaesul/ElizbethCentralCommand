"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { PhaseProfileGraph } from "~/components/PhaseProfileGraph";
import { LiveTelemetryChart } from "~/components/LiveTelemetryChart";
import { useFlowProfilingWebSocket } from "~/hooks/useFlowProfilingWebSocket";
import { useFlowShotHistory } from "~/hooks/useFlowShotHistory";
import { normalizeProfileForGraph } from "~/lib/profileUtils";
import { PROFILE_COLORS } from "~/lib/profileColors";
import type { PhaseProfile } from "~/types/profiles";

const getFlowWebSocketUrl = () => {
  const customUrl = process.env.NEXT_PUBLIC_FLOW_WS_URL;
  if (customUrl) return customUrl;
  return "ws://shotstopper-ws.local:81";
};

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
  const [flowWsUrl, setFlowWsUrl] = useState("");

  useEffect(() => {
    setFlowWsUrl(getFlowWebSocketUrl());
  }, []);

  const {
    isConnected: flowConnected,
    deviceProfiles: flowDeviceProfiles,
    sensor: flowSensor,
    shot: flowShot,
    sendRaw: flowSendRaw,
    sendCommand: flowSendCommand,
  } = useFlowProfilingWebSocket({
    url: flowWsUrl,
    reconnectInterval: 5000,
    reconnectOnClose: true,
    maxLogs: 200,
    requestProfileOnConnect: true,
  });

  const { points: livePoints, phaseMarkers } = useFlowShotHistory(flowSensor, flowShot);

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
        name: slot.name || raw.name || `Slot ${slot.index}`,
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
  }, [slotIndex, flowSendRaw, flowConnected]);

  const handleBrew = useCallback(() => {
    flowSendCommand("GO");
  }, [flowSendCommand]);

  const [stopClickedOptimistic, setStopClickedOptimistic] = useState(false);

  const handleStop = useCallback(() => {
    flowSendCommand("STOP");
    setStopClickedOptimistic(true);
  }, [flowSendCommand]);

  useEffect(() => {
    if (flowSensor?.brewActive === false) setStopClickedOptimistic(false);
  }, [flowSensor?.brewActive]);

  const isBrewing = !stopClickedOptimistic && (flowSensor?.brewActive ?? false);

  const pressure = flowShot?.pressure ?? flowSensor?.pressure;
  const pumpFlow = flowShot?.pumpFlow ?? flowSensor?.pumpFlow;
  const weightFlow = flowShot?.weightFlow ?? flowSensor?.weightFlow;
  const weight = flowShot?.shotWeight ?? flowSensor?.weight;

  if (!profile) {
    return (
      <div className="container mx-auto max-w-6xl px-4 py-8">
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
    <div className="container mx-auto max-w-7xl px-4 py-8 min-h-screen">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Button variant="ghost" onClick={() => router.push("/")} className="cursor-pointer">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold truncate">{profile.name}</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSetAsDefault} disabled={!flowConnected} className="cursor-pointer">
            Set as default
          </Button>
          <Button onClick={handleBrew} disabled={!flowConnected || isBrewing} className="cursor-pointer">
            Brew
          </Button>
          <Button
            variant="destructive"
            onClick={handleStop}
            disabled={!flowConnected || !isBrewing}
            className="cursor-pointer"
          >
            Stop
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3">
          <Card>
            <CardContent className="pt-4">
              <h2 className="text-sm font-semibold mb-3">Live metrics</h2>
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
              </div>
            </CardContent>
          </Card>
          {!flowConnected && (
            <p className="text-xs text-muted-foreground">
              Connect to device to see live data and brew.
            </p>
          )}
        </aside>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Profile</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <PhaseProfileGraph profile={profile} height={380} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Live telemetry</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <LiveTelemetryChart
                points={livePoints}
                phaseMarkers={phaseMarkers}
                height={360}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
