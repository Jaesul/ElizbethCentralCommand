"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart"

export interface ShotDataPoint {
  time: number; // seconds
  weight: number; // grams
  flowRate?: number; // g/s
}

interface ShotChartProps {
  dataPoints: ShotDataPoint[];
  isBrewing: boolean;
  goalWeight?: number;
}

const chartConfig = {
  weight: {
    label: "Weight",
    color: "var(--chart-1)",
  },
  flowRate: {
    label: "Flow Rate",
    color: "var(--chart-2)",
  },
  goalWeight: {
    label: "Target Weight",
    color: "var(--chart-4)", // Distinct color for target line
  },
} satisfies ChartConfig

export function ShotChart({ dataPoints, isBrewing, goalWeight }: ShotChartProps) {
  // Maintain EMA state and buffer for flow rate calculation
  const flowRateStateRef = React.useRef<{
    flowEMA: number;
    weights: number[];
    times: number[];
    flowRates: (number | undefined)[]; // Store all calculated flow rates
  }>({
    flowEMA: 0,
    weights: [],
    times: [],
    flowRates: [],
  });

  // Calculate flow rate for each data point and prepare chart data
  const chartData = React.useMemo(() => {
    if (dataPoints.length === 0) {
      // Reset state when no data
      flowRateStateRef.current = { flowEMA: 0, weights: [], times: [], flowRates: [] };
      return [];
    }

    // Configuration from FlowCald.ts - optimized for drip accounting
    const WINDOW_MS = 800; // 500ms window - larger than typical drip interval (400-600ms)
    const ALPHA = 0.2; // EMA smoothing factor - decent responsiveness
    const DEADBAND_GRAMS = 0.03; // Ignore tiny weight changes below this threshold (noise)
    const HISTORY_MS = 2500; // Keep ~2.5s of samples

    const state = flowRateStateRef.current;

    // Reset if shot restarted (dataPoints length decreased significantly)
    if (dataPoints.length < state.flowRates.length / 2) {
      state.flowEMA = 0;
      state.weights = [];
      state.times = [];
      state.flowRates = [];
    }

    // Only process new points (incremental like FlowRateCalculator)
    const startIndex = state.flowRates.length;

    // Process each point starting from where we left off
    for (let idx = startIndex; idx < dataPoints.length; idx++) {
      const point = dataPoints[idx];
      if (!point) continue;
      
      const weight = point.weight;
      const timeMs = point.time * 1000; // Convert seconds to milliseconds

      // Add sample to buffer
      state.weights.push(weight);
      state.times.push(timeMs);

      // Drop old samples outside history window (time-based pruning like FlowCald.ts)
      const cutoff = timeMs - HISTORY_MS;
      while (state.times.length > 0 && state.times[0] !== undefined && state.times[0] < cutoff) {
        state.times.shift();
        state.weights.shift();
      }

      let flowRate: number | undefined;

      // Calculate flow rate using time-based window (like FlowCald.ts)
      if (state.times.length < 2) {
        // Not enough data yet, use previous EMA
        flowRate = state.flowEMA > 0 ? state.flowEMA : undefined;
      } else {
        const i = state.times.length - 1; // Current index
        const tsMs = state.times[i];
        
        if (tsMs !== undefined) {
          // Find the sample at least WINDOW_MS ago
          const targetTime = tsMs - WINDOW_MS;
          let j = i - 1;

          // Walk backward until we find a point older than our target window
          while (j > 0 && state.times[j] !== undefined && state.times[j]! > targetTime) {
            j--;
          }

          // Ensure we have valid indices
          if (j >= 0 && state.times[j] !== undefined && state.weights[j] !== undefined && state.weights[i] !== undefined) {
            const dt = (state.times[i]! - state.times[j]!) / 1000; // Convert to seconds
            const dw = state.weights[i]! - state.weights[j]!;

            let flowRaw = 0;

            if (dt > 0) {
              // Deadband: treat tiny deltas as noise (accounts for scale jitter and drips)
              if (Math.abs(dw) >= DEADBAND_GRAMS) {
                flowRaw = dw / dt; // g/s over the window
              }
            }

            // EMA smoothing on top of windowed derivative
            state.flowEMA = ALPHA * flowRaw + (1 - ALPHA) * state.flowEMA;

            // Clamp negatives (noise from scale jitter) - NEVER allow negative flow
            if (state.flowEMA < 0) {
              state.flowEMA = 0;
            }

            flowRate = state.flowEMA;
          }
        }
      }

      // Store flow rate for this point
      state.flowRates.push(flowRate);
    }

    // Build chart data with all points (including previously processed ones)
    return dataPoints.map((point, index) => {
      // Use stored flow rate for this point
      const flowRate = state.flowRates[index];

      return {
        time: Number(point.time.toFixed(2)),
        weight: Number(point.weight.toFixed(1)),
        flowRate: flowRate !== undefined ? Number(flowRate.toFixed(2)) : undefined,
        goalWeight: goalWeight,
      };
    });
  }, [dataPoints, goalWeight]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Shot Chart</CardTitle>
          <CardDescription>No data available yet. Start a shot to see the chart.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="pt-0">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>Shot Profile</CardTitle>
          <CardDescription>
            {isBrewing ? "Live shot visualization" : "Completed shot profile"} ({chartData.length} data points)
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="fillWeight" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-weight)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-weight)"
                  stopOpacity={0.1}
                />
              </linearGradient>
              <linearGradient id="fillFlowRate" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-flowRate)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-flowRate)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => `${value}s`}
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => `Time: ${value}s`}
                  indicator="dot"
                />
              }
            />
            <Area
              yAxisId="left"
              dataKey="weight"
              type="natural"
              fill="url(#fillWeight)"
              stroke="var(--color-weight)"
            />
            <Area
              yAxisId="right"
              dataKey="flowRate"
              type="natural"
              fill="url(#fillFlowRate)"
              stroke="var(--color-flowRate)"
            />
            {goalWeight && (
              <Line
                yAxisId="left"
                type="natural"
                dataKey="goalWeight"
                stroke="var(--color-goalWeight)"
                strokeDasharray="5 5"
                dot={false}
              />
            )}
            <ChartLegend content={<ChartLegendContent />} />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
