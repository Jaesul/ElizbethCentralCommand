"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { FloatingConnectionIcon } from "~/components/FloatingConnectionIcon";
import { useFlowProfilingWebSocket, type UseFlowProfilingWebSocketReturn } from "~/hooks/useFlowProfilingWebSocket";

const FLOW_WS_URL = process.env.NEXT_PUBLIC_FLOW_WS_URL ?? "ws://shotstopper-ws.local:81";

const FlowConnectionContext = createContext<UseFlowProfilingWebSocketReturn | null>(null);

function FlowConnectionLifecycleManager({
  flowConnection,
}: {
  flowConnection: UseFlowProfilingWebSocketReturn;
}) {
  const pathname = usePathname();
  const lastPathnameRef = useRef<string | null>(null);

  const resyncConnection = useCallback(
    (reason: string) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }

      if (
        flowConnection.connectionState === "disconnected" ||
        flowConnection.connectionState === "stale"
      ) {
        flowConnection.reconnect();
        return;
      }

      if (flowConnection.connectionState === "connected") {
        flowConnection.refreshStatus(reason);
      }
    },
    [flowConnection],
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resyncConnection("visibilitychange");
      }
    };
    const handleFocus = () => resyncConnection("focus");
    const handlePageShow = () => resyncConnection("pageshow");
    const handleOnline = () => resyncConnection("online");

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("online", handleOnline);
    };
  }, [resyncConnection]);

  useEffect(() => {
    if (!pathname) return;
    if (lastPathnameRef.current === pathname) return;
    lastPathnameRef.current = pathname;
    resyncConnection(`route:${pathname}`);
  }, [pathname, resyncConnection]);

  return (
    <FloatingConnectionIcon
      connectionState={flowConnection.connectionState}
      error={flowConnection.error}
      onReconnect={flowConnection.reconnect}
      lastMessageTime={flowConnection.lastMessageTime}
      lastMessageAgeMs={flowConnection.lastMessageAgeMs}
    />
  );
}

export function FlowConnectionProvider({ children }: { children: ReactNode }) {
  const flowConnection = useFlowProfilingWebSocket({
    url: FLOW_WS_URL,
    reconnectInterval: 5000,
    reconnectOnClose: true,
    maxLogs: 800,
    includeRawJsonDuringShot: true,
    requestProfileOnConnect: true,
    keepAliveThresholdMs: 4000,
    keepAliveIntervalMs: 4000,
    staleMessageThresholdMs: 8000,
    forceReconnectThresholdMs: 15000,
    refreshThrottleMs: 1500,
  });

  return (
    <FlowConnectionContext.Provider value={flowConnection}>
      {children}
      <FlowConnectionLifecycleManager flowConnection={flowConnection} />
    </FlowConnectionContext.Provider>
  );
}

export function useFlowConnection() {
  const ctx = useContext(FlowConnectionContext);
  if (!ctx) {
    throw new Error("useFlowConnection must be used within a FlowConnectionProvider");
  }
  return ctx;
}
