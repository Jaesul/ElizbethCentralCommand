# I/O Interfaces

This document describes the main electrical interfaces implied by `FlowProfilingArduino.ino`.

## 1. Pressure transducer input

### Firmware assumptions

- sensor output is approximately `0.5 V` to `4.5 V`
- full-scale pressure is `1.6 MPa` / `16 bar`
- the signal is reduced by a divider before it reaches the ESP32 ADC

### Schematic goals

- provide the transducer with a clean supply rail
- scale the sensor output into the usable ADC range
- protect the ADC pin from overvoltage and noise
- keep analog return current away from noisy switching paths

### Recommended building blocks

- 3-pin connector: `V+`, `GND`, `SIGNAL`
- resistor divider close to the MCU-side ADC input
- optional RC low-pass filter
- optional series resistor into the ADC pin
- clamp or protection strategy compatible with the ESP32 ADC input limits
- analog test point on the divided signal

### Design checks

- divider ratio should match the firmware constant
- verify the sensor supply voltage matches the actual transducer part
- confirm the sensor can drive the divider and filter impedance

## 2. Zero-cross input

### Firmware assumptions

- connected to `GPIO14`
- configured as `INPUT_PULLUP`
- used as the timing reference for pump phase control

### Schematic goals

- generate a clean logic transition near AC zero crossings
- isolate the low-voltage MCU from mains
- avoid excessive pulse width variation or chatter

### Recommended building blocks

- mains-side zero-cross sensing network
- optocoupler or isolated detector stage
- logic-side output compatible with a pulled-up GPIO input
- optional pulse-shaping or filtering if the detector output is noisy
- test point on the logic-side zero-cross output

### Design checks

- confirm expected line frequency: `50 Hz` or `60 Hz`
- confirm whether the chosen detector produces one pulse or two pulses per AC cycle
- ensure the PSM library timing expectations match the detector behavior

## 3. Pump drive output

### Firmware assumptions

- `GPIO17` is the pump modulation output
- output is used by the PSM library, not simple on/off logic
- timing is synchronized to zero-cross events

### Schematic goals

- preserve timing fidelity between the MCU and the power stage
- isolate the logic domain if the power stage references mains
- support the selected triac or external power module

### Recommended building blocks

- GPIO source resistor
- indicator or test point only if it does not distort timing
- opto-triac or equivalent isolation stage if the driver is on-board
- gate resistor / snubber / dv-dt control as required by the final triac topology

### Design checks

- decide whether the power stage lives on this PCB or a separate board
- size clearances and creepage from the start if the mains-side stage is on-board
- confirm the ULKA pump switching method used in prior working tests

## 4. Brew-button simulation output

### Firmware assumptions

- `GPIO19` drives a pulse of about `250 ms`
- intended to simulate a button press
- comment explicitly calls out an optocoupler output

### Schematic goals

- electrically mimic a user pressing the brew switch
- protect the stock controller from accidental logic injection
- preserve isolation if the machine button circuit is not at safe SELV levels

### Recommended building blocks

- LED drive resistor from the MCU GPIO to an optocoupler LED
- isolated transistor or photo-MOS output side
- 2-pin connector for the button circuit
- optional jumper or footprint options if you need either polarity or relay-style behavior

### Design checks

- identify the actual button circuit voltage and polarity in the machine
- confirm whether a transistor optocoupler is sufficient or a bilateral isolated switch is needed

## 5. Wireless and service interfaces

The firmware uses:

- Wi-Fi for WebSocket transport
- BLE for Acaia scale communication

Implications for the schematic:

- avoid placing copper, shielding, or metal too close to the ESP32 antenna region
- keep noisy mains switching and high di/dt current loops away from the RF section
- provide an easy programming and debug path even if USB is not exposed in the final enclosure

## 6. Not currently required by this firmware

Do not let these expand revision 1 unless you intentionally want future-proofing:

- heater control
- thermocouple interface
- steam control
- wired scale ADC / HX711
- on-board display

Those belong in a later revision unless the firmware is expanded first.
