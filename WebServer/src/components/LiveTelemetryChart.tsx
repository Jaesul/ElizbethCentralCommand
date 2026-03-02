"use client";

import * as React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { FlowPhaseMarker, FlowShotPoint } from "~/hooks/useFlowShotHistory";
import { PROFILE_COLORS } from "~/lib/profileColors";

const TELEMETRY_COLORS = {
  pressure: "#dc2626",
  targetPressure: PROFILE_COLORS.pressure,
  pumpFlow: "#2563eb",
  targetPumpFlow: PROFILE_COLORS.flow,
  weight: "#16a34a",
  weightFlow: "#ca8a04",
};

type TelemetryRow = {
  time: number;
  pressure?: number;
  targetPressure?: number;
  pumpFlow?: number;
  targetPumpFlow?: number;
  weight?: number;
  weightFlow?: number;
};

interface LiveTelemetryChartProps {
  points: FlowShotPoint[];
  phaseMarkers?: FlowPhaseMarker[];
  height?: number;
}

export function LiveTelemetryChart({
  points,
  phaseMarkers = [],
  height = 360,
}: LiveTelemetryChartProps) {
  const data: TelemetryRow[] = React.useMemo(
    () =>
      points.map((p) => ({
        time: p.tMs / 1000,
        pressure: typeof p.pressure === "number" ? p.pressure : undefined,
        targetPressure: typeof p.targetPressure === "number" ? p.targetPressure : undefined,
        pumpFlow: typeof p.pumpFlow === "number" ? p.pumpFlow : undefined,
        targetPumpFlow: typeof p.targetPumpFlow === "number" ? p.targetPumpFlow : undefined,
        weight: typeof p.weight === "number" ? p.weight : undefined,
        weightFlow: typeof p.weightFlow === "number" ? p.weightFlow : undefined,
      })),
    [points]
  );

  const weightMax = React.useMemo(() => {
    const values = data.map((d) => d.weight).filter((v): v is number => typeof v === "number" && v > 0);
    return values.length === 0 ? 100 : Math.min(200, Math.ceil(Math.max(...values) / 10) * 10 + 20);
  }, [data]);

  const maxTime = React.useMemo(
    () => (data.length === 0 ? 1 : data.reduce((max, d) => Math.max(max, d.time), 1)),
    [data]
  );

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
        style={{ height: `${height}px` }}
      >
        Start a shot to see live telemetry.
      </div>
    );
  }

  const legendPayload = [
    { value: "Pressure (bar)", color: TELEMETRY_COLORS.pressure },
    { value: "Target pressure", color: TELEMETRY_COLORS.targetPressure, strokeDasharray: "5 5" },
    { value: "Pump flow (ml/s)", color: TELEMETRY_COLORS.pumpFlow },
    { value: "Target flow", color: TELEMETRY_COLORS.targetPumpFlow, strokeDasharray: "5 5" },
    { value: "Weight (g)", color: TELEMETRY_COLORS.weight },
    { value: "Weight flow (g/s)", color: TELEMETRY_COLORS.weightFlow, strokeDasharray: "4 4" },
  ];

  return (
    <div className="w-full min-w-0" style={{ height: `${height}px`, minHeight: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 44, right: 52, left: 0, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          {phaseMarkers.map((m) => (
            <ReferenceLine
              key={`phase-${m.tMs}`}
              yAxisId="primary"
              x={m.tMs / 1000}
              stroke="var(--muted-foreground)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              ifOverflow="extendDomain"
            />
          ))}
          <XAxis
            dataKey="time"
            type="number"
            domain={[0, Math.max(1, maxTime)]}
            tickFormatter={(v) => `${Number(v).toFixed(0)}`}
            label={{ value: "Time (s)", position: "insideBottom", offset: -5 }}
          />
          <YAxis
            yAxisId="primary"
            type="number"
            domain={[0, 12]}
            tickFormatter={(v) => `${Number(v).toFixed(0)}`}
            label={{
              value: "Pressure (bar), Flow (ml/s), Weight flow (g/s)",
              angle: -90,
              position: "insideLeft",
              dy: 70,
            }}
          />
          <YAxis
            yAxisId="weight"
            orientation="right"
            type="number"
            domain={[0, weightMax]}
            tickFormatter={(v) => `${Number(v).toFixed(0)}`}
            label={{ value: "Weight (g)", angle: 90, position: "insideRight", dy: -70 }}
          />
          <Legend
            payload={legendPayload}
            wrapperStyle={{ paddingTop: 20 }}
            content={({ payload }) => (
              <div className="flex flex-wrap justify-center gap-x-6 gap-y-1">
                {payload?.map((entry: { value?: string; color?: string; strokeDasharray?: string }, i: number) => (
                  <span key={i} className="inline-flex items-center gap-1.5 text-xs text-foreground">
                    <svg width="14" height="3" className="flex-shrink-0">
                      <line
                        x1="0"
                        y1="1.5"
                        x2="14"
                        y2="1.5"
                        stroke={entry.color ?? "currentColor"}
                        strokeWidth="2"
                        strokeDasharray={entry.strokeDasharray}
                      />
                    </svg>
                    {entry.value}
                  </span>
                ))}
              </div>
            )}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as TelemetryRow;
              const entries = Object.entries(row).filter(
                (entry): entry is [string, number] => entry[0] !== "time" && typeof entry[1] === "number"
              );
              return (
                <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-md">
                  <p className="text-xs text-muted-foreground">{row.time.toFixed(1)}s</p>
                  {entries.map(([k, v]) => (
                    <p key={k} className="text-sm">
                      {k}: {v.toFixed(2)}
                    </p>
                  ))}
                </div>
              );
            }}
          />
          <Line
            yAxisId="primary"
            type="linear"
            dataKey="pressure"
            name="Pressure"
            stroke={TELEMETRY_COLORS.pressure}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            yAxisId="primary"
            type="linear"
            dataKey="targetPressure"
            name="Target pressure"
            stroke={TELEMETRY_COLORS.targetPressure}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            yAxisId="primary"
            type="linear"
            dataKey="pumpFlow"
            name="Pump flow"
            stroke={TELEMETRY_COLORS.pumpFlow}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            yAxisId="primary"
            type="linear"
            dataKey="targetPumpFlow"
            name="Target flow"
            stroke={TELEMETRY_COLORS.targetPumpFlow}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            yAxisId="weight"
            type="linear"
            dataKey="weight"
            name="Weight"
            stroke={TELEMETRY_COLORS.weight}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            yAxisId="primary"
            type="linear"
            dataKey="weightFlow"
            name="Weight flow"
            stroke={TELEMETRY_COLORS.weightFlow}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
