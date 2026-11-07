// Tests for the GPIO planner data and logic (src/data/setup). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEADER, BOARDS, GPIO_PREFERENCE, GPIO_TIERS, pinOfGpio, pinDistance, DEVICES, allocate, availability, moveOptions, signalsOf, HAT_REASON,
} from '../src/data/setup/index.js';

const ESP = 'esp32-c5-devkitc-1';
const pinsOf = (result, device) =>
  Object.fromEntries(result.assignments.filter((a) => a.device === device).map((a) => [a.signal, a.pin]));

// --- Header ----------------------------------------------------------------------

test('header: 40 pins, numbered 1-40', () => {
  assert.deepEqual(HEADER.map((h) => h.pin), Array.from({ length: 40 }, (_, i) => i + 1));
});

test('header: GPIO 0-27 each once, power and ground pins', () => {
  const gpios = HEADER.filter((h) => h.kind === 'gpio').map((h) => h.gpio).sort((a, b) => a - b);
  assert.deepEqual(gpios, Array.from({ length: 28 }, (_, i) => i));
  const of = (kind) => HEADER.filter((h) => h.kind === kind).map((h) => h.pin);
  assert.deepEqual(of('3v3'), [1, 17]);
  assert.deepEqual(of('5v'), [2, 4]);
  assert.deepEqual(of('gnd'), [6, 9, 14, 20, 25, 30, 34, 39]);
  assert.deepEqual(HEADER.filter((h) => h.reserved).map((h) => h.gpio), [0, 1]);
});

test('header: pins used in the tutorial', () => {
  for (const [gpio, pin] of [[8, 24], [11, 23], [9, 21], [10, 19], [22, 15], [27, 13], [6, 31], [5, 29],
    [23, 16], [24, 18], [25, 22], [26, 37], [2, 3], [3, 5], [17, 11]]) {
    assert.equal(pinOfGpio(gpio), pin, `GPIO${gpio}`);
  }
});

test('header: preference order lists every usable GPIO once', () => {
  assert.deepEqual([...GPIO_PREFERENCE].sort((a, b) => a - b), Array.from({ length: 26 }, (_, i) => i + 2));
});

test('header: distance between pins follows the two-row layout', () => {
  assert.equal(pinDistance(15, 16), 1);
  assert.equal(pinDistance(15, 19), 2);
  assert.equal(pinDistance(1, 40), 20);
});

test('boards: Pi 5 and Pi Zero 2 W share the header', () => {
  assert.equal(BOARDS.rpi5.header, BOARDS['rpi-zero-2-w'].header);
});

// --- Catalog ---------------------------------------------------------------------

test('catalog: ids unique, sources given, signal ids unique per device and mode', () => {
  assert.equal(new Set(DEVICES.map((d) => d.id)).size, DEVICES.length);
  for (const d of DEVICES) {
    assert.ok(d.sources.length, `${d.id} has sources`);
    for (const signals of d.modes ? Object.values(d.modes).map((m) => m.signals) : [d.signals]) {
      assert.equal(new Set(signals.map((s) => s.id)).size, signals.length, `${d.id} signal ids`);
    }
  }
});

test('catalog: fixed and default GPIOs are usable header GPIOs', () => {
  const usable = new Set(HEADER.filter((h) => h.kind === 'gpio' && !h.reserved).map((h) => h.gpio));
  for (const d of DEVICES) {
    for (const signals of d.modes ? Object.values(d.modes).map((m) => m.signals) : [d.signals]) {
      for (const s of signals) {
        for (const g of [s.fixed, s.default].filter((x) => x !== undefined)) {
          assert.ok(usable.has(g), `${d.id}.${s.id} GPIO${g}`);
        }
      }
    }
  }
});

test('catalog: every ESP32 pin used for wiring is on the DevKit headers, in every board revision', () => {
  const esp = DEVICES.find((d) => d.id === ESP);
  assert.deepEqual(Object.keys(esp.pinouts), ['v1.1', 'v1.2 or later']);
  for (const [rev, pinout] of Object.entries(esp.pinouts)) {
    assert.equal(pinout.length, 32, rev);
    const names = new Set(pinout.map((p) => p.name));
    for (const mode of Object.values(esp.modes)) {
      for (const s of mode.signals) assert.ok(names.has(s.devicePin), `${rev} ${s.devicePin}`);
    }
  }
});

