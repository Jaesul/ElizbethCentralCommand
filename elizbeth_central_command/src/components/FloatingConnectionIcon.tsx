"use client";

import { useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Drawer } from "~/components/ui/drawer";
import { ConnectionStatusDrawer } from "~/components/ConnectionStatusDrawer";
import { cn } from "~/lib/utils";

interface FloatingConnectionIconProps {
  isConnected: boolean;
  error?: string | null;
  onReconnect?: () => void;
  lastMessageTime?: string;
  isTestingMode?: boolean;
}

export function FloatingConnectionIcon({
  isConnected,
  error,
  onReconnect,
  lastMessageTime,
  isTestingMode,
}: FloatingConnectionIconProps) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center justify-center",
          "h-14 w-14 rounded-full shadow-lg transition-all",
          "bg-background border-2",
          isConnected
            ? "border-green-500 hover:border-green-600"
            : "border-red-500 hover:border-red-600",
          !isConnected && "animate-pulse"
        )}
        aria-label="Connection status"
      >
        <div className="relative">
          {/* Icon */}
          {isConnected ? (
            <Wifi className="size-6 text-green-500" />
          ) : (
            <WifiOff className="size-6 text-red-500" />
          )}
          {/* Dot indicator */}
          <div
            className={cn(
              "absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-background",
              isConnected ? "bg-green-500" : "bg-red-500"
            )}
          />
        </div>
      </button>
      <ConnectionStatusDrawer
        isConnected={isConnected}
        error={error}
        onReconnect={onReconnect}
        lastMessageTime={lastMessageTime}
        isTestingMode={isTestingMode}
      />
    </Drawer>
  );
}

