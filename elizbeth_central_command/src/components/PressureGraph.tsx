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
import { Button } from "~/components/ui/button";
import { Download } from "lucide-react";
import type { PressureDataPoint } from "~/hooks/usePressureHistory";

interface PressureGraphProps {
  data: PressureDataPoint[];
  isBrewing?: boolean;
}

const chartConfig = {
  pressure: {
    label: "Pressure",
    color: "hsl(221.2 83.2% 53.3%)",
  },
} satisfies ChartConfig;

// Export to CSV
function exportToCSV(data: PressureDataPoint[]) {
  if (data.length === 0) return;

  const headers = ["Time (s)", "Pressure (bar)", "Timestamp (ms)"];
  const rows = data.map((point) => [
    point.time.toFixed(3),
    point.pressure.toFixed(2),
    point.timestamp.toString(),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `pressure-data-${new Date().toISOString().split("T")[0]}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Export to XLSX (using a simple approach - install xlsx library for better support)
async function exportToXLSX(data: PressureDataPoint[]) {
  if (data.length === 0) return;

  try {
    // Dynamic import to avoid bundling xlsx if not needed
    const XLSX = await import("xlsx");
    
    const worksheetData = [
      ["Time (s)", "Pressure (bar)", "Timestamp (ms)"],
      ...data.map((point) => [
        point.time,
        point.pressure,
        point.timestamp,
      ]),
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pressure Data");

    XLSX.writeFile(
      workbook,
      `pressure-data-${new Date().toISOString().split("T")[0]}.xlsx`
    );
  } catch (error) {
    console.error("Failed to export XLSX:", error);
    // Fallback to CSV if XLSX library is not available
    alert("XLSX export not available. Falling back to CSV.");
    exportToCSV(data);
  }
}

export function PressureGraph({ data, isBrewing = false }: PressureGraphProps) {
  const [exporting, setExporting] = React.useState(false);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pressure Profile</CardTitle>
          <CardDescription>
            {isBrewing
              ? "Waiting for pressure data..."
              : "No pressure data available"}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Find max pressure for Y-axis scaling
  const maxPressure = Math.max(...data.map((d) => d.pressure));
  const maxTime = Math.max(...data.map((d) => d.time));
  const yAxisMax = Math.ceil(maxPressure / 2) * 2; // Round up to nearest even number, min 10

  const handleExportCSV = () => {
    exportToCSV(data);
  };

  const handleExportXLSX = async () => {
    setExporting(true);
    try {
      await exportToXLSX(data);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Pressure Profile</CardTitle>
            <CardDescription>
              {isBrewing
                ? "Live pressure visualization"
                : "Completed pressure profile"}{" "}
              ({data.length} data points)
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              disabled={data.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportXLSX}
              disabled={data.length === 0 || exporting}
            >
              <Download className="mr-2 h-4 w-4" />
              {exporting ? "..." : "XLSX"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 20 }}>
            <defs>
              <linearGradient id="fillPressure" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="var(--color-pressure)"
                  stopOpacity={0.8}
                />
                <stop
                  offset="95%"
                  stopColor="var(--color-pressure)"
                  stopOpacity={0.1}
                />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="time"
              type="number"
              domain={[0, "dataMax"]}
              tickFormatter={(value) => `${value.toFixed(0)}s`}
              label={{ value: "Time (s)", position: "insideBottom", offset: -5 }}
            />
            <YAxis
              dataKey="pressure"
              type="number"
              domain={[0, Math.max(yAxisMax, 10)]}
              tickFormatter={(value) => `${value.toFixed(1)}`}
              label={{
                value: "Pressure (bar)",
                angle: -90,
                position: "insideLeft",
              }}
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const point = payload[0]!.payload as PressureDataPoint;
                return (
                  <ChartTooltipContent>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {point.time.toFixed(2)}s @ {point.pressure.toFixed(2)} bar
                      </p>
                    </div>
                  </ChartTooltipContent>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="pressure"
              stroke="var(--color-pressure)"
              fill="url(#fillPressure)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

