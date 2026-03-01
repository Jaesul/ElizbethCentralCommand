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
import { PROFILE_COLORS } from "~/lib/profileColors";
import type { FlowShotPoint } from "~/hooks/useFlowShotHistory";

const LIVE_COLORS = {
  actualPressure: "#dc2626",
  actualPumpFlow: "#2563eb",
  actualWeight: "#16a34a",
  actualWeightFlow: "#ca8a04",
};

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

function maxTime(data: { time: number }[]): number {
  return data.length === 0 ? 1 : data.reduce((max, d) => Math.max(max, d.time), 1);
}

export type MergedChartPoint = PhaseGraphPoint & {
  actualPressure?: number;
  actualPumpFlow?: number;
  actualWeight?: number;
  actualWeightFlow?: number;
};

interface PhaseProfileGraphWithLiveProps {
  profile: PhaseProfile;
  livePoints: FlowShotPoint[];
  height?: number;
}

export function PhaseProfileGraphWithLive({
  profile,
  livePoints,
  height = 400,
}: PhaseProfileGraphWithLiveProps) {
  const profileData = React.useMemo(() => generatePhaseProfileGraphData(profile), [profile]);
  const lineDefs = React.useMemo(() => getLineDefsForProfile(profile), [profile]);
  const hasPressure = profileData.some(hasPressureKey);
  const hasFlow = profileData.some(hasFlowKey);
  const visibleLines = React.useMemo(
    () => getVisibleLineDefs(profileData, lineDefs, hasPressure, hasFlow),
    [profileData, lineDefs, hasPressure, hasFlow]
  );

  const liveRows: MergedChartPoint[] = React.useMemo(
    () =>
      livePoints.map((p) => ({
        time: p.tMs / 1000,
        actualPressure: p.pressure,
        actualPumpFlow: p.pumpFlow,
        actualWeight: p.weight,
        actualWeightFlow: p.weightFlow,
      })),
    [livePoints]
  );

  const profileRows: MergedChartPoint[] = React.useMemo(
    () =>
      profileData.map((d) => ({
        ...d,
        actualPressure: undefined,
        actualPumpFlow: undefined,
        actualWeight: undefined,
        actualWeightFlow: undefined,
      })),
    [profileData]
  );

  const mergedData = React.useMemo(() => {
    const combined: MergedChartPoint[] = [
      ...profileRows,
      ...liveRows.map((r) => ({ ...r, phaseIndex: undefined })),
    ];
    combined.sort((a, b) => a.time - b.time);
    return combined;
  }, [profileRows, liveRows]);

  const maxTimeVal = maxTime(mergedData);
  const boundaryTimes = getPhaseBoundaryTimes(profile);
  const weightMax = React.useMemo(() => {
    const w = mergedData.map((d) => d.actualWeight).filter((v): v is number => typeof v === "number" && v > 0);
    return w.length === 0 ? 100 : Math.min(200, Math.ceil(Math.max(...w) / 10) * 10 + 20);
  }, [mergedData]);

  if (profileData.length === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center rounded-lg border text-sm text-muted-foreground">
        No profile data
      </div>
    );
  }

  const legendPayload: { value: string; color: string; strokeDasharray?: string }[] = [];
  if (hasPressure) {
    legendPayload.push({ value: "Target pressure (bar)", color: PROFILE_COLORS.pressure });
    legendPayload.push({ value: "Flow cap (ml/s)", color: PROFILE_COLORS.flow, strokeDasharray: "5 5" });
  }
  if (hasFlow) {
    legendPayload.push({ value: "Target flow (ml/s)", color: PROFILE_COLORS.flow });
    legendPayload.push({ value: "Pressure cap (bar)", color: PROFILE_COLORS.pressure, strokeDasharray: "5 5" });
  }
  legendPayload.push({ value: "Actual pressure", color: LIVE_COLORS.actualPressure });
  legendPayload.push({ value: "Actual pump flow", color: LIVE_COLORS.actualPumpFlow });
  legendPayload.push({ value: "Weight (g)", color: LIVE_COLORS.actualWeight });
  legendPayload.push({ value: "Weight flow (g/s)", color: LIVE_COLORS.actualWeightFlow });

  const hasLiveData = liveRows.length > 0;

  return (
    <div className="w-full" style={{ height: `${height}px`, minHeight: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={mergedData} margin={{ top: 44, right: 52, left: 0, bottom: 20 }}>
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
            tickFormatter={(v) => `${Number(v).toFixed(0)}`}
            label={{ value: "Time (s)", position: "insideBottom", offset: -5 }}
          />
          <YAxis
            yAxisId="primary"
            type="number"
            domain={[0, 12]}
            tickFormatter={(v) => `${Number(v).toFixed(0)}`}
            label={{ value: "Pressure (bar), Flow (ml/s)", angle: -90, position: "insideLeft", dy: 70 }}
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
              const point = payload[0]?.payload as MergedChartPoint;
              const entries = Object.entries(point).filter(
                ([k, v]) =>
                  k !== "time" &&
                  k !== "phaseIndex" &&
                  typeof v === "number" &&
                  (k.startsWith("target") ||
                    k.startsWith("restriction") ||
                    k.startsWith("connector") ||
                    k === "actualPressure" ||
                    k === "actualPumpFlow" ||
                    k === "actualWeight" ||
                    k === "actualWeightFlow")
              );
              return (
                <div className="rounded-md border bg-background px-3 py-2 text-sm shadow-md">
                  <p className="text-xs text-muted-foreground">{point.time.toFixed(1)}s</p>
                  {entries.map(([k, v]) => (
                    <p key={k} className="text-sm">
                      {k}: {typeof v === "number" ? v.toFixed(2) : v}
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
          {hasLiveData && (
            <>
              <Line
                yAxisId="primary"
                type="monotone"
                dataKey="actualPressure"
                name="Actual pressure"
                stroke={LIVE_COLORS.actualPressure}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                yAxisId="primary"
                type="monotone"
                dataKey="actualPumpFlow"
                name="Actual pump flow"
                stroke={LIVE_COLORS.actualPumpFlow}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey="actualWeight"
                name="Weight"
                stroke={LIVE_COLORS.actualWeight}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                yAxisId="weight"
                type="monotone"
                dataKey="actualWeightFlow"
                name="Weight flow"
                stroke={LIVE_COLORS.actualWeightFlow}
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
