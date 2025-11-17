"use client";

import { useState, useEffect, useRef } from "react";
import { type ShotStopperData } from "~/types/shotstopper";
import type { ShotDataPoint } from "~/components/ShotChart";

export function useShotHistory(data: ShotStopperData | null) {
  const [shotHistory, setShotHistory] = useState<ShotDataPoint[]>([]);
  const [isActiveShot, setIsActiveShot] = useState(false);
  const shotStartTimeRef = useRef<number | null>(null);

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
    if (isBrewing && isActiveShot && data.shotTimer !== undefined && data.currentWeight !== undefined) {
      const time = data.shotTimer;
      const weight = data.currentWeight;

      // Skip pre-tare measurements: ignore data points with zero or near-zero weight
      // This prevents negative flow rate calculation from pre-tare weight
      const WEIGHT_THRESHOLD = 0.5; // Ignore weights less than 0.5g
      
      setShotHistory((prev) => {
        // Skip zero/near-zero weight points (pre-tare or tare during shot)
        if (Math.abs(weight) < WEIGHT_THRESHOLD) {
          // If we have no history yet, this is a pre-tare measurement - skip it
          // If we have history, this might be a tare during shot - skip it
          return prev;
        }

        // Safety check: if prev has points but time is less than 0.5s, might be contamination
        // Clear if we detect a reset (shot timer goes back to near 0)
        if (prev.length > 0 && time < 0.5 && prev[prev.length - 1] && prev[prev.length - 1].time > 1.0) {
          // Time went backwards significantly - new shot started
          // Only add if weight is above threshold (not pre-tare)
          if (Math.abs(weight) >= WEIGHT_THRESHOLD) {
            return [{ time, weight }];
          }
          return prev;
        }

        // Only update if this is the exact same time and weight (true duplicate)
        const lastPoint = prev[prev.length - 1];
        
        // If same time AND same weight, skip (true duplicate)
        if (lastPoint && lastPoint.time === time && Math.abs(lastPoint.weight - weight) < 0.01) {
          return prev; // Skip true duplicates
        }

        // If same time but different weight, update it
        if (lastPoint && lastPoint.time === time) {
          return [...prev.slice(0, -1), { time, weight }];
        }

        // Add new data point (different time OR different weight)
        return [...prev, { time, weight }];
      });
    }
  }, [data, isActiveShot]);

  // Clear history when a new shot starts (handled above)
  const clearHistory = () => {
    setShotHistory([]);
    shotStartTimeRef.current = null;
    setIsActiveShot(false);
  };

  return {
    shotHistory,
    isActiveShot,
    clearHistory,
  };
}

