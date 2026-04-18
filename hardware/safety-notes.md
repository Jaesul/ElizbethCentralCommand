# Safety Notes

This project touches espresso-machine hardware. That means line voltage, hot water, pressure, and enclosure-level safety all matter.

This file is only a design reminder. It is not a substitute for electrical-safety review.

## High-level rule

Keep a very explicit boundary between:

- low-voltage logic and sensing
- mains-adjacent switching and machine wiring

If a signal crosses that boundary, document how and why.

## Design reminders

- Prefer galvanic isolation for zero-cross sensing into the MCU.
- Prefer galvanic isolation for pump-drive control if the switching stage references mains.
- Treat the brew-button interface as unknown until measured; do not assume it is safe to share grounds.
- Keep mains creepage and clearance in mind from the first schematic pass, not only during layout.
- Size connectors, wire gauges, and isolation parts for the actual environment inside the machine.
- Assume vibration, humidity, heat, and service handling will be worse than on a bench.

## Pressure-system reminders

- Use only fittings and transducers rated for the expected pressure and temperature.
- Mount the pressure transducer where it truly represents brew-path pressure.
- Avoid any plumbing choice that risks leaks over energized circuitry.

## Layout reminders

- Separate hot-side and cold-side areas visually and physically.
- Keep the ESP32 antenna away from mains wiring and large metal obstructions where possible.
- Keep analog pressure traces away from switching nodes.
- Add test points so you do not have to probe unsafe nodes casually during bring-up.

## Bring-up reminders

- First validate the low-voltage rails before connecting machine I/O.
- Then validate ADC scaling with a safe signal source.
- Then validate zero-cross logic with isolation intact.
- Only after that, validate pump-drive timing and any machine-side interfaces.

## Review triggers

Pause and re-check the design whenever:

- a low-voltage signal starts touching a mains-referenced circuit
- you are unsure whether a machine-side signal is floating, grounded, or mains-referenced
- you change transducer type, supply voltage, or power-stage topology
- the enclosure or mounting plan changes enough to affect insulation spacing
