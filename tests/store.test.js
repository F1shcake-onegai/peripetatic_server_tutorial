// Tests for the saved setup (src/data/setup/store.js). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SETUP_KEY, SETUP_EVENT, TAB_LABELS, emptySetup, validate, toSelection, keepPins, tabChoices,
  load, save, clear, subscribe, allocate,
} from '../src/data/setup/index.js';

const ESP = 'esp32-c5-devkitc-1';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}
const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
const setupWith = (fields) => ({ ...emptySetup(), ...fields });
const pinOf = (setup, device, signal) =>
  allocate(toSelection(setup)).assignments.find((a) => a.device === device && a.signal === signal)?.pin;

test('nothing saved: no setup', () => {
  assert.equal(load(new MemoryStorage()), null);
  assert.equal(load(undefined), null);
});

test('save and load give back the same setup', () => {
  const s = new MemoryStorage();
  const setup = setupWith({ board: 'rpi-zero-2-w', track: 'student', devices: [{ id: ESP, mode: 'sdio' }, { id: 'waveshare-tilt' }] });
  assert.deepEqual(save(s, setup), setup);
  assert.deepEqual(load(s), setup);
});

test('unreadable or blocked storage counts as no setup, never an error', () => {
  const s = new MemoryStorage();
  s.setItem(SETUP_KEY, '{not json');
  assert.equal(load(s), null);
  assert.equal(load(blocked), null);
  assert.equal(save(blocked, emptySetup()), null);
  assert.doesNotThrow(() => clear(blocked));
});

test('validate: wrong types and unknown versions are not used', () => {
  for (const raw of [null, 3, 'x', [], {}, { version: 0 }, { version: 2 }, { version: '1' }]) {
    assert.equal(validate(raw), null, JSON.stringify(raw));
  }
});

test('validate: unknown boards, tracks, devices and modes are cleaned up', () => {
  const v = validate({
    version: 1, board: 'rpi99', track: 'teacher',
    devices: [{ id: 'nope' }, { id: ESP, mode: 'usb' }, { id: ESP, mode: 'sdio' }, { id: 'waveshare-tilt', mode: 'x' }, 'junk'],
  });
  assert.deepEqual(v, setupWith({ devices: [{ id: ESP, mode: 'spi' }, { id: 'waveshare-tilt' }] }));
});

test('validate: only pins of movable signals of chosen devices, on usable GPIOs', () => {
  const v = validate({
    version: 1,
    devices: [{ id: ESP, mode: 'spi' }, { id: 'waveshare-tilt' }],
    moved: {
      [`${ESP}.handshake`]: 5, // ok
      [`${ESP}.cs`]: 7, // fixed signal
      [`${ESP}.dataready`]: 0, // reserved GPIO
      [`${ESP}.reset`]: 40, // not a GPIO
      'waveshare-tilt.dout': 2.5, // not a whole number
      'waveshare-hall.dout': 23, // device not chosen
      'waveshare-tilt.nope': 23, // no such signal
    },
    kept: { 'waveshare-tilt.dout': 23 },
  });
  assert.deepEqual(v.moved, { [`${ESP}.handshake`]: 5 });
  assert.deepEqual(v.kept, { 'waveshare-tilt.dout': 23 });
});

test('validate: SDIO has no movable pins, so their saved moves are dropped', () => {
  const v = validate({ version: 1, devices: [{ id: ESP, mode: 'sdio' }], moved: { [`${ESP}.handshake`]: 5 } });
  assert.deepEqual(v.moved, {});
});

test('kept pins: a module added later takes free pins, the wired one stays', () => {
  let setup = keepPins(setupWith({ devices: [{ id: 'waveshare-tilt' }] }));
  assert.deepEqual(setup.kept, { 'waveshare-tilt.dout': 5 });
  assert.equal(pinOf(setup, 'waveshare-tilt', 'dout'), 29);
  // Without kept pins, the Hall Sensor (earlier in the catalog) would take GPIO5
  setup = { ...setup, devices: [...setup.devices, { id: 'waveshare-hall' }] };
  assert.equal(pinOf(setup, 'waveshare-tilt', 'dout'), 29);
  assert.notEqual(pinOf(setup, 'waveshare-hall', 'dout'), 29);
  assert.equal(pinOf({ ...setup, kept: {} }, 'waveshare-hall', 'dout'), 29);
});

