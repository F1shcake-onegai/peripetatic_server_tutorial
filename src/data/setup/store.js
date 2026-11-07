// @ts-check
// The viewer's setup, saved in the browser (localStorage). Every value read back is
// checked against the catalog, so an old, edited or broken entry never breaks the site:
// what can't be used is dropped, and an unreadable entry counts as no setup.
import { BOARDS, HEADER } from './header.js';
import { DEVICES } from './devices.js';
import { allocate, signalsOf } from './allocate.js';

/** @typedef {import('./devices.js').Device} Device */
/** @typedef {import('./allocate.js').Selection} Selection */
/** @typedef {import('./allocate.js').Result} Result */

/**
 * @typedef {object} Setup
 * @property {number} version
 * @property {string} board                     'rpi5' or 'rpi-zero-2-w'
 * @property {'student' | 'server' | null} track
 * @property {{id: string, mode?: string}[]} devices
 * @property {Record<string, number>} moved     Pins the viewer moved by hand
 * @property {Record<string, number>} kept      Pins given when the setup was saved
 */

/** @typedef {{getItem(key: string): string | null, setItem(key: string, value: string): void, removeItem(key: string): void}} Storage */

export const SETUP_KEY = 'pst-setup';
export const SETUP_VERSION = 1;
/** Event sent on `window` when this tab saves or clears the setup. */
export const SETUP_EVENT = 'pst-setup-change';

const TRACKS = ['student', 'server'];
const USABLE_GPIOS = new Set(HEADER.filter((h) => h.kind === 'gpio' && !h.reserved).map((h) => h.gpio));

/** @returns {Setup} */
export function emptySetup() {
  return { version: SETUP_VERSION, board: 'rpi5', track: null, devices: [], moved: {}, kept: {} };
}

/**
 * Older saved versions are upgraded here, one version at a time: MIGRATIONS[n] turns a
 * version n entry into version n + 1. There is only version 1 so far.
 * @type {Record<number, (raw: any) => any>}
 */
const MIGRATIONS = {};

/**
 * Check a saved value. Returns a clean setup, or null when it can't be used at all.
 * @param {unknown} raw
 * @param {Device[]} [catalog]
 * @returns {Setup | null}
 */
export function validate(raw, catalog = DEVICES) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  /** @type {any} */
  let v = raw;
  if (!Number.isInteger(v.version) || v.version < 1 || v.version > SETUP_VERSION) return null;
  while (v.version < SETUP_VERSION) {
    const step = MIGRATIONS[v.version];
    if (!step) return null;
    v = step(v);
  }

  const setup = emptySetup();
  if (typeof v.board === 'string' && v.board in BOARDS) setup.board = v.board;
  if (TRACKS.includes(v.track)) setup.track = v.track;

  for (const d of Array.isArray(v.devices) ? v.devices : []) {
    const dev = catalog.find((x) => x.id === d?.id);
    if (!dev || setup.devices.some((x) => x.id === dev.id)) continue;
    if (dev.modes) {
      const mode = typeof d.mode === 'string' && d.mode in dev.modes ? d.mode : Object.keys(dev.modes)[0];
      setup.devices.push({ id: dev.id, mode });
    } else {
      setup.devices.push({ id: dev.id });
    }
  }

  // Only pins of movable signals of chosen devices, on usable header GPIOs
  for (const field of /** @type {const} */ (['moved', 'kept'])) {
    const pins = v[field];
    if (!pins || typeof pins !== 'object') continue;
    for (const [key, gpio] of Object.entries(pins)) {
      if (!Number.isInteger(gpio) || !USABLE_GPIOS.has(gpio)) continue;
      const [id, signalId] = key.split('.');
      const chosen = setup.devices.find((d) => d.id === id);
      const dev = catalog.find((x) => x.id === id);
      const signal = chosen && dev ? signalsOf(dev, chosen.mode)?.find((s) => s.id === signalId) : undefined;
      if (signal?.type === 'gpio' && signal.fixed === undefined) setup[field][key] = gpio;
    }
  }
  return setup;
}

/**
 * What the planner gets: moved pins win over kept ones.
 * @param {Setup} setup
 * @returns {Selection}
 */
export function toSelection(setup) {
  return { board: setup.board, devices: setup.devices, moved: setup.moved, kept: setup.kept };
}

