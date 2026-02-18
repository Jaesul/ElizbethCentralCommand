"use client";

import { useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Drawer } from "~/components/ui/drawer";
import { ConnectionStatusDrawer } from "~/components/ConnectionStatusDrawer";
import { cn } from "~/lib/utils";

interface FloatingConnectionIconProps {
  isConnected: boolean;
  connectionState?: "disconnected" | "connecting" | "connected" | "stale" | "reconnecting";
  reconnectAttempt?: number;
  error?: string | null;
  onReconnect?: () => void;
  lastMessageTime?: string;
  isTestingMode?: boolean;
}

export function FloatingConnectionIcon({
  isConnected,
  connectionState,
  reconnectAttempt,
  error,
  onReconnect,
  lastMessageTime,
  isTestingMode,
}: FloatingConnectionIconProps) {
  const [open, setOpen] = useState(false);

  const state = connectionState ?? (isConnected ? "connected" : "disconnected");
  const isOk = state === "connected";
  const isWarn = state === "connecting" || state === "reconnecting";

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center justify-center",
          "h-14 w-14 rounded-full shadow-lg transition-all",
          "bg-background border-2",
          isOk
            ? "border-green-500 hover:border-green-600"
            : isWarn
              ? "border-yellow-500 hover:border-yellow-600"
              : "border-red-500 hover:border-red-600",
          !isOk && "animate-pulse"
        )}
        aria-label="Connection status"
      >
        <div className="relative">
          {/* Icon */}
          {isOk ? (
            <Wifi className="size-6 text-green-500" />
          ) : (
            <WifiOff className={cn("size-6", isWarn ? "text-yellow-500" : "text-red-500")} />
          )}
          {/* Dot indicator */}
          <div
            className={cn(
              "absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-background",
              isOk ? "bg-green-500" : isWarn ? "bg-yellow-500" : "bg-red-500",
            )}
          />
        </div>
      </button>
      <ConnectionStatusDrawer
        isConnected={isConnected}
        connectionState={state}
        reconnectAttempt={reconnectAttempt}
        error={error}
        onReconnect={onReconnect}
        lastMessageTime={lastMessageTime}
        isTestingMode={isTestingMode}
      />
    </Drawer>
  );
}

