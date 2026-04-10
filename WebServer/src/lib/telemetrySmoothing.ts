/**
 * Exponential moving average left-to-right. Each output depends only on prior samples
 * and the current one, so when new points are appended the smoothed series for earlier
 * indices stays the same (unlike centered window smoothing).
 */
export function exponentialMovingAverage(
  values: (number | undefined)[],
  alpha: number,
): (number | undefined)[] {
  if (values.length === 0) return [];
  const a = Math.min(1, Math.max(0, alpha));
  const out: (number | undefined)[] = new Array(values.length);
  let prevSmoothed: number | undefined = undefined;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      out[i] = v;
      prevSmoothed = undefined;
      continue;
    }
    if (prevSmoothed === undefined) {
      out[i] = v;
      prevSmoothed = v;
    } else {
      const smoothed: number = a * v + (1 - a) * prevSmoothed;
      out[i] = smoothed;
      prevSmoothed = smoothed;
    }
  }

  return out;
}
