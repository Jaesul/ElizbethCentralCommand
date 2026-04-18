# Bring-Up Checklist

Use this checklist when moving from schematic to prototype.

## 1. Before ordering boards

- Confirm the MCU/module choice.
- Confirm the intended board input voltage.
- Confirm the exact pressure transducer part and supply requirement.
- Confirm whether the pump power stage is on-board or off-board.
- Confirm the brew-button interface electrical behavior on the stock machine.
- Check connector pinouts against `pin-map.md`.

## 2. Before first power

- Inspect polarity, connector labels, and net names.
- Verify regulator output expectations on paper.
- Verify no MCU GPIO is directly exposed to unknown machine-side voltages.
- Verify isolation boundaries are intentional and documented.
- Mark safe test points for `VIN`, `5V`, `3V3`, `GND`, `PRESSURE_ADC`, `ZC_IN`, and `DIM_OUT`.

## 3. First power-up, no machine attached

- Power only the low-voltage side.
- Confirm rail voltages are correct.
- Confirm the ESP32 boots reliably.
- Confirm programming and serial access work.
- Confirm idle current draw is reasonable.

## 4. Pressure-input validation

- Inject a known safe voltage into the pressure-input chain or use the real sensor off-machine.
- Confirm the ADC node never exceeds the MCU input limit.
- Confirm low pressure reads near zero and high pressure scales as expected.
- Check for excessive noise before the mains-related blocks are attached.

## 5. Zero-cross validation

- Validate the isolated detector output on the logic side first.
- Confirm pulse frequency and polarity.
- Confirm the pulse shape is stable enough for timing.
- Verify the MCU sees transitions cleanly.

## 6. Pump-drive validation

- Validate `DIM_OUT` timing on the low-voltage side before attaching the real power stage.
- If using an isolated driver, validate the isolation stage separately.
- Confirm the triac or external driver behaves correctly with the expected timing input.
- Do not attach the actual pump until the control path is understood.

## 7. Brew-button interface validation

- Measure the machine's button circuit before connecting.
- Confirm the chosen isolated output topology behaves like a button closure.
- Validate pulse timing from firmware.
- Confirm repeated pulses do not latch or upset the stock controller.

## 8. Integrated testing

- Power the board in its final supply configuration.
- Verify pressure readings with the pump idle and active.
- Verify zero-cross timing remains clean while the pump control path is active.
- Verify Wi-Fi and BLE remain stable during pump operation.
- Only then run closed-loop shot-control tests.

## 9. Record results

Write down:

- rail measurements
- pressure scaling calibration
- zero-cross frequency and waveform notes
- pump-drive topology used
- known-safe connector pinouts
- any firmware constants that must track the hardware
