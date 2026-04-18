# Brew Button Simulation

This document is a focused guide for starting the brew-button simulation section of the schematic.

The current firmware source of truth is:

- `Firmware/FlowProfilingArduino/FlowProfilingArduino.ino`

In that file, the brew-button simulation is represented by:

- `OUT_PIN` on `GPIO19`
- a `250 ms` pulse
- a comment that explicitly says this is an optocoupler output

## What this block needs to do

This circuit is meant to let the ESP32 behave like a human pressing the machine's brew button.

At a high level:

1. The ESP32 drives `BREW_PULSE_OUT`.
2. That signal turns on an isolation device.
3. The isolation device closes or emulates the brew-button circuit on the stock machine.
4. The stock machine reacts as if its normal brew button was pressed.

The important design goal is to emulate a button press without injecting the ESP32 ground or logic voltage directly into the machine's original control circuitry unless you have already proven that is safe.

## Firmware behavior you should design around

The firmware currently does this:

```740:748:C:/Users/Jae/Documents/repos/ElizbethCentralCommand/Firmware/FlowProfilingArduino/FlowProfilingArduino.ino
// ================== MACHINE BREW BUTTON (optocoupler pulse) ==================
static unsigned long lastOptoPulseMs = 0;
static void pulseMachineBrewButton() {
  // Simple debounce: don't allow back-to-back pulses too quickly
  if (millis() - lastOptoPulseMs < 700) return;
  digitalWrite(OUT_PIN, HIGH);
  delay(250);
  digitalWrite(OUT_PIN, LOW);
  lastOptoPulseMs = millis();
}
```

And the pin is defined here:

```64:69:C:/Users/Jae/Documents/repos/ElizbethCentralCommand/Firmware/FlowProfilingArduino/FlowProfilingArduino.ino
// ================== PINS ==================
#define ZC_PIN       14
#define DIM_PIN      17
#define PRESSURE_PIN 4
// Optocoupler output to simulate pressing the machine's brew button (matches TriacTests sketches)
#define OUT_PIN      19
```

That means the schematic only needs to support:

- a digital output from `GPIO19`
- a pulse width of about `250 ms`
- one activation at a time, not continuous PWM or high-speed signaling

## First schematic decision

Before placing any parts, determine what kind of machine-side button circuit you are interfacing with.

You need to measure or identify:

- the idle voltage across the brew button
- whether one side of the button is tied to ground, 3.3 V, 5 V, or something else
- whether the button simply shorts two low-voltage nodes together
- whether the button is part of a matrix or scanned input system
- whether polarity matters

This decides whether you can use:

- a transistor-output optocoupler
- a photo-MOS / solid-state relay style isolated switch
- another isolated closure method

If you do not know the button circuit yet, assume you need a floating isolated closure.

## Known machine-side behavior

The current understanding of the stock brew button is:

- wire 1: `12 V` rail
- wire 2: LED sink for the button illumination
- wire 3: return to the stock MCU for button sensing

The actual button press behavior is:

- pressing the button shorts the `12 V` rail to the `MCU return/sense` line

That means the switch function is not a generic low-side pull to ground. It is a high-side short that presents `12 V` to the machine's sense input when the button is pressed.

This is useful because it means the button action itself sounds simple and DC-based, but you still should not inject your ESP32 board ground into that circuit directly.

## Safest first-pass topology

For revision 1, the safest conceptual approach is:

1. `GPIO19` drives an LED inside an optocoupler through a resistor.
2. The isolated output side connects to the machine's brew-button circuit.
3. The machine-side output behaves like a switch closure.
4. No shared ground is assumed between the ESP32 board and the machine's brew-button circuit.

This lets you start the schematic without committing to a risky shared-ground assumption too early.

With the button behavior now known, the isolated output should be designed to short these two machine-side lines together:

- `BREW_12V_IN`
- `BREW_MCU_RETURN`

The LED wire is separate from the switch function and should not be part of the simulated press path unless you intentionally want to monitor or reproduce the indicator behavior later.

## What to place first in KiCad

Place these items first:

1. MCU output net label:
   `BREW_PULSE_OUT`
2. A series resistor from `BREW_PULSE_OUT`
3. An isolation device symbol:
   optocoupler or photo-MOS
4. A 2-pin machine interface connector:
   `J_BREW_SW`
5. Net labels on the machine side:
   `BREW_SW_A` and `BREW_SW_B`
6. Test point on the logic-side drive net if desired

That gives you the full block shape before choosing a final part number.

## Suggested starter net names

Use these labels so the block is easy to read:

- `BREW_PULSE_OUT`
- `BREW_OPTO_LED_A`
- `BREW_OPTO_LED_K`
- `BREW_SW_A`
- `BREW_SW_B`
- `3V3`
- `GND`

If you keep the LED side very simple, you may not need the internal LED net names, but they can make early review easier.

## Minimal block structure

Your first-pass schematic can look like this logically:

```text
ESP32 GPIO19 -> series resistor -> optocoupler LED -> GND

optocoupler isolated output -> J_BREW_SW pin 1
optocoupler isolated output -> J_BREW_SW pin 2
```

The exact right-hand side depends on the chosen isolation part:

- transistor optocoupler
- bilateral photo-MOS
- relay-like solid-state switch

For your specific machine-side wiring, the logical right-hand side is:

```text
machine 12V rail -------------------- J_BREW_SW pin 1
machine MCU sense return ------------ J_BREW_SW pin 2

isolated switch closes pin 1 to pin 2 when GPIO19 pulses
```

That is the core behavior you want the schematic to express.

## Recommended order of work

Follow this order:

1. Add `GPIO19` on the MCU sheet and label it `BREW_PULSE_OUT`.
2. Decide whether the brew-button block lives on the MCU sheet or a separate `Machine I/O` sheet.
3. Add the LED drive resistor and isolation device.
4. Add a 2-pin connector for the machine brew-button wiring.
5. Add a note on the schematic saying the machine-side circuit must be measured before the output topology is finalized.
6. Only after that, pick the exact component.

## How to choose the output device

### Option A: transistor-output optocoupler

Use this if:

- the machine button circuit is low-voltage
- one polarity is acceptable
- the closure does not need to be fully bilateral

Pros:

- cheap
- common
- simple

Concerns:

- output polarity matters
- may not behave like a true floating contact in every circuit

In your case, a simple transistor optocoupler may work if you wire it so the transistor conducts from the `12 V` rail into the stock MCU return line, but this is still not as universally safe as a true isolated switch because:

- the transistor has a defined polarity
- off-state leakage may matter to the stock MCU input
- saturation voltage may slightly alter the sensed "pressed" level
- the machine-side circuit is not truly being shorted by a floating contact

### Option B: photo-MOS or SSR-style isolated switch

Use this if:

- you want the output to behave more like a true isolated button closure
- the machine-side polarity is unknown or may reverse
- you want to minimize assumptions early

Pros:

- closer to a real isolated switch
- often easier to drop into unknown button circuits

Concerns:

- more expensive
- may need tighter part selection

For the button behavior you described, this is the cleaner conceptual fit because it behaves more like "close a switch between the 12 V line and the MCU return line."

That makes it easier to think about the circuit exactly the same way as the original button.

### Best current recommendation

Given the new information, the best final-board direction is:

- keep the ESP32 side isolated
- use an isolated switch element on the machine side
- wire that switch directly across the original button's two switching wires

That means:

- do not involve the LED wire in the simulated press path
- do not share grounds unless you have a separate reason to do so
- prefer a switch-like isolated output over a generic transistor sink if you want the cleanest emulation

## What not to do initially

Avoid these until you have measured the machine interface:

- directly wiring `GPIO19` into the stock board
- sharing grounds by default
- assuming the button is just a pull-up to 3.3 V
- assuming a transistor optocoupler will work in all directions

## What to write on the schematic as notes

Add one or two explicit notes near the block:

- `Brew-button interface must remain isolated until stock button circuit is characterized.`
- `Choose final isolated output type after measuring button voltage, polarity, and scan behavior.`

Those notes prevent future-you from forgetting that this block is still assumption-driven.

## Good revision-1 goal

A good first milestone is not "finalize the exact optocoupler."

It is:

- define the block boundary
- define the connector
- define the MCU net
- define the isolation requirement
- leave room to swap the final output part once the machine-side button circuit is measured

## Suggested first symbol set

If you want to move quickly in KiCad, start with placeholder symbols:

- generic resistor for LED drive
- generic optocoupler or photo-relay symbol
- 2-pin connector
- test point

That is enough to get the schematic architecture right before doing part selection.

## Next questions to answer

Before finalizing this block, gather:

1. What voltage is present across the stock brew button when idle?
2. Does pressing the button short two lines together, or pull one line to another rail?
3. Is the stock machine scanning the button matrix?
4. Do you want this closure to be fully floating?

Once you know those answers, this block can be turned from a placeholder architecture into a final circuit.

## Using the current Amazon SSR module

The relay module currently under consideration is this product:

- [`(2pcs) 3.3V / 5V / 12V DC solid state relay, input 3-32VDC, output 5-60VDC, 1A max`](https://www.amazon.com/2pcs-Solid-State-Relay-Input/dp/B0DK36RT9K/ref=sr_1_4_sspa?crid=34QYIDX87BFK9&dib=eyJ2IjoiMSJ9.8rsPhPxrA8_h-a4FgKOSB8W1powJKC69aHcXFUnvAzAQDyvbeQGMgMp63l1DUeBZ2wqoR6tsOlevPeYh5hx4oISQqaCsfcPQ-93-rluelXj_Cg3eZHgT_nYKYY4Q4diM7WOX_n4aLnAApV0s-f9X0cUEhQn8KEds6w6KhCOVAhkYea-McRVBRrQkqF2XgJVo866NMf7xnITI-5gDEwAplFaRM7UPAbaOthLRPcGZG-o8DK4vzpOWr18389zlGDznpijW6_zpf49lifuO4oYlgxSl9QrOVz-DP701y1TY2k0.yp_RQdMC48AMpAkGXtgG5r-JjLockkH9zbVPYemUjk0&dib_tag=se&keywords=3.3v%2Brelay&qid=1776036440&s=electronics&sprefix=3.3v%2Brelay%2Celectronics%2C185&sr=1-4-spons&sp_csd=d2lkZ2V0TmFtZT1zcF9tdGY&th=1)

The listing describes it as:

- input: `3-32 VDC`
- output: `5-60 VDC`
- max current without heatsink: `1 A`
- optocoupler isolated

### What that means for this design

This module may be usable for brew-button simulation, but only if the machine's brew-button circuit is a simple low-voltage DC circuit that fits inside the module's output behavior.

It is a better match if:

- the stock brew button switches a DC signal
- the signal voltage is between `5 V` and `60 V`
- the current is small
- the switch action does not need to be truly bidirectional like a mechanical contact

It is a weak match if:

- the brew button is part of a scanned keyboard matrix
- the button closure must be polarity-independent
- the circuit expects a true dry-contact closure with very low leakage
- the machine-side button voltage is below the module's stated output range

### Main concern

The listing calls this a `DC-DC SSR`, not a purpose-built dry-contact replacement.

That matters because a button emulator often needs to behave more like an isolated floating switch than a generic DC load switch.

Cheap DC SSR modules can have behavior that matters in logic circuits:

- output polarity constraints
- off-state leakage current
- nonzero on-resistance or voltage drop
- unknown behavior at very low current

Those issues may be irrelevant for switching a small DC load, but they can matter a lot when "pressing a button" on another control board.

### Practical recommendation

Use this module as a prototype option only after measuring the stock brew-button circuit.

Before committing to it in the schematic, verify:

1. the button circuit is DC, not AC
2. the button voltage is inside the module's operating range
3. the output polarity matches the machine circuit
4. the machine tolerates the SSR's leakage and on-state behavior

### Schematic implication

If you want to keep using this module for early testing, draw the brew-button block as a connectorized external module rather than baking its internals into revision 1 immediately.

For example:

- `BREW_PULSE_OUT` from `GPIO19`
- connector to SSR input side
- separate isolated connector from SSR output to machine brew-button lines

That keeps the main board flexible while you validate whether the module actually behaves like the machine expects.

For your now-known button behavior, if you prototype with this module, test one thing first on the bench:

- does the module cleanly present the stock MCU return line with the expected pressed-state voltage when it connects the `12 V` rail to that return line?

If yes, it may be fine as a prototype module. If no, move to a true switch-style isolated output.

### Better long-term fit

If the machine button circuit turns out to be delicate or polarity-agnostic, a photo-MOS relay or another true isolated switch element is likely a cleaner final schematic choice than a generic low-cost DC SSR module.

## Recommended components for a PCB build

If the goal is a board you can send to JLCPCB for assembly, the recommendation changes slightly:

- do not design around the external Amazon SSR module as the final production solution
- place the isolation device directly on your PCB
- choose package styles that are easy for assembly houses to place
- prefer parts that exist in the LCSC / JLC ecosystem or have close equivalents there

The most important point is that this block should look like a small on-board isolated switch, not like a header intended to drive an external hobby relay module.

## Recommended Rev A approach

For this brew-button circuit, the recommended final-board direction is:

1. `GPIO19` drives an on-board isolated switch input LED through a resistor.
2. The isolated output side connects directly across the machine's two switch wires:
   `BREW_12V_IN` and `BREW_MCU_RETURN`.
3. The button LED wire remains separate and is not part of this block.

## Preferred component type

### First choice: photo-MOS / solid-state isolated switch

This is the best fit for your known button behavior because it behaves most like a real isolated contact closure.

Use this class of part if possible:

- `PhotoMOS`
- `MOSFET output optocoupler`
- `solid-state relay with isolated switch-style output`

Why this is the preferred class:

- closest behavior to the original pushbutton
- cleaner isolation boundary
- easier to place directly across `12 V` and the stock MCU return line
- avoids some of the polarity and leakage awkwardness of a basic transistor optocoupler

### Candidate parts to look for in JLC / LCSC

These are good part families to look up and compare:

- `Panasonic AQY21x` family
- `Panasonic AQY22x` family
- `CPC1017N` family
- `VO14642A` family
- similar low-current photo-relay parts rated comfortably above `12 V`

Important note:

- verify the exact JLCPCB / LCSC stocked part before freezing the BOM
- the family recommendation matters more than the exact suffix at this stage

### Electrical characteristics to look for

For the final isolated switch part, prefer:

- output voltage rating comfortably above `12 V`
- low off-state leakage
- low enough on-resistance for logic switching
- low output capacitance if available
- input LED current that can be driven directly from `3.3 V`
- SOP or SOIC style package if possible

For this application, you do not need a high-current relay. You need a clean, low-leakage, isolated switch.

## Backup option

### Second choice: transistor-output optocoupler

If JLC availability or cost pushes you away from a photo-MOS, a transistor-output optocoupler is the next option.

Candidate families:

- `LTV-817`
- `EL357`
- `PC817`
- similar transistor-output optocouplers

This can work, but it is a compromise:

- it is less like a true contact closure
- polarity matters
- leakage and saturation behavior matter more

Use this path only if you confirm on the bench that the stock MCU input reliably sees a valid press when the optocoupler output is active.

## Recommended support components

For the on-board version of this block, use these support parts.

### 1. Input resistor from `GPIO19`

Recommended starting value:

- `680 ohm` if using a typical opto LED that wants a few mA

Safer low-current fallback:

- `1 kohm`

Why:

- from a `3.3 V` GPIO, these values usually put you in a sane LED-drive range for small isolated switch parts
- the exact final value should be tuned from the chosen device datasheet

Good rule of thumb:

- use `680 ohm` for most Rev A part selections
- move to `1 kohm` if the chosen isolator has a very sensitive input LED

### 2. GPIO pull-down

Recommended:

- `100 kohm` from `BREW_PULSE_OUT` to `GND`

Why:

- keeps the control input off during reset and boot if the ESP32 pin floats briefly

### 3. Machine-side connector

Recommended:

- `2-pin` locking connector for the actual switch wires
- keep the LED wire on a separate connector or not populated in this block

Suggested connector classes:

- JST-XH if you want compact and common
- JST-VH or equivalent if you want something more mechanically robust
- small pluggable terminal block if the wire harness is custom and serviceability matters more than compactness

### 4. Test points

Recommended:

- one test point on `BREW_PULSE_OUT`
- one test point on `BREW_12V_IN`
- one test point on `BREW_MCU_RETURN`

These are very useful during bench validation.

## What I would actually put in Rev A

If I were preparing this specifically for a JLC-assembled board, I would start with:

- `U_BREW_SW`: photo-MOS / photo-relay, SOP package, low-leakage, low-current logic-switch class
- `R_BREW_LED`: `680 ohm`, `1%`, `0603`
- `R_BREW_PD`: `100 kohm`, `1%`, `0603`
- `J_BREW_SW`: 2-pin connector for the machine switch wires
- optional `TP_BREW_CTRL`, `TP_BREW_12V`, `TP_BREW_SENSE`

If the preferred photo-MOS is not available in JLC's parts catalog, then my fallback Rev A would be:

- `U_BREW_SW`: transistor optocoupler in `SOP-4`
- `R_BREW_LED`: `680 ohm`, `0603`
- `R_BREW_PD`: `100 kohm`, `0603`
- bench-verify that the output really behaves like the stock button

## What I would not recommend for the final assembled PCB

I would avoid making any of these the primary production solution:

- the Amazon external SSR module as a permanent design element
- a mechanical relay unless you have a specific reason
- direct GPIO drive into the machine's button sense line
- shared-ground button emulation without a separate proof that it is safe

## Schematic note to add

Add a note near the block such as:

- `Preferred output device: on-board photo-MOS isolated switch.`
- `Fallback output device: transistor optocoupler only if bench-tested against stock MCU input.`
- `Button LED wire is not part of the simulated press path.`

## Final recommendation

For a board you want assembled by JLCPCB, the best recommendation is:

- use an on-board photo-MOS style isolated switch
- use `680 ohm` as the initial drive resistor
- add a `100 kohm` pull-down on the GPIO
- route the isolated output directly across the two actual switch wires
- leave the button LED wire out of this switching block
