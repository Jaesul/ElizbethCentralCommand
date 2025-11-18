import { useState, useEffect, useRef, useCallback } from "react";
import type { ShotStopperData } from "~/types/shotstopper";

interface MockDataGeneratorOptions {
  onData: (data: ShotStopperData) => void;
  goalWeight?: number;
}

export function useMockDataGenerator({ onData, goalWeight = 40 }: MockDataGeneratorOptions) {
  const [isBrewing, setIsBrewing] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const goalWeightRef = useRef(goalWeight);
  const brewingRef = useRef(false);

  useEffect(() => {
    goalWeightRef.current = goalWeight;
  }, [goalWeight]);

  const stopMockShot = useCallback(() => {
    setIsBrewing(false);
    brewingRef.current = false;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startTimeRef.current = null;
  }, []);

  const startMockShot = useCallback(() => {
    setIsBrewing(true);
    brewingRef.current = true;
    startTimeRef.current = Date.now();
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      if (!startTimeRef.current || !brewingRef.current) return;

      const elapsed = (Date.now() - startTimeRef.current) / 1000; // seconds
      const shotTimer = elapsed;

      // Simulate weight progression
      // Typical espresso shot: starts slow, accelerates, then slows down
      let currentWeight = 0;
      
      if (elapsed < 3) {
        // Pre-infusion phase - slow weight gain
        currentWeight = elapsed * 0.5;
      } else if (elapsed < 8) {
        // Main extraction - faster weight gain
        const mainPhaseTime = elapsed - 3;
        currentWeight = 1.5 + mainPhaseTime * 2.5; // ~2.5g/s
      } else {
        // Tailing off - slower weight gain
        const tailPhaseTime = elapsed - 8;
        currentWeight = 14 + tailPhaseTime * 1.2; // ~1.2g/s
      }

      // Add some realistic noise (±0.1g)
      currentWeight += (Math.random() - 0.5) * 0.2;

      // Calculate flow rate (simplified - derivative of weight)
      const flowRate = Math.max(0, 2.0 - elapsed * 0.1 + (Math.random() - 0.5) * 0.3);

      // Calculate expected end time (linear projection)
      const remainingWeight = Math.max(0, goalWeightRef.current - currentWeight);
      const expectedEndTime = remainingWeight > 0 && flowRate > 0 
        ? shotTimer + (remainingWeight / flowRate)
        : undefined;

      // Stop automatically when goal weight is reached
      if (currentWeight >= goalWeightRef.current * 0.98) {
        stopMockShot();
        currentWeight = goalWeightRef.current;
      }

      const mockData: ShotStopperData = {
        currentWeight: Math.max(0, currentWeight),
        shotTimer,
        brewing: brewingRef.current && currentWeight < goalWeightRef.current * 0.98,
        goalWeight: goalWeightRef.current,
        weightOffset: 0.4,
        flowRate,
        expectedEndTime,
        endType: currentWeight >= goalWeightRef.current * 0.98 ? "WEIGHT" : undefined,
        timestamp: Date.now().toString(),
      };

      onData(mockData);
    }, 50); // Update every 50ms (~20fps)
  }, [onData, stopMockShot]);

  const resetMockShot = useCallback(() => {
    stopMockShot();
    const resetData: ShotStopperData = {
      currentWeight: 0,
      shotTimer: 0,
      brewing: false,
      goalWeight: goalWeightRef.current,
      weightOffset: 0.4,
      flowRate: 0,
      timestamp: Date.now().toString(),
    };
    onData(resetData);
  }, [onData, stopMockShot]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    startMockShot,
    stopMockShot,
    resetMockShot,
    isBrewing,
  };
}

