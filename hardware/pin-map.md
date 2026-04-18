# Firmware Pin Map

This table is derived from `Firmware/FlowProfilingArduino/FlowProfilingArduino.ino` and should be treated as the starting point for the schematic.

## MCU-facing signals

| Firmware symbol | MCU GPIO | Suggested net name | Direction | Purpose |
|---|---:|---|---|---|
| `ZC_PIN` | `14` | `ZC_IN` | Input | Zero-cross timing pulse for PSM |
| `DIM_PIN` | `17` | `DIM_OUT` | Output | Pump phase-control command |
| `PRESSURE_PIN` | `4` | `PRESSURE_ADC` | Analog input | Scaled pressure transducer signal |
| `OUT_PIN` | `19` | `BREW_PULSE_OUT` | Output | Pulsed opto output to simulate brew button |

## Firmware-derived behavior notes

### `ZC_IN`

- Configured as `INPUT_PULLUP`
- Used by the PSM library as the AC timing reference
- Also used to delay ADC sampling away from switching noise

Implication:

- an open-collector or open-drain isolated detector output is likely appropriate

### `DIM_OUT`

- Used by `PSM pump(ZC_PIN, DIM_PIN, ...)`
- Commands pump power in full-cycle click semantics

Implication:

- this is not a simple relay enable
- the schematic should reflect a phase-control interface and its isolation boundary

### `PRESSURE_ADC`

- Configured as an analog input
- Firmware uses `analogReadMilliVolts()`
- ADC path is tuned for a divided sensor output

Assumed ranges from the firmware:

- sensor native range: `0.5 V` to `4.5 V`
- ADC target range after divider: about `0.34 V` to `3.09 V`
- divider ratio in code: `1.4545`

### `BREW_PULSE_OUT`

- Pulled high for `250 ms`, then low
- Debounced in firmware to avoid rapid retriggering
- Intended to drive an optocoupler that simulates the machine's brew switch

Implication:

- treat this as an isolated control interface, not a shared-ground button drive until proven safe

## Suggested connectors

| Connector | Pins | Suggested nets | Notes |
|---|---:|---|---|
| `J_PWR_IN` | 2-3 | `VIN`, `GND`, optional `PE` | Main power into the board |
| `J_PRESSURE` | 3 | `PRESSURE_V+`, `AGND`, `PRESSURE_RAW` | Pressure transducer |
| `J_ZC` | 2 | `ZC_OUT`, `GND` | Logic-side output from zero-cross detector |
| `J_DIM` | 2 | `DIM_OUT`, `GND` | Logic-side pump driver connection if off-board |
| `J_BREW_SW` | 2 | `BREW_SW_A`, `BREW_SW_B` | Isolated brew-button closure |
| `J_USB_UART` | as needed | `USB_D+`, `USB_D-`, `TX`, `RX`, `3V3`, `GND` | Programming and debug |

## Nets worth naming early

Use explicit net labels from the start:

- `3V3`
- `5V`
- `VIN`
- `GND`
- `AGND`
- `PRESSURE_RAW`
- `PRESSURE_ADC`
- `ZC_IN`
- `DIM_OUT`
- `BREW_PULSE_OUT`
- `BREW_SW_A`
- `BREW_SW_B`

## Open questions to resolve during schematic capture

- What exact ESP32-S3 module or dev board will be used?
- What input supply voltage will power the board?
- Is the pump-drive power stage on this PCB or on a separate board?
- Does the brew-button simulator need a true floating contact closure or only an opto transistor?
- Will the pressure sensor be powered from `5 V` or another regulated rail?
