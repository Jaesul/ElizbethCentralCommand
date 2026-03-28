import type {
  PressureProfile,
  PressureDataPoint,
  PhaseProfile,
  PhaseGraphPoint,
  Phase,
  PhaseTarget,
  PhaseStopConditions,
  GlobalStopConditions,
} from "~/types/profiles";

/**
 * Generate time/pressure data points from a pressure profile for graph visualization
 */
export function generateProfileData(profile: PressureProfile): PressureDataPoint[] {
  const data: PressureDataPoint[] = [];
  let currentTime = 0;
  let currentPressure = 0;

  // Pre-infusion stage
  data.push({ time: currentTime, pressure: profile.preInfusion.pressure, stage: "preInfusion" });
  currentTime += profile.preInfusion.duration;
  currentPressure = profile.preInfusion.pressure;
  data.push({ time: currentTime, pressure: currentPressure, stage: "preInfusion" });

  // Ramp stage - linear interpolation with more points for smoother curves
  const rampStartTime = currentTime;
  const rampEndTime = currentTime + profile.ramp.duration;
  const rampSteps = Math.max(10, Math.ceil(profile.ramp.duration * 4)); // At least 4 points per second for smoother curves
  for (let i = 0; i <= rampSteps; i++) {
    const t = i / rampSteps;
    const time = rampStartTime + t * profile.ramp.duration;
    const pressure = currentPressure + t * (profile.ramp.targetPressure - currentPressure);
    data.push({ time, pressure, stage: "ramp" });
  }
  currentTime = rampEndTime;
  currentPressure = profile.ramp.targetPressure;

  // Hold stage - add intermediate points for smoother transitions
  data.push({ time: currentTime, pressure: currentPressure, stage: "hold" });
  if (profile.hold.duration > 0) {
    const holdSteps = Math.max(5, Math.ceil(profile.hold.duration * 2));
    for (let i = 1; i < holdSteps; i++) {
      const t = i / holdSteps;
      const time = currentTime + t * profile.hold.duration;
      data.push({ time, pressure: currentPressure, stage: "hold" });
    }
  }
  currentTime += profile.hold.duration;
  data.push({ time: currentTime, pressure: currentPressure, stage: "hold" });

  // Decline stage - linear interpolation with more points for smoother curves
  const declineStartTime = currentTime;
  const declineEndTime = currentTime + profile.decline.duration;
  const declineSteps = Math.max(10, Math.ceil(profile.decline.duration * 4));
  for (let i = 0; i <= declineSteps; i++) {
    const t = i / declineSteps;
    const time = declineStartTime + t * profile.decline.duration;
    const pressure = currentPressure + t * (profile.decline.targetPressure - currentPressure);
    data.push({ time, pressure, stage: "decline" });
  }

  return data;
}

/**
 * Calculate total duration of a profile in seconds
 */
export function calculateTotalDuration(profile: PressureProfile): number {
  return (
    profile.preInfusion.duration +
    profile.ramp.duration +
    profile.hold.duration +
    profile.decline.duration
  );
}

/**
 * Validate a pressure profile
 */
export function validateProfile(profile: Partial<PressureProfile>): string[] {
  const errors: string[] = [];

  if (!profile.name || profile.name.trim().length === 0) {
    errors.push("Profile name is required");
  }

  if (!profile.preInfusion) {
    errors.push("Pre-infusion stage is required");
  } else {
    if (profile.preInfusion.duration < 0 || profile.preInfusion.duration > 60) {
      errors.push("Pre-infusion duration must be between 0 and 60 seconds");
    }
    if (profile.preInfusion.pressure < 0 || profile.preInfusion.pressure > 15) {
      errors.push("Pre-infusion pressure must be between 0 and 15 bar");
    }
  }

  if (!profile.ramp) {
    errors.push("Ramp stage is required");
  } else {
    if (profile.ramp.duration < 0 || profile.ramp.duration > 30) {
      errors.push("Ramp duration must be between 0 and 30 seconds");
    }
    if (profile.ramp.targetPressure < 0 || profile.ramp.targetPressure > 15) {
      errors.push("Ramp target pressure must be between 0 and 15 bar");
    }
  }

  if (!profile.hold) {
    errors.push("Hold stage is required");
  } else {
    if (profile.hold.duration < 0 || profile.hold.duration > 120) {
      errors.push("Hold duration must be between 0 and 120 seconds");
    }
    if (profile.hold.pressure < 0 || profile.hold.pressure > 15) {
      errors.push("Hold pressure must be between 0 and 15 bar");
    }
  }

  if (!profile.decline) {
    errors.push("Decline stage is required");
  } else {
    if (profile.decline.duration < 0 || profile.decline.duration > 30) {
      errors.push("Decline duration must be between 0 and 30 seconds");
    }
    if (profile.decline.targetPressure < 0 || profile.decline.targetPressure > 15) {
      errors.push("Decline target pressure must be between 0 and 15 bar");
    }
  }

  if (!profile.stop) {
    errors.push("Stop condition is required");
  } else {
    if (profile.stop.weight < 10 || profile.stop.weight > 200) {
      errors.push("Stop weight must be between 10 and 200 grams");
    }
  }

  return errors;
}

