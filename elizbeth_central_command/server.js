/**
 * Custom Next.js server with mDNS support
 * Serves Next.js app on port 80 as shotstopper.local
 * Run with: npm run dev:server
 */

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import dns from "dns";
import os from "os";

const dev = process.env.NODE_ENV !== "production";
const port = 80; // Port 80 for HTTP
const hostname = "0.0.0.0"; // Bind to all interfaces

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Get local IP address for mDNS
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || "/", true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error occurred handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  // Start server
  server
    .once("error", (err) => {
      if (err.code === "EACCES") {
        console.error(
          "\n❌ Error: Permission denied. Port 80 requires administrator privileges.\n" +
          "On Windows, run PowerShell as Administrator:\n" +
          "  npm run dev:server\n\n" +
          "Or use a different port (e.g., 3000) and set up port forwarding.\n"
        );
      } else {
        console.error(err);
      }
      process.exit(1);
    })
    .listen(port, hostname, () => {
      const localIP = getLocalIP();
      console.log("\n✅ Next.js server running!");
      console.log(`   Local:    http://localhost:${port}`);
      console.log(`   Network:  http://${localIP}:${port}`);
      console.log(`\n📡 To access via mDNS as shotstopper.local:`);
      console.log(`   1. Install Bonjour Print Services (if on Windows)`);
      console.log(`   2. Set up mDNS to point shotstopper.local to ${localIP}`);
      console.log(`   3. Or use: http://${localIP}:${port}\n`);
      console.log(`🔌 ESP32 WebSocket should be at: ws://shotstopper.local:81/ws\n`);
    });
});

