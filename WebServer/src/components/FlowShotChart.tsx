"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "~/components/ui/chart";
import type { FlowPhaseMarker, FlowShotPoint } from "~/hooks/useFlowShotHistory";

type Row = FlowShotPoint & { tS: number };

interface FlowShotChartProps {
  points: FlowShotPoint[];
  phaseMarkers?: FlowPhaseMarker[];
}

// Single combined shot chart: weight on left axis, pressure/flows/targets on right axis.
const chartConfig = {
  weight: { label: "Weight", color: "var(--chart-1)" },
  pressure: { label: "Pressure", color: "var(--chart-2)" },
  pumpFlow: { label: "Pump Flow (pump)", color: "var(--chart-3)" },
  weightFlow: { label: "Flow (scale)", color: "var(--chart-4)" },
  targetPressure: { label: "Target Pressure", color: "color-mix(in oklab, var(--chart-2) 65%, transparent)" },
  targetPumpFlow: { label: "Target Flow", color: "color-mix(in oklab, var(--chart-3) 65%, transparent)" },
} satisfies ChartConfig;

function lastDefined(points: FlowShotPoint[], key: keyof FlowShotPoint): number | undefined {
  for (let i = points.length - 1; i >= 0; i--) {
    const v = points[i]?.[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

export function FlowShotChart({ points, phaseMarkers = [] }: FlowShotChartProps) {
  const data: Row[] = React.useMemo(() => points.map((p) => ({ ...p, tS: p.tMs / 1000 })), [points]);

  const current = React.useMemo(() => {
    return {
      weight: lastDefined(points, "weight"),
      pressure: lastDefined(points, "pressure"),
      pumpFlow: lastDefined(points, "pumpFlow"),
      weightFlow: lastDefined(points, "weightFlow"),
      targetPressure: lastDefined(points, "targetPressure"),
      targetPumpFlow: lastDefined(points, "targetPumpFlow"),
    };
  }, [points]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shot Chart</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Start a shot to populate the chart.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shot Chart</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-[1fr_240px] md:items-start">
          <ChartContainer config={chartConfig} className="h-[360px] w-full">
            <LineChart data={data} margin={{ left: 8, right: 12, top: 12, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="tS" tickLine={false} axisLine={false} tickMargin={8} />

              {/* y1: weight */}
              <YAxis yAxisId="y1" tickLine={false} axisLine={false} width={42} domain={[0, "dataMax + 5"]} />
              {/* y2: pressure + flows */}
              <YAxis
                yAxisId="y2"
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={46}
                domain={[0, "dataMax + 2"]}
              />

              <ChartTooltip content={<ChartTooltipContent />} />

              {/* Phase markers */}
              {phaseMarkers.map((m) => (
                <ReferenceLine
                  key={`phase-${m.tMs}`}
                  x={m.tMs / 1000}
                  yAxisId="y2"
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                />
              ))}

              {/* Actuals */}
              <Line yAxisId="y1" type="linear" dataKey="weight" stroke="var(--color-weight)" dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line yAxisId="y2" type="linear" dataKey="pressure" stroke="var(--color-pressure)" dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line yAxisId="y2" type="linear" dataKey="pumpFlow" stroke="var(--color-pumpFlow)" dot={false} strokeWidth={2} isAnimationActive={false} />
              <Line yAxisId="y2" type="linear" dataKey="weightFlow" stroke="var(--color-weightFlow)" dot={false} strokeWidth={2} isAnimationActive={false} />

              {/* Targets (dashed) */}
              <Line
                yAxisId="y2"
                type="linear"
                dataKey="targetPressure"
                stroke="var(--color-targetPressure)"
                dot={false}
                strokeWidth={2}
                strokeDasharray="8 4"
                connectNulls
                isAnimationActive={false}
              />
              <Line
                yAxisId="y2"
                type="linear"
                dataKey="targetPumpFlow"
                stroke="var(--color-targetPumpFlow)"
                dot={false}
                strokeWidth={2}
                strokeDasharray="8 4"
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>

          {/* External legend + current values */}
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-sm font-medium">Current</div>
            <div className="mt-2 space-y-2 text-sm">
              <LegendRow color="var(--color-weight)" label="Weight" value={current.weight} suffix=" g" decimals={2} />
              <LegendRow color="var(--color-pressure)" label="Pressure" value={current.pressure} suffix=" bar" decimals={2} />
              <LegendRow color="var(--color-pumpFlow)" label="Pump flow" value={current.pumpFlow} suffix=" ml/s" decimals={2} />
              <LegendRow color="var(--color-weightFlow)" label="Scale flow" value={current.weightFlow} suffix=" g/s" decimals={2} />
              <LegendRow dashed color="var(--color-targetPressure)" label="Target pressure" value={current.targetPressure} suffix=" bar" decimals={2} />
              <LegendRow dashed color="var(--color-targetPumpFlow)" label="Target flow" value={current.targetPumpFlow} suffix=" ml/s" decimals={2} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendRow({
  color,
  label,
  value,
  suffix,
  decimals = 2,
  dashed = false,
}: {
  color: string;
  label: string;
  value: number | undefined;
  suffix: string;
  decimals?: number;
  dashed?: boolean;
}) {
  const text = typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(decimals)}${suffix}` : "--";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={dashed ? "h-2 w-5 border-t-2 border-dashed" : "h-2 w-5 rounded-[2px]"}
          style={dashed ? ({ borderColor: color } as React.CSSProperties) : ({ backgroundColor: color } as React.CSSProperties)}
          aria-hidden
        />
        <span className="truncate text-muted-foreground">{label}</span>
      </div>
      <span className="font-mono tabular-nums">{text}</span>
    </div>
  );
}


