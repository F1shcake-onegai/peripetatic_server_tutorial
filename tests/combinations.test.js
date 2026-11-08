// Every setup the setup pages can reach with up to 3 peripherals: a board and track that fit
// (page 1), then hardware that availability() allows, in any interface that fits (page 2),
// and any supply the pins page offers for a power wire (page 3). Each one is checked against
// the planner's rules. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARDS, HEADER, DEVICES, allocate, availability, devicesFor, trackFits, signalsOf, moveOptions,
  wiringSteps, pinViews, toSelection, keepPins, moveSignal, supplyOptions, setPower,
} from '../src/data/setup/index.js';

const MAX_DEVICES = 3;
const byId = Object.fromEntries(DEVICES.map((d) => [d.id, d]));

/** All reachable setups, as [board, track, devices] */
function reachable() {
  const out = [];
  const seen = new Set();
  for (const board of Object.keys(BOARDS)) for (const track of /** @type {const} */ (['student', 'server'])) {
    if (!trackFits(track, board)) continue;
    const offered = devicesFor(track).filter((d) => !d.boards || d.boards.includes(board));
    const stack = [[]];
    while (stack.length) {
      const devices = stack.pop();
      const key = `${board} ${track} ${JSON.stringify([...devices].sort((a, b) => a.id.localeCompare(b.id)))}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const av = availability({ board, devices });
      out.push({ board, track, devices, av });
      // Another supply for a power wire (pins page)
      for (const d of devices) {
        if (d.power) continue;
        const def = signalsOf(byId[d.id], d.mode)?.find((x) => x.type === 'power')?.power;
        for (const power of supplyOptions({ board, devices }, d.id)) {
          if (power !== def) stack.push(devices.map((x) => (x.id === d.id ? { ...x, power } : x)));
        }
      }
      if (devices.length >= MAX_DEVICES) continue;
      for (const d of offered) {
        if (devices.some((x) => x.id === d.id) || !av[d.id]?.ok) continue;
        const modes = d.modes ? Object.keys(d.modes).filter((m) => av[d.id].modes?.[m]?.ok !== false) : [undefined];
        for (const m of modes) stack.push([...devices, m ? { id: d.id, mode: m } : { id: d.id }]);
      }
    }
  }
  return out;
}

const SETUPS = reachable();
const name = (/** @type {{board: string, track: string, devices: {id: string, mode?: string, power?: string}[]}} */ s) =>
  `${s.board} ${s.track} [${s.devices.map((d) => d.id + (d.mode ? `:${d.mode}` : '') + (d.power ? ` on ${d.power}` : '')).join(', ')}]`;
const signalOf = (devices, a) => signalsOf(byId[a.device], devices.find((d) => d.id === a.device)?.mode)?.find((s) => s.id === a.signal);

test('combinations: every reachable setup is valid', () => {
  assert.ok(SETUPS.length > 1000, `${SETUPS.length} setups`);
  assert.ok(SETUPS.some((s) => s.devices.some((d) => d.power)), 'a setup with a chosen supply');
  for (const s of SETUPS) {
    const r = allocate({ board: s.board, devices: s.devices });
    assert.ok(r.ok, `${name(s)}: ${r.errors.map((e) => e.message).join('; ')}`);
  }
});

test('combinations: each header pin has one job, on the right kind of pin', () => {
  for (const s of SETUPS) {
    const r = allocate({ board: s.board, devices: s.devices });
    /** @type {Map<number, string[]>} */
    const jobs = new Map();
    const add = (pin, job) => jobs.set(pin, [...(jobs.get(pin) ?? []), job]);
    for (const a of r.assignments) if (a.pin !== undefined && a.how !== 'header') add(a.pin, `${a.device}.${a.signal}`);
    for (const rail of r.breadboard.rails) { add(rail.supply, `${rail.rail} rail +`); if (rail.ground !== undefined) add(rail.ground, `${rail.rail} rail −`); }
    // A pin a plug covers without a wire of its own
    for (const plug of r.plugs) {
      for (const pin of plug.pins) if (!r.assignments.some((a) => a.device === plug.device && a.pin === pin)) add(pin, `${plug.device} plug`);
    }
    for (const [pin, j] of jobs) assert.equal(j.length, 1, `${name(s)}: pin ${pin} ${j.join(' + ')}`);
    const plugged = new Set(r.plugs.flatMap((x) => x.pins));
    for (const a of r.assignments) {
      const sig = signalOf(s.devices, a);
      if (a.type === 'power') {
        // The supply: a plug's own, the one chosen, the default, or the next one when plugs
        // take every pin of the default
        const chosen = s.devices.find((d) => d.id === a.device)?.power;
        const def = sig?.power ?? '3v3';
        const fallback = !chosen && a.supply !== def;
        assert.equal(a.supply, sig?.pin !== undefined ? def : chosen ?? a.supply, `${name(s)}: ${a.device} supply`);
        assert.ok((sig?.supplies ?? [def]).includes(/** @type {'3v3' | '5v'} */ (a.supply)), `${name(s)}: ${a.device} on ${a.supply}`);
        if (fallback) assert.ok(HEADER.filter((h) => h.kind === def).every((h) => plugged.has(h.pin)), `${name(s)}: ${a.device} left ${def}`);
      }
      if (a.how === 'header' || a.pin === undefined) continue;
      const h = HEADER[a.pin - 1];
      if (a.type === 'gpio') {
        assert.equal(h.kind, 'gpio', `${name(s)}: ${a.device}.${a.signal}`);
        assert.equal(h.gpio, a.gpio);
        assert.ok(!h.reserved, `${name(s)}: ${a.device}.${a.signal} on a reserved pin`);
        if (sig?.fixed !== undefined) assert.equal(a.gpio, sig.fixed, `${name(s)}: ${a.device}.${a.signal} fixed`);
      } else {
        assert.equal(h.kind, a.type === 'ground' ? 'gnd' : a.supply, `${name(s)}: ${a.device}.${a.signal}`);
        if (sig?.pin !== undefined) assert.equal(a.pin, sig.pin, `${name(s)}: ${a.device}.${a.signal} plug pin`);
      }
    }
  }
});

test('combinations: breadboard rule: required with the ESP32 or more than 2 modules on a supply; rails for 2 or more modules, and 3V3 for pull-ups', () => {
  for (const s of SETUPS) {
    const r = allocate({ board: s.board, devices: s.devices });
    const on = { '3v3': new Set(), '5v': new Set() };
    for (const a of r.assignments) if (a.type === 'power' && a.how !== 'header' && a.how !== 'plug') on[/** @type {'3v3' | '5v'} */ (a.supply)].add(a.device);
    const mounted = s.devices.filter((d) => byId[d.id].fit).map((d) => d.id);
    const pulled = s.devices.filter((d) => signalsOf(byId[d.id], d.mode)?.some((x) => x.pullUp)).map((d) => d.id);
    assert.deepEqual(pulled.filter((id) => !mounted.includes(id)), [], `${name(s)}: pull-ups off the breadboard`);
    const required = mounted.length > 0 || on['3v3'].size > 2 || on['5v'].size > 2;
    assert.equal(r.breadboard.required, required, name(s));
    assert.deepEqual(r.breadboard.mounted, mounted, name(s));
    const rails = required ? /** @type {const} */ (['3v3', '5v']).filter((x) => on[x].size >= 2 || (x === '3v3' && pulled.length)) : [];
    assert.deepEqual(r.breadboard.rails.map((x) => x.rail), rails, name(s));
    for (const rail of r.breadboard.rails) {
      assert.deepEqual(rail.pullUps, rail.rail === '3v3' ? pulled : [], name(s));
      assert.deepEqual(rail.devices, on[rail.rail].size >= 2 ? [...on[rail.rail]] : [], name(s));
      assert.equal(rail.ground !== undefined, rail.devices.length > 0, `${name(s)}: ${rail.rail} rail ground`);
    }
    // Every pulled-up wire is on a module that sits on the breadboard, next to a + rail with 3V3
    for (const a of r.assignments) if (a.pullUp) assert.ok(r.breadboard.rails.some((x) => x.rail === '3v3' && x.pullUps.includes(a.device)), `${name(s)}: ${a.device}.${a.signal}`);
    for (const a of r.assignments) {
      if ((a.type === 'power' || a.type === 'ground') && a.how !== 'header') assert.ok(a.pin !== undefined || a.rail, `${name(s)}: ${a.device}.${a.signal} unwired`);
    }
  }
});

test('combinations: wiring steps list every wire once; the map shows every pin', () => {
  for (const s of SETUPS) {
    const sel = { board: s.board, devices: s.devices };
    const r = allocate(sel);
    const steps = wiringSteps(sel, r);
    assert.equal(steps[0].kind, 'start');
    assert.equal(new Set(steps.map((x) => x.key)).size, steps.length, `${name(s)}: duplicate step`);
    const wires = r.assignments.filter((a) => a.how !== 'header' && a.how !== 'plug' && (a.pin !== undefined || a.rail));
    assert.equal(steps.filter((x) => x.kind === 'wire').length, wires.length, name(s));
    assert.equal(steps.filter((x) => x.kind === 'rail').length, r.breadboard.rails.reduce((n, x) => n + 1 + Number(x.ground !== undefined), 0), name(s));
    assert.equal(steps.filter((x) => x.kind === 'bridge').length, Number(r.breadboard.bridge), name(s));
    assert.deepEqual(steps.filter((x) => x.kind === 'fit').map((x) => x.device), r.breadboard.mounted, name(s));
    assert.deepEqual(steps.filter((x) => x.pullUp).map((x) => x.signal).sort(), r.assignments.filter((a) => a.pullUp).map((a) => a.signal).sort(), name(s));
    assert.deepEqual(steps.filter((x) => x.kind === 'plug').map((x) => [x.device, x.pins]), r.plugs.map((x) => [x.device, x.pins]), name(s));
    const views = pinViews(sel, r);
    for (const a of r.assignments) {
      if (a.pin !== undefined && a.how !== 'header') assert.ok(views[a.pin - 1].users.some((u) => u.device === a.device), `${name(s)}: ${a.device}.${a.signal}`);
    }
    for (const plug of r.plugs) for (const pin of plug.pins) assert.ok(views[pin - 1].users.some((u) => u.device === plug.device), `${name(s)}: plug pin ${pin}`);
  }
});

test('combinations: greyed-out hardware has a short reason, and really does not fit', () => {
  for (const s of SETUPS) {
    for (const [id, v] of Object.entries(s.av)) {
      if (s.devices.some((d) => d.id === id) || !devicesFor(s.track).includes(byId[id])) continue;
      if (!v.ok) assert.ok(v.reason && v.reason.length <= 60, `${name(s)}: ${id} "${v.reason}"`);
      const modes = byId[id].modes ? Object.keys(byId[id].modes) : [undefined];
      const fits = modes.some((m) => allocate({ board: s.board, devices: [...s.devices, m ? { id, mode: m } : { id }] }).ok);
      assert.equal(v.ok, fits, `${name(s)}: ${id}`);
    }
  }
});

test('combinations: switching a power wire\'s supply moves no GPIO', () => {
  let switched = 0;
  for (const s of SETUPS) {
    const setup = { version: 1, board: s.board, track: s.track, devices: s.devices, moved: {}, kept: {} };
    const r = allocate(toSelection(setup));
    for (const d of s.devices) {
      const current = r.assignments.find((a) => a.device === d.id && a.type === 'power')?.supply;
      for (const power of supplyOptions(toSelection(keepPins(setup)), d.id)) {
        if (power === current) continue;
        switched++;
        const r2 = allocate(toSelection(setPower(setup, d.id, power)));
        assert.ok(r2.ok, `${name(s)}: ${d.id} -> ${power}`);
        assert.equal(r2.assignments.find((a) => a.device === d.id && a.type === 'power')?.supply, power);
        const gpios = (/** @type {typeof r} */ x) => x.assignments.filter((a) => a.type === 'gpio').map((a) => `${a.device}.${a.signal}=${a.gpio}`).sort();
        assert.deepEqual(gpios(r2), gpios(r), `${name(s)}: ${d.id} -> ${power}`);
      }
    }
  }
  assert.ok(switched > 0);
});

test('combinations: moving a pin moves only that pin', () => {
  for (const s of SETUPS) {
    const setup = { version: 1, board: s.board, track: s.track, devices: s.devices, moved: {}, kept: {} };
    const r = allocate(toSelection(setup));
    for (const a of r.assignments) {
      if (a.type !== 'gpio' || a.how === 'header' || signalOf(s.devices, a)?.fixed !== undefined) continue;
      const key = `${a.device}.${a.signal}`;
      for (const g of moveOptions(toSelection(keepPins(setup)), key)) {
        if (g === a.gpio) continue;
        const r2 = allocate(toSelection(moveSignal(setup, key, g)));
        assert.ok(r2.ok, `${name(s)}: ${key} -> GPIO${g}`);
        for (const x of r.assignments.filter((y) => y.type === 'gpio')) {
          const y = r2.assignments.find((z) => z.device === x.device && z.signal === x.signal);
          assert.equal(y?.gpio, `${x.device}.${x.signal}` === key ? g : x.gpio, `${name(s)}: ${key} -> GPIO${g}, ${x.device}.${x.signal}`);
        }
      }
    }
  }
});
