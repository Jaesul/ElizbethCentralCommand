# Schematic Plan

This document turns `Firmware/FlowProfilingArduino/FlowProfilingArduino.ino` into a first-pass schematic structure.

## Design intent

This board is currently a profiling add-on that runs alongside the machine's existing controller. The board should:

- measure brew pressure
- detect AC zero-cross timing
- command pump power through a phase-control path
- simulate a brew-button press through an isolated output
- provide Wi-Fi and BLE connectivity through the ESP32 platform

The board should not currently assume responsibility for:

- boiler temperature control
- steam control
- machine safety interlocks owned by the stock controller
- direct scale load-cell measurement

## Recommended sheet hierarchy

Create these schematic sheets first:

1. `MCU Core`
2. `Power`
3. `Pressure Input`
4. `Zero Cross`
5. `Pump Drive`
6. `Machine I/O`
7. `Connectors and Test Points`

## Sheet goals

### 1. MCU Core

Include:

- ESP32-S3 module or dev-board equivalent
- enable / boot circuitry
- local decoupling
- USB or UART programming access
- debug header or test pads

Important firmware nets:

- `GPIO14` -> `ZC_IN`
- `GPIO17` -> `DIM_OUT`
- `GPIO4` -> `PRESSURE_ADC`
- `GPIO19` -> `BREW_PULSE_OUT`

### 2. Power

Include:

- board power input connector
- primary input protection
- buck or LDO stages as needed
- 3.3 V rail for the MCU
- any optional 5 V rail needed by sensors or isolators

Decide early:

- main input voltage
- whether field I/O runs at 3.3 V or 5 V
- grounding strategy between dirty switching return paths and analog return paths

### 3. Pressure Input

Include:

- pressure transducer connector
- input protection
- resistor divider sized to match firmware assumptions
- optional RC filtering near the ADC pin
- analog ground handling and test point

The firmware currently assumes:

- transducer output range of about `0.5 V` to `4.5 V`
- ADC input range after divider of about `0.34 V` to `3.09 V`
- maximum displayed pressure of `16 bar`

### 4. Zero Cross

Include:

- isolated zero-cross detector input from mains
- logic output conditioning for the ESP32 input
- pull-up / pull-down strategy consistent with the chosen detector
- test point for zero-cross pulse observation

The firmware sets the pin as `INPUT_PULLUP`, so open-collector or open-drain style detector outputs are a natural fit.

### 5. Pump Drive

Include:

- MCU output conditioning from `DIM_OUT`
- isolation barrier if the triac driver is on the mains side
- opto-triac or equivalent drive stage
- triac gate network and snubbing as required by the chosen topology

Treat this as a mains-adjacent design block even if the control logic is low-voltage.

### 6. Machine I/O

Include:

- brew-button simulation output
- optocoupler or isolated transistor stage
- connector to the machine's brew-button wiring
- optional future inputs or spare GPIO breakout

This output should behave like an isolated switch closure, not a direct logic connection into the stock machine control board.

### 7. Connectors and Test Points

Add labeled access for:

- power input
- pressure sensor
- zero-cross interface
- pump control interface
- brew-button interface
- USB/UART/programming
- 3.3 V, 5 V, and GND test points
- ADC test point on the scaled pressure signal

## Design order

Recommended order of work:

1. Place the MCU and power sheets.
2. Define connectors and net names.
3. Add the pressure-input path and confirm divider values.
4. Add zero-cross detection.
5. Add the pump-drive path.
6. Add the brew-button simulation circuit.
7. Add test points, mounting holes, and revision labels.

## Out-of-scope for revision 1 unless firmware changes

- thermocouple inputs
- heater relay control
- steam valve control
- wired scale ADC front end
- display/UI hardware

Those can be added later, but they should not shape the first schematic if the current firmware does not use them.
