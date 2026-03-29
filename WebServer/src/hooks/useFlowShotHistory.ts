"use client";

import { useEffect, useMemo, useState } from "react";
import type { FlowSensorData, FlowShotData } from "~/hooks/useFlowProfilingWebSocket";

export interface FlowShotPoint {
  tMs: number;
  pressure?: number;
  targetPressure?: number;
  pumpFlow?: number;
  targetPumpFlow?: number;
  weight?: number;
  weightFlow?: number;
  pumpPowerPct?: number;
  pumpCps?: number;
  pumpClicks?: number;
  phaseIdx?: number;
  phaseType?: "PRESSURE" | "FLOW";
}

export interface FlowPhaseMarker {
  tMs: number;
  phaseIdx: number;
  phaseType?: "PRESSURE" | "FLOW";
}

// Note: default maxPoints is intentionally high because FlowProfilingArduino can stream
// shot_data_update at relatively high rates (e.g. 20ms–100ms). A low cap silently drops
// older samples and makes the chart look "undersampled".
export function useFlowShotHistory(
  sensor: FlowSensorData | null,
  shot: FlowShotData | null,
  maxPoints = 10000,
  isTelemetryFresh = true,
) {
  const [points, setPoints] = useState<FlowShotPoint[]>([]);
  const [isActive, setIsActive] = useState(false);

  // Mark active/inactive based on sensor when available.
  // Important: do NOT clear points on brewActive=true because sensor_data_update is low-rate (1Hz)
  // and can arrive late, which would drop early shot samples and make the "first point" appear
  // far into the shot.
  useEffect(() => {
    if (!isTelemetryFresh) {
      if (isActive) setIsActive(false);
      return;
    }

    const brewActive = sensor?.brewActive ?? false;
    if (!brewActive && isActive) {
      setIsActive(false);
      return;
    }
    if (brewActive && !isActive) {
      setIsActive(true);
    }
  }, [sensor?.brewActive, isActive, isTelemetryFresh]);

  // Append new shot points (dedupe by tMs)
  useEffect(() => {
    if (!isTelemetryFresh) return;
    if (!shot) return;
    const tMs = typeof shot.timeInShot === "number" ? shot.timeInShot : undefined;
    if (tMs === undefined) return;

    // If we are receiving shot telemetry, consider the shot "active" immediately
    // (even before the 1Hz sensor_data_update arrives).
    if (!isActive) setIsActive(true);

    setPoints((prev) => {
      const last = prev[prev.length - 1];
      const nextPoint: FlowShotPoint = {
        tMs,
        pressure: typeof shot.pressure === "number" ? shot.pressure : undefined,
        targetPressure: typeof shot.targetPressure === "number" ? shot.targetPressure : undefined,
        pumpFlow: typeof shot.pumpFlow === "number" ? shot.pumpFlow : undefined,
        targetPumpFlow: typeof shot.targetPumpFlow === "number" ? shot.targetPumpFlow : undefined,
        weight: typeof shot.shotWeight === "number" ? shot.shotWeight : undefined,
        weightFlow: typeof shot.weightFlow === "number" ? shot.weightFlow : undefined,
        pumpPowerPct: typeof shot.pumpPowerPct === "number" ? shot.pumpPowerPct : undefined,
        pumpCps: typeof shot.pumpCps === "number" ? shot.pumpCps : undefined,
        pumpClicks: typeof shot.pumpClicks === "number" ? shot.pumpClicks : undefined,
        phaseIdx: typeof shot.phaseIdx === "number" ? shot.phaseIdx : undefined,
        phaseType: shot.phaseType,
      };

      // Dedupe / update same timestamp
      if (last?.tMs === tMs) {
        const next = [...prev.slice(0, -1), nextPoint];
        return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
      }
      // If time went backwards, treat as new shot
      if (last && tMs < last.tMs) {
        return [nextPoint];
      }
      const next = [...prev, nextPoint];
      return next.length > maxPoints ? next.slice(next.length - maxPoints) : next;
    });
  }, [shot, maxPoints, isActive, isTelemetryFresh]);

  const phaseMarkers = useMemo(() => {
    const markers: FlowPhaseMarker[] = [];
    let lastPhase: number | undefined = undefined;
    for (const p of points) {
      if (p.phaseIdx === undefined) continue;
      if (lastPhase === undefined || p.phaseIdx !== lastPhase) {
        markers.push({ tMs: p.tMs, phaseIdx: p.phaseIdx, phaseType: p.phaseType });
        lastPhase = p.phaseIdx;
      }
    }
    return markers;
  }, [points]);

  return { points, phaseMarkers, isActive };
}


