// Tests for the setup page's header picture (src/data/setup/picture.js) and moving a pin by
// hand (moveSignal in src/data/setup/editor.js). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, pinViews, moveSignal, moveOptions, toSelection, emptySetup } from '../src/data/setup/index.js';

const ESP = 'esp32-c5-devkitc-1';
/** @param {{id: string, mode?: string}[]} devices */
const setupWith = (devices) => ({ ...emptySetup(), devices });
/** @param {ReturnType<typeof setupWith>} setup */
const viewsOf = (setup) => {
  const selection = toSelection(setup);
  return pinViews(selection, allocate(selection));
};

test('40 pins with names; free pins have no badge', () => {
  const views = viewsOf(setupWith([]));
  assert.equal(views.length, 40);
  assert.deepEqual(views.slice(0, 6).map((v) => v.name), ['3V3 power', '5V power', 'GPIO2', '5V power', 'GPIO3', 'Ground']);
  assert.ok(views.every((v) => v.badge === '' && !v.users.length));
  assert.deepEqual(views.filter((v) => v.reserved).map((v) => v.pin), [27, 28]);
});

test('a module\'s pins show its short name, never the full name', () => {
  const views = viewsOf(setupWith([{ id: 'ublox-neo-6m-gps' }]));
  const tx = views.find((v) => v.gpio === 15);
  assert.equal(tx?.badge, 'GPS Module · GPS TX (to Pi RXD)');
  assert.ok(views.every((v) => !v.badge.includes('u-blox')));
  assert.equal(tx?.users[0].movable, false, 'fixed UART pins');
});

test('breadboard rails: one badge per rail pin instead of a badge per module', () => {
  const sensors = ['waveshare-hall', 'waveshare-laser', 'waveshare-tilt'];
  const setup = setupWith(sensors.map((id) => ({ id })));
  const result = allocate(toSelection(setup));
  assert.ok(result.breadboard.required);
  const views = pinViews(toSelection(setup), result);
  const rail = result.breadboard.rails[0];
  assert.equal(views[rail.supply - 1].badge, 'Breadboard 3V3 rail (+) · 3 modules');
  assert.equal(views[rail.ground - 1].badge, 'Breadboard 3V3 rail (−) · 3 modules');
  assert.deepEqual(views[rail.supply - 1].rail, { rail: '3v3', side: '+', devices: rail.devices });
  // No module badge on any power or ground pin
  assert.ok(views.filter((v) => v.kind !== 'gpio').every((v) => !v.users.length));
});

test('without a breadboard, each module has its own power pin', () => {
  const views = viewsOf(setupWith([{ id: 'waveshare-hall' }, { id: 'waveshare-tilt' }]));
  const power = views.filter((v) => v.kind === '3v3' && v.users.length);
  assert.equal(power.length, 2);
  assert.ok(power.every((v) => v.users.length === 1 && !v.rail));
});

test('a board on the header: its pins through the header, the rest covered', () => {
  const views = viewsOf(setupWith([{ id: 'waveshare-2in13-touch-epaper-hat' }]));
  const busy = views.find((v) => v.gpio === 24);
  assert.equal(busy?.users[0].how, 'header');
  assert.equal(busy?.users[0].short, 'e-Paper HAT');
  assert.equal(busy?.coveredBy, undefined);
  assert.equal(views[0].coveredBy, 'waveshare-2in13-touch-epaper-hat');
});

test('movable signals are marked; fixed ones are not', () => {
  const views = viewsOf(setupWith([{ id: ESP, mode: 'spi' }]));
  const byGpio = (/** @type {number} */ g) => views.find((v) => v.gpio === g)?.users[0];
  assert.equal(byGpio(22)?.movable, true, 'handshake');
  assert.equal(byGpio(10)?.movable, false, 'MOSI');
});

test('moving a pin by hand leaves every other module where it was', () => {
  const setup = setupWith([{ id: 'waveshare-color' }, { id: 'waveshare-hall' }, { id: 'waveshare-tilt' }]);
  const before = allocate(toSelection(setup)).assignments.filter((a) => a.type === 'gpio');
  const hall = before.find((a) => a.device === 'waveshare-hall');
  const options = moveOptions(toSelection(setup), 'waveshare-hall.dout').filter((g) => g !== hall?.gpio);
  assert.ok(options.length > 0);
  for (const gpio of options) {
    const moved = moveSignal(setup, 'waveshare-hall.dout', gpio);
    assert.equal(moved.moved['waveshare-hall.dout'], gpio);
    const after = allocate(toSelection(moved));
    assert.ok(after.ok);
    for (const a of before) {
      if (a.device === 'waveshare-hall') continue;
      const now = after.assignments.find((x) => x.device === a.device && x.signal === a.signal);
      assert.equal(now?.gpio, a.gpio, `${a.device}.${a.signal} after moving to GPIO${gpio}`);
    }
  }
});

test('back to automatic: the moved pin is forgotten, the others stay', () => {
  const setup = setupWith([{ id: 'waveshare-hall' }, { id: 'waveshare-tilt' }]);
  const moved = moveSignal(setup, 'waveshare-hall.dout', 13);
  const auto = moveSignal(moved, 'waveshare-hall.dout', undefined);
  assert.equal(auto.moved['waveshare-hall.dout'], undefined);
  assert.equal(auto.kept['waveshare-hall.dout'], undefined);
  assert.equal(auto.kept['waveshare-tilt.dout'], moved.kept['waveshare-tilt.dout']);
});
