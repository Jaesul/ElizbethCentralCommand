"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { type ShotStopperData } from "~/types/shotstopper";

interface UseWebSocketOptions {
  url: string;
  reconnectInterval?: number;
  reconnectOnClose?: boolean;
}

interface UseWebSocketReturn {
  isConnected: boolean;
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
}: UseWebSocketOptions): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [data, setData] = useState<ShotStopperData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState<string | undefined>();
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);

  const connect = useCallback(() => {
    // Prevent multiple connection attempts
    if (isConnectingRef.current || (wsRef.current && wsRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear any pending reconnect
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
      };

      ws.onmessage = (event) => {
        try {
          // ESP32 now sends data directly (no wrapper from Node.js server)
          const espData = JSON.parse(event.data);
          
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
          };

          setData(shotData);
          setLastMessageTime(timestamp);
        } catch (err) {
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

        // Attempt to reconnect if enabled and not a manual close
        if (reconnectOnClose && event.code !== 1000) {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };
    } catch (err) {
      setError("Failed to create WebSocket connection");
      isConnectingRef.current = false;

      if (reconnectOnClose) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      }
    }
  }, [url, reconnectInterval, reconnectOnClose]);

  const reconnect = useCallback(() => {
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    connect();
  }, [connect]);

  const sendMessage = useCallback((message: object) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (err) {
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
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounting");
        wsRef.current = null;
      }
    };
  }, [connect, url]);

  return {
    isConnected,
    data,
    error,
    lastMessageTime,
    reconnect,
    sendMessage,
  };
}

