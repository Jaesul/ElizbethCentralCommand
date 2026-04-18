# Power Architecture

This document is for deciding the board's supply strategy before locking the schematic.

## Current firmware implications

The current firmware strongly implies:

- an ESP32-class MCU at `3.3 V`
- an analog pressure sensor input that may require a higher supply than `3.3 V`
- isolated or semi-isolated I/O blocks near mains circuitry

The firmware does not by itself define the board input voltage, so this needs to be chosen at the hardware level.

## Recommended power-planning decisions

Resolve these first:

1. What is the board input voltage?
2. Is there an existing safe low-voltage supply available inside the machine?
3. Does the pressure transducer require `5 V` excitation?
4. Do any isolators, optos, or external modules require `5 V`?
5. Is the pump power stage on-board or off-board?

## Likely rail set

A practical first-pass rail plan is:

- `VIN` - incoming board power
- `5V` - optional intermediate rail for sensor excitation or interface circuits
- `3V3` - MCU and logic rail

## Suggested architecture options

### Option A: machine provides a stable low-voltage rail

Use this if the machine already has a trustworthy low-voltage source with enough margin.

Pros:

- simplest board
- lowest thermal burden
- fewer power components

Concerns:

- verify noise from pumps, solenoids, and the stock controller
- verify startup and brownout behavior

### Option B: dedicated board supply from a higher input rail

Use a local regulator path on your board.

Pros:

- more control over noise and regulation
- easier to standardize the add-on hardware

Concerns:

- more heat and layout work
- larger BOM
- more safety scrutiny if derived from machine internals

## Analog and digital grounding

Even if the whole low-voltage side shares one ground net, treat the layout as if there are functional regions:

- analog return for the pressure signal path
- digital return for MCU and logic
- noisy return for switching interfaces

Goals:

- keep ADC return paths short
- keep pump-drive switching currents out of the pressure-sensor reference path
- avoid routing analog traces next to fast switching or mains-adjacent nets

## Protection ideas to consider

- reverse-polarity protection at the input
- input fuse sized for the board, not the whole machine
- TVS or surge handling appropriate to the source rail
- local bulk capacitance near the power entry point
- local decoupling at every active IC and optocoupler supply pin

## ESP32-specific notes

- keep `3V3` well-regulated during Wi-Fi transmit bursts
- do not starve the rail with an undersized regulator
- place decoupling close to the module pins
- keep the antenna keepout region clear of copper and noisy circuits

## Pressure-sensor supply note

If the transducer is a common industrial `0.5-4.5 V` output type, it often expects `5 V` or a wider supply range. Confirm the exact part before finalizing the rail plan, because that may force a `5 V` rail even if the MCU is only `3.3 V`.

## Decision record

Record these choices once made:

- board input voltage:
- regulator topology:
- pressure-sensor supply:
- whether `5V` exists on-board:
- whether the power stage is on-board:
- expected max board current:
