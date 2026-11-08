// Tests for the setup page's changes (src/data/setup/editor.js). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devicesFor, setBoard, setTrack, toggleDevice, setMode, movePin, setPower, resetPins } from '../src/data/setup/editor.js';
import { emptySetup, DEVICES } from '../src/data/setup/index.js';

const ESP = 'esp32-c5-devkitc-1';
const base = () => ({
  ...emptySetup(),
  devices: [{ id: ESP, mode: 'spi' }, { id: 'waveshare-tilt' }],
  moved: { [`${ESP}.handshake`]: 5 },
  kept: { 'waveshare-tilt.dout': 23, [`${ESP}.reset`]: 6 },
});

test('every device has a short name for the pins', () => {
  for (const d of DEVICES) assert.ok(d.short && d.short.length <= 24, d.id);
});

test('devices for a track; all without one', () => {
  assert.equal(devicesFor(null).length, DEVICES.length);
  assert.ok(devicesFor('server').every((d) => d.tracks.includes('server')));
  assert.ok(devicesFor('server').some((d) => d.id === 'rpi-camera-module-3'));
  assert.ok(!devicesFor('server').some((d) => d.id === ESP));
});

test('adding a device: first mode, once', () => {
  let s = toggleDevice(emptySetup(), ESP, true);
  assert.deepEqual(s.devices, [{ id: ESP, mode: 'spi' }]);
  assert.equal(toggleDevice(s, ESP, true), s);
  s = toggleDevice(s, 'waveshare-tilt', true);
  assert.deepEqual(s.devices.map((d) => d.id), [ESP, 'waveshare-tilt']);
  assert.equal(toggleDevice(s, 'nope', true), s);
});

test('removing a device drops its pins only', () => {
  const s = toggleDevice(base(), ESP, false);
  assert.deepEqual(s.devices, [{ id: 'waveshare-tilt' }]);
  assert.deepEqual(s.moved, {});
  assert.deepEqual(s.kept, { 'waveshare-tilt.dout': 23 });
});

test('changing the mode drops that device\'s pins', () => {
  const s = setMode(base(), ESP, 'sdio');
  assert.deepEqual(s.devices[0], { id: ESP, mode: 'sdio' });
  assert.deepEqual(s.moved, {});
  assert.deepEqual(s.kept, { 'waveshare-tilt.dout': 23 });
});

test('choosing a track removes hardware that is not for it', () => {
  const s = setTrack({ ...base(), devices: [...base().devices, { id: 'rpi-camera-module-3' }] }, 'server');
  assert.equal(s.track, 'server');
  assert.deepEqual(s.devices, [{ id: 'rpi-camera-module-3' }]);
  assert.deepEqual([s.moved, s.kept], [{}, {}]);
  assert.deepEqual(setTrack(base(), null).devices, base().devices);
});

test('moving a pin, and back to automatic', () => {
  let s = movePin(base(), 'waveshare-tilt.dout', 24);
  assert.equal(s.moved['waveshare-tilt.dout'], 24);
  assert.equal(s.kept['waveshare-tilt.dout'], undefined);
  s = movePin(s, 'waveshare-tilt.dout', undefined);
  assert.equal(s.moved['waveshare-tilt.dout'], undefined);
});

test('board and pin reset; the original setup is never changed', () => {
  const original = base();
  const copy = JSON.parse(JSON.stringify(original));
  assert.equal(setBoard(original, 'rpi-zero-2-w').board, 'rpi-zero-2-w');
  assert.deepEqual([resetPins(original).moved, resetPins(original).kept], [{}, {}]);
  setTrack(original, 'server');
  toggleDevice(original, ESP, false);
  setMode(original, ESP, 'sdio');
  movePin(original, 'waveshare-tilt.dout', 24);
  assert.deepEqual(original, copy);
});

test('switching the PIR to 3V3 keeps the other pins; its default or Reset pins goes back to automatic', () => {
  const PIR = 'adafruit-mini-pir-4871';
  const s = { ...emptySetup(), devices: [{ id: PIR }, { id: 'waveshare-tilt' }] };
  const on3 = setPower(s, PIR, '3v3');
  assert.deepEqual(on3.devices, [{ id: PIR, power: '3v3' }, { id: 'waveshare-tilt' }]);
  assert.deepEqual(Object.keys(on3.kept).sort(), [`${PIR}.o`, 'waveshare-tilt.dout']);
  assert.deepEqual(setPower(on3, PIR, '5v').devices, [{ id: PIR }, { id: 'waveshare-tilt' }]);
  assert.deepEqual(setPower(s, 'waveshare-tilt', '5v').devices, s.devices);
  assert.deepEqual(resetPins(on3).devices, [{ id: PIR }, { id: 'waveshare-tilt' }]);
  assert.deepEqual(s.devices, [{ id: PIR }, { id: 'waveshare-tilt' }]);
});
