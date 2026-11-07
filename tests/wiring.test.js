// Tests for the wiring steps of chapter 0 (src/data/setup/wiring.js). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, wiringSteps, DEVICES } from '../src/data/setup/index.js';

const ESP = 'esp32-c5-devkitc-1';
const PIR = 'adafruit-mini-pir-4871';
const stepsFor = (devices, extra = {}) => {
  const selection = { board: 'rpi5', devices, ...extra };
  return wiringSteps(selection, allocate(selection));
};
const kinds = (steps) => steps.map((s) => s.kind);

test('wiring: starts with power off; nothing else without hardware', () => {
  assert.deepEqual(kinds(stepsFor([])), ['start']);
});

test('wiring: ESP32 over SPI: ground, then data wires in signal order, then its USB cable', () => {
  const steps = stepsFor([{ id: ESP, mode: 'spi' }]);
  assert.deepEqual(kinds(steps), ['start', ...Array(8).fill('wire'), 'usb']);
  const wires = steps.filter((s) => s.kind === 'wire');
  assert.deepEqual(wires.map((s) => [s.signal, s.devicePin, s.pin]), [
    ['gnd', 'GND', 25], ['cs', 'IO10', 24], ['sclk', 'IO6', 23], ['miso', 'IO2', 21], ['mosi', 'IO7', 19],
    ['handshake', 'IO3', 15], ['dataready', 'IO4', 13], ['reset', 'RST', 31],
  ]);
  assert.deepEqual(wires.map((s) => s.index), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(wires.every((s) => s.count === 8));
});

test('wiring: parts without jumper wires come first, in catalog order', () => {
  const steps = stepsFor([{ id: 'freenove-5in-dsi' }, { id: 'rpi-camera-module-3' }, { id: 'wifi-dongle' }]);
  assert.deepEqual(steps.map((s) => [s.kind, s.device, s.how, s.connector]), [
    ['start', undefined, undefined, undefined],
    ['part', 'wifi-dongle', 'usb', 'USB 1'],
    ['part', 'rpi-camera-module-3', 'camera', 'CAM/DISP 1'],
    ['part', 'freenove-5in-dsi', 'display', 'CAM/DISP 0'],
  ]);
  const hat = stepsFor([{ id: 'ai-hat-plus-2' }]);
  assert.deepEqual(hat.map((s) => [s.kind, s.how]), [['start', undefined], ['part', 'header']]);
});

test('wiring: optional breadboard step when a module takes power from the header', () => {
  const steps = stepsFor([{ id: 'waveshare-hall' }]);
  assert.deepEqual(kinds(steps), ['start', 'breadboard', 'wire', 'wire', 'wire']);
  assert.equal(steps[1].required, false);
  const given = allocate({ board: 'rpi5', devices: [{ id: 'waveshare-hall' }] }).assignments;
  const pinOf = (signal) => given.find((a) => a.signal === signal).pin;
  assert.deepEqual(steps.slice(2).map((s) => [s.type, s.pin]), [['power', pinOf('vcc')], ['ground', pinOf('gnd')], ['gpio', pinOf('dout')]]);
  // The ESP32 is powered over USB: no breadboard step
  assert.ok(!kinds(stepsFor([{ id: ESP, mode: 'spi' }])).includes('breadboard'));
});

test('wiring: required breadboard: rail wires first, then modules on the rail; a lone 5V module goes straight to the header', () => {
  const ids = ['waveshare-tilt', 'waveshare-laser', 'waveshare-hall', PIR];
  const steps = stepsFor(ids.map((id) => ({ id })));
  const board = steps.find((s) => s.kind === 'breadboard');
  assert.equal(board.required, true);
  assert.deepEqual(board.over, [{ supply: '3v3', modules: 3 }]);
  const rails = steps.filter((s) => s.kind === 'rail');
  assert.deepEqual(rails.map((s) => [s.rail, s.side]), [['3v3', '+'], ['3v3', '−']]);
  assert.ok(steps.indexOf(rails[1]) < steps.findIndex((s) => s.kind === 'wire'));
  const hall = steps.filter((s) => s.device === 'waveshare-hall');
  assert.deepEqual(hall.map((s) => [s.type, s.rail, s.side]), [['power', '3v3', '+'], ['ground', '3v3', '−'], ['gpio', undefined, undefined]]);
  const pir = steps.filter((s) => s.device === PIR);
  assert.ok([2, 4].includes(pir[0].pin));
  assert.equal(pir[0].rail, undefined);
  // Modules in catalog order
  const order = [...new Set(steps.filter((s) => s.kind === 'wire').map((s) => s.device))];
  assert.deepEqual(order, [...order].sort((a, b) => DEVICES.findIndex((d) => d.id === a) - DEVICES.findIndex((d) => d.id === b)));
});

test('wiring: a moved pin changes only that wire\'s key', () => {
  const before = stepsFor([{ id: ESP, mode: 'spi' }]);
  const after = stepsFor([{ id: ESP, mode: 'spi' }], { moved: { [`${ESP}.handshake`]: 5 } });
  const changed = before.filter((s, i) => s.key !== after[i].key).map((s) => s.signal);
  assert.deepEqual(changed, ['handshake']);
});
