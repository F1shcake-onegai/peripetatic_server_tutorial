// Tests for pin values in the pages (src/data/setup/pins.js). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACEHOLDER, defaultAssignment, formatPin } from '../src/data/setup/pins.js';

const ESP = 'esp32-c5-devkitc-1';
const value = (key, show) => formatPin(defaultAssignment(key), show);

test('defaults: the ESP32 over SPI as in the tutorial', () => {
  assert.deepEqual([value(`${ESP}.handshake`, 'pin'), value(`${ESP}.handshake`, 'gpio')], ['15', '22']);
  assert.deepEqual([value(`${ESP}.dataready`, 'pin'), value(`${ESP}.dataready`, 'gpio')], ['13', '27']);
  assert.deepEqual([value(`${ESP}.reset`, 'pin'), value(`${ESP}.reset`, 'gpio')], ['31', '6']);
});

test('defaults: a signal only SDIO has uses the SDIO mode', () => {
  assert.deepEqual([value(`${ESP}.clk`, 'pin'), value(`${ESP}.clk`, 'gpio')], ['15', '22']);
});

test('defaults: a sensor on its own', () => {
  assert.equal(value('waveshare-tilt.dout', 'pin'), '29');
});

test('typos fail the build', () => {
  assert.throws(() => defaultAssignment('nope.handshake'), /unknown device/);
  assert.throws(() => defaultAssignment(`${ESP}.handshak`), /unknown signal/);
  assert.throws(() => defaultAssignment('waveshare-sound.aout'), /no header pin/);
  assert.throws(() => formatPin({ pin: 1, gpio: 2 }, 'bcm'), /show must be/);
});

test('code placeholder syntax', () => {
  const m = PLACEHOLDER.exec('x=⟦esp32-c5-devkitc-1.reset:gpio⟧ y');
  assert.deepEqual([m[1], m[2], m.index], ['esp32-c5-devkitc-1.reset', 'gpio', 2]);
  assert.equal(PLACEHOLDER.exec('⟦esp32-c5-devkitc-1.reset:bcm⟧'), null);
});
