"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";
import type { PressureDataPoint } from "~/types/profiles";

interface ProfileGraphProps {
  data: PressureDataPoint[];
  height?: number;
  inline?: boolean; // If true, don't wrap in Card
}

const chartConfig = {
  pressure: {
    label: "Pressure",
    color: "var(--color-profile-orange)",
  },
} satisfies ChartConfig;

export function ProfileGraph({ data, height = 300, inline = false }: ProfileGraphProps) {
  if (data.length === 0) {
    if (inline) {
      return <div className="text-sm text-muted-foreground">No profile data available</div>;
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pressure Profile</CardTitle>
          <CardDescription>No profile data available</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Find max pressure for Y-axis scaling
  const maxPressure = Math.max(...data.map((d) => d.pressure));
  const maxTime = Math.max(...data.map((d) => d.time));

  const chartContent = (
    <ChartContainer 
      config={chartConfig} 
      className="w-full aspect-auto" 
      style={{ height: `${height}px` }}
    >
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
        <defs>
          <linearGradient id="fillPressure" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-profile-orange)"
              stopOpacity={0.8}
            />
            <stop
              offset="95%"
              stopColor="var(--color-profile-orange)"
              stopOpacity={0.1}
            />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="time"
          type="number"
          domain={[0, "dataMax"]}
          tickFormatter={(value) => `${value.toFixed(0)}`}
          label={{ value: "Time (s)", position: "insideBottom", offset: -5 }}
        />
        <YAxis
          dataKey="pressure"
          type="number"
          domain={[0, 10]}
          tickFormatter={(value) => `${value.toFixed(0)}`}
          label={{ value: "Pressure (bar)", angle: -90, position: "insideLeft" }}
        />
        <ChartTooltip
          content={({ active, payload }) => {
            if (!active || !payload || payload.length === 0) return null;
            const data = payload[0]!.payload as PressureDataPoint;
            return (
              <ChartTooltipContent>
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {data.time.toFixed(1)}s @ {data.pressure.toFixed(1)} bar
                  </p>
                  {data.stage && (
                    <p className="text-xs text-muted-foreground capitalize">
                      {data.stage}
                    </p>
                  )}
                </div>
              </ChartTooltipContent>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="pressure"
          fill="url(#fillPressure)"
          stroke="var(--color-profile-orange)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );

  if (inline) {
    return chartContent;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Pressure Profile</CardTitle>
        <CardDescription className="text-xs">Pressure curve over time</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">{chartContent}</CardContent>
    </Card>
  );
}

