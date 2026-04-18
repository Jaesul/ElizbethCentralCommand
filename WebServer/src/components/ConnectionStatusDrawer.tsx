"use client";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { Wifi, WifiOff } from "lucide-react";
import { SafeLucide } from "~/components/SafeLucide";
import type { FlowConnectionState } from "~/hooks/useFlowProfilingWebSocket";

interface ConnectionStatusDrawerProps {
  connectionState: FlowConnectionState;
  error?: string | null;
  onReconnect?: () => void;
  lastMessageTime?: string;
  lastMessageAgeMs?: number | null;
  scaleConnected?: boolean;
  isTestingMode?: boolean;
}

export function ConnectionStatusDrawer({
  connectionState,
  error,
  onReconnect,
  lastMessageTime,
  lastMessageAgeMs,
  scaleConnected,
  isTestingMode,
}: ConnectionStatusDrawerProps) {
  const isConnected = connectionState === "connected";
  const isReconnectable =
    connectionState === "stale" ||
    connectionState === "disconnected" ||
    connectionState === "reconnecting";
  const statusLabel =
    connectionState === "connected"
      ? "Connected"
      : connectionState === "stale"
        ? "Stale"
        : connectionState === "reconnecting"
          ? "Reconnecting"
          : connectionState === "connecting"
            ? "Connecting"
            : "Disconnected";
  const statusVariant =
    connectionState === "connected"
      ? "default"
      : connectionState === "stale"
        ? "secondary"
        : "destructive";
  const lastMessageAgeLabel =
    lastMessageAgeMs == null
      ? null
      : lastMessageAgeMs < 1000
        ? "just now"
        : `${Math.round(lastMessageAgeMs / 1000)}s ago`;
  const scaleStatusLabel =
    scaleConnected === true
      ? "Connected"
      : scaleConnected === false
        ? "Disconnected"
        : "Unknown";
  const scaleStatusVariant =
    scaleConnected === true
      ? "default"
      : scaleConnected === false
        ? "destructive"
        : "secondary";
  const description =
    isTestingMode
      ? "Testing mode is on, so this screen is using simulated machine data."
      : connectionState === "connecting"
        ? "The UI is trying to find the ESP and open a WebSocket connection."
        : connectionState === "reconnecting"
          ? "The UI had a connection before and is now trying to restore it."
          : connectionState === "stale"
            ? "The socket is still open, but the ESP has not sent fresh telemetry recently."
            : connectionState === "disconnected"
              ? "The UI is not currently connected to the ESP."
              : "The UI is connected to the ESP and receiving live telemetry.";
  const helperMessage =
    isTestingMode
      ? "No hardware connection is required while testing mode is enabled."
      : connectionState === "connecting"
        ? "Trying the ESP WebSocket now. If this takes more than a few seconds, check that the machine is powered on and on the same network."
        : connectionState === "reconnecting"
          ? "The app will keep retrying automatically. You can also force a reconnect below."
          : connectionState === "stale"
            ? "The last values are still visible, but they should not be treated as live machine state."
            : connectionState === "disconnected"
              ? "Tap reconnect after confirming the ESP is reachable from this browser."
              : "Live machine updates are arriving normally.";

  return (
    <DrawerContent className="max-w-lg mx-auto">
      <DrawerHeader className="p-8">
        <div className="flex items-center justify-between">
          <DrawerTitle className="flex items-center gap-2">
            {isConnected ? (
              <SafeLucide icon={Wifi} className="size-5 text-green-500" />
            ) : (
              <SafeLucide icon={WifiOff} className="size-5 text-red-500" />
            )}
            Connection Status
          </DrawerTitle>
          <Badge variant={statusVariant}>
            {statusLabel}
          </Badge>
        </div>
        <DrawerDescription>
          {description}
        </DrawerDescription>
      </DrawerHeader>
      <div className="px-8 pb-8">
        <div className="space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Check browser console (F12) for more details
              </p>
            </div>
          )}

          {isConnected && lastMessageTime && (
            <div className="space-y-1 text-sm text-muted-foreground">
              <div>Last message: {new Date(lastMessageTime).toLocaleTimeString()}</div>
              {lastMessageAgeLabel && <div>Freshness: {lastMessageAgeLabel}</div>}
            </div>
          )}

          {!isTestingMode && (
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <div>
                <div className="text-sm font-medium">Scale</div>
                <div className="text-xs text-muted-foreground">
                  {scaleConnected === true
                    ? "The ESP reports an active scale connection."
                    : scaleConnected === false
                      ? "The ESP is reachable, but no scale is currently connected."
                      : "Waiting for scale status from the ESP."}
                </div>
              </div>
              <Badge variant={scaleStatusVariant}>{scaleStatusLabel}</Badge>
            </div>
          )}

          {connectionState === "stale" && !isTestingMode && (
            <div className="text-sm text-muted-foreground">
              The browser still has the last ESP values, but they are no longer considered live.
            </div>
          )}

          {!isConnected && connectionState !== "stale" && !error && !isTestingMode && (
            <div className="text-sm text-muted-foreground">
              {connectionState === "reconnecting" || connectionState === "connecting"
                ? "Attempting ESP connection..."
                : "ESP connection is idle right now."}
            </div>
          )}

          {isTestingMode && (
            <div className="text-sm text-muted-foreground">
              Currently in testing mode. All data is simulated.
            </div>
          )}

          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            {helperMessage}
          </div>
        </div>
      </div>
      {isReconnectable && onReconnect && !isTestingMode && (
        <DrawerFooter className="p-8">
          <Button onClick={onReconnect} variant="outline" className="w-full">
            Reconnect
          </Button>
        </DrawerFooter>
      )}
    </DrawerContent>
  );
}