/**
 * Remember the pins the planner gave (default and automatic ones), so a module added
 * later only takes free pins and nothing already wired moves.
 * @param {Setup} setup
 * @param {Result} [result]   allocate() result for this setup; worked out when not given
 * @param {Device[]} [catalog]
 * @returns {Setup}
 */
export function keepPins(setup, result, catalog = DEVICES) {
  const r = result ?? allocate(toSelection(setup), catalog);
  /** @type {Record<string, number>} */
  const kept = {};
  for (const a of r.assignments) {
    if (a.type === 'gpio' && a.gpio !== undefined && (a.how === 'default' || a.how === 'auto' || a.how === 'kept')) {
      kept[`${a.device}.${a.signal}`] = a.gpio;
    }
  }
  return { ...setup, kept };
}

// Starlight remembers a synced tab group's choice under "starlight-synced-tabs__<syncKey>".
// The setup writes the groups it decides, so those tabs open on the viewer's hardware.
const TAB_PREFIX = 'starlight-synced-tabs__';
export const TAB_LABELS = {
  'second-interface': {
    'esp32-c5-devkitc-1': 'Using an ESP32 DevKit via GPIO',
    'wifi-dongle': 'Using a Plug-and-Play Wi-Fi Dongle',
  },
  'esp-transport': { spi: 'SPI', sdio: 'SDIO' },
};

/**
 * The tab label the setup picks for each synced tab group it decides.
 * @param {Setup | null} setup
 * @returns {Record<string, string>}
 */
export function tabChoices(setup) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!setup) return out;
  for (const d of setup.devices) {
    const label = TAB_LABELS['second-interface'][/** @type {keyof typeof TAB_LABELS['second-interface']} */ (d.id)];
    if (label) out['second-interface'] = label;
    if (d.id === 'esp32-c5-devkitc-1' && d.mode) {
      out['esp-transport'] = TAB_LABELS['esp-transport'][/** @type {'spi' | 'sdio'} */ (d.mode)];
    }
  }
  return out;
}

/** @param {Storage} storage @param {Setup | null} setup */
function writeTabs(storage, setup) {
  const choices = tabChoices(setup);
  for (const key of Object.keys(TAB_LABELS)) {
    if (choices[key]) storage.setItem(TAB_PREFIX + key, choices[key]);
    else if (setup === null) storage.removeItem(TAB_PREFIX + key);
  }
}

/**
 * @param {Storage | undefined} storage
 * @param {Device[]} [catalog]
 * @returns {Setup | null}
 */
export function load(storage, catalog = DEVICES) {
  try {
    const text = storage?.getItem(SETUP_KEY);
    return text ? validate(JSON.parse(text), catalog) : null;
  } catch {
    return null; // blocked storage or unreadable JSON: no setup
  }
}

/**
 * Save a setup (checked first). Returns what was saved, or null when saving failed.
 * @param {Storage | undefined} storage
 * @param {Setup} setup
 * @param {Device[]} [catalog]
 * @returns {Setup | null}
 */
export function save(storage, setup, catalog = DEVICES) {
  const clean = validate(setup, catalog);
  if (!clean || !storage) return null;
  try {
    storage.setItem(SETUP_KEY, JSON.stringify(clean));
    writeTabs(storage, clean);
  } catch {
    return null;
  }
  announce();
  return clean;
}

/** @param {Storage | undefined} storage */
export function clear(storage) {
  try {
    storage?.removeItem(SETUP_KEY);
    if (storage) writeTabs(storage, null);
  } catch {
    // blocked storage: nothing was saved either
  }
  announce();
}

function announce() {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(SETUP_EVENT));
  }
}

/**
 * Call `onChange` with the current setup whenever it changes, in this tab or another.
 * Returns a function that stops listening.
 * @param {(setup: Setup | null) => void} onChange
 * @param {Storage} [storage]
 */
export function subscribe(onChange, storage) {
  if (typeof window === 'undefined') return () => {};
  const store = storage ?? safeLocalStorage();
  const same = () => onChange(load(store));
  const other = (/** @type {StorageEvent} */ e) => { if (e.key === SETUP_KEY || e.key === null) onChange(load(store)); };
  window.addEventListener(SETUP_EVENT, same);
  window.addEventListener('storage', other);
  return () => {
    window.removeEventListener(SETUP_EVENT, same);
    window.removeEventListener('storage', other);
  };
}

/** localStorage, or undefined where the browser blocks it. */
export function safeLocalStorage() {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
