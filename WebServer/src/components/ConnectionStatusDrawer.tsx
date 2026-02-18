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

interface ConnectionStatusDrawerProps {
  isConnected: boolean;
  connectionState?: "disconnected" | "connecting" | "connected" | "stale" | "reconnecting";
  reconnectAttempt?: number;
  error?: string | null;
  onReconnect?: () => void;
  lastMessageTime?: string;
  isTestingMode?: boolean;
}

export function ConnectionStatusDrawer({
  isConnected,
  connectionState,
  reconnectAttempt,
  error,
  onReconnect,
  lastMessageTime,
  isTestingMode,
}: ConnectionStatusDrawerProps) {
  const state = connectionState ?? (isConnected ? "connected" : "disconnected");
  const badgeText =
    state === "connected"
      ? "Connected"
      : state === "connecting"
        ? "Connecting"
        : state === "reconnecting"
          ? "Reconnecting"
          : state === "stale"
            ? "Stale"
            : "Disconnected";

  return (
    <DrawerContent className="max-w-lg mx-auto">
      <DrawerHeader className="p-8">
        <div className="flex items-center justify-between">
          <DrawerTitle className="flex items-center gap-2">
            {state === "connected" ? (
              <Wifi className="size-5 text-green-500" />
            ) : (
              <WifiOff className="size-5 text-red-500" />
            )}
            Connection Status
          </DrawerTitle>
          <Badge variant={state === "connected" ? "default" : "destructive"}>
            {badgeText}
          </Badge>
        </div>
        <DrawerDescription>
          {isTestingMode
            ? "Testing mode - using simulated data"
            : "WebSocket connection to ESP32"}
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

          {lastMessageTime && (
            <div className="text-sm text-muted-foreground">
              Last message: {new Date(lastMessageTime).toLocaleTimeString()}
            </div>
          )}

          {!isConnected && !error && !isTestingMode && (
            <div className="text-sm text-muted-foreground">
              {state === "reconnecting" && typeof reconnectAttempt === "number"
                ? `Reconnecting (attempt ${reconnectAttempt})...`
                : state === "stale"
                  ? "Connection appears stale; reconnecting..."
                  : "Connecting to WebSocket server..."}
            </div>
          )}

          {isTestingMode && (
            <div className="text-sm text-muted-foreground">
              Currently in testing mode. All data is simulated.
            </div>
          )}
        </div>
      </div>
      {!isConnected && onReconnect && !isTestingMode && (
        <DrawerFooter className="p-8">
          <Button onClick={onReconnect} variant="outline" className="w-full">
            Reconnect
          </Button>
        </DrawerFooter>
      )}
    </DrawerContent>
  );
}

