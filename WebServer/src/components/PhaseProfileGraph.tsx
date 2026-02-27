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
import type { PhaseProfile, PhaseGraphPoint } from "~/types/profiles";
import { generatePhaseProfileGraphData, getPhaseBoundaryTimes } from "~/lib/profileUtils";
import { getLineDefsForProfile, getVisibleLineDefs } from "~/components/PhaseProfileChartLines";
import { Skeleton } from "~/components/ui/skeleton";
import { PROFILE_COLORS } from "~/lib/profileColors";

function hasPressureKey(d: PhaseGraphPoint): boolean {
  return Object.keys(d).some(
    (k) => (k.startsWith("targetPressure_") || k.startsWith("restrictionPressure_")) && typeof d[k] === "number"
  );
}
function hasFlowKey(d: PhaseGraphPoint): boolean {
  return Object.keys(d).some(
    (k) => (k.startsWith("targetFlow_") || k.startsWith("restrictionFlow_")) && typeof d[k] === "number"
  );
}
function pressureValues(data: PhaseGraphPoint[]): number[] {
  const out: number[] = [];
  data.forEach((d) => {
    Object.entries(d).forEach(([k, v]) => {
      if ((k.startsWith("targetPressure_") || k.startsWith("restrictionPressure_")) && typeof v === "number")
        out.push(v);
    });
  });
  return out;
}
function flowValues(data: PhaseGraphPoint[]): number[] {
  const out: number[] = [];
  data.forEach((d) => {
    Object.entries(d).forEach(([k, v]) => {
      if ((k.startsWith("targetFlow_") || k.startsWith("restrictionFlow_")) && typeof v === "number") out.push(v);
    });
  });
  return out;
}

/** Max without spreading (avoids call stack overflow on large data). */
function maxTime(data: PhaseGraphPoint[]): number {
  return data.length === 0 ? 1 : data.reduce((max, d) => Math.max(max, d.time), 1);
}

interface PhaseProfileGraphProps {
  profile: PhaseProfile;
  height?: number;
  inline?: boolean;
}

export function PhaseProfileGraph({ profile, height = 300, inline = false }: PhaseProfileGraphProps) {
  // Generate data on every render to ensure reactivity (profile changes frequently during editing)
  const data = generatePhaseProfileGraphData(profile);
  const lineDefs = getLineDefsForProfile(profile);
  const hasPressure = data.some(hasPressureKey);
  const hasFlow = data.some(hasFlowKey);
  const visibleLines = getVisibleLineDefs(data, lineDefs, hasPressure, hasFlow);

  if (data.length === 0) {
    if (inline) {
      return <div className="text-sm text-muted-foreground">No profile data</div>;
    }
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg border text-sm text-muted-foreground">
        No profile data
      </div>
    );
  }

  const maxTimeVal = maxTime(data);
  const boundaryTimes = getPhaseBoundaryTimes(profile);

  const legendPayload: { value: string; color: string; strokeDasharray?: string }[] = [];
  if (hasPressure) {
    legendPayload.push({ value: "Target pressure (bar)", color: PROFILE_COLORS.pressure });
    legendPayload.push({ value: "Flow cap (ml/s)", color: PROFILE_COLORS.flow, strokeDasharray: "5 5" });
  }
  if (hasFlow) {
    legendPayload.push({ value: "Target flow (ml/s)", color: PROFILE_COLORS.flow });
    legendPayload.push({ value: "Pressure cap (bar)", color: PROFILE_COLORS.pressure, strokeDasharray: "5 5" });
  }
  const legendDedup = legendPayload.filter(
    (item, i, arr) => arr.findIndex((x) => x.value === item.value && x.strokeDasharray === item.strokeDasharray) === i
  );

  // Key must include all inputs that affect graph shape so changing curve (or target start/end/time) forces a full remount
  const chartKey = profile.phases
    .map(
      (p) =>
        `${p.target.curve}-${p.target.start ?? ""}-${p.target.end}-${p.target.time}-${p.type}-${p.restriction}`
    )
    .join("|");

  const [isRecalculating, setIsRecalculating] = React.useState(true);
  React.useEffect(() => {
    setIsRecalculating(true);
    const t = setTimeout(() => setIsRecalculating(false), 220);
    return () => clearTimeout(t);
  }, [chartKey]);

  const chartContent = (
    <div className="relative w-full" style={{ height: `${height}px`, minHeight: `${height}px` }}>
      {isRecalculating && (
        <div
          className="absolute inset-0 z-10 flex flex-col gap-3 rounded-lg border border-border/50 bg-card/80 p-4"
          style={{ height: `${height}px`, minHeight: `${height}px` }}
          aria-hidden
        >
          <div className="flex gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="flex-1 w-full rounded-md" />
          <Skeleton className="h-3 w-full max-w-[60%]" />
        </div>
      )}
      <div key={chartKey} className="w-full h-full" style={{ visibility: isRecalculating ? "hidden" : "visible" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
          margin={{ top: 44, right: 10, left: 0, bottom: 20 }}
        >
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        {boundaryTimes.map((t) => (
          <ReferenceLine
            key={`boundary-${t}`}
            yAxisId="primary"
            x={t}
            stroke="var(--muted-foreground)"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            ifOverflow="extendDomain"
          />
        ))}
        <XAxis
          dataKey="time"
          type="number"
          domain={[0, maxTimeVal]}
          tickFormatter={(v) => `${v.toFixed(0)}`}
          label={{ value: "Time (s)", position: "insideBottom", offset: -5 }}
        />
        <YAxis
          yAxisId="primary"
          type="number"
          domain={[0, 12]}
          tickFormatter={(v) => `${Number(v).toFixed(0)}`}
          label={{ value: "Pressure (bar), Flow (ml/s)", angle: -90, position: "insideLeft", dy: 70 }}
        />
        <Legend
          payload={legendDedup}
          wrapperStyle={{ paddingTop: 20 }}
          content={({ payload }) => (
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-1">
              {payload?.map((entry: { value?: string; color?: string; strokeDasharray?: string }, i: number) => (
                <span key={i} className="text-xs text-foreground inline-flex items-center gap-1.5">
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
            const point = payload[0]?.payload as PhaseGraphPoint;
            const entries = Object.entries(point).filter(
              ([k, v]) => k !== "time" && k !== "phaseIndex" && typeof v === "number"
            );
            return (
              <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-md">
                <p className="text-xs text-muted-foreground">{point.time.toFixed(1)}s</p>
                {entries.map(([k, v]) => (
                  <p key={k} className="text-sm">
                    {k}: {typeof v === "number" ? v.toFixed(1) : v}
                  </p>
                ))}
              </div>
            );
          }}
        />
        {visibleLines.map((def) => (
          <Line
            key={def.dataKey}
            yAxisId="primary"
            type={def.type}
            dataKey={def.dataKey}
            name={def.name}
            stroke={def.stroke}
            strokeWidth={def.strokeWidth}
            strokeDasharray={def.strokeDasharray}
            dot={false}
            connectNulls={def.connectNulls !== false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  if (inline) return chartContent;

  return (
    <div className="w-full rounded-lg border p-4">
      <h3 className="mb-2 text-sm font-medium">Profile</h3>
      {chartContent}
    </div>
  );
}
