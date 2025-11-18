"use client";

import { Button } from "~/components/ui/button";
import {
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { ShotChart } from "~/components/ShotChart";
import type { ShotStopperData } from "~/types/shotstopper";
import type { ShotDataPoint } from "~/components/ShotChart";

interface ShotMonitoringDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shotData: ShotStopperData | null;
  shotHistory: ShotDataPoint[];
  isBrewing: boolean;
  onStartShot: () => void;
  onStopShot: () => void;
  isConnected: boolean;
}

export function ShotMonitoringDrawer({
  open,
  onOpenChange,
  shotData,
  shotHistory,
  isBrewing,
  onStartShot,
  onStopShot,
  isConnected,
}: ShotMonitoringDrawerProps) {
  const formatNumber = (value: number | undefined, decimals = 1) => {
    if (value === undefined || isNaN(value)) return "0.0";
    return value.toFixed(decimals);
  };

  return (
    <DrawerContent className="max-w-4xl mx-auto max-h-[95vh] flex flex-col" style={{ maxHeight: "95vh" }} data-vaul-drawer-direction="bottom">
      <DrawerHeader className="p-8 shrink-0">
        <DrawerTitle>Shot Monitoring</DrawerTitle>
        <DrawerDescription>
          Real-time espresso shot data and visualization
        </DrawerDescription>
      </DrawerHeader>
      <div className="px-8 pb-8 space-y-6 overflow-y-auto flex-1 min-h-0">
        {/* Live Shot Chart */}
        <div>
          <ShotChart
            dataPoints={shotHistory}
            isBrewing={isBrewing}
            goalWeight={shotData?.goalWeight}
          />
        </div>

        {/* Current Weight and Timer Display */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Current Weight</div>
            <div className="text-lg font-bold">
              {formatNumber(shotData?.currentWeight)}{" "}
              <span className="text-sm text-muted-foreground">g</span>
            </div>
          </div>
          <div className="text-center p-2 bg-muted/50 rounded-lg">
            <div className="text-xs text-muted-foreground mb-1">Shot Timer</div>
            <div className="text-lg font-bold">
              {formatNumber(shotData?.shotTimer)}{" "}
              <span className="text-sm text-muted-foreground">s</span>
            </div>
          </div>
        </div>
      </div>
      <DrawerFooter className="p-8 shrink-0">
        {isBrewing ? (
          <Button onClick={onStopShot} variant="destructive" size="lg" className="w-full">
            Stop Shot
          </Button>
        ) : (
          <Button 
            onClick={onStartShot} 
            disabled={!isConnected}
            size="lg" 
            className="w-full"
          >
            Start Shot
          </Button>
        )}
      </DrawerFooter>
    </DrawerContent>
  );
}