// --- Phase profile helpers ---

function easeInOut(t: number): number {
  return 0.5 * (Math.sin((t - 0.5) * Math.PI) + 1);
}
function easeIn(t: number): number {
  return Math.pow(t, 1.675);
}
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 1.675);
}

function interpolate(curve: TransitionCurve, t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  switch (curve) {
    case "INSTANT":
      return 1;
    case "LINEAR":
      return t;
    case "EASE_IN":
      return easeIn(t);
    case "EASE_OUT":
      return easeOut(t);
    case "EASE_IN_OUT":
      return easeInOut(t);
    default:
      return t;
  }
}

/**
 * Normalize a profile (e.g. from API/ESP) for graphing.
 * - Converts time from milliseconds to seconds when values look like ms (> 100).
 * - Converts target.start === -1 to undefined so the graph uses "previous phase end".
 * Returns a full PhaseProfile so it can be passed to generatePhaseProfileGraphData / PhaseProfileGraph.
 */
export function normalizeProfileForGraph(profile: {
  name?: string;
  id?: string;
  phases: Array<{
    type?: "PRESSURE" | "FLOW";
    target?: { start?: number; end?: number; curve?: string; time?: number };
    restriction?: number;
    stopConditions?: Record<string, number>;
  }>;
  globalStopConditions?: Record<string, number>;
}): PhaseProfile {
  const toSeconds = (v: number | undefined): number => {
    if (v == null || Number.isNaN(v)) return 5;
    if (v > 100) return v / 1000;
    return v;
  };

  const phases: Phase[] = (profile.phases ?? []).map((p) => {
    const target = p.target ?? { end: 0, curve: "INSTANT" as const, time: 0 };
    const start = target.start;
    const normalizedStart: number | undefined =
      start == null || start === -1 ? undefined : start;

    const rawStop = (p.stopConditions as PhaseStopConditions) ?? {};
    const normalizedStop: PhaseStopConditions = { ...rawStop };
    if (typeof rawStop.time === "number" && rawStop.time > 0) {
      normalizedStop.time = toSeconds(rawStop.time);
    }

    return {
      type: p.type === "FLOW" ? "FLOW" : "PRESSURE",
      target: {
        start: normalizedStart,
        end: typeof target.end === "number" ? target.end : 0,
        curve:
          target.curve === "LINEAR" ||
          target.curve === "EASE_IN" ||
          target.curve === "EASE_OUT" ||
          target.curve === "EASE_IN_OUT"
            ? target.curve
            : "INSTANT",
        time: toSeconds(target.time),
      },
      restriction: typeof p.restriction === "number" ? p.restriction : 0,
      stopConditions: normalizedStop,
    };
  });

  const globalStopConditions: GlobalStopConditions = {};
  const raw = profile.globalStopConditions ?? {};
  if (typeof raw.weight === "number" && raw.weight > 0) globalStopConditions.weight = raw.weight;
  if (typeof raw.time === "number" && raw.time > 0) globalStopConditions.time = toSeconds(raw.time);
  if (typeof raw.waterPumped === "number" && raw.waterPumped > 0) globalStopConditions.waterPumped = raw.waterPumped;

  return {
    id: profile.id ?? "graph-profile",
    name: profile.name ?? "Profile",
    phases,
    globalStopConditions,
  };
}

