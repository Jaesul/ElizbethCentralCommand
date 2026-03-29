"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FlowWsAction = "sensor_data_update" | "shot_data_update" | "log_record";
export type FlowConnectionState =
  | "connecting"
  | "connected"
  | "stale"
  | "reconnecting"
  | "disconnected";

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
  keepAliveThresholdMs?: number;
  keepAliveIntervalMs?: number;
  staleMessageThresholdMs?: number;
  forceReconnectThresholdMs?: number;
  refreshThrottleMs?: number;
}

/** Coerce raw WebSocket payload to FlowShotData so numeric fields are real numbers (ESP may send strings or alternate keys). */
function normalizeShotData(data: Record<string, unknown>): FlowShotData {
  const num = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  };
  return {
    timeInShot: num(data.timeInShot),
    profileTimeInShot: num(data.profileTimeInShot),
    pressure: num(data.pressure),
    pumpFlow: num(data.pumpFlow),
    weightFlow: num(data.weightFlow),
    shotWeight: num(data.shotWeight) ?? num(data.weight),
    waterPumped: num(data.waterPumped),
    targetPumpFlow: num(data.targetPumpFlow),
    targetPressure: num(data.targetPressure),
    phaseIdx: num(data.phaseIdx),
    phaseType: data.phaseType === "PRESSURE" || data.phaseType === "FLOW" ? data.phaseType : undefined,
    timeInPhase: num(data.timeInPhase),
    pumpClicks: num(data.pumpClicks),
    pumpCps: num(data.pumpCps),
    pumpPowerPct: num(data.pumpPowerPct),
  };
}

