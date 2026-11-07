// @ts-check
// The wiring steps of chapter 0 for a saved setup, from the planner's result:
// 1. before you start (power off);
// 2. parts that aren't wired with jumper wires, in catalog order: boards on the header,
//    ribbon cables, USB devices;
// 3. the breadboard: required (then one step per rail wire), or optional when a module
//    takes power from the header;
// 4. each wired module in catalog order, one wire per step: power, ground, then data.
//    A USB cable (the ESP32's) comes after the module's wires.
import { DEVICES } from './devices.js';
import { signalsOf } from './allocate.js';

/** @typedef {import('./allocate.js').Result} Result */
/** @typedef {import('./allocate.js').Selection} Selection */

/**
 * @typedef {object} Step
 * @property {string} key   The same while the wiring is the same: a moved pin changes it
 * @property {'start' | 'part' | 'breadboard' | 'rail' | 'wire' | 'usb'} kind
 * @property {string} [device]
 * @property {'header' | 'pcie' | 'camera' | 'display' | 'usb'} [how]   part: how it connects
 * @property {string} [connector]   part/usb: the connector it uses, e.g. 'CAM/DISP 0'
 * @property {boolean} [required]   breadboard
 * @property {{supply: '3v3' | '5v', modules: number}[]} [over]   breadboard: supplies with
 *   more modules than the header has pins
 * @property {'3v3' | '5v'} [rail]   rail/wire: the breadboard rail pair
 * @property {'+' | '−'} [side]     rail/wire: the rail's supply (+) or ground (−) strip
 * @property {number} [pin]          rail/wire: the header pin
 * @property {number} [gpio]         wire
 * @property {string} [signal]       wire: signal id
 * @property {string} [label]        wire: e.g. 'Power', 'Handshake'
 * @property {string} [devicePin]    wire: the pin's name on the module, e.g. 'VCC', 'IO3'
 * @property {'gpio' | 'power' | 'ground'} [type]   wire
 * @property {number} [index]        wire: 1-based, among the module's wires
 * @property {number} [count]        wire: how many wires the module has
 */

const TYPE_ORDER = { power: 0, ground: 1, gpio: 2 };

/**
 * @param {Selection} selection
 * @param {Result} result
 * @param {import('./devices.js').Device[]} [catalog]
 * @returns {Step[]}
 */
export function wiringSteps(selection, result, catalog = DEVICES) {
  /** @type {Step[]} */
  const steps = [{ key: 'start', kind: 'start' }];
  const chosen = new Map(selection.devices.map((d) => [d.id, d]));
  const devices = catalog.filter((d) => chosen.has(d.id));
  const connectorsOf = (/** @type {string} */ id) => result.connectors.filter((c) => c.device === id);
  const wiresOf = (/** @type {string} */ id) => result.assignments.filter((a) => a.device === id && a.how !== 'header' && (a.pin !== undefined || a.rail));
  const wired = devices.filter((d) => wiresOf(d.id).length > 0);

  // Parts without jumper wires
  for (const d of devices) {
    if (wired.includes(d)) continue;
    const conn = connectorsOf(d.id);
    if (d.header?.covers) steps.push({ key: `part:${d.id}`, kind: 'part', device: d.id, how: 'header', ...(conn[0] ? { connector: conn[0].name } : {}) });
    else if (conn[0]) steps.push({ key: `part:${d.id}:${conn[0].name}`, kind: 'part', device: d.id, how: conn[0].kind, connector: conn[0].name });
  }

  // Breadboard
  const powered = result.assignments.filter((a) => a.type === 'power' && a.how !== 'header' && (a.pin !== undefined || a.rail));
  if (result.breadboard.required) {
    /** @type {Record<'3v3' | '5v', Set<string>>} */
    const per = { '3v3': new Set(), '5v': new Set() };
    for (const a of powered) {
      const supply = a.rail ?? (a.pin !== undefined ? supplyOfPin(selection, a, catalog) : undefined);
      if (supply) per[supply].add(a.device);
    }
    const over = /** @type {const} */ (['3v3', '5v']).filter((s) => per[s].size > 2).map((s) => ({ supply: s, modules: per[s].size }));
    steps.push({ key: 'breadboard', kind: 'breadboard', required: true, over });
    for (const r of result.breadboard.rails) {
      steps.push({ key: `rail:${r.rail}+:${r.supply}`, kind: 'rail', rail: r.rail, side: '+', pin: r.supply });
      steps.push({ key: `rail:${r.rail}−:${r.ground}`, kind: 'rail', rail: r.rail, side: '−', pin: r.ground });
    }
  } else if (powered.length) {
    steps.push({ key: 'breadboard', kind: 'breadboard', required: false });
  }

  // Wired modules, one wire per step
  for (const d of wired) {
    const order = (signalsOf(d, chosen.get(d.id)?.mode) ?? []).map((s) => s.id);
    const wires = [...wiresOf(d.id)].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || order.indexOf(a.signal) - order.indexOf(b.signal));
    wires.forEach((a, i) => {
      const side = a.rail ? (a.type === 'power' ? '+' : '−') : undefined;
      const where = a.rail ? `${a.rail}${side}` : String(a.pin);
      steps.push({
        key: `wire:${d.id}.${a.signal}:${where}`, kind: 'wire', device: d.id, signal: a.signal, label: a.label, devicePin: a.devicePin, type: a.type,
        ...(a.rail ? { rail: a.rail, side } : { pin: a.pin }),
        ...(a.gpio !== undefined ? { gpio: a.gpio } : {}),
        index: i + 1, count: wires.length,
      });
    });
    for (const c of connectorsOf(d.id).filter((x) => x.kind === 'usb')) {
      steps.push({ key: `usb:${d.id}`, kind: 'usb', device: d.id, connector: c.name });
    }
  }
  return steps;
}

/** The supply of a power wire on a header pin @param {Selection} selection @param {import('./allocate.js').Assignment} a @param {import('./devices.js').Device[]} catalog */
function supplyOfPin(selection, a, catalog) {
  const dev = catalog.find((d) => d.id === a.device);
  const mode = selection.devices.find((d) => d.id === a.device)?.mode;
  const s = dev ? (signalsOf(dev, mode) ?? []).find((x) => x.id === a.signal) : undefined;
  return s?.power ?? '3v3';
}
