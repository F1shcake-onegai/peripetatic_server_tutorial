// Tests for hiding by setup (src/data/setup/visibility.js). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { headScript, visibilityCss, checkCondition } from '../src/data/setup/visibility.js';
import { DEVICES } from '../src/data/setup/index.js';

/** Run the <head> script against a fake page with this localStorage content and page audience. */
function runHead(saved, audience = {}) {
  const items = new Map(saved === undefined ? [] : [['pst-setup', saved]]);
  const root = { dataset: {} };
  const meta = { getAttribute: () => JSON.stringify(audience) };
  const context = {
    localStorage: {
      getItem: (k) => (items.has(k) ? items.get(k) : null),
      setItem: (k, v) => items.set(k, String(v)),
    },
    document: { documentElement: root, querySelector: (q) => (q === 'meta[name="pst-audience"]' ? meta : null) },
    JSON, Array, Set,
  };
  vm.runInNewContext(headScript(), context);
  return { marks: root.dataset, items };
}

test('head script: no setup marks nothing', () => {
  assert.deepEqual(runHead(undefined).marks, {});
  assert.deepEqual(runHead('{broken').marks, {});
  assert.deepEqual(runHead(JSON.stringify({ version: 2, devices: [] })).marks, {});
});

test('head script: marks the setup and writes the tab choices', () => {
  const { marks, items } = runHead(JSON.stringify({
    version: 1, board: 'rpi-zero-2-w', track: 'student',
    devices: [{ id: 'esp32-c5-devkitc-1', mode: 'sdio' }, { id: 'waveshare-tilt' }],
  }));
  assert.deepEqual({ ...marks }, {
    setup: '', board: 'rpi-zero-2-w', track: 'student',
    hw: 'esp32-c5-devkitc-1 waveshare-tilt', modes: 'esp32-c5-devkitc-1:sdio',
  });
  assert.equal(items.get('starlight-synced-tabs__second-interface'), 'Using an ESP32 DevKit via GPIO');
  assert.equal(items.get('starlight-synced-tabs__esp-transport'), 'SDIO');
});

test('head script: marks a page that is not part of the setup', () => {
  const student = JSON.stringify({ version: 1, track: 'student', devices: [{ id: 'wifi-dongle' }] });
  const noTrack = JSON.stringify({ version: 1, devices: [] });
  assert.equal(runHead(student, { track: 'server' }).marks.offSetup, '');
  assert.equal(runHead(student, { track: 'student' }).marks.offSetup, undefined);
  assert.equal(runHead(student, {}).marks.offSetup, undefined);
  assert.equal(runHead(noTrack, { track: 'server' }).marks.offSetup, undefined); // no track chosen: every page fits
  assert.equal(runHead(student, { hw: 'esp32-c5-devkitc-1' }).marks.offSetup, '');
  assert.equal(runHead(student, { hw: 'wifi-dongle' }).marks.offSetup, undefined);
  assert.equal(runHead(undefined, { track: 'server' }).marks.offSetup, undefined); // no setup: nothing marked
});

test('head script: an unknown track is left out', () => {
  assert.equal(runHead(JSON.stringify({ version: 1, track: 'teacher', devices: [] })).marks.track, undefined);
});

test('CSS: a rule for every device, mode, track and decided tab group', () => {
  const css = visibilityCss();
  for (const d of DEVICES) {
    assert.ok(css.includes(`html[data-setup]:not([data-hw~="${d.id}"]) [data-when-hw="${d.id}"]`), d.id);
    assert.ok(css.includes(`html[data-hw~="${d.id}"] [data-when-not-hw="${d.id}"]`), d.id);
  }
  assert.ok(css.includes('[data-when-mode="esp32-c5-devkitc-1:sdio"]'));
  assert.ok(css.includes('html[data-track]:not([data-track="server"]) [data-when-track="server"]'));
  assert.ok(css.includes('html[data-modes~="esp32-c5-devkitc-1:spi"] starlight-tabs[data-sync-key="esp-transport"]>.tablist-wrapper'));
  assert.ok(css.includes('html[data-hw~="wifi-dongle"] starlight-tabs[data-sync-key="second-interface"]>.tablist-wrapper'));
});

test('CSS: sidebar links and whole groups for the other track, and the off-setup note', () => {
  const css = visibilityCss();
  assert.ok(css.includes('html[data-track]:not([data-track="server"]) .sidebar-content li:has(> a[data-when-track="server"])'));
  assert.ok(css.includes('html[data-track]:not([data-track="student"]) .sidebar-content li:has(> details):not(:has(a:not([data-when-track="student"])))'));
  assert.ok(css.includes('.pst-off-setup{display:none}'));
  assert.ok(css.includes('html[data-off-setup] .pst-off-setup{display:block}'));
});

test('<Only> conditions: typos fail the build', () => {
  assert.doesNotThrow(() => checkCondition({ hw: 'wifi-dongle', mode: 'esp32-c5-devkitc-1:spi', track: 'server' }));
  assert.throws(() => checkCondition({ hw: 'wifi-dongel' }), /unknown device/);
  assert.throws(() => checkCondition({ notHw: 'nope' }), /unknown device/);
  assert.throws(() => checkCondition({ mode: 'esp32-c5-devkitc-1:usb' }), /unknown mode/);
  assert.throws(() => checkCondition({ track: 'teacher' }), /unknown track/);
});
