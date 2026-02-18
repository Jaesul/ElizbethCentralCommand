"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FlowWsAction = "sensor_data_update" | "shot_data_update" | "log_record";
export type FlowWsConnectionState = "disconnected" | "connecting" | "connected" | "stale" | "reconnecting";

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
  heartbeatIntervalMs?: number;
  staleTimeoutMs?: number;
  backoffMaxMs?: number;
  backoffFactor?: number;
  backoffJitterPct?: number;
}

export interface UseFlowProfilingWebSocketReturn {
  isConnected: boolean;
  connectionState: FlowWsConnectionState;
  reconnectAttempt: number;
  error: string | null;
  lastMessageTime: string | undefined;
  sensor: FlowSensorData | null;
  shot: FlowShotData | null;
  logs: string[];
  rawJson: string[];
  reconnect: () => void;
  sendCommand: (cmd: "GO" | "STOP" | "STATUS" | "PING") => void;
}

export function useFlowProfilingWebSocket({
  url,
  reconnectInterval = 5000,
  reconnectOnClose = true,
  maxLogs = 200,
  includeRawJsonDuringShot = true,
  heartbeatIntervalMs = 25000,
  staleTimeoutMs = 60000,
  backoffMaxMs = 60000,
  backoffFactor = 2,
  backoffJitterPct = 0.1,
}: UseFlowProfilingWebSocketOptions): UseFlowProfilingWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<FlowWsConnectionState>("disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState<string | undefined>();
  const [sensor, setSensor] = useState<FlowSensorData | null>(null);
  const [shot, setShot] = useState<FlowShotData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [rawJson, setRawJson] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const staleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRxMsRef = useRef<number>(0);
  const reconnectAttemptRef = useRef<number>(0);
  const isConnectingRef = useRef(false);
  const shotActiveRef = useRef(false);

  const pushLog = useCallback(
    (line: string) => {
      setLogs((prev) => {
        const next = [...prev, line];
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

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (staleTimeoutRef.current) {
      clearTimeout(staleTimeoutRef.current);
      staleTimeoutRef.current = null;
    }
  }, []);

  const noteRx = useCallback(() => {
    const now = Date.now();
    lastRxMsRef.current = now;
    if (staleTimeoutRef.current) clearTimeout(staleTimeoutRef.current);
    staleTimeoutRef.current = setTimeout(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      setConnectionState("stale");
      setError((prev) => prev ?? `WebSocket stale (no data for ${Math.round(staleTimeoutMs / 1000)}s)`);
      pushLog("[ui] stale connection; closing to force reconnect");
      try {
        ws.close(4000, "stale");
      } catch {
        // ignore
      }
    }, staleTimeoutMs);
  }, [pushLog, staleTimeoutMs]);

  const computeBackoffDelayMs = useCallback(
    (attempt: number) => {
      const base = Math.max(250, reconnectInterval);
      const factor = Math.max(1.1, backoffFactor);
      const max = Math.max(base, backoffMaxMs);
      const exp = Math.min(30, Math.max(0, attempt - 1));
      const raw = Math.min(max, Math.round(base * Math.pow(factor, exp)));
      const jitter = Math.max(0, Math.min(0.5, backoffJitterPct));
      const scale = 1 + (Math.random() * 2 - 1) * jitter; // ±jitter
      return Math.max(250, Math.round(raw * scale));
    },
    [backoffFactor, backoffJitterPct, backoffMaxMs, reconnectInterval],
  );

  const connect = useCallback(() => {
    if (!url || url.trim() === "") {
      isConnectingRef.current = false;
      setConnectionState("disconnected");
      return;
    }
    if (isConnectingRef.current || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    clearTimers();

    isConnectingRef.current = true;
    setError(null);
    setConnectionState(reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting");

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        isConnectingRef.current = false;
        setConnectionState("connected");
        reconnectAttemptRef.current = 0;
        setReconnectAttempt(0);
        noteRx();
        pushLog(`[ui] connected: ${url}`);

        // Heartbeat: low-rate ping so idle links are detected as alive/dead without UI blocking.
        if (heartbeatIntervalMs > 0) {
          if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = setInterval(() => {
            const w = wsRef.current;
            if (!w || w.readyState !== WebSocket.OPEN) return;
            try {
              // Avoid log spam; PONG responses are also ignored below.
              w.send("PING");
            } catch {
              // ignore; onclose will handle reconnect.
            }
          }, heartbeatIntervalMs);
        }
      };

      ws.onmessage = (event) => {
        const nowIso = new Date().toISOString();
        setLastMessageTime(nowIso);
        noteRx();

        const raw = String(event.data ?? "");
        if (raw.trim() === "PONG") {
          return;
        }
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
        clearTimers();

        if (reconnectOnClose && event.code !== 1000) {
          const nextAttempt = reconnectAttemptRef.current + 1;
          reconnectAttemptRef.current = nextAttempt;
          setReconnectAttempt(nextAttempt);
          setConnectionState("reconnecting");
          const delay = computeBackoffDelayMs(nextAttempt);
          reconnectTimeoutRef.current = setTimeout(() => connect(), delay);
        } else {
          setConnectionState("disconnected");
        }
      };
    } catch {
      setError("Failed to create WebSocket connection");
      isConnectingRef.current = false;
      setConnectionState("disconnected");

      if (reconnectOnClose) {
        const nextAttempt = reconnectAttemptRef.current + 1;
        reconnectAttemptRef.current = nextAttempt;
        setReconnectAttempt(nextAttempt);
        setConnectionState("reconnecting");
        const delay = computeBackoffDelayMs(nextAttempt);
        reconnectTimeoutRef.current = setTimeout(() => connect(), delay);
      }
    }
  }, [
    url,
    reconnectOnClose,
    pushLog,
    pushRaw,
    clearTimers,
    computeBackoffDelayMs,
    noteRx,
    heartbeatIntervalMs,
    includeRawJsonDuringShot,
  ]);

  const reconnect = useCallback(() => {
    clearTimers();
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    connect();
  }, [clearTimers, connect]);

  const sendCommand = useCallback(
    (cmd: "GO" | "STOP" | "STATUS" | "PING") => {
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
    },
    [pushLog],
  );

  useEffect(() => {
    if (!url) return;
    connect();
    return () => {
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounting");
        wsRef.current = null;
      }
    };
  }, [connect, url, clearTimers]);

  return {
    isConnected,
    connectionState,
    reconnectAttempt,
    error,
    lastMessageTime,
    sensor,
    shot,
    logs,
    rawJson,
    reconnect,
    sendCommand,
  };
}