test('kept pins: a moved pin wins, and how is reported', () => {
  const setup = setupWith({
    devices: [{ id: ESP, mode: 'spi' }],
    kept: { [`${ESP}.handshake`]: 22, [`${ESP}.reset`]: 6 },
    moved: { [`${ESP}.handshake`]: 5 },
  });
  const r = allocate(toSelection(setup));
  const how = Object.fromEntries(r.assignments.filter((a) => a.type === 'gpio').map((a) => [a.signal, a.how]));
  assert.deepEqual(how, { cs: 'fixed', sclk: 'fixed', miso: 'fixed', mosi: 'fixed', handshake: 'moved', dataready: 'default', reset: 'kept' });
  assert.equal(r.assignments.find((a) => a.signal === 'handshake').pin, 29);
});

test('kept pins: something that would need a wired pin is greyed out instead of moving it', () => {
  const setup = keepPins(setupWith({ devices: [{ id: 'waveshare-tilt' }] }), undefined);
  // Tilt sits on GPIO5; the ESP32 over SPI fits around it, SDIO needs GPIO22-27 (free) and fits too
  const sel = toSelection(setup);
  const r = allocate({ ...sel, devices: [...sel.devices, { id: ESP, mode: 'sdio' }], kept: { 'waveshare-tilt.dout': 22 } });
  assert.equal(r.ok, false);
  assert.match(r.errors[0].message, /GPIO22/);
});

test('tab choices: the ESP32 and its interface, or the dongle', () => {
  assert.deepEqual(tabChoices(setupWith({ devices: [{ id: ESP, mode: 'sdio' }] })), {
    'second-interface': 'Using an ESP32 DevKit via GPIO', 'esp-transport': 'SDIO',
  });
  assert.deepEqual(tabChoices(setupWith({ devices: [{ id: 'wifi-dongle' }] })), { 'second-interface': 'Using a Plug-and-Play Wi-Fi Dongle' });
  assert.deepEqual(tabChoices(null), {});
});

test('saving writes Starlight\'s tab keys; clearing removes them', () => {
  const s = new MemoryStorage();
  save(s, setupWith({ devices: [{ id: ESP, mode: 'sdio' }] }));
  assert.equal(s.getItem('starlight-synced-tabs__second-interface'), 'Using an ESP32 DevKit via GPIO');
  assert.equal(s.getItem('starlight-synced-tabs__esp-transport'), 'SDIO');
  save(s, setupWith({ devices: [{ id: 'wifi-dongle' }] }));
  assert.equal(s.getItem('starlight-synced-tabs__second-interface'), 'Using a Plug-and-Play Wi-Fi Dongle');
  clear(s);
  assert.equal(s.getItem(SETUP_KEY), null);
  assert.equal(s.getItem('starlight-synced-tabs__second-interface'), null);
  assert.equal(s.getItem('starlight-synced-tabs__esp-transport'), null);
});

test('every tab label the setup writes exists in the pages, under the same sync key', () => {
  const pages = ['00-hardware', '04-second-interface'].map((p) => readFileSync(new URL(`../src/content/docs/guide/${p}.mdx`, import.meta.url), 'utf8')).join('\n');
  for (const [key, labels] of Object.entries(TAB_LABELS)) {
    assert.ok(pages.includes(`<Tabs syncKey="${key}">`), key);
    for (const label of Object.values(labels)) assert.ok(pages.includes(`<TabItem label="${label}">`), label);
  }
});

test('subscribe: hears saves in this tab and changes from other tabs', () => {
  const previous = globalThis.window;
  globalThis.window = new EventTarget();
  try {
    const s = new MemoryStorage();
    const seen = [];
    const stop = subscribe((setup) => seen.push(setup?.devices.map((d) => d.id) ?? null), s);
    save(s, setupWith({ devices: [{ id: 'waveshare-tilt' }] }));
    s.setItem(SETUP_KEY, JSON.stringify(setupWith({ devices: [{ id: 'waveshare-hall' }] }))); // as another tab would
    const other = new Event('storage');
    other.key = SETUP_KEY;
    window.dispatchEvent(other);
    clear(s);
    stop();
    save(s, emptySetup()); // not heard any more
    assert.deepEqual(seen, [['waveshare-tilt'], ['waveshare-hall'], null]);
    assert.equal(SETUP_EVENT, 'pst-setup-change');
  } finally {
    globalThis.window = previous;
  }
});