test('catalog: ESP32 revisions differ only in pin order', () => {
  const esp = DEVICES.find((d) => d.id === ESP);
  const gpios = (rev) => esp.pinouts[rev].map((p) => p.gpio).filter((g) => g !== undefined).sort((a, b) => a - b);
  assert.deepEqual(gpios('v1.1'), gpios('v1.2 or later'));
  const where = (rev, name) => esp.pinouts[rev].filter((p) => p.name === name).map((p) => `${p.header}-${p.no}`);
  assert.deepEqual(where('v1.1', 'IO10'), ['J3-7']);
  assert.deepEqual(where('v1.2 or later', 'IO10'), ['J1-11']);
});

const PACK = DEVICES.filter((d) => d.id.startsWith('waveshare-') && d.category === 'sensor');
const PACK_DIGITAL = PACK.filter((d) => d.signals.some((s) => s.type === 'gpio')).map((d) => d.id);

test('catalog: the 10 Sensors Pack modules with a digital output (analog-only ones left out)', () => {
  assert.equal(PACK.length, 10);
  assert.equal(PACK_DIGITAL.length, 10);
  for (const id of ['waveshare-moisture', 'waveshare-uv', 'waveshare-liquid-level']) {
    assert.ok(!DEVICES.some((d) => d.id === id), id);
  }
});

test('catalog: every device belongs to a track', () => {
  for (const d of DEVICES) assert.ok(d.tracks.length && d.tracks.every((t) => ['student', 'server'].includes(t)), d.id);
});

// --- ESP32 wiring matches the tutorial -------------------------------------------

test('ESP32 over SPI: default pins are the tutorial wiring table', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }] });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual(pinsOf(r, ESP), { cs: 24, sclk: 23, miso: 21, mosi: 19, handshake: 15, dataready: 13, reset: 31, gnd: 25 });
});

test('ESP32 over SDIO: fixed pins are the tutorial wiring table', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: ESP, mode: 'sdio' }] });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual(pinsOf(r, ESP), { dat3: 13, clk: 15, cmd: 16, dat0: 18, dat1: 22, dat2: 37, reset: 31, gnd: 39 });
});

test('ESP32 without a mode uses its first mode (SPI)', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: ESP }] });
  assert.equal(pinsOf(r, ESP).handshake, 15);
});

// --- Moving pins -----------------------------------------------------------------

test('moving Handshake to GPIO5 puts it on pin 29', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }], moved: { [`${ESP}.handshake`]: 5 } });
  assert.ok(r.ok);
  const hs = r.assignments.find((a) => a.signal === 'handshake');
  assert.deepEqual([hs.gpio, hs.pin, hs.how], [5, 29, 'moved']);
});

test('moving a control pin onto SPI0, a reserved GPIO, a moved pin or off the header fails', () => {
  const sel = (gpio) => ({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }], moved: { [`${ESP}.handshake`]: gpio } });
  assert.equal(allocate(sel(9)).errors[0].message, "ESP32-C5 Handshake: can't use GPIO9");
  assert.equal(allocate(sel(0)).errors[0].message, 'ESP32-C5 Handshake: GPIO0 is reserved');
  assert.equal(allocate(sel(40)).errors[0].message, 'ESP32-C5 Handshake: GPIO40 is not on the header');
  assert.equal(allocate(sel(9)).errors[0].reason, 'Not enough GPIO pins for SPI');
  const both = allocate({
    board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }],
    moved: { [`${ESP}.handshake`]: 5, [`${ESP}.dataready`]: 5 },
  });
  assert.equal(both.errors[0].message, 'ESP32-C5 Data Ready: GPIO5 is used by ESP32-C5 Handshake');
});

test('a moved pin wins over a default: the default signal moves on, with a warning', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }], moved: { [`${ESP}.handshake`]: 27 } });
  assert.ok(r.ok);
  assert.deepEqual([pinsOf(r, ESP).handshake, pinsOf(r, ESP).dataready], [13, 29]);
  assert.equal(r.warnings[0].reason, 'Data Ready is on GPIO5 because GPIO27 is in use');
});