type RawImportPhase = {
  type?: unknown;
  target?: {
    start?: unknown;
    end?: unknown;
    curve?: unknown;
    time?: unknown;
  };
  restriction?: unknown;
  stopConditions?: Record<string, unknown>;
};

type RawImportProfile = {
  name?: unknown;
  phases?: unknown;
  globalStopConditions?: unknown;
};

export function importGaggiuinoProfile(rawJson: string): { profile?: PhaseProfile; errors: string[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return { errors: ["Invalid JSON. Paste a valid Gaggiuino profile object."] };
  }

  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { errors: ["Profile must be a JSON object."] };
  }

  const raw = parsed as RawImportProfile;
  const errors: string[] = [];

  if (typeof raw.name !== "string" || raw.name.trim().length === 0) {
    errors.push("`name` must be a non-empty string.");
  }

  if (!Array.isArray(raw.phases) || raw.phases.length === 0) {
    errors.push("`phases` must be a non-empty array.");
  }

  if (raw.globalStopConditions == null || typeof raw.globalStopConditions !== "object" || Array.isArray(raw.globalStopConditions)) {
    errors.push("`globalStopConditions` must be an object.");
  }

  const phases = Array.isArray(raw.phases) ? raw.phases : [];
  phases.forEach((phase, index) => {
    if (phase == null || typeof phase !== "object" || Array.isArray(phase)) {
      errors.push(`Phase ${index + 1} must be an object.`);
      return;
    }

    const p = phase as RawImportPhase;
    if (p.type !== "PRESSURE" && p.type !== "FLOW") {
      errors.push(`Phase ${index + 1}: \`type\` must be PRESSURE or FLOW.`);
    }

    if (p.target == null || typeof p.target !== "object" || Array.isArray(p.target)) {
      errors.push(`Phase ${index + 1}: \`target\` must be an object.`);
    } else {
      if (typeof p.target.end !== "number" || !Number.isFinite(p.target.end)) {
        errors.push(`Phase ${index + 1}: \`target.end\` must be a number.`);
      }
      if (
        p.target.curve !== "INSTANT" &&
        p.target.curve !== "LINEAR" &&
        p.target.curve !== "EASE_IN" &&
        p.target.curve !== "EASE_OUT" &&
        p.target.curve !== "EASE_IN_OUT"
      ) {
        errors.push(`Phase ${index + 1}: \`target.curve\` must be a supported curve.`);
      }
      if (p.target.time != null && (typeof p.target.time !== "number" || !Number.isFinite(p.target.time))) {
        errors.push(`Phase ${index + 1}: \`target.time\` must be a number when provided.`);
      }
      if (p.target.start != null && (typeof p.target.start !== "number" || !Number.isFinite(p.target.start))) {
        errors.push(`Phase ${index + 1}: \`target.start\` must be a number when provided.`);
      }
    }

    if (typeof p.restriction !== "number" || !Number.isFinite(p.restriction)) {
      errors.push(`Phase ${index + 1}: \`restriction\` must be a number.`);
    }

    if (p.stopConditions == null || typeof p.stopConditions !== "object" || Array.isArray(p.stopConditions)) {
      errors.push(`Phase ${index + 1}: \`stopConditions\` must be an object.`);
    }
  });

  if (errors.length > 0) {
    return { errors };
  }

  const normalized = normalizeProfileForGraph({
    id: "imported-gaggiuino-profile",
    name: raw.name as string,
    phases: phases as Array<{
      type?: "PRESSURE" | "FLOW";
      target?: { start?: number; end?: number; curve?: string; time?: number };
      restriction?: number;
      stopConditions?: Record<string, number>;
    }>,
    globalStopConditions: raw.globalStopConditions as Record<string, number>,
  });

  const profileErrors = validatePhaseProfile(normalized);
  if (profileErrors.length > 0) {
    return { errors: profileErrors };
  }

  return { profile: normalized, errors: [] };
}

/**
 * Estimate phase duration in seconds for graphing.
 * Prefer the explicit target transition time.
 * If a phase has no target time but does have a time stop condition, use that.
 * Otherwise default to 5 seconds so pressure/flow-only stop phases still render on the graph.
 */
function getPhaseDurationSec(phase: Phase): number {
  const targetTimeSec = phase.target.time ?? 0;
  if (targetTimeSec > 0) return targetTimeSec;

  const stopTimeSec = phase.stopConditions.time ?? 0;
  if (stopTimeSec > 0) return stopTimeSec;

  return 5;
}

