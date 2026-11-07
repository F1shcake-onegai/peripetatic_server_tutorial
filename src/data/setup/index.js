// @ts-check
// GPIO planner data and logic (step 1 of the interactive setup). Nothing on the site uses
// it yet. Tests: npm test
//
// For step 2 (saving the setup), not done yet:
// - Save the pins each module was given, so a module added later only takes free pins
//   and modules that are already wired never move.
// - Students can change GPIOs by hand; save those moves and pass them to allocate() as
//   `moved`.
//
// Breadboard rule, not done yet (the header has only two 3V3, two 5V and eight GND pins):
// - More than 2 devices on 3V3, or more than 2 on 5V (2 pins each): the breadboard is
//   required, and those modules get their power from its rails.
// - Otherwise: the breadboard step is shown, marked "(optional)".
// - Students are never asked whether they have a breadboard.
// - Not counted: boards on the header, the USB-powered ESP32, and ribbon or USB devices.
// - Wiring order: 3V3/5V/GND to the rails first, then each module's VCC/GND to the rails,
//   then its data pins straight to their GPIOs.
// Power pins are currently assigned per module (and marked shared when they run out).
export { HEADER, BOARDS, GPIO_TIERS, GPIO_PREFERENCE, pinOfGpio, pinDistance } from './header.js';
export { DEVICES } from './devices.js';
export { allocate, availability, moveOptions, signalsOf } from './allocate.js';
