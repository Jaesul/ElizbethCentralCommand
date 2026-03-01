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

/** Response from device PROFILES command: active index + slots with full profile JSON */
export interface DeviceProfilesPayload {
  active: number;
  slots: Array<{
    index: number;
    name: string;
    profile: string;
    isActive: boolean;
  }>;
}

export interface UseFlowProfilingWebSocketOptions {
  url: string;
  reconnectInterval?: number;
  reconnectOnClose?: boolean;
  maxLogs?: number;
  includeRawJsonDuringShot?: boolean;
  /** If true, send "PROFILES" on connect to request current profile from ESP */
  requestProfileOnConnect?: boolean;
}

export interface UseFlowProfilingWebSocketReturn {
  isConnected: boolean;
  error: string | null;
  lastMessageTime: string | undefined;
  sensor: FlowSensorData | null;
  shot: FlowShotData | null;
  /** Current profile from ESP (raw JSON), e.g. after sending PROFILES or from STATUS */
  espProfile: Record<string, unknown> | null;
  /** Response from PROFILES command (active index + slots with full profile JSON); null until first PROFILES reply */
  deviceProfiles: DeviceProfilesPayload | null;
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
  requestProfileOnConnect = false,
}: UseFlowProfilingWebSocketOptions): UseFlowProfilingWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState<string | undefined>();
  const [sensor, setSensor] = useState<FlowSensorData | null>(null);
  const [shot, setShot] = useState<FlowShotData | null>(null);
  const [espProfile, setEspProfile] = useState<Record<string, unknown> | null>(null);
  const [deviceProfiles, setDeviceProfiles] = useState<DeviceProfilesPayload | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [rawJson, setRawJson] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);
  const shotActiveRef = useRef(false);
  const lastMessageTimeRef = useRef<string>("");
  const lastMessageTimeUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const setProfileFromMessage = useCallback((obj: unknown): boolean => {
    if (obj == null || typeof obj !== "object") return false;
    const o = obj as Record<string, unknown>;
    if (Array.isArray(o.phases) && (typeof o.name === "string" || typeof o.id === "string")) {
      setEspProfile(o);
      return true;
    }
    if (o.currentProfile != null) return setProfileFromMessage(o.currentProfile);
    if (Array.isArray(o.profiles) && o.profiles.length > 0) return setProfileFromMessage(o.profiles[0]);
    return false;
  }, []);

  // Refs for handlers so connect() doesn't depend on them and get recreated every render
  const pushLogRef = useRef<(line: string) => void>(() => {});
  const pushRawRef = useRef<(line: string) => void>(() => {});
  const setProfileFromMessageRef = useRef<(obj: unknown) => boolean>(() => false);
  pushLogRef.current = pushLog;
  pushRawRef.current = pushRaw;
  setProfileFromMessageRef.current = setProfileFromMessage;

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
      const reqProfile = requestProfileOnConnect;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        isConnectingRef.current = false;
        pushLogRef.current(`[ui] connected: ${url}`);
        if (reqProfile) {
          try {
            ws.send("PROFILES");
            pushLogRef.current(`[tx] PROFILES`);
          } catch {
            setError("Failed to send PROFILES");
          }
        }
      };

      ws.onmessage = (event) => {
        const nowIso = new Date().toISOString();
        lastMessageTimeRef.current = nowIso;
        // Throttle lastMessageTime state updates to avoid "Maximum update depth" when ESP sends many messages
        if (lastMessageTimeUpdateRef.current == null) {
          lastMessageTimeUpdateRef.current = setTimeout(() => {
            lastMessageTimeUpdateRef.current = null;
            setLastMessageTime(lastMessageTimeRef.current);
          }, 100);
        }

        const raw = String(event.data ?? "");
        if (!raw.trim().startsWith("{")) {
          if (raw.includes("[profile]") && (raw.includes("active set to") || raw.includes("SET_ACTIVE requires"))) {
            console.log("[Set active response]", raw.trim());
          }
          pushLogRef.current(raw.trim());
          return;
        }

        let msg: { action?: FlowWsAction; data?: unknown } | null = null;
        try {
          msg = JSON.parse(raw) as { action?: FlowWsAction; data?: unknown };
        } catch {
          pushLogRef.current(`[ui] parse error: ${raw.slice(0, 200)}`);
          return;
        }

        const action = msg?.action;
        const data = (msg?.data ?? {}) as Record<string, unknown>;

        if (action === "log_record") {
          const log = String((data as FlowLogData).log ?? "");
          const src = String((data as FlowLogData).source ?? "device");
          pushLogRef.current(`[log:${src}] ${log}`);
          return;
        }

        if (action === "sensor_data_update") {
          const s = data as FlowSensorData;
          if (typeof s.brewActive === "boolean") {
            shotActiveRef.current = s.brewActive;
            if (!s.brewActive) {
              setRawJson([]);
            }
          }
          setSensor(s);
          if (includeRawJsonDuringShot && shotActiveRef.current) {
            pushRawRef.current(raw.trim());
          }
          return;
        }

        if (action === "shot_data_update") {
          shotActiveRef.current = true;
          setShot(data as FlowShotData);
          if (includeRawJsonDuringShot) {
            pushRawRef.current(raw.trim());
          }
          return;
        }

        const asRecord = msg as Record<string, unknown>;
        if (
          typeof asRecord?.active === "number" &&
          Array.isArray(asRecord.slots) &&
          asRecord.slots.length > 0
        ) {
          console.log("[FlowProfiling] PROFILES raw response", raw);
          console.log("[FlowProfiling] PROFILES parsed", msg);
          const slots = asRecord.slots as Array<Record<string, unknown>>;
          const payload: DeviceProfilesPayload = {
            active: asRecord.active as number,
            slots: slots.map((s) => ({
              index: (s.index as number) ?? 0,
              name: (typeof s.name === "string" ? s.name : "") as string,
              profile: (typeof s.profile === "string" ? s.profile : "") as string,
              isActive: Boolean(s.isActive),
            })),
          };
          setDeviceProfiles(payload);
          pushLogRef.current("[rx] PROFILES");
          return;
        }

        if (action === "profile") {
          if (setProfileFromMessageRef.current(msg?.data ?? msg)) return;
        } else if (setProfileFromMessageRef.current(msg)) {
          return;
        }

        pushLogRef.current(`[ui] unknown message: ${raw.slice(0, 200)}`);
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
  }, [url, reconnectInterval, reconnectOnClose, requestProfileOnConnect]);

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
      if (lastMessageTimeUpdateRef.current != null) {
        clearTimeout(lastMessageTimeUpdateRef.current);
        lastMessageTimeUpdateRef.current = null;
      }
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
    espProfile,
    deviceProfiles,
    logs,
    rawJson,
    reconnect,
    sendCommand,
    sendRaw,
  };
}


