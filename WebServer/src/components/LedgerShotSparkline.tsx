"use client";

import * as React from "react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

import { exponentialMovingAverage } from "~/lib/telemetrySmoothing";
import type { LedgerTelemetryTrace } from "~/types/coffee";

const SPARKLINE_COLORS = {
  pressure: "#dc2626",
  targetPressure: "#7f1d1d",
  pumpFlow: "#2563eb",
  targetPumpFlow: "#1d4ed8",
  weight: "#16a34a",
  weightFlow: "#ca8a04",
} as const;

// Smaller alpha = heavier smoothing for the compact at-a-glance preview.
const SPARKLINE_EMA_ALPHA = 0.08;

type SparklineRow = {
  time: number;
  pressure?: number;
  targetPressure?: number;
  pumpFlow?: number;
  targetPumpFlow?: number;
  weight?: number;
  weightFlow?: number;
};

interface LedgerShotSparklineProps {
  trace: LedgerTelemetryTrace | null;
  height?: number;
}

export function LedgerShotSparkline({
  trace,
  height = 88,
}: LedgerShotSparklineProps) {
  if (!trace || trace.points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed px-2 text-xs text-muted-foreground"
        style={{ height }}
      >
        No trace
      </div>
    );
  }

  const data: SparklineRow[] = React.useMemo(() => {
    const raw = trace.points.map((point) => ({
      time: point.tMs / 1000,
      pressure: typeof point.pressure === "number" ? point.pressure : undefined,
      targetPressure:
        typeof point.targetPressure === "number" ? point.targetPressure : undefined,
      pumpFlow: typeof point.pumpFlow === "number" ? point.pumpFlow : undefined,
      targetPumpFlow:
        typeof point.targetPumpFlow === "number" ? point.targetPumpFlow : undefined,
      weight: typeof point.weight === "number" ? point.weight : undefined,
      weightFlow: typeof point.weightFlow === "number" ? point.weightFlow : undefined,
    }));

    const pressure = exponentialMovingAverage(
      raw.map((row) => row.pressure),
      SPARKLINE_EMA_ALPHA,
    );
    const pumpFlow = exponentialMovingAverage(
      raw.map((row) => row.pumpFlow),
      SPARKLINE_EMA_ALPHA,
    );
    const weight = exponentialMovingAverage(
      raw.map((row) => row.weight),
      SPARKLINE_EMA_ALPHA,
    );
    const weightFlow = exponentialMovingAverage(
      raw.map((row) => row.weightFlow),
      SPARKLINE_EMA_ALPHA,
    );

    return raw.map((row, idx) => ({
      ...row,
      pressure: pressure[idx],
      pumpFlow: pumpFlow[idx],
      weight: weight[idx],
      weightFlow: weightFlow[idx],
    }));
  }, [trace.points]);
  const maxTime = data.at(-1)?.time ?? 0;
  const primaryValues = data
    .flatMap((point) => [
      point.pressure,
      point.targetPressure,
      point.pumpFlow,
      point.targetPumpFlow,
      point.weightFlow,
    ])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const weightValues = data
    .map((point) => point.weight)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const primaryMax = primaryValues.length > 0 ? Math.max(...primaryValues) : 0;
  const weightMax = weightValues.length > 0 ? Math.max(...weightValues) : 0;
  const primaryUpperBound = Math.max(primaryMax * 1.08, 1);
  const weightUpperBound = Math.max(weightMax * 1.08, 1);

  return (
    <div className="overflow-hidden rounded-md border bg-muted/10" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 6, right: 8, bottom: 6, left: 8 }}
        >
          <XAxis type="number" dataKey="time" hide domain={[0, Math.max(maxTime, 1)]} />
          <YAxis yAxisId="primary" hide domain={[0, primaryUpperBound]} />
          <YAxis yAxisId="weight" hide orientation="right" domain={[0, weightUpperBound]} />
          <Line
            type="linear"
            dataKey="pressure"
            yAxisId="primary"
            stroke={SPARKLINE_COLORS.pressure}
            strokeWidth={1.8}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="stepAfter"
            dataKey="targetPressure"
            yAxisId="primary"
            stroke={SPARKLINE_COLORS.targetPressure}
            strokeWidth={1.2}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="pumpFlow"
            yAxisId="primary"
            stroke={SPARKLINE_COLORS.pumpFlow}
            strokeWidth={1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="stepAfter"
            dataKey="targetPumpFlow"
            yAxisId="primary"
            stroke={SPARKLINE_COLORS.targetPumpFlow}
            strokeWidth={1.1}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="weight"
            yAxisId="weight"
            stroke={SPARKLINE_COLORS.weight}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="linear"
            dataKey="weightFlow"
            yAxisId="primary"
            stroke={SPARKLINE_COLORS.weightFlow}
            strokeWidth={1.1}
            strokeDasharray="3 3"
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
