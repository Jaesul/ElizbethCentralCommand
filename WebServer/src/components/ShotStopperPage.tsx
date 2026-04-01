"use client";

import { useEffect, useMemo, useState } from "react";
import { useFlowConnection } from "~/components/FlowConnectionProvider";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import type { UseFlowProfilingWebSocketReturn } from "~/hooks/useFlowProfilingWebSocket";
import { useTestingMode } from "~/hooks/useTestingMode";
import { useMockDataGenerator } from "~/lib/mockDataGenerator";
import type { ShotStopperData } from "~/types/shotstopper";
import { Button } from "~/components/ui/button";
import { useFlowShotHistory } from "~/hooks/useFlowShotHistory";
import { FlowShotChart } from "~/components/FlowShotChart";
import { PhaseProfileGraph } from "~/components/PhaseProfileGraph";
import { normalizeProfileForGraph } from "~/lib/profileUtils";
import type { PhaseProfile } from "~/types/profiles";

const FLOW_WS_URL = process.env.NEXT_PUBLIC_FLOW_WS_URL ?? "ws://shotstopper-ws.local:81";

export function ShotStopperPage({
  flowConnection: flowConnectionProp,
}: {
  flowConnection?: UseFlowProfilingWebSocketReturn;
} = {}) {
  const [mockData, setMockData] = useState<ShotStopperData | null>(null);
  const { isTestingMode, isLoaded: testingModeLoaded, setTestingMode } = useTestingMode();

  const flowFromContext = useFlowConnection();
  const {
    isConnected: flowConnected,
    connectionState: flowConnectionState,
    error: flowError,
    lastMessageAgeMs: flowLastMessageAgeMs,
    sensor: flowSensor,
    shot: flowShot,
    logs: flowLogs,
    rawJson: flowRawJson,
    deviceProfiles: flowDeviceProfiles,
    refreshStatus: flowRefreshStatus,
    sendCommand: flowSendCommand,
    sendRaw: flowSendRaw,
    reconnect: flowReconnect,
  } = flowConnectionProp ?? flowFromContext;

  const isFlowFresh = flowConnected && flowConnectionState === "connected";
  const { points: flowPoints, phaseMarkers: flowPhaseMarkers, isActive: flowShotActive } = useFlowShotHistory(
    flowSensor,
    flowShot,
    10000,
    isFlowFresh,
  );
  const [flowLogCopyStatus, setFlowLogCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [flowCsvCopyStatus, setFlowCsvCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const activeDeviceProfile: PhaseProfile | null = useMemo(() => {
    if (!flowDeviceProfiles?.slots?.length) return null;
    const activeSlot =
      flowDeviceProfiles.slots.find((slot) => slot.index === flowDeviceProfiles.active) ??
      flowDeviceProfiles.slots.find((slot) => slot.isActive) ??
      flowDeviceProfiles.slots[flowDeviceProfiles.active];
    if (!activeSlot?.profile) return null;
    try {
      const raw = JSON.parse(activeSlot.profile) as Parameters<typeof normalizeProfileForGraph>[0];
      if (!raw?.phases?.length) return null;
      return normalizeProfileForGraph({
        ...raw,
        id: `device-slot-${activeSlot.index}`,
        name: activeSlot.name ?? raw.name ?? `Slot ${activeSlot.index}`,
      });
    } catch {
      return null;
    }
  }, [flowDeviceProfiles]);

  useEffect(() => {
    if (!flowDeviceProfiles) return;
    const activeSlot =
      flowDeviceProfiles.slots.find((slot) => slot.index === flowDeviceProfiles.active) ??
      flowDeviceProfiles.slots.find((slot) => slot.isActive) ??
      flowDeviceProfiles.slots[flowDeviceProfiles.active];

    if (activeSlot) {
      console.log("[FlowProfiles] Active slot from ESP", {
        activeIndex: flowDeviceProfiles.active,
        slotIndex: activeSlot.index,
        slotName: activeSlot.name,
        normalizedName: activeDeviceProfile?.name,
      });
      try {
        if (activeSlot.profile?.trim()) {
          const raw: unknown = JSON.parse(activeSlot.profile);
          console.log("[FlowProfiles] rawSlotProfile", raw);
        }
      } catch (error) {
        console.warn("[FlowProfiles] Failed to parse active slot profile JSON", error);
      }
    } else {
      console.log("[FlowProfiles] No active slot resolved from PROFILES", {
        activeIndex: flowDeviceProfiles.active,
        slots: flowDeviceProfiles.slots,
      });
    }
  }, [flowDeviceProfiles, activeDeviceProfile?.name]);

  const { resetMockShot } = useMockDataGenerator({
    onData: setMockData,
    goalWeight: mockData?.goalWeight ?? 40,
  });

  useEffect(() => {
    if (isTestingMode) {
      resetMockShot();
    }
  }, [isTestingMode, resetMockShot]);

  const buildPressureCsv = () => {
    const header = "t_ms,pressure_bar,target_pressure_bar";
    const rows = flowPoints.map((point) => {
      const t = Number.isFinite(point.tMs) ? String(Math.round(point.tMs)) : "";
      const pressure =
        typeof point.pressure === "number" && Number.isFinite(point.pressure) ? point.pressure.toFixed(3) : "";
      const target =
        typeof point.targetPressure === "number" && Number.isFinite(point.targetPressure)
          ? point.targetPressure.toFixed(3)
          : "";
      return `${t},${pressure},${target}`;
    });
    return [header, ...rows].join("\n") + "\n";
  };

  const handleDownloadPressureCsv = () => {
    if (!flowPoints.length) return;
    const csv = buildPressureCsv();
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `flow_pressure_${ts}.csv`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleCopyPressureCsv = async () => {
    if (!flowPoints.length) return;
    try {
      const csv = buildPressureCsv();
      await navigator.clipboard.writeText(csv);
      setFlowCsvCopyStatus("copied");
      window.setTimeout(() => setFlowCsvCopyStatus("idle"), 1200);
    } catch {
      setFlowCsvCopyStatus("error");
      window.setTimeout(() => setFlowCsvCopyStatus("idle"), 1500);
    }
  };

  const handleCopyFlowLogs = async () => {
    try {
      const text = (flowLogs.length ? flowLogs.join("\n") : "[no logs yet]") + "\n";
      await navigator.clipboard.writeText(text);
      setFlowLogCopyStatus("copied");
      window.setTimeout(() => setFlowLogCopyStatus("idle"), 1200);
    } catch {
      setFlowLogCopyStatus("error");
      window.setTimeout(() => setFlowLogCopyStatus("idle"), 1500);
    }
  };

  const handleCopyFlowRawJson = async () => {
    try {
      const text = (flowRawJson.length ? flowRawJson.join("\n") : "[no shot JSON yet]") + "\n";
      await navigator.clipboard.writeText(text);
      setFlowLogCopyStatus("copied");
      window.setTimeout(() => setFlowLogCopyStatus("idle"), 1200);
    } catch {
      setFlowLogCopyStatus("error");
      window.setTimeout(() => setFlowLogCopyStatus("idle"), 1500);
    }
  };

  const handleStartShot = () => {
    if (isTestingMode) return;
    flowSendCommand("GO");
  };

  const handleStopShot = () => {
    if (isTestingMode) return;
    flowSendCommand("STOP");
  };

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 xl:max-w-6xl">
      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-4xl font-bold">Elizabeth Central Command</h1>
            <p className="text-muted-foreground">Real-time espresso shot monitoring from ESP32</p>
          </div>
          {testingModeLoaded && (
            <Card className="w-auto">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={isTestingMode}
                      onChange={(event) => setTestingMode(event.target.checked)}
                      className="h-4 w-4"
                    />
                    Testing Mode
                  </label>
                  <Badge variant={isTestingMode ? "default" : "secondary"}>
                    {isTestingMode ? "Simulated" : "Live"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {isTestingMode ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Testing Mode</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Live ESP traffic is disabled while testing mode is on.</p>
            <p>The shared flow connection remains available, but this page will not send machine commands.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Flow Profiling</span>
              <Badge variant={isFlowFresh ? "default" : flowConnectionState === "stale" ? "secondary" : "destructive"}>
                {flowConnectionState === "connected"
                  ? "Connected"
                  : flowConnectionState === "stale"
                    ? "Stale"
                    : flowConnectionState === "reconnecting"
                      ? "Reconnecting"
                      : flowConnectionState === "connecting"
                        ? "Connecting"
                        : "Disconnected"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {flowError && (
              <div className="text-sm text-destructive">
                {flowError}{" "}
                <Button variant="outline" size="sm" onClick={flowReconnect} className="ml-2">
                  Reconnect
                </Button>
              </div>
            )}

            {flowConnectionState === "stale" && (
              <div className="text-sm text-muted-foreground">
                Flow telemetry is stale
                {flowLastMessageAgeMs != null ? ` (${Math.round(flowLastMessageAgeMs / 1000)}s old)` : ""}. The UI is
                keeping the last values visible until the ESP responds again.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleStartShot} disabled={!isFlowFresh}>
                GO
              </Button>
              <Button onClick={handleStopShot} disabled={!isFlowFresh} variant="destructive">
                STOP
              </Button>
              <Button onClick={() => flowRefreshStatus("testing-panel")} disabled={!flowConnected} variant="outline">
                STATUS
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <div className="text-muted-foreground">brewActive</div>
                <div className="font-medium">{flowSensor?.brewActive ? "true" : "false"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">pressure</div>
                <div className="font-medium">{(flowShot?.pressure ?? flowSensor?.pressure ?? 0).toFixed(2)} bar</div>
              </div>
              <div>
                <div className="text-muted-foreground">weight</div>
                <div className="font-medium">{(flowShot?.shotWeight ?? flowSensor?.weight ?? 0).toFixed(2)} g</div>
              </div>
              <div>
                <div className="text-muted-foreground">phase</div>
                <div className="font-medium">
                  {flowShot?.phaseIdx ?? "-"} {flowShot?.phaseType ? `(${flowShot.phaseType})` : ""}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <div className="text-muted-foreground">targetP</div>
                <div className="font-medium">{(flowShot?.targetPressure ?? 0).toFixed(2)} bar</div>
              </div>
              <div>
                <div className="text-muted-foreground">targetF</div>
                <div className="font-medium">{(flowShot?.targetPumpFlow ?? 0).toFixed(2)} ml/s</div>
              </div>
              <div>
                <div className="text-muted-foreground">clicks / cps</div>
                <div className="font-medium">
                  {(flowShot?.pumpClicks ?? flowSensor?.pumpClicks ?? 0).toString()} /{" "}
                  {(flowShot?.pumpCps ?? flowSensor?.pumpCps ?? 0).toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">power</div>
                <div className="font-medium">{(flowShot?.pumpPowerPct ?? flowSensor?.pumpPowerPct ?? 0).toFixed(1)}%</div>
              </div>
            </div>

            <div className="text-xs text-muted-foreground">
              WS: <code>{FLOW_WS_URL}</code> (override with <code>NEXT_PUBLIC_FLOW_WS_URL</code>)
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => flowSendRaw("PROFILES")} disabled={!flowConnected}>
                Send PROFILES
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => flowRefreshStatus("testing-panel-manual")}
                disabled={!flowConnected}
              >
                Refresh Status
              </Button>
              <span className="text-xs text-muted-foreground">Replies appear in Device log below.</span>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Active profile (device)</div>
              {activeDeviceProfile ? (
                <>
                  <PhaseProfileGraph profile={activeDeviceProfile} height={220} inline />
                  <div className="rounded-md border bg-muted/30 p-3">
                    <div className="mb-1 text-xs font-medium text-muted-foreground">Profile (steps / phases)</div>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs font-mono">
                      {JSON.stringify(activeDeviceProfile, null, 2)}
                    </pre>
                  </div>
                </>
              ) : (
                <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                  {flowConnected ? "Click “Send PROFILES” to load the active profile." : "Connect to device, then send PROFILES."}
                </div>
              )}
            </div>

            <div className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs font-mono">
              {flowLogs.slice(-30).join("\n") || "[no logs yet]"}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Device log</div>
                <div className="flex items-center gap-2">
                  {flowLogCopyStatus === "copied" && <span className="text-xs text-muted-foreground">Copied</span>}
                  {flowLogCopyStatus === "error" && <span className="text-xs text-destructive">Copy failed</span>}
                  <Button variant="outline" size="sm" onClick={handleCopyFlowLogs} disabled={flowLogs.length === 0}>
                    Copy Logs
                  </Button>
                </div>
              </div>
              <textarea
                className="min-h-[180px] w-full rounded-md border bg-background p-3 text-xs font-mono"
                readOnly
                value={flowLogs.length ? flowLogs.join("\n") : "[no logs yet]"}
              />
              <div className="text-xs text-muted-foreground">
                Command replies and device broadcast logs (with timestamps). Use for debugging without Serial.
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">Shot JSON payloads (raw)</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyFlowRawJson}
                  disabled={flowRawJson.length === 0}
                >
                  Copy JSON
                </Button>
              </div>
              <textarea
                className="min-h-[220px] w-full rounded-md border bg-background p-3 text-xs font-mono"
                readOnly
                value={flowRawJson.length ? flowRawJson.join("\n") : "[no shot JSON yet]"}
              />
              <div className="text-xs text-muted-foreground">
                This includes the exact WS JSON messages during the shot (sensor + shot updates).
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">CSV export (pressure)</div>
              <div className="text-xs text-muted-foreground">
                Exports <code>t_ms</code>, <code>pressure_bar</code>, <code>target_pressure_bar</code> from the recorded
                shot points.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPressureCsv}
                  disabled={flowPoints.length === 0}
                >
                  Download CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopyPressureCsv} disabled={flowPoints.length === 0}>
                  Copy CSV
                </Button>
                {flowCsvCopyStatus === "copied" && <span className="text-xs text-muted-foreground">Copied</span>}
                {flowCsvCopyStatus === "error" && <span className="text-xs text-destructive">Copy failed</span>}
              </div>
            </div>

            {flowShotActive && (
              <div className="pt-3">
                <FlowShotChart points={flowPoints} phaseMarkers={flowPhaseMarkers} />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

