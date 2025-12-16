"use client";

import { useState, useEffect } from "react";
import { FloatingConnectionIcon } from "~/components/FloatingConnectionIcon";
import { ProfileSelector } from "~/components/ProfileSelector";
import { ShotMonitoringDrawer } from "~/components/ShotMonitoringDrawer";
import { Drawer } from "~/components/ui/drawer";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { useWebSocket } from "~/hooks/useWebSocket";
import { useShotHistory } from "~/hooks/useShotHistory";
import { useProfiles } from "~/hooks/useProfiles";
import { useTestingMode } from "~/hooks/useTestingMode";
import { useMockDataGenerator } from "~/lib/mockDataGenerator";
import type { ShotStopperData } from "~/types/shotstopper";

// Determine WebSocket URL - ESP32 is now the WebSocket server via mDNS
const getWebSocketUrl = () => {
  if (typeof window === "undefined") return "";
  
  // Try mDNS first (shotstopper.local), fallback to IP if mDNS doesn't work
  // You can set this via environment variable NEXT_PUBLIC_WS_URL or use the default
  const customUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (customUrl) {
    return customUrl;
  }
  
  // Default: Connect to ESP32 WebSocket server via mDNS
  // ESP32 hostname: shotstopper-ws.local, port: 81, path: /ws
  // If mDNS doesn't work, you can manually set NEXT_PUBLIC_WS_URL to the IP address
  // Example: NEXT_PUBLIC_WS_URL=ws://10.0.0.242:81/ws
  return "ws://shotstopper-ws.local:81/ws";
};

// Determine Pressure WebSocket URL - separate ESP32 for pressure reading (optional, only if explicitly configured)
const getPressureWebSocketUrl = () => {
  if (typeof window === "undefined") return "";
  
  // Only connect to separate pressure reader if explicitly configured via environment variable
  // By default, use the combined device which includes pressure data
  const customUrl = process.env.NEXT_PUBLIC_PRESSURE_WS_URL;
  if (customUrl) {
    return customUrl;
  }
  
  // Default: Don't connect to separate pressure reader (combined device provides pressure)
  return "";
};