test('two control pins can swap', () => {
  const r = allocate({
    board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }],
    moved: { [`${ESP}.handshake`]: 27, [`${ESP}.dataready`]: 22 },
  });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(pinsOf(r, ESP).handshake, 13);
});

test('move options: free GPIOs outside SPI0; none for fixed signals', () => {
  const sel = { board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }] };
  const options = moveOptions(sel, `${ESP}.handshake`);
  assert.ok(options.includes(5) && options.includes(22));
  for (const g of [0, 1, 6, 7, 8, 9, 10, 11, 27]) assert.ok(!options.includes(g), `GPIO${g}`);
  assert.deepEqual(moveOptions(sel, `${ESP}.cs`), []);
  assert.deepEqual(moveOptions({ board: 'rpi5', devices: [{ id: ESP, mode: 'sdio' }] }, `${ESP}.reset`), []);
});

// --- Automatic pins, power, ground -----------------------------------------------

test('a sensor gets the first free plain GPIO, with 3V3 and ground next to it', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: 'waveshare-tilt' }] });
  assert.ok(r.ok);
  assert.deepEqual(pinsOf(r, 'waveshare-tilt'), { vcc: 17, gnd: 30, dout: 29 });
});

const rowsOf = (pins) => pins.map((p) => Math.ceil(p / 2));
const PLAIN = new Set(GPIO_TIERS[0]);

test('a module\'s pins stay together: the Color Sensor uses plain GPIOs in the closest rows', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: 'waveshare-color' }] });
  assert.ok(r.ok);
  const gpio = r.assignments.filter((a) => a.type === 'gpio');
  assert.ok(gpio.every((a) => PLAIN.has(a.gpio)));
  const rows = rowsOf(gpio.map((a) => a.pin));
  assert.equal(Math.max(...rows) - Math.min(...rows), 8); // 6 of the 8 plain pins can't be closer
  assert.deepEqual(pinsOf(r, 'waveshare-color'), { vcc: 17, gnd: 14, out: 13, s0: 15, s1: 16, s2: 18, s3: 22, led: 29 });
});

test('a module next to the ESP32 groups in the free plain pins nearby', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }, { id: 'waveshare-rotation' }] });
  assert.deepEqual(pinsOf(r, 'waveshare-rotation'), { vcc: 17, gnd: 14, sia: 16, sib: 18, sw: 22 });
});

test('a module uses the next tier only when the plain pins run out, and no bus pins', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }, { id: 'waveshare-color' }] });
  assert.ok(r.ok);
  const gpios = r.assignments.filter((a) => a.device === 'waveshare-color' && a.type === 'gpio').map((a) => a.gpio);
  assert.ok(gpios.some((g) => !PLAIN.has(g)), 'only 5 plain pins are left for 6 signals');
  assert.ok(gpios.every((g) => PLAIN.has(g) || GPIO_TIERS[1].includes(g)), 'no UART, I2C or SPI0 pins');
});

test('with the ESP32 over SPI, sensors avoid its pins and its ground', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }, { id: 'waveshare-tilt' }, { id: 'waveshare-laser' }] });
  assert.ok(r.ok);
  const tilt = pinsOf(r, 'waveshare-tilt');
  const laser = pinsOf(r, 'waveshare-laser');
  assert.equal(laser.dout, 29); // GPIO5: the Laser Sensor comes first in the catalog
  assert.equal(tilt.dout, 16); // GPIO23
  assert.notEqual(tilt.gnd, 25);
  assert.notEqual(laser.gnd, tilt.gnd);
});

test('breadboard: up to 2 modules per supply get their own pins (optional breadboard)', () => {
  const r = allocate({ board: 'rpi5', devices: ['waveshare-tilt', 'waveshare-laser', 'adafruit-mini-pir-4871'].map((id) => ({ id })) });
  assert.equal(r.breadboard.required, false);
  assert.deepEqual(r.breadboard.rails, []);
  const power = r.assignments.filter((a) => a.type === 'power');
  assert.deepEqual(power.map((a) => [a.device, a.pin]), [
    ['adafruit-mini-pir-4871', 4], ['waveshare-laser', 17], ['waveshare-tilt', 1],
  ].sort((a, b) => DEVICES.findIndex((d) => d.id === a[0]) - DEVICES.findIndex((d) => d.id === b[0])));
  assert.ok(power.every((a) => !a.shared && !a.rail));
});

