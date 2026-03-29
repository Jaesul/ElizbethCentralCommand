"use client";

import { useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Drawer } from "~/components/ui/drawer";
import { ConnectionStatusDrawer } from "~/components/ConnectionStatusDrawer";
import type { FlowConnectionState } from "~/hooks/useFlowProfilingWebSocket";
import { cn } from "~/lib/utils";

interface FloatingConnectionIconProps {
  connectionState: FlowConnectionState;
  error?: string | null;
  onReconnect?: () => void;
  lastMessageTime?: string;
  lastMessageAgeMs?: number | null;
  isTestingMode?: boolean;
}

export function FloatingConnectionIcon({
  connectionState,
  error,
  onReconnect,
  lastMessageTime,
  lastMessageAgeMs,
  isTestingMode,
}: FloatingConnectionIconProps) {
  const [open, setOpen] = useState(false);
  const isConnected = connectionState === "connected";
  const isWarning = connectionState === "stale";
  const borderClass = isConnected
    ? "border-green-500 hover:border-green-600"
    : isWarning
      ? "border-amber-500 hover:border-amber-600"
      : connectionState === "reconnecting" || connectionState === "connecting"
        ? "border-sky-500 hover:border-sky-600"
        : "border-red-500 hover:border-red-600";
  const iconClass = isConnected
    ? "text-green-500"
    : isWarning
      ? "text-amber-500"
      : connectionState === "reconnecting" || connectionState === "connecting"
        ? "text-sky-500"
        : "text-red-500";
  const dotClass = isConnected
    ? "bg-green-500"
    : isWarning
      ? "bg-amber-500"
      : connectionState === "reconnecting" || connectionState === "connecting"
        ? "bg-sky-500"
        : "bg-red-500";
  const statusMessage =
    connectionState === "connecting"
      ? "Looking for ESP..."
      : connectionState === "reconnecting"
        ? "Reconnecting to ESP..."
        : connectionState === "stale"
          ? "ESP data is stale"
          : connectionState === "disconnected"
            ? "ESP disconnected"
            : null;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      {statusMessage && !isTestingMode && (
        <div className="fixed right-20 bottom-6 z-50 rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur">
          {statusMessage}
        </div>
      )}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center justify-center",
          "h-14 w-14 rounded-full shadow-lg transition-all",
          "bg-background border-2",
          borderClass,
          connectionState !== "connected" && "animate-pulse"
        )}
        aria-label={statusMessage ? `Connection status: ${statusMessage}` : "Connection status: connected"}
        title={statusMessage ?? "Connected to ESP"}
      >
        <div className="relative">
          {/* Icon */}
          {isConnected || isWarning ? (
            <Wifi className={cn("size-6", iconClass)} />
          ) : (
            <WifiOff className={cn("size-6", iconClass)} />
          )}
          {/* Dot indicator */}
          <div
            className={cn(
              "absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-background",
              dotClass
            )}
          />
        </div>
      </button>
      <ConnectionStatusDrawer
        connectionState={connectionState}
        error={error}
        onReconnect={onReconnect}
        lastMessageTime={lastMessageTime}
        lastMessageAgeMs={lastMessageAgeMs}
        isTestingMode={isTestingMode}
      />
    </Drawer>
  );
}

