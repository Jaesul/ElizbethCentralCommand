/**
 * Single source of truth for pressure/flow profile UI colors.
 * Change these to switch the color scheme across the profile editor, step cards, and chart.
 */
export const PROFILE_PRESSURE_COLOR = "#eab308";
export const PROFILE_FLOW_COLOR = "#0ea5e9";

export const PROFILE_COLORS = {
  pressure: PROFILE_PRESSURE_COLOR,
  flow: PROFILE_FLOW_COLOR,
} as const;
