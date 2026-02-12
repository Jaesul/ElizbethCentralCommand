"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "~/components/ui/chart";
import type { FlowPhaseMarker, FlowShotPoint } from "~/hooks/useFlowShotHistory";

type Row = FlowShotPoint & { tS: number };

interface Props {
  points: FlowShotPoint[];
  phaseMarkers?: FlowPhaseMarker[];
}

// Mimic gaggiuino web shot chart: weight on left axis, pressure/flows/targets on right axis.
const chartConfig = {
  weight: { label: "Weight", color: "var(--chart-1)" },
  pressure: { label: "Pressure", color: "var(--chart-2)" },
  pumpFlow: { label: "Pump Flow", color: "var(--chart-3)" },
  weightFlow: { label: "Weight Flow", color: "var(--chart-4)" },
  targetPressure: { label: "Target Pressure", color: "color-mix(in oklab, var(--chart-2) 65%, transparent)" },
  targetPumpFlow: { label: "Target Flow", color: "color-mix(in oklab, var(--chart-3) 65%, transparent)" },
} satisfies ChartConfig;

export function FlowShotChartGaggiuinoStyle({ points, phaseMarkers = [] }: Props) {
  const data: Row[] = React.useMemo(() => points.map((p) => ({ ...p, tS: p.tMs / 1000 })), [points]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shot Chart</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Start a shot to populate the chart.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Shot Chart (Gaggiuino style)</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[340px] w-full">
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
            <ChartLegend content={<ChartLegendContent />} />

            {/* Optional phase markers (not in gaggiuino, but useful). */}
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
            {/* Pressure: render as raw segments (no smoothing) */}
            <Line yAxisId="y2" type="linear" dataKey="pressure" stroke="var(--color-pressure)" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line yAxisId="y2" type="linear" dataKey="pumpFlow" stroke="var(--color-pumpFlow)" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line yAxisId="y2" type="linear" dataKey="weightFlow" stroke="var(--color-weightFlow)" dot={false} strokeWidth={2} isAnimationActive={false} />

            {/* Targets (dashed like gaggiuino) */}
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
      </CardContent>
    </Card>
  );
}


