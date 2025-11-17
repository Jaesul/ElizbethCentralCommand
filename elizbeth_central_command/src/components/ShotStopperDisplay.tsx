"use client";

import { useState, useEffect } from "react";
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
  const [goalWeightInput, setGoalWeightInput] = useState<string>("");
  const [isSettingWeight, setIsSettingWeight] = useState(false);

  const handleSetGoalWeight = () => {
    const weight = parseInt(goalWeightInput, 10);
    if (isNaN(weight) || weight < 10 || weight > 200) {
      return;
    }

    if (sendMessage) {
      setIsSettingWeight(true);
      sendMessage({
        command: "setGoalWeight",
        goalWeight: weight,
      });
      
      // Reset input after sending
      setGoalWeightInput("");
      
      // Reset loading state after a short delay
      setTimeout(() => setIsSettingWeight(false), 500);
    }
  };

  // Update input placeholder when data changes (for initial load)
  useEffect(() => {
    // Don't overwrite user input, just use data as reference
  }, [data?.goalWeight]);
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
    if (value === undefined) return "---";
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
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-2">Current Weight</div>
              <div className="text-5xl font-bold">
                {formatNumber(data.currentWeight)} <span className="text-2xl text-muted-foreground">g</span>
              </div>
            </div>

            {/* Shot Timer */}
            {data.shotTimer !== undefined && (
              <div className="text-center">
                <div className="text-sm text-muted-foreground mb-1">Shot Timer</div>
                <div className="text-3xl font-semibold">
                  {formatNumber(data.shotTimer)} <span className="text-lg text-muted-foreground">s</span>
                </div>
              </div>
            )}

            {/* Start/Stop Controls */}
            {sendMessage && (
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => {
                    sendMessage({ command: "startShot" });
                  }}
                  disabled={data.brewing}
                  variant={data.brewing ? "secondary" : "default"}
                  className="flex-1"
                >
                  {data.brewing ? "Brewing..." : "Start Shot"}
                </Button>
                <Button
                  onClick={() => {
                    sendMessage({ command: "stopShot" });
                  }}
                  disabled={!data.brewing}
                  variant={!data.brewing ? "secondary" : "destructive"}
                  className="flex-1"
                >
                  Stop Shot
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Goal and Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Goal Weight</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-2xl font-semibold">
                {data.goalWeight ?? "---"} <span className="text-sm text-muted-foreground">g</span>
              </div>
              {sendMessage && (
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="10"
                    max="200"
                    value={goalWeightInput}
                    onChange={(e) => setGoalWeightInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleSetGoalWeight();
                      }
                    }}
                    placeholder={data.goalWeight?.toString() ?? "36"}
                    className="flex-1 px-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Button
                    onClick={handleSetGoalWeight}
                    disabled={isSettingWeight || !goalWeightInput || parseInt(goalWeightInput, 10) < 10 || parseInt(goalWeightInput, 10) > 200}
                    size="sm"
                  >
                    {isSettingWeight ? "Setting..." : "Set"}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Weight Offset</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {formatNumber(data.weightOffset)} <span className="text-sm text-muted-foreground">g</span>
            </div>
          </CardContent>
        </Card>
      </div>

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

      {/* Additional Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data.datapoints !== undefined && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Points</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-semibold">{data.datapoints}</div>
            </CardContent>
          </Card>
        )}

        {data.timestamp && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Last Update</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                {new Date(data.timestamp).toLocaleTimeString()}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

