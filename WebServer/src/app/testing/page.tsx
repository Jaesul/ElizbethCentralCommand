"use client";

import { useState, useEffect } from "react";
import { ShotStopperPage } from "~/components/ShotStopperPage";
import { PhaseProfileGraph } from "~/components/PhaseProfileGraph";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { useFlowProfilingWebSocket } from "~/hooks/useFlowProfilingWebSocket";
import { normalizeProfileForGraph } from "~/lib/profileUtils";

const getFlowWebSocketUrl = () => {
  const customUrl = process.env.NEXT_PUBLIC_FLOW_WS_URL;
  if (customUrl) return customUrl;
  return "ws://shotstopper-ws.local:81";
};

export default function TestingPage() {
  const [flowWsUrl, setFlowWsUrl] = useState("");
  useEffect(() => {
    setFlowWsUrl(getFlowWebSocketUrl());
  }, []);

  const flow = useFlowProfilingWebSocket({
    url: flowWsUrl,
    reconnectInterval: 5000,
    reconnectOnClose: true,
    maxLogs: 800,
    includeRawJsonDuringShot: true,
    requestProfileOnConnect: true,
  });

  const profileForGraph =
    flow.espProfile != null
      ? normalizeProfileForGraph(flow.espProfile as Parameters<typeof normalizeProfileForGraph>[0])
      : null;

  return (
    <main className="min-h-screen bg-background">
      {profileForGraph && profileForGraph.phases.length > 0 && (
        <div className="container mx-auto max-w-7xl px-4 py-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                Active profile on ESP: {profileForGraph.name}
                {!flow.isConnected && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    (disconnected – connect to load)
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <PhaseProfileGraph profile={profileForGraph} height={280} inline />
            </CardContent>
          </Card>
        </div>
      )}
      <ShotStopperPage flowConnection={flow} />
    </main>
  );
}