test('breadboard: a third module on 3V3 sends power and ground through a rail pair', () => {
  const ids = ['waveshare-tilt', 'waveshare-laser', 'waveshare-hall'];
  const r = allocate({ board: 'rpi5', devices: ids.map((id) => ({ id })) });
  assert.ok(r.ok);
  assert.equal(r.breadboard.required, true);
  const supplyGround = r.assignments.filter((a) => a.type === 'power' || a.type === 'ground');
  assert.ok(supplyGround.every((a) => a.rail === '3v3' && a.pin === undefined && a.how === 'breadboard'));
  assert.deepEqual(r.breadboard.rails.map((x) => [x.rail, x.supply, x.ground, [...x.devices].sort()]), [['3v3', 17, 30, [...ids].sort()]]);
});

test('breadboard: a 5V module gets its own rail pair when the breadboard is required', () => {
  const r = allocate({ board: 'rpi5', devices: ['waveshare-tilt', 'waveshare-laser', 'waveshare-hall', 'adafruit-mini-pir-4871'].map((id) => ({ id })) });
  assert.deepEqual(r.breadboard.rails.map((x) => [x.rail, x.devices]), [
    ['3v3', ['waveshare-hall', 'waveshare-laser', 'waveshare-tilt']], ['5v', ['adafruit-mini-pir-4871']],
  ]);
  assert.ok([2, 4].includes(r.breadboard.rails[1].supply));
  assert.notEqual(r.breadboard.rails[0].ground, r.breadboard.rails[1].ground);
});

test('breadboard: the ESP32 keeps its own ground wire; boards on the header do not count', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }, ...['waveshare-tilt', 'waveshare-laser', 'waveshare-hall'].map((id) => ({ id }))] });
  assert.equal(r.breadboard.required, true);
  assert.equal(pinsOf(r, ESP).gnd, 25);
  assert.ok(!r.breadboard.rails[0].devices.includes(ESP));
  const hat = allocate({ board: 'rpi5', devices: [{ id: 'waveshare-2in13-touch-epaper-hat' }] });
  assert.equal(hat.breadboard.required, false);
});

test('selection order does not change the result', () => {
  const ids = ['waveshare-color', ESP, 'waveshare-dht11', 'waveshare-rotation'];
  const a = allocate({ board: 'rpi5', devices: ids.map((id) => ({ id })) });
  const b = allocate({ board: 'rpi5', devices: [...ids].reverse().map((id) => ({ id })) });
  assert.deepEqual(a, b);
});

test('the whole Sensors Pack fits beside the ESP32 over SPI (24 of 26 GPIOs)', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }, ...PACK_DIGITAL.map((id) => ({ id }))] });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(new Set(r.assignments.filter((a) => a.type === 'gpio').map((a) => a.gpio)).size, 24);
});

// --- Greying out -----------------------------------------------------------------

const CATALOG_WITH = (...extra) => [...DEVICES, ...extra];
const needs = (id, n) => ({
  id, name: id, short: id, track: 'student', category: 'sensor', sources: ['test'],
  signals: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, label: `S${i}`, devicePin: `S${i}`, type: 'gpio' })),
});

test('a device that no longer fits is greyed out with the reason', () => {
  const sel = { board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }, ...PACK_DIGITAL.map((id) => ({ id }))] };
  const catalog = CATALOG_WITH(needs('two-pins', 2), needs('three-pins', 3));
  const av = availability(sel, catalog);
  assert.equal(av['two-pins'].ok, true);
  assert.deepEqual(av['three-pins'], { ok: false, reason: 'Not enough GPIO pins' });
});

