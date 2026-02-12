"use client";

import { useState, useEffect, useRef } from "react";
import { type ShotStopperData } from "~/types/shotstopper";
import type { ShotDataPoint } from "~/components/ShotChart";

export function useShotHistory(data: ShotStopperData | null) {
  const [shotHistory, setShotHistory] = useState<ShotDataPoint[]>([]);
  const [isActiveShot, setIsActiveShot] = useState(false);
  const shotStartTimeRef = useRef<number | null>(null);
  const lastKnownPressureRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!data) return;

    const wasBrewing = isActiveShot;
    const isBrewing = data.brewing ?? false;

    // Shot just started - CLEAR history immediately and reset state
    if (isBrewing && !wasBrewing) {
      shotStartTimeRef.current = data.shotTimer ? -data.shotTimer : 0;
      // Force clear history immediately before adding any new points
      setShotHistory([]);
      setIsActiveShot(true);
      // Return early to ensure history is cleared before processing data
      return;
    }

    // Shot ended - stop adding points but keep the completed shot data
    if (!isBrewing && wasBrewing) {
      setIsActiveShot(false);
      // Don't process any more data points until a new shot starts
      return;
    }

    // Only add data points during active brewing (after history has been cleared)
    // Always add points even when weight is 0 to keep graph updating continuously
    if (isBrewing && isActiveShot && data.shotTimer !== undefined) {
      const time = data.shotTimer;
      // Use currentWeight if available, otherwise default to 0
      const weight = data.currentWeight !== undefined ? data.currentWeight : 0;
      // Get pressure, preserving last known value if current is undefined
      const currentPressure = data.currentPressure ?? data.pressureBar;
      const pressure = currentPressure !== undefined ? currentPressure : lastKnownPressureRef.current;
      
      // Update last known pressure if we have a new value
      if (currentPressure !== undefined) {
        lastKnownPressureRef.current = currentPressure;
      }
      
      setShotHistory((prev) => {
        // Safety check: if prev has points but time is less than 0.5s, might be contamination
        // Clear if we detect a reset (shot timer goes back to near 0)
        const lastPoint = prev[prev.length - 1];
        if (prev.length > 0 && time < 0.5 && lastPoint && lastPoint.time > 1.0) {
          // Time went backwards significantly - new shot started
          return [{ time, weight, pressure }];
        }

        // If same time AND same weight, skip (true duplicate)
        if (lastPoint?.time === time && Math.abs((lastPoint.weight ?? 0) - weight) < 0.01) {
          // But update pressure if it changed
          if (pressure !== undefined && Math.abs((lastPoint.pressure ?? 0) - pressure) >= 0.01) {
            return [...prev.slice(0, -1), { time, weight, pressure }];
          }
          return prev; // Skip true duplicates
        }

        // If same time but different weight, update it
        if (lastPoint?.time === time) {
          return [...prev.slice(0, -1), { time, weight, pressure }];
        }

        // Add new data point (different time OR different weight)
        // Always add points even if weight is 0 to keep graph updating
        return [...prev, { time, weight, pressure }];
      });
    }
  }, [data, isActiveShot]);

  // Clear history when a new shot starts (handled above)
  const clearHistory = () => {
    setShotHistory([]);
    shotStartTimeRef.current = null;
    setIsActiveShot(false);
    lastKnownPressureRef.current = undefined;
  };

  return {
    shotHistory,
    isActiveShot,
    clearHistory,
  };
}

