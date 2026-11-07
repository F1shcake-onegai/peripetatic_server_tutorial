// @ts-check
// Pin values in the pages. The built page shows the default value (the device on its own,
// on a Raspberry Pi 5); with a saved setup, src/scripts/setup-runtime.js swaps in the
// viewer's values.
//
//   In text and tables:  <Pin signal="esp32-c5-devkitc-1.handshake" show="pin" />  → 15
//   In code blocks:      ⟦esp32-c5-devkitc-1.handshake:gpio⟧                       → 22
//   show: "pin" (physical header pin) or "gpio" (BCM GPIO number)
import { DEVICES } from './devices.js';
import { allocate, signalsOf } from './allocate.js';

/** @typedef {import('./allocate.js').Assignment} Assignment */

export const PLACEHOLDER = /⟦([\w-]+\.[\w-]+):(pin|gpio)⟧/;
export const SHOWS = ['pin', 'gpio'];

/**
 * The pin a signal gets by default: its device alone, in the first mode that has the
 * signal. Throws on an unknown signal, so a typo fails the build.
 * @param {string} key  'deviceId.signalId'
 * @param {import('./devices.js').Device[]} [catalog]
 * @returns {Assignment}
 */
export function defaultAssignment(key, catalog = DEVICES) {
  const [id, signalId] = key.split('.');
  const dev = catalog.find((d) => d.id === id);
  if (!dev) throw new Error(`Pin: unknown device "${id}" in "${key}"`);
  const mode = dev.modes ? Object.keys(dev.modes).find((m) => signalsOf(dev, m)?.some((s) => s.id === signalId)) : undefined;
  if (!signalsOf(dev, mode)?.some((s) => s.id === signalId)) throw new Error(`Pin: unknown signal "${signalId}" in "${key}"`);
  const a = allocate({ board: 'rpi5', devices: [{ id, ...(mode ? { mode } : {}) }] }, catalog)
    .assignments.find((x) => x.device === id && x.signal === signalId);
  if (!a || a.pin === undefined) throw new Error(`Pin: "${key}" has no header pin`);
  return a;
}

/**
 * The text shown for an assignment.
 * @param {Pick<Assignment, 'pin' | 'gpio'>} a
 * @param {string} show
 */
export function formatPin(a, show) {
  if (!SHOWS.includes(show)) throw new Error(`Pin: show must be "pin" or "gpio", not "${show}"`);
  return String(show === 'pin' ? a.pin : a.gpio);
}
