# OPV Runner (Node.js)

This tool runs the blind-basket OPV characterization tests by controlling the ESP32 over WebSocket and capturing pressure telemetry.

## Prereqs
- Flash the Arduino sketch: `Arduino/TriacTests/OPVCharacterization/OPVCharacterization.ino`
- Ensure only one device is using `shotstopper-ws.local` on your network.

## Install

```bash
cd tools/opv_runner
npm install
```

## Test 1: Power step sweep

```bash
node opv_runner.mjs --mode sweep --name blind_sweep_1
node opv_analyze.mjs --csv captures/blind_sweep_1.csv
```

## Test 2: Ramp-rate sensitivity

```bash
node opv_runner.mjs --mode ramp --target 60 --name blind_ramps_60
```

## WebSocket URL override

If mDNS is unreliable, use the ESP32 IP:

```bash
node opv_runner.mjs --url ws://10.0.0.242:81/ws --mode sweep --name blind_sweep_ip
```



