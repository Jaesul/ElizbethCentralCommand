"use client";

import { useState, useEffect } from "react";
import { FloatingConnectionIcon } from "~/components/FloatingConnectionIcon";
import { ProfileSelector } from "~/components/ProfileSelector";
import { ShotMonitoringDrawer } from "~/components/ShotMonitoringDrawer";
import { Drawer } from "~/components/ui/drawer";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Slider } from "~/components/ui/slider";
import { useWebSocket } from "~/hooks/useWebSocket";
import { useFlowProfilingWebSocket } from "~/hooks/useFlowProfilingWebSocket";
import { useShotHistory } from "~/hooks/useShotHistory";
import { useProfiles } from "~/hooks/useProfiles";
import { useTestingMode } from "~/hooks/useTestingMode";
import { useMockDataGenerator } from "~/lib/mockDataGenerator";
import type { ShotStopperData } from "~/types/shotstopper";
import { Button } from "~/components/ui/button";
import { useFlowShotHistory } from "~/hooks/useFlowShotHistory";
import { FlowShotChart } from "~/components/FlowShotChart";
import { PressureFlowChart } from "~/components/PressureFlowChart";

// Determine WebSocket URL - ESP32 is now the WebSocket server via mDNS
const getWebSocketUrl = () => {
  // Try mDNS first (shotstopper.local), fallback to IP if mDNS doesn't work
  // You can set this via environment variable NEXT_PUBLIC_WS_URL or use the default
  const customUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (customUrl) {
    return customUrl;
  }
  
  // Default: Connect to ESP32 WebSocket server via mDNS.
  // NOTE: Arduino WebSocketsServer typically uses root path (no /ws).
  return "ws://shotstopper-ws.local:81";
};

// Flow profiling device (FlowProfilingArduino) WebSocket URL.
const getFlowWebSocketUrl = () => {
  const customUrl = process.env.NEXT_PUBLIC_FLOW_WS_URL;
  if (customUrl) return customUrl;
  return "ws://shotstopper-ws.local:81";
};

// Determine Pressure WebSocket URL - separate ESP32 for pressure reading (optional, only if explicitly configured)
const getPressureWebSocketUrl = () => {
  // Only connect to separate pressure reader if explicitly configured via environment variable
  // By default, use the combined device which includes pressure data
  const customUrl = process.env.NEXT_PUBLIC_PRESSURE_WS_URL;
  if (customUrl) {
    return customUrl;
  }
  
  // Default: Don't connect to separate pressure reader (combined device provides pressure)
  return "";
};

export function ShotStopperPage() {
  // Avoid hydration mismatches: don't compute client-only values (URL, Date.now) during the initial SSR render.
  const [isMounted, setIsMounted] = useState(false);
  const [wsUrl, setWsUrl] = useState("");
  const [pressureWsUrl, setPressureWsUrl] = useState("");
  const [flowWsUrl, setFlowWsUrl] = useState("");

  useEffect(() => {
    setIsMounted(true);
    setWsUrl(getWebSocketUrl());
    setPressureWsUrl(getPressureWebSocketUrl());
    setFlowWsUrl(getFlowWebSocketUrl());
  }, []);
  const [mockData, setMockData] = useState<ShotStopperData | null>(null);
  const [monitoringDrawerOpen, setMonitoringDrawerOpen] = useState(false);
  
  const { isTestingMode, isLoaded: testingModeLoaded, setTestingMode } = useTestingMode();
  
  // Real WebSocket connection for ShotStopper (only when not in testing mode)
  const { 
    isConnected: wsConnected, 
    connectionState: wsConnectionState,
    reconnectAttempt: wsReconnectAttempt,
    data: wsData, 
    error: wsError, 
    lastMessageTime: wsLastMessageTime, 
    reconnect: wsReconnect, 
    sendMessage: wsSendMessage 
  } = useWebSocket({
    url: isTestingMode ? "" : wsUrl, // Don't connect in testing mode
    reconnectInterval: 5000,
    reconnectOnClose: true,
  });

  // Flow profiling WebSocket connection (FlowProfilingArduino firmware)
  const {
    isConnected: flowConnected,
    error: flowError,
    sensor: flowSensor,
    shot: flowShot,
    rawJson: flowRawJson,
    sendCommand: flowSendCommand,
    reconnect: flowReconnect,
  } = useFlowProfilingWebSocket({
    url: isTestingMode ? "" : flowWsUrl,
    reconnectInterval: 5000,
    reconnectOnClose: true,
    // Keep raw JSON bounded for copy/paste debugging without runaway memory.
    maxLogs: 400,
    includeRawJsonDuringShot: true,
  });
  const { points: flowPoints, phaseMarkers: flowPhaseMarkers, isActive: flowShotActive } = useFlowShotHistory(flowSensor, flowShot);

  const [flowJsonCopyStatus, setFlowJsonCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const [flowCsvCopyStatus, setFlowCsvCopyStatus] = useState<"idle" | "copied" | "error">("idle");

  const buildPressureCsv = () => {
    // Minimal export: time + actual pressure + target pressure (like gaggiuino fields).
    const header = "t_ms,pressure_bar,target_pressure_bar";
    const rows = flowPoints.map((p) => {
      const t = Number.isFinite(p.tMs) ? String(Math.round(p.tMs)) : "";
      const pressure = typeof p.pressure === "number" && Number.isFinite(p.pressure) ? p.pressure.toFixed(3) : "";
      const target = typeof p.targetPressure === "number" && Number.isFinite(p.targetPressure) ? p.targetPressure.toFixed(3) : "";
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

  const handleCopyFlowRawJson = async () => {
    try {
      const text = (flowRawJson.length ? flowRawJson.join("\n") : "[no shot JSON yet]") + "\n";
      await navigator.clipboard.writeText(text);
      setFlowJsonCopyStatus("copied");
      window.setTimeout(() => setFlowJsonCopyStatus("idle"), 1200);
    } catch {
      setFlowJsonCopyStatus("error");
      window.setTimeout(() => setFlowJsonCopyStatus("idle"), 1500);
    }
  };

  // Separate WebSocket connection for pressure reader
  const { 
    isConnected: pressureWsConnected, 
    connectionState: pressureWsConnectionState,
    reconnectAttempt: pressureWsReconnectAttempt,
    data: pressureWsData, 
    error: pressureWsError, 
    lastMessageTime: pressureWsLastMessageTime,
    reconnect: pressureWsReconnect
  } = useWebSocket({
    url: isTestingMode ? "" : pressureWsUrl, // Don't connect in testing mode
    reconnectInterval: 5000,
    reconnectOnClose: true,
  });

  // Mock data generator (only when in testing mode)
  const { startMockShot, stopMockShot, resetMockShot, isBrewing: mockBrewing } = useMockDataGenerator({
    onData: setMockData,
    goalWeight: mockData?.goalWeight ?? 40,
  });

  // Use mock data in testing mode, real data otherwise
  // Merge pressure data: prioritize baseShotData (combined device), fallback to separate pressure WebSocket
  const baseShotData = isTestingMode ? mockData : wsData;
  const shotData = baseShotData 
    ? {
        ...baseShotData,
        // Prioritize pressure from baseShotData (combined device), fallback to separate pressure WebSocket
        currentPressure: baseShotData.currentPressure ?? baseShotData.pressureBar ?? pressureWsData?.currentPressure ?? pressureWsData?.pressureBar,
        pressurePSI: baseShotData.pressurePSI ?? pressureWsData?.pressurePSI,
        pressureBar: baseShotData.pressureBar ?? baseShotData.currentPressure ?? pressureWsData?.pressureBar ?? pressureWsData?.currentPressure,
      }
    : pressureWsData 
      ? {
          // If only pressure data is available, create minimal data object
          currentPressure: pressureWsData.currentPressure ?? pressureWsData.pressureBar,
          pressurePSI: pressureWsData.pressurePSI,
          pressureBar: pressureWsData.pressureBar ?? pressureWsData.currentPressure,
        }
      : null;
  
  const isConnected = isTestingMode ? true : (wsConnected || pressureWsConnected);
  const error = isTestingMode ? undefined : (wsError ?? pressureWsError);
  // Prefer the most recent message time across sockets (ISO timestamps compare lexicographically).
  const lastMessageTime = isTestingMode
    ? undefined
    : (wsLastMessageTime && pressureWsLastMessageTime
        ? (wsLastMessageTime > pressureWsLastMessageTime ? wsLastMessageTime : pressureWsLastMessageTime)
        : (wsLastMessageTime ?? pressureWsLastMessageTime));

  const connectionState = isTestingMode
    ? "connected"
    : isConnected
      ? "connected"
      : (wsConnectionState === "stale" || pressureWsConnectionState === "stale")
        ? "stale"
        : (wsConnectionState === "reconnecting" || pressureWsConnectionState === "reconnecting")
          ? "reconnecting"
          : (wsConnectionState === "connecting" || pressureWsConnectionState === "connecting")
            ? "connecting"
            : "disconnected";

  const reconnectAttempt = Math.max(wsReconnectAttempt ?? 0, pressureWsReconnectAttempt ?? 0);

  // Manual triac power control (for flow profiling comparisons)
  const [pumpPowerPct, setPumpPowerPct] = useState(100);
  const [isPowerSliding, setIsPowerSliding] = useState(false);

  useEffect(() => {
    if (isTestingMode) return;
    if (isPowerSliding) return;
    const v = wsData?.pumpPowerPct;
    if (typeof v === "number" && Number.isFinite(v)) {
      setPumpPowerPct(Math.max(0, Math.min(100, Math.round(v))));
    }
  }, [wsData?.pumpPowerPct, isTestingMode, isPowerSliding]);

  // Handle sendMessage - disable in testing mode or make it control mock data
  const sendMessage = isTestingMode 
    ? (message: object) => {
        // In testing mode, simulate commands
        if ("command" in message) {
          if (message.command === "startShot") {
            startMockShot();
          } else if (message.command === "stopShot") {
            stopMockShot();
          }
        }
      }
    : wsSendMessage;

  const sendPumpPower = (value: number) => {
    if (isTestingMode) return;
    if (!wsConnected) return; // must go to main device, not the pressure-only socket
    const p = Math.max(0, Math.min(100, Math.round(value)));
    wsSendMessage({ command: "setPower", powerPct: p });
  };

  const { shotHistory, isActiveShot } = useShotHistory(shotData);
  const {
    profiles,
    selectedProfileId,
    isLoaded: profilesLoaded,
    deleteProfile,
    selectProfile,
  } = useProfiles();

  const handleReconnect = () => {
    if (!isTestingMode) {
      wsReconnect();
      pressureWsReconnect();
    } else {
      resetMockShot();
    }
  };

  // Initialize mock data when entering testing mode
  useEffect(() => {
    if (isTestingMode) {
      resetMockShot();
    }
  }, [isTestingMode, resetMockShot]);


  const handleStartShot = (profileId: string) => {
    selectProfile(profileId);
    sendMessage({ command: "startShot" });
    setMonitoringDrawerOpen(true);
  };

  const handleStopShot = () => {
    sendMessage({ command: "stopShot" });
  };

  // Use shot history directly (pressure is already merged in useShotHistory hook)
  const mergedShotHistoryForDrawer = shotHistory;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-4xl font-bold mb-2">Elizabeth Central Command</h1>
            <p className="text-muted-foreground">
              Real-time espresso shot monitoring from ESP32
            </p>
          </div>
          {/* Testing Mode Toggle */}
          {testingModeLoaded && (
            <Card className="w-auto">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium cursor-pointer flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isTestingMode}
                      onChange={(e) => setTestingMode(e.target.checked)}
                      className="w-4 h-4"
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

      {/* Flow Profiling Control Panel (replaces node ws_capture for GO/STOP/STATUS) */}
      {!isTestingMode && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Flow Profiling</span>
              <Badge variant={flowConnected ? "default" : "secondary"}>
                {flowConnected ? "Connected" : "Disconnected"}
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

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => flowSendCommand("GO")} disabled={!flowConnected}>
                GO
              </Button>
              <Button onClick={() => flowSendCommand("STOP")} disabled={!flowConnected} variant="destructive">
                STOP
              </Button>
              <Button
                onClick={() => flowSendCommand("PURGE")}
                disabled={!flowConnected || flowShotActive}
                variant="outline"
              >
                Purge
              </Button>
              <Button onClick={() => flowSendCommand("STATUS")} disabled={!flowConnected} variant="outline">
                STATUS
              </Button>
            </div>

            {/* Charts */}
            {flowShotActive && (
              <div className="pt-3">
                <FlowShotChart points={flowPoints} phaseMarkers={flowPhaseMarkers} />
              </div>
            )}

            {/* Extra chart: pressure/flow only, fixed bounds */}
            {flowShotActive && (
              <div className="pt-3">
                <PressureFlowChart points={flowPoints} phaseMarkers={flowPhaseMarkers} />
              </div>
            )}

            {/* Debug exports (below graph) */}
            <div className="pt-4 space-y-4">
              {/* CSV export (pressure actual + target) */}
              <div className="space-y-2">
                <div className="text-sm font-medium">CSV export (pressure)</div>
                <div className="text-xs text-muted-foreground">
                  Exports <code>t_ms</code>, <code>pressure_bar</code>, <code>target_pressure_bar</code> from the recorded shot points.
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyPressureCsv}
                    disabled={flowPoints.length === 0}
                  >
                    Copy CSV
                  </Button>
                  {flowCsvCopyStatus === "copied" && <span className="text-xs text-muted-foreground">Copied</span>}
                  {flowCsvCopyStatus === "error" && <span className="text-xs text-destructive">Copy failed</span>}
                </div>
              </div>

              {/* Full JSON payload stream (copy/paste) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">Shot JSON payloads (raw)</div>
                  <div className="flex items-center gap-2">
                    {flowJsonCopyStatus === "copied" && <span className="text-xs text-muted-foreground">Copied</span>}
                    {flowJsonCopyStatus === "error" && <span className="text-xs text-destructive">Copy failed</span>}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyFlowRawJson}
                      disabled={flowRawJson.length === 0}
                    >
                      Copy JSON
                    </Button>
                  </div>
                </div>
                <textarea
                  className="w-full min-h-[220px] rounded-md border bg-background p-3 text-xs font-mono"
                  readOnly
                  value={(flowRawJson.length ? flowRawJson.join("\n") : "[no shot JSON yet]")}
                />
                <div className="text-xs text-muted-foreground">
                  This includes the exact WS JSON messages during the shot (sensor + shot updates).
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manual pump power control (triac %). Sends setPower to ESP32 on release. */}
      {!isTestingMode && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Manual Pump Power</span>
              <Badge variant={wsConnected ? "default" : "secondary"}>
                {wsConnected ? `${pumpPowerPct}%` : "Not connected"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Slider
              value={[pumpPowerPct]}
              min={0}
              max={100}
              step={1}
              disabled={!wsConnected}
              onValueChange={(v) => {
                setIsPowerSliding(true);
                setPumpPowerPct(v[0] ?? 0);
              }}
              onValueCommit={(v) => {
                setIsPowerSliding(false);
                const val = v[0] ?? 0;
                setPumpPowerPct(val);
                sendPumpPower(val);
              }}
            />
            <div className="text-xs text-muted-foreground">
              This sends <code>setPower</code> to the ESP32. (ShotStopper firmware must support triac power control.)
            </div>
          </CardContent>
        </Card>
      )}


      {/* Profile Selector - Front and center */}
      {profilesLoaded && (
        <div>
          <ProfileSelector
            profiles={profiles}
            selectedProfileId={selectedProfileId}
            onSelectProfile={selectProfile}
            onDeleteProfile={deleteProfile}
                  onStartShot={handleStartShot}
            isConnected={isConnected}
            isBrewing={shotData?.brewing ?? false}
          />
        </div>
      )}

      {/* Floating Connection Status Icon */}
      <FloatingConnectionIcon
        isConnected={isConnected}
        connectionState={connectionState}
        reconnectAttempt={reconnectAttempt}
        error={error}
        onReconnect={handleReconnect}
        lastMessageTime={lastMessageTime}
        isTestingMode={isTestingMode}
      />

      {/* Shot Monitoring Drawer */}
      <Drawer 
        open={monitoringDrawerOpen} 
        onOpenChange={(open) => {
          setMonitoringDrawerOpen(open);
        }}
      >
        <ShotMonitoringDrawer
          open={monitoringDrawerOpen}
          onOpenChange={setMonitoringDrawerOpen}
          shotData={shotData}
          shotHistory={mergedShotHistoryForDrawer}
          currentPressure={
            shotData?.currentPressure ??
            shotData?.pressureBar
          }
          isBrewing={shotData?.brewing ?? false}
          onStartShot={() => handleStartShot(selectedProfileId ?? "")}
          onStopShot={handleStopShot}
          isConnected={isConnected}
        />
      </Drawer>
    </div>
  );
}

