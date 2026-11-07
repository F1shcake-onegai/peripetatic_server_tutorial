// @ts-check
// GPIO planner data and logic (step 1) and the saved setup (step 2, store.js).
// Tests: npm test
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
export {
  SETUP_KEY, SETUP_VERSION, SETUP_EVENT, TAB_LABELS, emptySetup, validate, toSelection, keepPins,
  tabChoices, load, save, clear, subscribe, safeLocalStorage,
} from './store.js';
