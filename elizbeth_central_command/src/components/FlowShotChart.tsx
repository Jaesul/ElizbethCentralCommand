"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "~/components/ui/chart";
import type { FlowPhaseMarker, FlowShotPoint } from "~/hooks/useFlowShotHistory";

type FlowChartRow = FlowShotPoint & { tS: number };

interface FlowShotChartProps {
  points: FlowShotPoint[];
  phaseMarkers?: FlowPhaseMarker[];
}

const pressureConfig = {
  pressure: { label: "Pressure", color: "var(--chart-1)" },
  targetPressure: { label: "Target Pressure", color: "var(--chart-4)" },
} satisfies ChartConfig;

const weightConfig = {
  weight: { label: "Weight", color: "var(--chart-2)" },
  weightFlow: { label: "Weight Flow", color: "var(--chart-3)" },
} satisfies ChartConfig;

const pumpConfig = {
  pumpPowerPct: { label: "Pump Power", color: "var(--chart-1)" },
  pumpCps: { label: "Pump CPS", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function FlowShotChart({ points, phaseMarkers = [] }: FlowShotChartProps) {
  const data: FlowChartRow[] = React.useMemo(
    () => points.map((p) => ({ ...p, tS: p.tMs / 1000 })),
    [points],
  );

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Flow Profiling Charts</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Start a shot to populate the chart.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Pressure (Actual vs Target)</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={pressureConfig} className="h-[260px] w-full">
            <LineChart data={data} margin={{ left: 8, right: 8, top: 12, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="tS" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={40} domain={[0, "dataMax + 1"]} />
              <ChartTooltip content={<ChartTooltipContent />} />

              {phaseMarkers.map((m) => (
                <ReferenceLine
                  key={`phase-${m.tMs}`}
                  x={m.tMs / 1000}
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                />
              ))}

              <Line
                type="linear"
                dataKey="pressure"
                stroke="var(--chart-1)"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="targetPressure"
                stroke="var(--chart-4)"
                dot={false}
                strokeWidth={2}
                strokeDasharray="6 3"
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weight + Weight Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={weightConfig} className="h-[260px] w-full">
            <LineChart data={data} margin={{ left: 8, right: 8, top: 12, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="tS" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis yAxisId="w" tickLine={false} axisLine={false} width={40} domain={[0, "dataMax + 5"]} />
              <YAxis
                yAxisId="wf"
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={44}
                domain={[0, "dataMax + 1"]}
              />
              <ChartTooltip content={<ChartTooltipContent />} />

              {phaseMarkers.map((m) => (
                <ReferenceLine
                  key={`phasew-${m.tMs}`}
                  x={m.tMs / 1000}
                  yAxisId="w"
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                />
              ))}

              <Line
                yAxisId="w"
                type="linear"
                dataKey="weight"
                stroke="var(--chart-2)"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Line
                yAxisId="wf"
                type="linear"
                dataKey="weightFlow"
                stroke="var(--chart-3)"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pump Power + Click Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={pumpConfig} className="h-[240px] w-full">
            <LineChart data={data} margin={{ left: 8, right: 8, top: 12, bottom: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="tS" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis yAxisId="p" tickLine={false} axisLine={false} width={40} domain={[0, 100]} />
              <YAxis yAxisId="c" orientation="right" tickLine={false} axisLine={false} width={44} domain={[0, 70]} />
              <ChartTooltip content={<ChartTooltipContent />} />

              {phaseMarkers.map((m) => (
                <ReferenceLine
                  key={`phasep-${m.tMs}`}
                  x={m.tMs / 1000}
                  yAxisId="p"
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                />
              ))}

              <Line
                yAxisId="p"
                type="linear"
                dataKey="pumpPowerPct"
                stroke="var(--chart-1)"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Line
                yAxisId="c"
                type="linear"
                dataKey="pumpCps"
                stroke="var(--chart-2)"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}


