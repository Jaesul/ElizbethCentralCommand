export type EndType = "BUTTON" | "WEIGHT" | "TIME" | "DISCONNECT" | "UNDEF";

export interface ShotStopperData {
  currentWeight?: number;
  shotTimer?: number;
  brewing?: boolean;
  goalWeight?: number;
  weightOffset?: number;
  expectedEndTime?: number;
  endType?: EndType;
  datapoints?: number;
  timestamp?: string;
  currentPressure?: number;
  pressurePSI?: number;
  pressureBar?: number;
  pumpPowerPct?: number;
}

