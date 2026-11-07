// @ts-check
// The changes the setup page makes to a setup. Each function returns a new setup and
// leaves the one it was given unchanged. Pins (moved or kept) of a device that is removed,
// or whose mode changes, are dropped: its signals change.
import { DEVICES } from './devices.js';
import { keepPins } from './store.js';

/** @typedef {import('./store.js').Setup} Setup */
/** @typedef {import('./devices.js').Device} Device */

/** @param {Record<string, number>} pins @param {string} id */
const withoutDevice = (pins, id) => Object.fromEntries(Object.entries(pins).filter(([key]) => !key.startsWith(`${id}.`)));

/**
 * Hardware offered for a track (all of it when no track is chosen), in catalog order.
 * @param {Setup['track']} track
 * @param {Device[]} [catalog]
 */
export function devicesFor(track, catalog = DEVICES) {
  return catalog.filter((d) => !track || d.tracks.includes(track));
}

/** @param {Setup} setup @param {string} board @returns {Setup} */
export function setBoard(setup, board) {
  return { ...setup, board };
}

/**
 * Choose a track. Hardware that isn't for this track is removed.
 * @param {Setup} setup @param {Setup['track']} track @param {Device[]} [catalog]
 * @returns {Setup}
 */
export function setTrack(setup, track, catalog = DEVICES) {
  const offered = new Set(devicesFor(track, catalog).map((d) => d.id));
  let next = { ...setup, track };
  for (const d of setup.devices) if (!offered.has(d.id)) next = toggleDevice(next, d.id, false, catalog);
  return next;
}

/**
 * Add (on) or remove a device. A device with modes starts in its first mode.
 * @param {Setup} setup @param {string} id @param {boolean} on @param {Device[]} [catalog]
 * @returns {Setup}
 */
export function toggleDevice(setup, id, on, catalog = DEVICES) {
  const has = setup.devices.some((d) => d.id === id);
  if (on) {
    const dev = catalog.find((d) => d.id === id);
    if (has || !dev) return setup;
    return { ...setup, devices: [...setup.devices, { id, ...(dev.modes ? { mode: Object.keys(dev.modes)[0] } : {}) }] };
  }
  if (!has) return setup;
  return {
    ...setup,
    devices: setup.devices.filter((d) => d.id !== id),
    moved: withoutDevice(setup.moved, id),
    kept: withoutDevice(setup.kept, id),
  };
}

/** @param {Setup} setup @param {string} id @param {string} mode @returns {Setup} */
export function setMode(setup, id, mode) {
  return {
    ...setup,
    devices: setup.devices.map((d) => (d.id === id ? { ...d, mode } : d)),
    moved: withoutDevice(setup.moved, id),
    kept: withoutDevice(setup.kept, id),
  };
}

/**
 * Move a signal to a GPIO, or back to automatic (gpio undefined).
 * @param {Setup} setup @param {string} key 'deviceId.signalId' @param {number | undefined} gpio
 * @returns {Setup}
 */
export function movePin(setup, key, gpio) {
  const moved = { ...setup.moved };
  const kept = { ...setup.kept };
  delete kept[key];
  if (gpio === undefined) delete moved[key];
  else moved[key] = gpio;
  return { ...setup, moved, kept };
}

/**
 * Move a signal by hand (or back to automatic, gpio undefined) without moving anything
 * else: every other pin placed automatically is kept where it is first. Otherwise freeing
 * one pin and taking another could regroup another module's automatic pins.
 * @param {Setup} setup @param {string} key 'deviceId.signalId' @param {number | undefined} gpio
 * @param {Device[]} [catalog]
 * @returns {Setup}
 */
export function moveSignal(setup, key, gpio, catalog = DEVICES) {
  return movePin(keepPins(setup, undefined, catalog), key, gpio);
}

/** Forget moved and kept pins: everything is placed automatically again. @param {Setup} setup */
export function resetPins(setup) {
  return { ...setup, moved: {}, kept: {} };
}