test('SDIO takes GPIO 22-27: a module that needs GPIO22 is greyed out (with SPI, Handshake makes room)', () => {
  const fixed22 = { ...needs('needs-gpio22', 0), signals: [{ id: 'x', label: 'X', devicePin: 'X', type: 'gpio', fixed: 22 }] };
  const catalog = CATALOG_WITH(fixed22);
  assert.equal(availability({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }] }, catalog)['needs-gpio22'].ok, true);
  const av = availability({ board: 'rpi5', devices: [{ id: ESP, mode: 'sdio' }] }, catalog)['needs-gpio22'];
  assert.equal(av.reason, 'Not enough GPIO pins');
  // From the ESP32's side: SDIO doesn't fit next to a module on GPIO22
  const esp = availability({ board: 'rpi5', devices: [{ id: 'needs-gpio22' }] }, catalog)[ESP];
  assert.equal(esp.modes?.sdio.reason, 'Not enough GPIO pins for SDIO');
});

test('ESP32 modes are checked one by one', () => {
  const fixed22 = { ...needs('uses-gpio22', 0), signals: [{ id: 'x', label: 'X', devicePin: 'X', type: 'gpio', fixed: 22 }] };
  const av = availability({ board: 'rpi5', devices: [{ id: 'uses-gpio22' }] }, CATALOG_WITH(fixed22))[ESP];
  assert.equal(av.ok, true); // SPI still fits: Handshake moves off GPIO22
  assert.equal(av.modes.spi.ok, true);
  assert.equal(av.modes.sdio.ok, false);
});

test('AI HAT+ 2 needs a Raspberry Pi 5', () => {
  assert.equal(allocate({ board: 'rpi5', devices: [{ id: 'ai-hat-plus-2' }] }).ok, true);
  const r = allocate({ board: 'rpi-zero-2-w', devices: [{ id: 'ai-hat-plus-2' }] });
  assert.deepEqual(r.errors.map((e) => e.reason), ['Requires a PCIe connector on Raspberry Pi 5']);
  assert.equal(availability({ board: 'rpi-zero-2-w', devices: [] })['ai-hat-plus-2'].reason, 'Requires a PCIe connector on Raspberry Pi 5');
});

const usesHeader = (d) => Boolean(d.header) || (d.modes ? true : d.signals.some((s) => s.type !== 'analog'));

test('a board covering the header leaves nothing to wire; ribbon-cable devices still fit', () => {
  for (const hat of ['ai-hat-plus-2', 'waveshare-2in13-touch-epaper-hat', 'pimoroni-inky-impression-7in3']) {
    const av = availability({ board: 'rpi5', devices: [{ id: hat }] });
    for (const d of DEVICES.filter((x) => x.id !== hat)) {
      assert.equal(av[d.id].ok, !usesHeader(d), `${d.id} with ${hat}`);
    }
    const short = DEVICES.find((d) => d.id === hat)?.short;
    assert.equal(av[ESP].reason, `GPIO header is covered by ${short}`);
    assert.equal(av['waveshare-tilt'].reason, `GPIO header is covered by ${short}`);
  }
  // From the board's side: wired modules or another board are already on the header
  assert.equal(availability({ board: 'rpi5', devices: [{ id: 'waveshare-tilt' }] })['waveshare-2in13-touch-epaper-hat'].reason, HAT_REASON);
  assert.equal(availability({ board: 'rpi5', devices: [{ id: 'pimoroni-inky-impression-7in3' }] })['waveshare-2in13-touch-epaper-hat'].reason, HAT_REASON);
  assert.equal(availability({ board: 'rpi5', devices: [{ id: 'waveshare-2in13-touch-epaper-hat' }] })['pimoroni-inky-impression-7in3'].reason, HAT_REASON);
});

test('only one board without extension pins fits on the header', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: 'ai-hat-plus-2' }, { id: 'waveshare-2in13-touch-epaper-hat' }] });
  assert.equal(r.errors[0].message, 'e-Paper HAT: Requires installing on top of GPIO headers');
});