/**
 * Generate graph data for a phase profile (target + restriction, pressure and flow)
 */
export function generatePhaseProfileGraphData(profile: PhaseProfile): PhaseGraphPoint[] {
  const points: PhaseGraphPoint[] = [];
  let currentTimeSec = 0;

  for (let i = 0; i < profile.phases.length; i++) {
    const phase = profile.phases[i]!;
    const phaseDurationSec = getPhaseDurationSec(phase);
    const target = phase.target;
    const startVal = target.start ?? (i === 0 ? 0 : profile.phases[i - 1]!.target.end);
    const endVal = target.end;
    const steps = Math.max(50, Math.ceil(phaseDurationSec * 25));

    const phaseEndTime = currentTimeSec + phaseDurationSec;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const timeInPhaseSec = t * phaseDurationSec;
      let timeSecFromStart = currentTimeSec + timeInPhaseSec;
      // Exact boundary times so step lines draw vertical segments at phase transitions
      if (s === 0 && i > 0) timeSecFromStart = currentTimeSec;
      else if (s === steps) timeSecFromStart = phaseEndTime;
      // No rounding of mid-phase times so the curve stays smooth

      // For INSTANT curves, jump to endVal immediately
      // For other curves (LINEAR, EASE_*, etc.), interpolate over the phase duration
      let targetVal: number;
      if (target.curve === "INSTANT") {
        targetVal = endVal;
      } else {
        // Interpolate from startVal to endVal over the phase duration
        const x = phaseDurationSec > 0 ? Math.min(timeInPhaseSec / phaseDurationSec, 1) : 1;
        targetVal = startVal + interpolate(target.curve, x) * (endVal - startVal);
      }

      const pt: PhaseGraphPoint = {
        time: timeSecFromStart,
        phaseIndex: i,
      };
      // Each phase is its own line: targetPressure_i, restrictionFlow_i (pressure phase) or targetFlow_i, restrictionPressure_i (flow phase)
      if (phase.type === "PRESSURE") {
        pt[`targetPressure_${i}`] = targetVal;
        pt[`restrictionFlow_${i}`] = phase.restriction;
      } else {
        pt[`targetFlow_${i}`] = targetVal;
        pt[`restrictionPressure_${i}`] = phase.restriction;
      }
      points.push(pt);
    }
    currentTimeSec += phaseDurationSec;
  }

  // Add connector points at phase boundaries (short vertical lines connecting phases)
  let boundaryTime = 0;
  for (let i = 0; i < profile.phases.length - 1; i++) {
    const phase = profile.phases[i]!;
    const nextPhase = profile.phases[i + 1]!;
    boundaryTime += getPhaseDurationSec(phase);

    // Get end values for phase i
    const endPressure = phase.type === "PRESSURE" ? phase.target.end : phase.restriction;
    const endFlow = phase.type === "PRESSURE" ? phase.restriction : phase.target.end;

    // For instant phases, the boundary value shown on the graph is target.end immediately.
    const nextStartVal =
      nextPhase.target.curve === "INSTANT"
        ? nextPhase.target.end
        : (nextPhase.target.start ?? nextPhase.target.end);
    const nextStartPressure = nextPhase.type === "PRESSURE" ? nextStartVal : nextPhase.restriction;
    const nextStartFlow = nextPhase.type === "PRESSURE" ? nextPhase.restriction : nextStartVal;

    // Add connector points (two points at boundary to draw the vertical line)
    points.push({
      time: boundaryTime - 0.005,
      [`connectorPressure_${i}`]: endPressure,
      [`connectorFlow_${i}`]: endFlow,
    });
    points.push({
      time: boundaryTime + 0.005,
      [`connectorPressure_${i}`]: nextStartPressure,
      [`connectorFlow_${i}`]: nextStartFlow,
    });
  }

  return points.sort((a, b) => a.time - b.time);
}

/**
 * Estimate total duration of a phase profile in seconds
 */
export function calculatePhaseProfileDuration(profile: PhaseProfile): number {
  return profile.phases.reduce((sum, p) => sum + getPhaseDurationSec(p), 0);
}

/**
 * Return times (in seconds) where one phase ends and the next begins (for vertical connector lines).
 * Excludes 0 and the end time; e.g. for two 10s phases returns [10].
 */
