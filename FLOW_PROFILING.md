# Flow Profiling Quickstart (with Pressure)

## What to flash

- **Power sweep (flow vs power + pressure)**: `Arduino/TriacTests/AutoPumpProfiler/AutoPumpProfiler.ino`
  - CSV: `time_ms,power_pct,weight_g,flow_gps,pressure_bar`

- **Closed-loop profile (pressure control + flow + pressure)**: `Arduino/TriacTests/PressureProfileController/PressureProfileController.ino`
  - CSV: `t_ms,stage_idx,power_pct,pressure_bar,target_pressure_bar,weight_g,flow_gps,resistance_bar_per_gps`
  - Commands: `GO`, `STOP`, `STATUS`

## Capture (Windows)

### AutoPumpProfiler capture (WebSocket, no Serial)

```powershell
cd .\tools\ws_capture
npm install
node .\ws_capture.mjs --url ws://shotstopper-ws.local:81/ws --name run1
```

Type `GO` (then Enter) to start the sweep.

### Analyze AutoPumpProfiler capture

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\analyze_autopumpprofiler.ps1 -InputCsv .\captures\run1.csv
```

## Notes

- `testing.py` writes a **clean CSV** and also keeps a `.raw.log` with all debug lines.
- Baud rate is **115200**.


