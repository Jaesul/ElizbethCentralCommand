"use client";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Wifi, WifiOff } from "lucide-react";

interface WebSocketConnectionStatusProps {
  isConnected: boolean;
  error?: string | null;
  onReconnect?: () => void;
  lastMessageTime?: string;
}

export function WebSocketConnectionStatus({
  isConnected,
  error,
  onReconnect,
  lastMessageTime,
}: WebSocketConnectionStatusProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {isConnected ? (
              <Wifi className="size-5 text-green-500" />
            ) : (
              <WifiOff className="size-5 text-red-500" />
            )}
            Connection Status
          </CardTitle>
          <Badge variant={isConnected ? "default" : "destructive"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
        </div>
        <CardDescription>
          WebSocket connection to ESP32
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Check browser console (F12) for more details
              </p>
            </div>
          )}

          {isConnected && lastMessageTime && (
            <div className="text-sm text-muted-foreground">
              Last message: {new Date(lastMessageTime).toLocaleTimeString()}
            </div>
          )}

          {!isConnected && !error && (
            <div className="text-sm text-muted-foreground">
              Connecting to WebSocket server...
            </div>
          )}

          {!isConnected && onReconnect && (
            <Button onClick={onReconnect} variant="outline" className="w-full">
              Reconnect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

