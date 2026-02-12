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

