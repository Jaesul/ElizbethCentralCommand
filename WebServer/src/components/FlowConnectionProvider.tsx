"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useFlowProfilingWebSocket, type UseFlowProfilingWebSocketReturn } from "~/hooks/useFlowProfilingWebSocket";

const FLOW_WS_URL = process.env.NEXT_PUBLIC_FLOW_WS_URL ?? "ws://shotstopper-ws.local:81";

const FlowConnectionContext = createContext<UseFlowProfilingWebSocketReturn | null>(null);

export function FlowConnectionProvider({ children }: { children: ReactNode }) {
  const flowConnection = useFlowProfilingWebSocket({
    url: FLOW_WS_URL,
    reconnectInterval: 5000,
    reconnectOnClose: true,
    maxLogs: 800,
    includeRawJsonDuringShot: true,
    requestProfileOnConnect: true,
  });

  return (
    <FlowConnectionContext.Provider value={flowConnection}>
      {children}
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
