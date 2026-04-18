# Hardware Workspace

This folder is the starting point for the Bean Pounder / Elizabeth Central Command hardware design work.

The current source of truth for the first schematic pass is:

- `Firmware/FlowProfilingArduino/FlowProfilingArduino.ino`

That firmware currently describes an `ESP32`-based controller that:

- reads an analog brew pressure transducer
- detects AC zero-cross
- drives a pump power control path through PSM-style phase control
- pulses an opto-isolated brew-button interface
- uses Wi-Fi and BLE on the MCU
- does not currently own boiler temperature control

## Suggested workflow

1. Read `schematic-plan.md` to understand the block/sheet breakdown.
2. Use `pin-map.md` while placing MCU symbols and connectors.
3. Use `io-interfaces.md` when deciding the topology of each external interface.
4. Use `power-architecture.md` before locking in regulators and isolation boundaries.
5. Use `safety-notes.md` while drawing any mains-adjacent circuitry.
6. Use `bringup-checklist.md` during bench testing and first power-up.

## Folder contents

- `schematic-plan.md` - first-pass schematic hierarchy and design scope
- `pin-map.md` - firmware-derived pin and connector mapping
- `io-interfaces.md` - notes for each electrical interface block
- `power-architecture.md` - power-rail planning notes
- `safety-notes.md` - safety reminders for mains-adjacent design
- `bringup-checklist.md` - staged hardware bring-up checklist
- `kicad/` - intended home for the KiCad project files

## Current hardware scope

The present firmware suggests a narrow scope:

- pressure profiling add-on for an existing espresso machine controller
- parallel install, not full machine replacement
- no heater, boiler, or steam control in this revision
- optional scale integration over BLE rather than a wired load-cell front end

If the firmware scope changes, update these docs so the schematic stays aligned with the code.
