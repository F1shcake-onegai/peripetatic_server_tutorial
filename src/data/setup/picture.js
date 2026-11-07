// @ts-check
// What the setup page's header picture shows on each of the 40 pins: the pin's name and
// kind, and who uses it. Power and ground wired to breadboard rails show one rail badge
// ("3V3 rail (+)") instead of a badge per module.
import { HEADER } from './header.js';
import { DEVICES } from './devices.js';
import { signalsOf } from './allocate.js';

/** @typedef {import('./allocate.js').Selection} Selection */
/** @typedef {import('./allocate.js').Result} Result */
/** @typedef {import('./allocate.js').Assignment} Assignment */
/** @typedef {import('./header.js').PinKind} PinKind */
/** @typedef {import('./devices.js').Device} Device */

/**
 * @typedef {object} PinUser
 * @property {string} key         'deviceId.signalId'
 * @property {string} device
 * @property {string} short       The device's short name
 * @property {string} label       The signal's label
 * @property {string} devicePin
 * @property {Assignment['how']} how
 * @property {boolean} movable    The viewer can move it to another GPIO
 */

/**
 * @typedef {object} PinRail   A header pin wired to a breadboard rail
 * @property {'3v3' | '5v'} rail
 * @property {'+' | '−'} side
 * @property {string[]} devices
 */

/**
 * @typedef {object} PinView
 * @property {number} pin
 * @property {PinKind} kind
 * @property {number} [gpio]
 * @property {string} name          'GPIO22', '3V3 power', '5V power' or 'Ground'
 * @property {string[]} functions
 * @property {boolean} reserved
 * @property {string} [note]
 * @property {PinUser[]} users
 * @property {PinRail} [rail]
 * @property {string} [coveredBy]   Id of the board covering the header, on pins it doesn't use
 * @property {string} badge         Text shown next to the pin; '' when nothing uses it
 */

export const RAIL_NAMES = { '3v3': '3V3', '5v': '5V' };
const KIND_NAMES = { '3v3': '3V3 power', '5v': '5V power', gnd: 'Ground' };

/** @param {number} n */
const modules = (n) => `${n} module${n === 1 ? '' : 's'}`;

/** @param {PinUser[]} users */
function badgeOf(users) {
  if (!users.length) return '';
  if (users.length === 1) return `${users[0].short} · ${users[0].label}`;
  const labels = new Set(users.map((u) => u.label));
  const who = users.length === 2 ? users.map((u) => u.short).join(' & ') : modules(users.length);
  return labels.size === 1 ? `${who} · ${users[0].label}` : who;
}

/**
 * @param {Selection} selection
 * @param {Result} result   allocate(selection)
 * @param {Device[]} [catalog]
 * @returns {PinView[]}     The 40 pins in order
 */
export function pinViews(selection, result, catalog = DEVICES) {
  const byId = new Map(catalog.map((d) => [d.id, d]));
  const modeOf = new Map(selection.devices.map((d) => [d.id, d.mode]));
  const top = selection.devices
    .map((d) => byId.get(d.id))
    .find((d) => d?.header?.covers && !d.header.passthrough);

  return HEADER.map((h) => {
    /** @type {PinUser[]} */
    const users = [];
    for (const a of result.assignments) {
      const here = a.pin === h.pin || (a.how === 'header' && h.gpio !== undefined && a.gpio === h.gpio);
      if (!here) continue;
      const dev = byId.get(a.device);
      const signal = dev ? signalsOf(dev, modeOf.get(a.device))?.find((s) => s.id === a.signal) : undefined;
      users.push({
        key: `${a.device}.${a.signal}`,
        device: a.device,
        short: dev?.short ?? a.device,
        label: a.label,
        devicePin: a.devicePin,
        how: a.how,
        movable: Boolean(signal && signal.type === 'gpio' && signal.fixed === undefined && a.how !== 'header'),
      });
    }

    /** @type {PinRail | undefined} */
    let rail;
    for (const r of result.breadboard.rails) {
      if (r.supply === h.pin) rail = { rail: r.rail, side: '+', devices: r.devices };
      if (r.ground === h.pin) rail = { rail: r.rail, side: '−', devices: r.devices };
    }

    const badge = rail
      ? `${RAIL_NAMES[rail.rail]} rail (${rail.side})${users.length ? ` + ${badgeOf(users)}` : ''}`
      : badgeOf(users);

    return {
      pin: h.pin,
      kind: h.kind,
      ...(h.gpio !== undefined ? { gpio: h.gpio } : {}),
      name: h.kind === 'gpio' ? `GPIO${h.gpio}` : KIND_NAMES[h.kind],
      functions: h.functions,
      reserved: Boolean(h.reserved),
      ...(h.note ? { note: h.note } : {}),
      users,
      ...(rail ? { rail } : {}),
      ...(top && !users.length && !rail ? { coveredBy: top.id } : {}),
      badge,
    };
  });
}
