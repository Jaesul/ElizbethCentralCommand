"use client";

import type { PhaseProfile } from "~/types/profiles";
import type { PhaseGraphPoint } from "~/types/profiles";
import { PROFILE_COLORS } from "~/lib/profileColors";

const STROKE = {
  pressureTarget: PROFILE_COLORS.pressure,
  pressureRestriction: PROFILE_COLORS.pressure,
  flowTarget: PROFILE_COLORS.flow,
  flowRestriction: PROFILE_COLORS.flow,
} as const;

type LineType = "stepAfter" | "linear";
type YAxisId = "pressure" | "flow";

export interface PhaseProfileLineDef {
  dataKey: string;
  yAxisId: YAxisId;
  type: LineType;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  name: string;
  connectNulls?: boolean;
}

/** One line per phase: target + restriction for that phase (e.g. targetPressure_0, restrictionFlow_0). No connectors. */
export function getLineDefsForProfile(profile: PhaseProfile): PhaseProfileLineDef[] {
  const defs: PhaseProfileLineDef[] = [];
  profile.phases.forEach((phase, i) => {
    // Target lines: INSTANT uses stepAfter (jump), others use linear (diagonal)
    // Restriction lines: always stepAfter (instant)
    const targetLineType: LineType = phase.target.curve === "INSTANT" ? "stepAfter" : "linear";

    if (phase.type === "PRESSURE") {
      defs.push({
        dataKey: `targetPressure_${i}`,
        yAxisId: "pressure",
        type: targetLineType,
        stroke: STROKE.pressureTarget,
        strokeWidth: 2,
        name: `pressure_${i}`,
      });
      defs.push({
        dataKey: `restrictionFlow_${i}`,
        yAxisId: "flow",
        type: "stepAfter",
        stroke: STROKE.flowRestriction,
        strokeWidth: 1.5,
        strokeDasharray: "5 5",
        name: `flowRestriction_${i}`,
      });
    } else {
      defs.push({
        dataKey: `targetFlow_${i}`,
        yAxisId: "flow",
        type: targetLineType,
        stroke: STROKE.flowTarget,
        strokeWidth: 2,
        name: `flow_${i}`,
      });
      defs.push({
        dataKey: `restrictionPressure_${i}`,
        yAxisId: "pressure",
        type: "stepAfter",
        stroke: STROKE.pressureRestriction,
        strokeWidth: 1.5,
        strokeDasharray: "5 5",
        name: `pressureRestriction_${i}`,
      });
    }
  });

  // Add connector line defs for each phase boundary (i -> i+1)
  for (let i = 0; i < profile.phases.length - 1; i++) {
    const nextPhase = profile.phases[i + 1]!;
    const nextIsPressure = nextPhase.type === "PRESSURE";

    // Pressure connector: solid if next phase is PRESSURE, dashed if FLOW
    defs.push({
      dataKey: `connectorPressure_${i}`,
      yAxisId: "pressure",
      type: "linear",
      stroke: STROKE.pressureTarget,
      strokeWidth: 2,
      strokeDasharray: nextIsPressure ? undefined : "4 4",
      name: `connectorPressure_${i}`,
      connectNulls: true, // Each connector has only 2 points with unique key, safe to connect
    });

    // Flow connector: solid if next phase is FLOW, dashed if PRESSURE
    defs.push({
      dataKey: `connectorFlow_${i}`,
      yAxisId: "flow",
      type: "linear",
      stroke: STROKE.flowTarget,
      strokeWidth: 2,
      strokeDasharray: nextIsPressure ? "4 4" : undefined,
      name: `connectorFlow_${i}`,
      connectNulls: true, // Each connector has only 2 points with unique key, safe to connect
    });
  }

  return defs;
}

export function hasDataForKey(data: PhaseGraphPoint[], key: string): boolean {
  return data.some((d) => {
    const v = d[key];
    return v != null && typeof v === "number";
  });
}

/** Line defs that have at least one value in data; hasPressure/hasFlow from presence of any pressure/flow key. */
export function getVisibleLineDefs(
  data: PhaseGraphPoint[],
  lineDefs: PhaseProfileLineDef[],
  hasPressure: boolean,
  hasFlow: boolean
): PhaseProfileLineDef[] {
  return lineDefs.filter((def) => {
    if (!hasDataForKey(data, def.dataKey)) return false;
    // Connector lines are always visible if they have data (don't filter by hasPressure/hasFlow)
    if (def.dataKey.startsWith("connector")) return true;
    if (def.yAxisId === "pressure" && !hasPressure) return false;
    if (def.yAxisId === "flow" && !hasFlow) return false;
    return true;
  });
}