export function ShotStopperPage() {
  const wsUrl = getWebSocketUrl();
  const pressureWsUrl = getPressureWebSocketUrl();
  const [mockData, setMockData] = useState<ShotStopperData | null>(null);
  const [monitoringDrawerOpen, setMonitoringDrawerOpen] = useState(false);
  
  const { isTestingMode, isLoaded: testingModeLoaded, setTestingMode } = useTestingMode();
  
  // Real WebSocket connection for ShotStopper (only when not in testing mode)
  const { 
    isConnected: wsConnected, 
    data: wsData, 
    error: wsError, 
    lastMessageTime: wsLastMessageTime, 
    reconnect: wsReconnect, 
    sendMessage: wsSendMessage 
  } = useWebSocket({
    url: isTestingMode ? "" : wsUrl, // Don't connect in testing mode
    reconnectInterval: 5000,
    reconnectOnClose: true,
  });

  // Separate WebSocket connection for pressure reader
  const { 
    isConnected: pressureWsConnected, 
    data: pressureWsData, 
    error: pressureWsError, 
    reconnect: pressureWsReconnect
  } = useWebSocket({
    url: isTestingMode ? "" : pressureWsUrl, // Don't connect in testing mode
    reconnectInterval: 5000,
    reconnectOnClose: true,
  });

  // Mock data generator (only when in testing mode)
  const { startMockShot, stopMockShot, resetMockShot, isBrewing: mockBrewing } = useMockDataGenerator({
    onData: setMockData,
    goalWeight: mockData?.goalWeight ?? 40,
  });

  // Use mock data in testing mode, real data otherwise
  // Merge pressure data: prioritize baseShotData (combined device), fallback to separate pressure WebSocket
  const baseShotData = isTestingMode ? mockData : wsData;
  const shotData = baseShotData 
    ? {
        ...baseShotData,
        // Prioritize pressure from baseShotData (combined device), fallback to separate pressure WebSocket
        currentPressure: baseShotData.currentPressure ?? baseShotData.pressureBar ?? pressureWsData?.currentPressure ?? pressureWsData?.pressureBar,
        pressurePSI: baseShotData.pressurePSI ?? pressureWsData?.pressurePSI,
        pressureBar: baseShotData.pressureBar ?? baseShotData.currentPressure ?? pressureWsData?.pressureBar ?? pressureWsData?.currentPressure,
      }
    : pressureWsData 
      ? {
          // If only pressure data is available, create minimal data object
          currentPressure: pressureWsData.currentPressure ?? pressureWsData.pressureBar,
          pressurePSI: pressureWsData.pressurePSI,
          pressureBar: pressureWsData.pressureBar ?? pressureWsData.currentPressure,
        }
      : null;
  
  const isConnected = isTestingMode ? true : (wsConnected || pressureWsConnected);
  const error = isTestingMode ? undefined : (wsError || pressureWsError);
  const lastMessageTime = isTestingMode ? Date.now().toString() : wsLastMessageTime;

  // Handle sendMessage - disable in testing mode or make it control mock data
  const sendMessage = isTestingMode 
    ? (message: object) => {
        // In testing mode, simulate commands
        if ("command" in message) {
          if (message.command === "startShot") {
            startMockShot();
          } else if (message.command === "stopShot") {
            stopMockShot();
          }
        }
      }
    : wsSendMessage;

  const { shotHistory, isActiveShot } = useShotHistory(shotData);
  const {
    profiles,
    selectedProfileId,
    isLoaded: profilesLoaded,
    deleteProfile,
    selectProfile,
  } = useProfiles();

  const handleReconnect = () => {
    if (!isTestingMode) {
      wsReconnect();
      pressureWsReconnect();
    } else {
      resetMockShot();
    }
  };

  // Initialize mock data when entering testing mode
  useEffect(() => {
    if (isTestingMode) {
      resetMockShot();
    }
  }, [isTestingMode, resetMockShot]);


  const handleStartShot = (profileId: string) => {
    selectProfile(profileId);
    sendMessage({ command: "startShot" });
    setMonitoringDrawerOpen(true);
  };

  const handleStopShot = () => {
    sendMessage({ command: "stopShot" });
  };

  // Use shot history directly (pressure is already merged in useShotHistory hook)
  const mergedShotHistoryForDrawer = shotHistory;

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-4xl font-bold mb-2">Elizabeth Central Command</h1>
            <p className="text-muted-foreground">
              Real-time espresso shot monitoring from ESP32
            </p>
          </div>
          {/* Testing Mode Toggle */}
          {testingModeLoaded && (
            <Card className="w-auto">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium cursor-pointer flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isTestingMode}
                      onChange={(e) => setTestingMode(e.target.checked)}
                      className="w-4 h-4"
                    />
                    Testing Mode
                  </label>
                  <Badge variant={isTestingMode ? "default" : "secondary"}>
                    {isTestingMode ? "Simulated" : "Live"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>


      {/* Profile Selector - Front and center */}
      {profilesLoaded && (
        <div>
          <ProfileSelector
            profiles={profiles}
            selectedProfileId={selectedProfileId}
            onSelectProfile={selectProfile}
            onDeleteProfile={deleteProfile}
                  onStartShot={handleStartShot}
            isConnected={isConnected}
            isBrewing={shotData?.brewing ?? false}
          />
        </div>
      )}

      {/* Floating Connection Status Icon */}
      <FloatingConnectionIcon
        isConnected={isConnected}
        error={error}
        onReconnect={handleReconnect}
        lastMessageTime={lastMessageTime}
        isTestingMode={isTestingMode}
      />

      {/* Shot Monitoring Drawer */}
      <Drawer 
        open={monitoringDrawerOpen} 
        onOpenChange={(open) => {
          setMonitoringDrawerOpen(open);
        }}
      >
        <ShotMonitoringDrawer
          open={monitoringDrawerOpen}
          onOpenChange={setMonitoringDrawerOpen}
          shotData={shotData}
          shotHistory={mergedShotHistoryForDrawer}
          currentPressure={
            shotData?.currentPressure ??
            shotData?.pressureBar
          }
          isBrewing={shotData?.brewing ?? false}
          onStartShot={() => handleStartShot(selectedProfileId || "")}
          onStopShot={handleStopShot}
          isConnected={isConnected}
        />
      </Drawer>
    </div>
  );
}

