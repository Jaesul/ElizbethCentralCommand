export interface PreInfusionStage {
  duration: number; // seconds
  pressure: number; // bar
}

export interface RampStage {
  duration: number; // seconds
  targetPressure: number; // bar
}

export interface HoldStage {
  duration: number; // seconds
  pressure: number; // bar
}

export interface DeclineStage {
  duration: number; // seconds
  targetPressure: number; // bar
}

export interface StopCondition {
  weight: number; // grams
}

export interface PressureProfile {
  id: string; // Unique identifier
  name: string;
  preInfusion: PreInfusionStage;
  ramp: RampStage;
  hold: HoldStage;
  decline: DeclineStage;
  stop: StopCondition;
}

// Data point for graph visualization
export interface PressureDataPoint {
  time: number; // seconds
  pressure: number; // bar
  stage?: string; // Stage name for reference
}

// Phase-based profile (firmware-aligned)
export type TransitionCurve =
  | "INSTANT"
  | "LINEAR"
  | "EASE_IN"
  | "EASE_OUT"
  | "EASE_IN_OUT";

export interface PhaseTarget {
  start?: number;
  end: number;
  curve: TransitionCurve;
  /** Transition duration in seconds; must be 0 when curve is INSTANT (use phase stopConditions.time for hold). */
  time: number;
}

export interface PhaseStopConditions {
  time?: number; // seconds
  pressureAbove?: number;
  pressureBelow?: number;
  flowAbove?: number;
  flowBelow?: number;
  weight?: number;
  waterPumpedInPhase?: number;
}

/** Single stop condition for UI: type + value. Used in dropdown list. */
export type PhaseStopConditionType = keyof PhaseStopConditions;
export interface PhaseStopConditionEntry {
  type: PhaseStopConditionType;
  value: number;
}

export interface Phase {
  type: "PRESSURE" | "FLOW";
  target: PhaseTarget;
  restriction: number;
  stopConditions: PhaseStopConditions;
}

export interface GlobalStopConditions {
  time?: number; // seconds
  weight?: number;
  waterPumped?: number;
}

export type GlobalStopConditionType = keyof GlobalStopConditions;
export interface GlobalStopConditionEntry {
  type: GlobalStopConditionType;
  value: number;
}

export interface PhaseProfile {
  id: string;
  name: string;
  phases: Phase[];
  globalStopConditions: GlobalStopConditions;
}

// Data point for phase profile line chart. Each phase is its own line: targetPressure_0, restrictionFlow_0, etc.
export type PhaseGraphPoint = {
  time: number; // seconds
  phaseIndex?: number;
} & Record<string, number | undefined>;

// Default profiles
export const defaultProfiles: PressureProfile[] = [
  {
    id: "classic",
    name: "Classic",
    preInfusion: { duration: 4, pressure: 2 },
    ramp: { duration: 5, targetPressure: 9 },
    hold: { duration: 10, pressure: 9 },
    decline: { duration: 7, targetPressure: 6 },
    stop: { weight: 40 },
  },
  {
    id: "turbo",
    name: "Turbo",
    preInfusion: { duration: 2, pressure: 1 },
    ramp: { duration: 3, targetPressure: 6 },
    hold: { duration: 15, pressure: 6 },
    decline: { duration: 5, targetPressure: 4 },
    stop: { weight: 50 },
  },
  {
    id: "allonge",
    name: "Allonge",
    preInfusion: { duration: 6, pressure: 1.5 },
    ramp: { duration: 8, targetPressure: 7 },
    hold: { duration: 20, pressure: 7 },
    decline: { duration: 10, targetPressure: 5 },
    stop: { weight: 100 },
  },
];

// Default phase-based profiles (firmware-aligned)
export const defaultPhaseProfiles: PhaseProfile[] = [
  {
    id: "blooming",
    name: "Blooming",
    phases: [
      {
        type: "PRESSURE",
        target: { start: -1, end: 3, curve: "INSTANT", time: 0 },
        restriction: 6,
        stopConditions: { time: 10 },
      },
      {
        type: "PRESSURE",
        target: { start: -1, end: 9, curve: "LINEAR", time: 6 },
        restriction: 9,
        stopConditions: { time: 6 },
      },
      {
        type: "PRESSURE",
        target: { start: -1, end: 6, curve: "EASE_OUT", time: 12 },
        restriction: 9,
        stopConditions: { weight: 50 },
      },
    ],
    globalStopConditions: { weight: 40 },
  },
];

