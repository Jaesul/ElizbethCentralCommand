"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FlowWsAction = "sensor_data_update" | "shot_data_update" | "log_record";

export interface FlowSensorData {
  brewActive?: boolean;
  scalesPresent?: boolean;
  pressure?: number;
  pumpFlow?: number;
  weightFlow?: number;
  weight?: number;
  pumpClicks?: number;
  pumpCps?: number;
  pumpPowerPct?: number;
}

export interface FlowShotData {
  timeInShot?: number; // ms (wall time since GO)
  profileTimeInShot?: number; // ms (profile timebase)
  pressure?: number;
  pumpFlow?: number;
  weightFlow?: number;
  shotWeight?: number;
  waterPumped?: number;
  targetPumpFlow?: number;
  targetPressure?: number;
  phaseIdx?: number;
  phaseType?: "PRESSURE" | "FLOW";
  timeInPhase?: number;
  pumpClicks?: number;
  pumpCps?: number;
  pumpPowerPct?: number;
}

export interface FlowLogData {
  source?: string;
  log?: string;
}

export interface UseFlowProfilingWebSocketOptions {
  url: string;
  reconnectInterval?: number;
  reconnectOnClose?: boolean;
  maxLogs?: number;
  includeRawJsonDuringShot?: boolean;
}

export interface UseFlowProfilingWebSocketReturn {
  isConnected: boolean;
  error: string | null;
  lastMessageTime: string | undefined;
  sensor: FlowSensorData | null;
  shot: FlowShotData | null;
  logs: string[];
  rawJson: string[];
  reconnect: () => void;
  sendCommand: (cmd: "GO" | "STOP" | "STATUS" | "PING") => void;
  sendRaw: (payload: string) => void;
}

export function useFlowProfilingWebSocket({
  url,
  reconnectInterval = 5000,
  reconnectOnClose = true,
  maxLogs = 200,
  includeRawJsonDuringShot = true,
}: UseFlowProfilingWebSocketOptions): UseFlowProfilingWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState<string | undefined>();
  const [sensor, setSensor] = useState<FlowSensorData | null>(null);
  const [shot, setShot] = useState<FlowShotData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [rawJson, setRawJson] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);
  const shotActiveRef = useRef(false);

  const pushLog = useCallback(
    (line: string) => {
      const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.sss
      setLogs((prev) => {
        const next = [...prev, `${ts} ${line}`];
        if (next.length > maxLogs) next.splice(0, next.length - maxLogs);
        return next;
      });
    },
    [maxLogs],
  );

  const pushRaw = useCallback(
    (line: string) => {
      setRawJson((prev) => {
        const next = [...prev, line];
        if (next.length > maxLogs) next.splice(0, next.length - maxLogs);
        return next;
      });
    },
    [maxLogs],
  );

  const connect = useCallback(() => {
    if (!url || url.trim() === "") {
      isConnectingRef.current = false;
      return;
    }
    if (isConnectingRef.current || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    isConnectingRef.current = true;
    setError(null);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        isConnectingRef.current = false;
        pushLog(`[ui] connected: ${url}`);
      };

      ws.onmessage = (event) => {
        const nowIso = new Date().toISOString();
        setLastMessageTime(nowIso);

        const raw = String(event.data ?? "");
        // Some servers may send plain text (e.g. STATUS) - keep it as a log line.
        if (!raw.trim().startsWith("{")) {
          pushLog(raw.trim());
          return;
        }

        let msg: { action?: FlowWsAction; data?: unknown } | null = null;
        try {
          msg = JSON.parse(raw) as { action?: FlowWsAction; data?: unknown };
        } catch {
          pushLog(`[ui] parse error: ${raw.slice(0, 200)}`);
          return;
        }

        const action = msg?.action;
        const data = (msg?.data ?? {}) as Record<string, unknown>;

        if (action === "log_record") {
          const log = String((data as FlowLogData).log ?? "");
          const src = String((data as FlowLogData).source ?? "device");
          pushLog(`[log:${src}] ${log}`);
          return;
        }

        if (action === "sensor_data_update") {
          const s = data as FlowSensorData;
          if (typeof s.brewActive === "boolean") {
            shotActiveRef.current = s.brewActive;
            if (!s.brewActive) {
              // Reset raw stream between shots so copy/paste is clean.
              setRawJson([]);
            }
          }
          setSensor(s);
          if (includeRawJsonDuringShot && shotActiveRef.current) {
            pushRaw(raw.trim());
          }
          return;
        }

        if (action === "shot_data_update") {
          shotActiveRef.current = true;
          setShot(data as FlowShotData);
          if (includeRawJsonDuringShot) {
            pushRaw(raw.trim());
          }
          return;
        }

        // Unknown JSON: still log for debugging
        pushLog(`[ui] unknown message: ${raw.slice(0, 200)}`);
      };

      ws.onerror = () => {
        setError(`WebSocket connection error: ${url}`);
        isConnectingRef.current = false;
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        isConnectingRef.current = false;
        wsRef.current = null;

        if (reconnectOnClose && event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => connect(), reconnectInterval);
        }
      };
    } catch {
      setError("Failed to create WebSocket connection");
      isConnectingRef.current = false;

      if (reconnectOnClose) {
        reconnectTimeoutRef.current = setTimeout(() => connect(), reconnectInterval);
      }
    }
  }, [url, reconnectInterval, reconnectOnClose, pushLog]);

  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    connect();
  }, [connect]);

  const sendCommand = useCallback((cmd: "GO" | "STOP" | "STATUS" | "PING") => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(cmd);
        pushLog(`[tx] ${cmd}`);
      } catch {
        setError("Failed to send command");
      }
    } else {
      setError("WebSocket not connected");
    }
  }, [pushLog]);

  const sendRaw = useCallback(
    (payload: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(payload);
          const preview = payload.length > 80 ? payload.slice(0, 80) + "..." : payload;
          pushLog(`[tx] ${preview}`);
        } catch {
          setError("Failed to send payload");
        }
      } else {
        setError("WebSocket not connected");
      }
    },
    [pushLog],
  );

  useEffect(() => {
    if (!url) return;
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounting");
        wsRef.current = null;
      }
    };
  }, [connect, url]);

  return {
    isConnected,
    error,
    lastMessageTime,
    sensor,
    shot,
    logs,
    rawJson,
    reconnect,
    sendCommand,
    sendRaw,
  };
}