test('a board with extension pins (e.g. a battery HAT) stacks under one that covers the header', () => {
  const battery = { ...needs('battery-ext', 0), category: 'hat', header: { covers: true, passthrough: true }, signals: [] };
  const catalog = CATALOG_WITH(battery);
  assert.ok(allocate({ board: 'rpi5', devices: [{ id: 'battery-ext' }, { id: 'waveshare-2in13-touch-epaper-hat' }] }, catalog).ok);
  assert.ok(allocate({ board: 'rpi5', devices: [{ id: 'battery-ext' }, { id: 'waveshare-tilt' }] }, catalog).ok);
  const capped = { ...battery, id: 'battery-capped', header: { covers: true, passthrough: false } };
  assert.equal(availability({ board: 'rpi5', devices: [{ id: 'battery-capped' }] }, CATALOG_WITH(capped))['waveshare-tilt'].ok, false);
});

test('e-Paper HAT pins come through the header, not wires', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: 'waveshare-2in13-touch-epaper-hat' }] });
  assert.ok(r.ok);
  assert.ok(r.assignments.every((a) => a.how === 'header' && a.pin === undefined));
});

// --- Analog outputs --------------------------------------------------------------

test('an analog-only sensor needs an analog-to-digital converter', () => {
  const analogOnly = { ...needs('analog-only', 0), signals: [{ id: 'aout', label: 'Analog output', devicePin: 'AOUT', type: 'analog' }] };
  const av = availability({ board: 'rpi5', devices: [] }, CATALOG_WITH(analogOnly))['analog-only'];
  assert.equal(av.ok, false);
  assert.equal(av.reason, 'Raspberry Pi has no analog input');
});

test('a sensor with both outputs is wired by its digital output only', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: 'waveshare-sound' }] });
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(pinsOf(r, 'waveshare-sound')).sort(), ['dout', 'gnd', 'vcc']);
  assert.equal(r.warnings[0].reason, 'AOUT not connected: Raspberry Pi has no analog input');
});

test('signalsOf picks a mode', () => {
  const esp = DEVICES.find((d) => d.id === ESP);
  assert.equal(signalsOf(esp, 'sdio').find((s) => s.id === 'clk').fixed, 22);
  assert.equal(signalsOf(esp, 'nope'), undefined);
});

// --- Connectors other than the header ---------------------------------------------

test('Raspberry Pi 5: one PCIe connector, two camera/display connectors, four USB ports', () => {
  assert.equal(BOARDS.rpi5.pcie, 1);
  assert.deepEqual(BOARDS.rpi5.mipi.map((m) => [m.camera, m.display]), [[true, true], [true, true]]);
  assert.equal(BOARDS.rpi5.usb, 4);
  assert.equal(BOARDS['rpi-zero-2-w'].pcie, 0);
  assert.deepEqual(BOARDS['rpi-zero-2-w'].mipi.map((m) => [m.camera, m.display]), [[true, false]]);
  assert.equal(BOARDS['rpi-zero-2-w'].usb, 1);
});

test('AI HAT+ 2 takes the PCIe connector; the camera and the display take the two ribbon connectors', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: 'ai-hat-plus-2' }, { id: 'rpi-camera-module-3' }, { id: 'freenove-5in-dsi' }] });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.deepEqual(r.connectors.map((c) => [c.device, c.name]), [
    ['ai-hat-plus-2', 'PCIe'],
    ['freenove-5in-dsi', 'CAM/DISP 0'],
    ['rpi-camera-module-3', 'CAM/DISP 1'],
  ]);
});

test('a third camera or display does not fit on a Raspberry Pi 5', () => {
  const two = { ...needs('second-camera', 0), category: 'camera', uses: { camera: 1 } };
  const r = allocate({ board: 'rpi5', devices: [{ id: 'rpi-camera-module-3' }, { id: 'freenove-5in-dsi' }, { id: 'second-camera' }] }, CATALOG_WITH(two));
  assert.deepEqual(r.errors.map((e) => e.reason), ['Both CAM/DISP connectors are in use']);
});

