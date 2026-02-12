/*
  ESP32-S3 WebSocket Connection Test
  Simple test to verify WiFi and WebSocket connection
*/

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// WiFi and WebSocket configuration (same as ShotStopperWebSocket)
#define WIFI_SSID "Kenyon19"
#define WIFI_PASSWORD "Kenyon_1"
#define WS_SERVER_HOST "10.0.0.200"
#define WS_SERVER_PORT 3000
#define WS_SERVER_PATH "/api/websocket"
#define WS_RECONNECT_INTERVAL 5000

WebSocketsClient webSocket;
bool websocketConnected = false;
unsigned long lastDataSend = 0;

// WebSocket event handler
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("[WebSocket] Disconnected");
      if (payload && length > 0) {
        Serial.printf("[WebSocket] Disconnect reason: %s\n", (char*)payload);
      }
      websocketConnected = false;
      break;
    case WStype_CONNECTED:
      Serial.printf("[WebSocket] Connected to: %s\n", payload);
      websocketConnected = true;
      break;
    case WStype_TEXT:
      Serial.printf("[WebSocket] Received (%d bytes): %s\n", length, payload);
      break;
    case WStype_ERROR:
      Serial.printf("[WebSocket] Error (%d bytes): ", length);
      if (payload && length > 0) {
        Serial.println((char*)payload);
      } else {
        Serial.println("Unknown error");
      }
      websocketConnected = false;
      break;
    case WStype_PING:
      Serial.println("[WebSocket] Ping received");
      break;
    case WStype_PONG:
      Serial.println("[WebSocket] Pong received");
      break;
    default:
      Serial.printf("[WebSocket] Unknown event type: %d\n", type);
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n========================================");
  Serial.println("ESP32-S3 WebSocket Test");
  Serial.println("========================================\n");
  
  // Connect to WiFi
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    
    // Initialize WebSocket
    Serial.print("Connecting to WebSocket: ws://");
    Serial.print(WS_SERVER_HOST);
    Serial.print(":");
    Serial.print(WS_SERVER_PORT);
    Serial.println(WS_SERVER_PATH);
    
    // Wait a moment for WiFi to stabilize
    delay(1000);
    
    Serial.println("\n[WebSocket] Initializing WebSocket client...");
    
    // Configure WebSocket BEFORE begin()
    webSocket.onEvent(webSocketEvent);
    webSocket.setReconnectInterval(WS_RECONNECT_INTERVAL);
    
    // Disable heartbeat initially to see if it's causing issues
    // webSocket.enableHeartbeat(15000, 3000, 2); // Disabled for debugging
    
    // Additional options for compatibility
    // Try without protocol specification first (defaults to ws://)
    
    // Now begin the connection
    Serial.println("[WebSocket] Starting connection...");
    Serial.printf("[WebSocket] Host: %s, Port: %d, Path: %s\n", 
      WS_SERVER_HOST, WS_SERVER_PORT, WS_SERVER_PATH);
    
    webSocket.begin(WS_SERVER_HOST, WS_SERVER_PORT, WS_SERVER_PATH);
    
    Serial.println("[WebSocket] Configuration complete - connection will be established by loop()");
    
  } else {
    Serial.println("");
    Serial.println("WiFi connection failed!");
  }
}

void loop() {
  // Handle WebSocket connection (must be called regularly)
  webSocket.loop();
  
  // Debug: Print connection status periodically
  static unsigned long lastStatusPrint = 0;
  if (millis() - lastStatusPrint > 5000) {
    lastStatusPrint = millis();
    Serial.printf("[Status] WiFi: %s, WebSocket: %s, Heap: %d\n", 
      WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected",
      websocketConnected ? "Connected" : "Disconnected",
      ESP.getFreeHeap());
  }
  
  // Test HTTP connectivity first (one-time check)
  static bool httpTested = false;
  if (WiFi.status() == WL_CONNECTED && !httpTested && millis() > 3000) {
    httpTested = true;
    Serial.println("\n========================================");
    Serial.println("[Test] Testing HTTP connectivity to server...");
    Serial.println("========================================");
    
    WiFiClient client;
    if (client.connect(WS_SERVER_HOST, WS_SERVER_PORT)) {
      Serial.println("[Test] HTTP connection successful!");
      client.print("GET /test HTTP/1.1\r\n");
      client.print("Host: ");
      client.print(WS_SERVER_HOST);
      client.print(":");
      client.print(WS_SERVER_PORT);
      client.print("\r\n\r\n");
      
      unsigned long timeout = millis();
      while (client.available() == 0) {
        if (millis() - timeout > 5000) {
          Serial.println("[Test] HTTP request timeout!");
          client.stop();
          break;
        }
      }
      
      if (client.available()) {
        Serial.println("[Test] Server response:");
        while (client.available()) {
          Serial.write(client.read());
        }
      }
      client.stop();
    } else {
      Serial.println("[Test] HTTP connection FAILED!");
      Serial.printf("[Test] Could not reach %s:%d\n", WS_SERVER_HOST, WS_SERVER_PORT);
    }
    Serial.println("");
  }
  
  // Send test data every 2 seconds if connected
  if (websocketConnected && (millis() - lastDataSend >= 2000)) {
    lastDataSend = millis();
    
    // Create test JSON data
    StaticJsonDocument<256> doc;
    doc["test"] = true;
    doc["message"] = "Hello from ESP32!";
    doc["uptime"] = millis() / 1000;
    doc["freeHeap"] = ESP.getFreeHeap();
    doc["timestamp"] = millis() / 1000;
    
    String jsonString;
    serializeJson(doc, jsonString);
    
    webSocket.sendTXT(jsonString);
    Serial.printf("[Sent] %s\n", jsonString.c_str());
  }
  
  // Reconnect WiFi if disconnected
  if (WiFi.status() != WL_CONNECTED && !websocketConnected) {
    static unsigned long lastReconnectAttempt = 0;
    if (millis() - lastReconnectAttempt > 10000) {
      lastReconnectAttempt = millis();
      Serial.println("WiFi disconnected, attempting reconnect...");
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      httpTested = false; // Reset HTTP test
    }
  }
  
  delay(10);
}