export function getPhaseBoundaryTimes(profile: PhaseProfile): number[] {
  const boundaries: number[] = [];
  let t = 0;
  for (let i = 0; i < profile.phases.length; i++) {
    const phase = profile.phases[i]!;
    t += getPhaseDurationSec(phase);
    if (i < profile.phases.length - 1) boundaries.push(t);
  }
  return boundaries;
}

/**
 * Validate a phase profile
 */
export function validatePhaseProfile(profile: Partial<PhaseProfile>): string[] {
  const errors: string[] = [];

  if (!profile.name || profile.name.trim().length === 0) {
    errors.push("Profile name is required");
  }

  if (!profile.phases || !Array.isArray(profile.phases)) {
    errors.push("At least one phase is required");
    return errors;
  }
  if (profile.phases.length < 1 || profile.phases.length > 10) {
    errors.push("Profile must have between 1 and 10 phases");
  }

  profile.phases.forEach((phase, idx) => {
    if (!phase) return;
    if (!phase.type || (phase.type !== "PRESSURE" && phase.type !== "FLOW")) {
      errors.push(`Phase ${idx + 1}: type must be PRESSURE or FLOW`);
    }
    if (phase.target == null) {
      errors.push(`Phase ${idx + 1}: target is required`);
    } else {
      if (typeof phase.target.end !== "number") {
        errors.push(`Phase ${idx + 1}: target.end is required`);
      }
      if (phase.target.time < 0) {
        errors.push(`Phase ${idx + 1}: target.time must be >= 0`);
      }
    }
    if (typeof phase.restriction !== "number" || phase.restriction < 0) {
      errors.push(`Phase ${idx + 1}: restriction must be >= 0`);
    }
  });

  return errors;
}

/**
 * Convert legacy PressureProfile to PhaseProfile (fixed mapping)
 */
export function pressureProfileToPhaseProfile(p: PressureProfile): PhaseProfile {
  return {
    id: p.id,
    name: p.name,
    phases: [
      {
        type: "PRESSURE",
        target: { end: p.preInfusion.pressure, curve: "INSTANT", time: 0 },
        restriction: p.preInfusion.pressure,
        stopConditions: { time: p.preInfusion.duration },
      },
      {
        type: "PRESSURE",
        target: { end: p.ramp.targetPressure, curve: "LINEAR", time: p.ramp.duration },
        restriction: p.ramp.targetPressure,
        stopConditions: { time: p.ramp.duration },
      },
      {
        type: "PRESSURE",
        target: { end: p.hold.pressure, curve: "INSTANT", time: 0 },
        restriction: p.hold.pressure,
        stopConditions: { time: p.hold.duration },
      },
      {
        type: "PRESSURE",
        target: { end: p.decline.targetPressure, curve: "LINEAR", time: p.decline.duration },
        restriction: p.hold.pressure,
        stopConditions: {},
      },
    ],
    globalStopConditions: { weight: p.stop.weight },
  };
}

/**
 * Convert PhaseProfile to PressureProfile (lossy; only for legacy compatibility)
 */
export function phaseProfileToPressureProfile(p: PhaseProfile): PressureProfile | null {
  if (p.phases.length < 4) return null;
  const pre = p.phases[0];
  const ramp = p.phases[1];
  const hold = p.phases[2];
  const decline = p.phases[3];
  if (!pre || !ramp || !hold || !decline) return null;
  if (pre.type !== "PRESSURE" || ramp.type !== "PRESSURE" || hold.type !== "PRESSURE" || decline.type !== "PRESSURE") return null;

  const preTimeSec = pre.stopConditions.time ?? 0;
  const rampTimeSec = ramp.stopConditions.time ?? ramp.target.time;
  const holdTimeSec = hold.stopConditions.time ?? 0;
  const declineTimeSec = decline.stopConditions.time ?? decline.target.time;

  return {
    id: p.id,
    name: p.name,
    preInfusion: { duration: preTimeSec, pressure: pre.target.end },
    ramp: { duration: rampTimeSec, targetPressure: ramp.target.end },
    hold: { duration: holdTimeSec, pressure: hold.target.end },
    decline: { duration: declineTimeSec, targetPressure: decline.target.end },
    stop: { weight: p.globalStopConditions.weight ?? 40 },
  };
}

