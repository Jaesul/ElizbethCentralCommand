"use client";

import { type ShotStopperData } from "~/types/shotstopper";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";

interface ShotStopperDisplayProps {
  data: ShotStopperData | null;
  isConnected?: boolean;
  sendMessage?: (message: object) => void;
}

export function ShotStopperDisplay({ data, isConnected = false, sendMessage }: ShotStopperDisplayProps) {
  if (!isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ShotStopper</CardTitle>
          <CardDescription>Waiting for WebSocket connection...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>ShotStopper</CardTitle>
          <CardDescription>Waiting for data from ESP32...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const formatNumber = (value: number | undefined, decimals = 1) => {
    if (value === undefined || isNaN(value)) return "0.0";
    return value.toFixed(decimals);
  };

  const formatEndType = (endType?: string) => {
    if (!endType || endType === "UNDEF") return null;
    return endType.charAt(0) + endType.slice(1).toLowerCase();
  };

  return (
    <div className="space-y-6">
      {/* Main Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>ShotStopper</CardTitle>
            <Badge variant={data.brewing ? "default" : "secondary"}>
              {data.brewing ? "Brewing" : "Idle"}
            </Badge>
          </div>
          <CardDescription>
            Real-time espresso shot monitoring
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Current Weight - Large Display */}
            <div className="text-center min-h-[100px] flex flex-col justify-center">
              <div className="text-sm text-muted-foreground mb-2">Current Weight</div>
              <div className="text-5xl font-bold">
                {formatNumber(data.currentWeight)} <span className="text-2xl text-muted-foreground">g</span>
              </div>
            </div>

            {/* Shot Timer - Always render to prevent layout shift */}
            <div className="text-center min-h-[80px] flex flex-col justify-center">
              <div className="text-sm text-muted-foreground mb-1">Shot Timer</div>
              <div className="text-3xl font-semibold">
                {formatNumber(data.shotTimer)} <span className="text-lg text-muted-foreground">s</span>
              </div>
            </div>

            {/* Current Pressure - Always render to prevent layout shift */}
            <div className="text-center min-h-[80px] flex flex-col justify-center">
              <div className="text-sm text-muted-foreground mb-1">Current Pressure</div>
              <div className="text-3xl font-semibold">
                {formatNumber(data.currentPressure ?? data.pressureBar, 2)} <span className="text-lg text-muted-foreground">bar</span>
              </div>
              {data.pressurePSI !== undefined && (
                <div className="text-sm text-muted-foreground mt-1">
                  {formatNumber(data.pressurePSI, 1)} PSI
                </div>
              )}
            </div>

            {/* Start/Stop Controls */}
            {sendMessage && (
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => {
                    sendMessage({ command: "startShot" });
                  }}
                  disabled={data.brewing}
                  variant={data.brewing ? "secondary" : "default"}
                  className="flex-1 min-w-0"
                >
                  <span className="inline-block w-full text-center">Start Shot</span>
                </Button>
                <Button
                  onClick={() => {
                    sendMessage({ command: "stopShot" });
                  }}
                  disabled={!data.brewing}
                  variant={!data.brewing ? "secondary" : "destructive"}
                  className="flex-1 min-w-0"
                >
                  <span className="inline-block w-full text-center">Stop Shot</span>
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>


      {/* Expected End Time (only show when brewing) */}
      {data.brewing && data.expectedEndTime !== undefined && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Expected End Time</CardTitle>
            <CardDescription>Predicted time to reach goal weight</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatNumber(data.expectedEndTime)} <span className="text-sm text-muted-foreground">s</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* End Type (only show when shot ended) */}
      {data.endType && data.endType !== "UNDEF" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Shot Ended By</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline" className="text-lg px-4 py-2">
              {formatEndType(data.endType)}
            </Badge>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

