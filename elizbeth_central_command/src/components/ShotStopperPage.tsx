"use client";

import { ShotStopperDisplay } from "~/components/ShotStopperDisplay";
import { WebSocketConnectionStatus } from "~/components/WebSocketConnectionStatus";
import { ShotChart } from "~/components/ShotChart";
import { useWebSocket } from "~/hooks/useWebSocket";
import { useShotHistory } from "~/hooks/useShotHistory";

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

export function ShotStopperPage() {
  const wsUrl = getWebSocketUrl();
  
  const { isConnected, data: shotData, error, lastMessageTime, reconnect, sendMessage } = useWebSocket({
    url: wsUrl,
    reconnectInterval: 5000,
    reconnectOnClose: true,
  });

  const { shotHistory, isActiveShot } = useShotHistory(shotData);

  const handleReconnect = () => {
    reconnect();
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Elizabeth Central Command</h1>
        <p className="text-muted-foreground">
          Real-time espresso shot monitoring from ESP32
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Connection Status - Takes up left column */}
        <div className="lg:col-span-1">
          <WebSocketConnectionStatus
            isConnected={isConnected}
            error={error}
            onReconnect={handleReconnect}
            lastMessageTime={lastMessageTime}
          />
        </div>

        {/* Shot Data Display - Takes up remaining columns */}
        <div className="lg:col-span-2">
          <ShotStopperDisplay data={shotData} isConnected={isConnected} sendMessage={sendMessage} />
        </div>
      </div>

      {/* Shot Chart - Full width, always visible but shows message when no data */}
      <div className="mt-6">
        <ShotChart
          dataPoints={shotHistory}
          isBrewing={isActiveShot}
          goalWeight={shotData?.goalWeight}
        />
      </div>
    </div>
  );
}

