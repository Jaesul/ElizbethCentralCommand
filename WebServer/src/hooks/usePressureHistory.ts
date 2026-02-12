"use client";

import { useState, useEffect, useRef } from "react";
import { type ShotStopperData } from "~/types/shotstopper";

export interface PressureDataPoint {
  time: number; // Time in seconds
  pressure: number; // Pressure in bar
  timestamp: number; // Absolute timestamp (millis)
}

export function usePressureHistory(data: ShotStopperData | null) {
  const [pressureHistory, setPressureHistory] = useState<PressureDataPoint[]>([]);
  const [isActive, setIsActive] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;

    const pressure = data.currentPressure ?? data.pressureBar;
    if (pressure === undefined) return;

    const wasBrewing = isActive;
    const isBrewing = data.brewing ?? false;

    // Shot just started - start tracking pressure
    if (isBrewing && !wasBrewing) {
      startTimeRef.current = Date.now();
      lastTimeRef.current = null;
      // Clear history when new shot starts
      setPressureHistory([]);
      setIsActive(true);
      return;
    }

    // Shot ended - stop adding points but keep the completed data
    if (!isBrewing && wasBrewing) {
      setIsActive(false);
      return;
    }

    // Only add data points during active brewing
    if (isBrewing && isActive && startTimeRef.current !== null) {
      const now = Date.now();
      const elapsed = (now - startTimeRef.current) / 1000; // Time in seconds

      // Throttle: only add point if enough time has passed (avoid too many points)
      const TIME_THRESHOLD = 0.05; // 50ms minimum between points
      if (lastTimeRef.current !== null && elapsed - lastTimeRef.current < TIME_THRESHOLD) {
        return;
      }

      setPressureHistory((prev) => {
        // Skip duplicates (same time and pressure)
        const lastPoint = prev[prev.length - 1];
        if (lastPoint && Math.abs(lastPoint.time - elapsed) < 0.01 && Math.abs(lastPoint.pressure - pressure) < 0.01) {
          return prev; // Skip true duplicates
        }

        // If same time but different pressure, update it
        if (lastPoint && Math.abs(lastPoint.time - elapsed) < 0.01) {
          return [...prev.slice(0, -1), { time: elapsed, pressure, timestamp: now }];
        }

        // Add new data point
        lastTimeRef.current = elapsed;
        return [...prev, { time: elapsed, pressure, timestamp: now }];
      });
    }
  }, [data, isActive]);

  // Clear history
  const clearHistory = () => {
    setPressureHistory([]);
    startTimeRef.current = null;
    lastTimeRef.current = null;
    setIsActive(false);
  };

  return {
    pressureHistory,
    isActive,
    clearHistory,
  };
}

