"use client";

import * as React from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "~/components/ui/chart";
import type { FlowPhaseMarker, FlowShotPoint } from "~/hooks/useFlowShotHistory";

type Row = FlowShotPoint & { tS: number };

interface PressureFlowChartProps {
  points: FlowShotPoint[];
  phaseMarkers?: FlowPhaseMarker[];
}

const chartConfig = {
  pressure: { label: "Pressure", color: "var(--chart-2)" },
  pumpFlow: { label: "Pump Flow", color: "var(--chart-3)" },
  weightFlow: { label: "Scale Flow", color: "var(--chart-4)" },
  targetPressure: { label: "Target Pressure", color: "color-mix(in oklab, var(--chart-2) 65%, transparent)" },
  targetPumpFlow: { label: "Target Flow", color: "color-mix(in oklab, var(--chart-3) 65%, transparent)" },
} satisfies ChartConfig;

export function PressureFlowChart({ points, phaseMarkers = [] }: PressureFlowChartProps) {
  const data: Row[] = React.useMemo(() => points.map((p) => ({ ...p, tS: p.tMs / 1000 })), [points]);

  if (data.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pressure + Flow (0–12)</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <LineChart data={data} margin={{ left: 8, right: 12, top: 12, bottom: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="tS" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis tickLine={false} axisLine={false} width={42} domain={[0, 12]} />
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

            <Line type="linear" dataKey="pressure" stroke="var(--color-pressure)" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line type="linear" dataKey="pumpFlow" stroke="var(--color-pumpFlow)" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line type="linear" dataKey="weightFlow" stroke="var(--color-weightFlow)" dot={false} strokeWidth={2} isAnimationActive={false} />

            <Line
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