test('Raspberry Pi Zero 2 W: a camera fits, a display does not', () => {
  assert.ok(allocate({ board: 'rpi-zero-2-w', devices: [{ id: 'rpi-camera-module-3' }] }).ok);
  const r = allocate({ board: 'rpi-zero-2-w', devices: [{ id: 'freenove-5in-dsi' }] });
  assert.deepEqual(r.errors.map((e) => e.reason), ['Requires a DISP connector on Raspberry Pi 5']);
  // The Zero 2 W's one connector, taken by a camera
  const two = { ...needs('second-camera', 0), category: 'camera', uses: { camera: 1 } };
  const z = allocate({ board: 'rpi-zero-2-w', devices: [{ id: 'rpi-camera-module-3' }, { id: 'second-camera' }] }, CATALOG_WITH(two));
  assert.deepEqual(z.errors.map((e) => e.reason), ['Camera connector is in use']);
});

test('Raspberry Pi Zero 2 W: the ESP32 takes its only USB port', () => {
  const usb = { ...needs('usb-thing', 0), uses: { usb: 1 } };
  const av = availability({ board: 'rpi-zero-2-w', devices: [{ id: ESP, mode: 'spi' }] }, CATALOG_WITH(usb));
  assert.equal(av['usb-thing'].reason, 'The only USB port is in use');
  assert.ok(availability({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }] }, CATALOG_WITH(usb))['usb-thing'].ok);
});

// --- New devices -------------------------------------------------------------------

test('Inky Impression 7.3": pins from Pimoroni\'s library', () => {
  const inky = DEVICES.find((d) => d.id === 'pimoroni-inky-impression-7in3');
  const fixedOf = Object.fromEntries(inky.signals.map((s) => [s.id, s.fixed]));
  assert.deepEqual(fixedOf, {
    mosi: 10, sclk: 11, cs: 8, dc: 22, reset: 27, busy: 17,
    'button-a': 5, 'button-b': 6, 'button-c': 16, 'button-d': 24, sda: 2, scl: 3,
  });
  assert.ok(allocate({ board: 'rpi-zero-2-w', devices: [{ id: inky.id }] }).ok);
});

test('mini PIR: powered from 5V (output stays 3.3 V), one GPIO', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: 'adafruit-mini-pir-4871' }] });
  assert.ok(r.ok);
  assert.deepEqual(pinsOf(r, 'adafruit-mini-pir-4871'), { vcc: 4, gnd: 30, o: 29 });
});

test('GPS: UART on GPIO14/15 (pins 8 and 10), powered from 3V3', () => {
  const r = allocate({ board: 'rpi-zero-2-w', devices: [{ id: 'ublox-neo-6m-gps' }] });
  assert.ok(r.ok);
  assert.deepEqual(pinsOf(r, 'ublox-neo-6m-gps'), { vcc: 1, gnd: 6, tx: 10, rx: 8 });
});

test('GPS and the ESP32 over SPI fit together', () => {
  assert.ok(allocate({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }, { id: 'ublox-neo-6m-gps' }] }).ok);
});

// --- Second network interface -----------------------------------------------------

test('Wi-Fi dongle: one USB port, no header pins', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: 'wifi-dongle' }] });
  assert.ok(r.ok);
  assert.deepEqual(r.assignments, []);
  assert.deepEqual(r.connectors.map((c) => c.name), ['USB 1']);
});

test('second network interface: the ESP32 or the Wi-Fi dongle, not both', () => {
  const r = allocate({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }, { id: 'wifi-dongle' }] });
  assert.deepEqual(r.errors.map((e) => e.reason), ['Only one second network interface is allowed']);
  assert.equal(availability({ board: 'rpi5', devices: [{ id: 'wifi-dongle' }] })[ESP].reason, 'Only one second network interface is allowed');
  assert.equal(availability({ board: 'rpi5', devices: [{ id: ESP, mode: 'spi' }] })['wifi-dongle'].reason, 'Only one second network interface is allowed');
});

test('Raspberry Pi Zero 2 W: the Wi-Fi dongle takes its only USB port; the ESP32 is greyed out for being a second interface', () => {
  const r = allocate({ board: 'rpi-zero-2-w', devices: [{ id: 'wifi-dongle' }] });
  assert.ok(r.ok);
  assert.deepEqual(r.connectors.map((c) => [c.device, c.name]), [['wifi-dongle', 'USB 1']]);
  assert.equal(availability({ board: 'rpi-zero-2-w', devices: [{ id: 'wifi-dongle' }] })[ESP].reason, 'Only one second network interface is allowed');
});
