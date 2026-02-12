import type { PressureProfile, PressureDataPoint } from "~/types/profiles";

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