function parseStatusLine(line: string): { sensor: FlowSensorData; activeProfileIndex?: number } | null {
  if (!line.startsWith("[status]")) return null;

  const tokens = new Map<string, string>();
  for (const match of line.matchAll(/([A-Za-z]+)=([^\s]+)/g)) {
    const key = match[1];
    const value = match[2];
    if (key != null && value != null) {
      tokens.set(key, value);
    }
  }

  const parseNumber = (value: string | undefined, suffix?: string) => {
    if (!value) return undefined;
    const normalized = suffix && value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const brewActiveToken = tokens.get("brewActive");
  const brewActive =
    brewActiveToken === "1" ? true
    : brewActiveToken === "0" ? false
    : undefined;

  return {
    sensor: {
      brewActive,
      pressure: parseNumber(tokens.get("p"), "bar"),
      pumpFlow: parseNumber(tokens.get("pumpFlow"), "ml/s"),
      weight: parseNumber(tokens.get("weight"), "g"),
      weightFlow: parseNumber(tokens.get("weightFlow"), "g/s"),
      pumpClicks: parseNumber(tokens.get("clicks")),
      pumpCps: parseNumber(tokens.get("cps")),
      pumpPowerPct: parseNumber(tokens.get("power"), "%"),
    },
    activeProfileIndex: parseNumber(tokens.get("activeProfile")),
  };
}

const noopLog = (_line: string) => undefined;
const noopRaw = (_line: string) => undefined;
const noopProfile = (_obj: unknown) => false;
const FLOW_WS_DEBUG_PREFIX = "[FlowWS]";

export interface UseFlowProfilingWebSocketReturn {
  isConnected: boolean;
  connectionState: FlowConnectionState;
  isStale: boolean;
  isReconnecting: boolean;
  error: string | null;
  lastMessageTime: string | undefined;
  lastMessageAgeMs: number | null;
  sensor: FlowSensorData | null;
  shot: FlowShotData | null;
  /** Current profile from ESP (raw JSON), e.g. after sending PROFILES or from STATUS */
  espProfile: Record<string, unknown> | null;
  /** Response from PROFILES command (active index + slots with full profile JSON); null until first PROFILES reply */
  deviceProfiles: DeviceProfilesPayload | null;
  logs: string[];
  rawJson: string[];
  reconnect: () => void;
  refreshStatus: (reason?: string) => void;
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
  keepAliveThresholdMs = 4000,
  keepAliveIntervalMs = 4000,
  staleMessageThresholdMs = 8000,
  forceReconnectThresholdMs = 15000,
  refreshThrottleMs = 1500,
}: UseFlowProfilingWebSocketOptions): UseFlowProfilingWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<FlowConnectionState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState<string | undefined>();
  const [lastMessageAgeMs, setLastMessageAgeMs] = useState<number | null>(null);
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
  // True once we start receiving shot_data_update; used to avoid sensor_data_update
  // "synthetic shot" clobbering the real shot timebase and making time jump backwards.
  const hasShotTelemetryRef = useRef(false);
  const brewStartMsRef = useRef<number>(0);
  const lastMessageTimeRef = useRef<string>("");
  const lastMessageAtRef = useRef<number | null>(null);
  const lastMessageTimeUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healthMonitorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRefreshAtRef = useRef<number>(0);
  const hasConnectedOnceRef = useRef(false);
  const keepAlivePendingRef = useRef(false);
  const lastKeepAliveAtRef = useRef<number>(0);
  const setShotRef = useRef(setShot);
  const shotPayloadRef = useRef<FlowShotData | null>(null);
  const shotThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConnectionLogRef = useRef<string>("");
  const lastKeepAliveIssueRef = useRef<string>("");
  const lastSensorStatusRef = useRef<string>("");
  const lastShotPhaseLogRef = useRef<string>("");
  setShotRef.current = setShot;

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
  const pushLogRef = useRef<(line: string) => void>(noopLog);
  const pushRawRef = useRef<(line: string) => void>(noopRaw);
  const setProfileFromMessageRef = useRef<(obj: unknown) => boolean>(noopProfile);
  pushLogRef.current = pushLog;
  pushRawRef.current = pushRaw;
  setProfileFromMessageRef.current = setProfileFromMessage;

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
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    isConnectingRef.current = true;
    setIsConnected(false);
    setConnectionState(hasConnectedOnceRef.current ? "reconnecting" : "connecting");
    setError(null);
    console.log(`${FLOW_WS_DEBUG_PREFIX} connect:start`, {
      url,
      hasConnectedOnce: hasConnectedOnceRef.current,
    });

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;
      const reqProfile = requestProfileOnConnect;

      ws.onopen = () => {
        setIsConnected(true);
        setConnectionState("connected");
        setError(null);
        isConnectingRef.current = false;
        keepAlivePendingRef.current = false;
        lastKeepAliveAtRef.current = 0;
        lastKeepAliveIssueRef.current = "";
        hasConnectedOnceRef.current = true;
        pushLogRef.current(`[ui] connected: ${url}`);
        console.log(`${FLOW_WS_DEBUG_PREFIX} open`, {
          url,
          requestProfileOnConnect: reqProfile,
        });
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
        keepAlivePendingRef.current = false;
        lastKeepAliveIssueRef.current = "";
        setConnectionState("connected");
        const nowIso = new Date().toISOString();
        const nowMs = Date.now();
        lastMessageTimeRef.current = nowIso;
        lastMessageAtRef.current = nowMs;
        setLastMessageAgeMs(0);
        // Throttle lastMessageTime state updates to avoid "Maximum update depth" when ESP sends many messages
        lastMessageTimeUpdateRef.current ??= setTimeout(() => {
          lastMessageTimeUpdateRef.current = null;
          setLastMessageTime(lastMessageTimeRef.current);
        }, 100);

        const raw = String(event.data ?? "");
        if (!raw.trim().startsWith("{")) {
          const trimmed = raw.trim();
          const parsedStatus = parseStatusLine(trimmed);
          if (parsedStatus) {
            const { sensor: statusSensor, activeProfileIndex } = parsedStatus;
            if (typeof statusSensor.brewActive === "boolean") {
              shotActiveRef.current = statusSensor.brewActive;
              if (!statusSensor.brewActive) {
                setRawJson([]);
                brewStartMsRef.current = 0;
                hasShotTelemetryRef.current = false;
                shotPayloadRef.current = null;
                setShotRef.current(null);
              } else if (brewStartMsRef.current === 0) {
                brewStartMsRef.current = Date.now();
              }
            }

            setSensor((prev) => ({ ...prev, ...statusSensor }));
            if (typeof activeProfileIndex === "number") {
              setDeviceProfiles((prev) => {
                if (!prev) return prev;
                return {
                  active: activeProfileIndex,
                  slots: prev.slots.map((slot) => ({
                    ...slot,
                    isActive: slot.index === activeProfileIndex,
                  })),
                };
              });
            }
          }
          if (raw.includes("[profile]") && (raw.includes("active set to") || raw.includes("SET_ACTIVE requires"))) {
            console.log("[Set active response]", raw.trim());
          }
          pushLogRef.current(trimmed);
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
          const sensorStatusKey = `${String(s.brewActive)}|${String(s.scalesPresent)}`;
          if (sensorStatusKey !== lastSensorStatusRef.current) {
            lastSensorStatusRef.current = sensorStatusKey;
            console.log(`${FLOW_WS_DEBUG_PREFIX} sensor`, {
              brewActive: s.brewActive,
              scalesPresent: s.scalesPresent,
              pressure: s.pressure,
              weight: s.weight,
              weightFlow: s.weightFlow,
            });
          }
          if (typeof s.brewActive === "boolean") {
            shotActiveRef.current = s.brewActive;
            if (!s.brewActive) {
              setRawJson([]);
              brewStartMsRef.current = 0;
              hasShotTelemetryRef.current = false;
              shotPayloadRef.current = null;
              setShotRef.current(null);
              lastShotPhaseLogRef.current = "";
            } else if (brewStartMsRef.current === 0) {
              brewStartMsRef.current = Date.now();
            }
          }
          setSensor(s);
          // Only synthesize shot points from sensor_data_update until we have real shot telemetry.
          if (shotActiveRef.current && !hasShotTelemetryRef.current) {
            const elapsed = Date.now() - brewStartMsRef.current;
            const normalized = normalizeShotData({ ...data, timeInShot: elapsed, shotWeight: data.weight ?? data.shotWeight });
            setShotRef.current(normalized);
          }
          if (includeRawJsonDuringShot && shotActiveRef.current) {
            pushRawRef.current(raw.trim());
          }
          return;
        }

        if (action === "shot_data_update") {
          shotActiveRef.current = true;
          hasShotTelemetryRef.current = true;
          const normalized = normalizeShotData(data);
          const shotPhaseKey = `${String(normalized.phaseIdx)}|${String(normalized.phaseType)}`;
          if (shotPhaseKey !== lastShotPhaseLogRef.current) {
            lastShotPhaseLogRef.current = shotPhaseKey;
            console.log(`${FLOW_WS_DEBUG_PREFIX} shot`, {
              phaseIdx: normalized.phaseIdx,
              phaseType: normalized.phaseType,
              timeInShot: normalized.timeInShot,
              profileTimeInShot: normalized.profileTimeInShot,
              targetPressure: normalized.targetPressure,
              targetPumpFlow: normalized.targetPumpFlow,
            });
          }
          shotPayloadRef.current = normalized;
          shotThrottleRef.current ??= setTimeout(() => {
            shotThrottleRef.current = null;
            const payload = shotPayloadRef.current;
            if (payload) setShotRef.current(payload);
          }, 50);
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
          const slots = asRecord.slots as Array<Record<string, unknown>>;
          const payload: DeviceProfilesPayload = {
            active: asRecord.active,
            slots: slots.map((s) => ({
              index: typeof s.index === "number" ? s.index : 0,
              name: typeof s.name === "string" ? s.name : "",
              profile: typeof s.profile === "string" ? s.profile : "",
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
        console.log(`${FLOW_WS_DEBUG_PREFIX} error`, { url });
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        isConnectingRef.current = false;
        wsRef.current = null;
        console.log(`${FLOW_WS_DEBUG_PREFIX} close`, {
          url,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          reconnectOnClose,
        });

        if (reconnectOnClose && event.code !== 1000) {
          setConnectionState("reconnecting");
          reconnectTimeoutRef.current = setTimeout(() => connect(), reconnectInterval);
        } else {
          setConnectionState("disconnected");
        }
      };
    } catch {
      setError("Failed to create WebSocket connection");
      isConnectingRef.current = false;
      setConnectionState(hasConnectedOnceRef.current ? "reconnecting" : "disconnected");

      if (reconnectOnClose) {
        reconnectTimeoutRef.current = setTimeout(() => connect(), reconnectInterval);
      }
    }
  }, [includeRawJsonDuringShot, reconnectInterval, reconnectOnClose, requestProfileOnConnect, url]);

  const reconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    keepAlivePendingRef.current = false;
    lastKeepAliveAtRef.current = 0;
    lastKeepAliveIssueRef.current = "";
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      ws.onclose = null;
      ws.close(4000, "Manual reconnect");
    }
    connect();
  }, [connect]);

  const refreshStatus = useCallback(
    (reason = "manual") => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < refreshThrottleMs) return;
      lastRefreshAtRef.current = now;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send("STATUS");
          pushLog(`[tx] STATUS (${reason})`);
          wsRef.current.send("PROFILES");
          pushLog(`[tx] PROFILES (${reason})`);
          setError(null);
        } catch {
          setError("Failed to refresh device status");
        }
        return;
      }

      setError("WebSocket not connected");
      connect();
    },
    [connect, pushLog, refreshThrottleMs],
  );

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
    const summary = `${connectionState}|${isConnected ? "1" : "0"}|${error ?? ""}`;
    if (summary !== lastConnectionLogRef.current) {
      lastConnectionLogRef.current = summary;
      console.log(`${FLOW_WS_DEBUG_PREFIX} state`, {
        url,
        connectionState,
        isConnected,
        error,
      });
    }
  }, [connectionState, error, isConnected, url]);

  useEffect(() => {
    if (!url) return;
    connect();
    return () => {
      if (lastMessageTimeUpdateRef.current != null) {
        clearTimeout(lastMessageTimeUpdateRef.current);
        lastMessageTimeUpdateRef.current = null;
      }
      if (shotThrottleRef.current != null) {
        clearTimeout(shotThrottleRef.current);
        shotThrottleRef.current = null;
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounting");
        wsRef.current = null;
      }
    };
  }, [connect, url]);

  useEffect(() => {
    const effectiveStaleThresholdMs = Math.max(staleMessageThresholdMs, forceReconnectThresholdMs);

    if (healthMonitorRef.current != null) {
      clearInterval(healthMonitorRef.current);
      healthMonitorRef.current = null;
    }

    healthMonitorRef.current = setInterval(() => {
      const now = Date.now();
      const lastMessageAt = lastMessageAtRef.current;
      const age = lastMessageAt == null ? null : now - lastMessageAt;
      setLastMessageAgeMs((prev) => (prev === age ? prev : age));

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (age == null) return;

      if (
        age >= keepAliveThresholdMs &&
        now - lastKeepAliveAtRef.current >= keepAliveIntervalMs
      ) {
        lastKeepAliveAtRef.current = now;
        keepAlivePendingRef.current = true;
        pushLogRef.current(`[ui] keepalive check (${age}ms idle)`);
        try {
          ws.send("PING");
          pushLogRef.current("[tx] PING (keepalive)");
          ws.send("STATUS");
          pushLogRef.current("[tx] STATUS (keepalive)");
          setError(null);
        } catch {
          setError("Failed to send keepalive ping");
        }
      }

      if (age >= effectiveStaleThresholdMs) {
        const issueKey = `stale:${lastKeepAliveAtRef.current}`;
        if (lastKeepAliveIssueRef.current !== issueKey) {
          lastKeepAliveIssueRef.current = issueKey;
          pushLogRef.current(`[ui] keepalive unanswered after ${age}ms`);
        }
        setConnectionState("stale");
        return;
      }

      setConnectionState("connected");
    }, 1000);

    return () => {
      if (healthMonitorRef.current != null) {
        clearInterval(healthMonitorRef.current);
        healthMonitorRef.current = null;
      }
    };
  }, [forceReconnectThresholdMs, keepAliveIntervalMs, keepAliveThresholdMs, staleMessageThresholdMs]);

  return {
    isConnected,
    connectionState,
    isStale: connectionState === "stale",
    isReconnecting: connectionState === "reconnecting",
    error,
    lastMessageTime,
    lastMessageAgeMs,
    sensor,
    shot,
    espProfile,
    deviceProfiles,
    logs,
    rawJson,
    reconnect,
    refreshStatus,
    sendCommand,
    sendRaw,
  };
}


