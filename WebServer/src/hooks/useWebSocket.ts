"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { type ShotStopperData, type EndType } from "~/types/shotstopper";

interface UseWebSocketOptions {
  url: string;
  reconnectInterval?: number;
  reconnectOnClose?: boolean;
  staleTimeoutMs?: number;
  backoffMaxMs?: number;
  backoffFactor?: number;
  backoffJitterPct?: number;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  connectionState: "disconnected" | "connecting" | "connected" | "stale" | "reconnecting";
  reconnectAttempt: number;
  data: ShotStopperData | null;
  error: string | null;
  lastMessageTime: string | undefined;
  reconnect: () => void;
  sendMessage: (message: object) => void;
}

export function useWebSocket({
  url,
  reconnectInterval = 5000,
  reconnectOnClose = true,
  staleTimeoutMs = 30000,
  backoffMaxMs = 60000,
  backoffFactor = 2,
  backoffJitterPct = 0.1,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected" | "stale" | "reconnecting"
  >("disconnected");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [data, setData] = useState<ShotStopperData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState<string | undefined>();
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const staleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastRxMsRef = useRef<number>(0);
  const reconnectAttemptRef = useRef<number>(0);
  const isConnectingRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (staleTimeoutRef.current) {
      clearTimeout(staleTimeoutRef.current);
      staleTimeoutRef.current = null;
    }
  }, []);

  const noteRx = useCallback(() => {
    lastRxMsRef.current = Date.now();
    if (staleTimeoutRef.current) clearTimeout(staleTimeoutRef.current);
    staleTimeoutRef.current = setTimeout(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      setConnectionState("stale");
      setError((prev) => prev ?? `WebSocket stale (no data for ${Math.round(staleTimeoutMs / 1000)}s)`);
      try {
        ws.close(4000, "stale");
      } catch {
        // ignore
      }
    }, staleTimeoutMs);
  }, [staleTimeoutMs]);

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
    [reconnectInterval, backoffFactor, backoffMaxMs, backoffJitterPct],
  );

  const connect = useCallback(() => {
    // Don't connect if URL is empty
    if (!url || url.trim() === "") {
      isConnectingRef.current = false;
      setIsConnected(false);
      setConnectionState("disconnected");
      return;
    }

    // Prevent multiple connection attempts
    if (isConnectingRef.current || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    // Clean up existing connection
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
      };

      ws.onmessage = (event) => {
        try {
          noteRx();
          // ESP32 now sends data directly (no wrapper from Node.js server)
          const espData = JSON.parse(event.data as string) as {
            timestamp?: number;
            currentWeight?: number;
            weight?: number;
            shotTimer?: number;
            timer?: number;
            brewing?: boolean;
            isBrewing?: boolean;
            goalWeight?: number;
            weightOffset?: number;
            expectedEndTime?: number;
            endType?: EndType;
            datapoints?: number;
            pumpPowerPct?: number;
            currentPressure?: number;
            pressurePSI?: number;
            pressureBar?: number;
            serialLog?: string;
            adcValue?: number;
            adcVoltage?: number;
            sensorVoltage?: number;
            pressureMPA?: number;
          };
          
          // Map ESP32 data to ShotStopperData format
          // ESP32 timestamp is in seconds (millis() / 1000), convert to ISO string
          let timestamp: string;
          if (espData.timestamp && typeof espData.timestamp === 'number') {
            // ESP32 sends timestamp in seconds
            timestamp = new Date(espData.timestamp * 1000).toISOString();
          } else {
            // Fallback to current time
            timestamp = new Date().toISOString();
          }

          const shotData: ShotStopperData = {
            currentWeight: espData.currentWeight ?? espData.weight,
            shotTimer: espData.shotTimer ?? espData.timer,
            brewing: espData.brewing ?? espData.isBrewing,
            goalWeight: espData.goalWeight,
            weightOffset: espData.weightOffset,
            expectedEndTime: espData.expectedEndTime,
            endType: espData.endType,
            datapoints: espData.datapoints,
            timestamp: timestamp,
            currentPressure: espData.currentPressure ?? espData.pressureBar ?? undefined,
            pressurePSI: espData.pressurePSI ?? undefined,
            pressureBar: espData.pressureBar ?? espData.currentPressure ?? undefined,
            pumpPowerPct: espData.pumpPowerPct ?? undefined,
          };

          setData(shotData);
          setLastMessageTime(timestamp);
        } catch {
          setError("Failed to parse message from ESP32");
        }
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

        // Attempt to reconnect if enabled and not a manual close
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
  }, [url, reconnectOnClose, clearTimers, computeBackoffDelayMs, noteRx]);

  const reconnect = useCallback(() => {
    clearTimers();
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    connect();
  }, [clearTimers, connect]);

  const sendMessage = useCallback((message: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch {
        setError("Failed to send message to ESP32");
      }
    } else {
      setError("WebSocket not connected");
    }
  }, []);

  useEffect(() => {
    // Only connect if we have a valid URL
    if (!url) {
      return;
    }

    // Connect on mount
    connect();

    // Cleanup on unmount
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
    data,
    error,
    lastMessageTime,
    reconnect,
    sendMessage,
  };
}

