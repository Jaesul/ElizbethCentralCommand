/**
 * Simple WebSocket client test script
 * Run with: node test-websocket.js
 */

import WebSocket from "ws";

// Try localhost first, then IP if that doesn't work
const WS_URL = process.argv[2] || "ws://10.0.0.200:3000/api/websocket";
// To test locally: node test-websocket.js ws://localhost:3000/api/websocket
// To test from ESP32 perspective: node test-websocket.js ws://10.0.0.200:3000/api/websocket

console.log(`Connecting to ${WS_URL}...\n`);

const ws = new WebSocket(WS_URL);

ws.on("open", () => {
  console.log("✅ WebSocket connected!");
  console.log("Sending test message...\n");
  
  const testMessage = {
    test: true,
    message: "Hello from test client!",
    timestamp: new Date().toISOString(),
  };
  
  ws.send(JSON.stringify(testMessage));
});

ws.on("message", (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log("📨 Received message:", JSON.stringify(message, null, 2));
  } catch (error) {
    console.log("📨 Received (raw):", data.toString());
  }
});

ws.on("error", (error) => {
  console.error("❌ WebSocket error:", error.message);
});

ws.on("close", (code, reason) => {
  console.log(`\n🔌 WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
  process.exit(0);
});

// Keep the script running for 5 seconds
setTimeout(() => {
  console.log("\n⏱️  Test complete. Closing connection...");
  ws.close();
}, 5000);

