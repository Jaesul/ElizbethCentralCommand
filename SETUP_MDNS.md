# mDNS Setup Guide

## Architecture

- **Port 80** → `http://shotstopper.local/` (Next.js frontend on your computer)
- **Port 81** → `ws://shotstopper.local:81/ws` (ESP32 WebSocket server)

## Problem

Both the ESP32 and your computer want to use the mDNS hostname "shotstopper". Since you can't have two devices with the same mDNS name, we have two options:

### Option 1: Change ESP32 mDNS Name (Recommended)

Change the ESP32 to use a different mDNS name, then set up Windows mDNS for the frontend.

1. **Update ESP32 code**: Change `MDNS_HOSTNAME` in `ShotStopperWebSocket.ino`:
   ```cpp
   #define MDNS_HOSTNAME "shotstopper-ws"  // Changed from "shotstopper"
   ```

2. **Update frontend WebSocket URL** in `ShotStopperPage.tsx`:
   ```typescript
   return "ws://shotstopper-ws.local:81/ws";
   ```

3. **Set up Windows mDNS for Next.js**:
   - Install Bonjour Print Services: https://support.apple.com/kb/DL999
   - Or use a tool like `avahi-daemon` (Linux) or configure Windows DNS

### Option 2: Use IP Address for ESP32

Keep ESP32 mDNS as "shotstopper" but use IP address in frontend.

1. **Keep ESP32 code as-is** (uses "shotstopper" mDNS)

2. **Update frontend** to use ESP32's IP address:
   - Find ESP32 IP from Serial Monitor
   - Set environment variable: `NEXT_PUBLIC_WS_URL=ws://10.0.0.242:81/ws` (replace with actual IP)

3. **Set up Windows mDNS** for Next.js to use "shotstopper.local:80"

## Running the Frontend

### Option A: Run on Port 80 (Requires Admin)

```bash
# Run PowerShell as Administrator
npm run dev:server
```

Then access at: `http://shotstopper.local/` (after setting up mDNS)

### Option B: Run on Different Port (No Admin Required)

1. Change port in `server.js` from `80` to `3000`
2. Run: `npm run dev:server`
3. Access at: `http://localhost:3000` or `http://<your-ip>:3000`

## Windows mDNS Setup

### Method 1: Bonjour Print Services
1. Download and install: https://support.apple.com/kb/DL999
2. This provides mDNS support on Windows
3. You may need to configure it to point `shotstopper.local` to your computer's IP

### Method 2: Manual hosts file (Not mDNS, but works)
1. Open `C:\Windows\System32\drivers\etc\hosts` as Administrator
2. Add line: `127.0.0.1 shotstopper.local`
3. Access at: `http://shotstopper.local/` (but only works on your computer)

### Method 3: Use IP Address
Just use your computer's IP address directly:
- `http://10.0.0.200:80/` (or whatever your IP is)

## Testing

1. **Test ESP32 mDNS**:
   ```bash
   ping shotstopper-ws.local  # Should resolve to ESP32 IP
   ```

2. **Test Next.js mDNS**:
   ```bash
   ping shotstopper.local  # Should resolve to your computer IP
   ```

3. **Test WebSocket**:
   - Open browser console
   - Check if connection to `ws://shotstopper-ws.local:81/ws` works

