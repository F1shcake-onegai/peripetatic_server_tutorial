// @ts-check
// Assigns Raspberry Pi header pins to the chosen hardware, and works out which hardware
// can still be added. The same selection always gives the same result.
//
// Order: fixed GPIOs, then GPIOs the viewer moved or kept from a saved setup, then
// defaults, then free GPIOs, kept
// close together for each device (plain pins first, see GPIO_TIERS); then the power and
// ground pins nearest each device's GPIOs. A board that covers the header without
// extension pins leaves no pins to wire anything else to. A plug on the header (the Touch
// Display 2's power cable) keeps its pins for itself.
import { BOARDS, GPIO_PREFERENCE, GPIO_TIERS, HEADER, pinDistance } from './header.js';
import { DEVICES } from './devices.js';

/** @typedef {import('./devices.js').Device} Device */
/** @typedef {import('./devices.js').Signal} Signal */

/**
 * @typedef {object} Selection
 * @property {string} board                     'rpi5' or 'rpi-zero-2-w'
 * @property {{id: string, mode?: string, power?: '3v3' | '5v'}[]} devices   `power`: the supply
 *   the viewer chose for the device's power wire (see Signal.supplies)
 * @property {Record<string, number>} [moved]   'deviceId.signalId' -> GPIO the viewer chose
 * @property {Record<string, number>} [kept]    'deviceId.signalId' -> GPIO given when the setup
 *   was saved, so a module added later never moves one that is already wired. `moved` wins.
 */

/**
 * @typedef {object} Assignment
 * @property {string} device     Device id
 * @property {string} signal     Signal id
 * @property {string} label
 * @property {string} devicePin
 * @property {'gpio' | 'power' | 'ground'} type
 * @property {number} [pin]      Physical header pin (not set for a board that sits on the header,
 *   or for power and ground taken from a breadboard rail)
 * @property {number} [gpio]
 * @property {'3v3' | '5v'} [rail]  Power or ground from this breadboard rail (pair) instead of a pin
 * @property {'3v3' | '5v'} [supply]  Power: the supply it takes
 * @property {number} [pullUp]   GPIO: ohms of its pull-up resistor to the breadboard's 3V3 rail (+)
 * @property {'fixed' | 'moved' | 'kept' | 'default' | 'auto' | 'header' | 'breadboard' | 'plug'} how
 *   plug: a wire of a plug on the header, on the pin the plug puts it
 * @property {boolean} [shared]  The pin is also used by another device
 */

/**
 * @typedef {object} Breadboard
 * @property {boolean} required  A module sits on it (the ESP32 DevKit), or more than 2 modules
 *   take 3V3, or more than 2 take 5V, from the header (there are 2 of each pin). Then the
 *   modules on a supply with 2 or more go through a breadboard rail pair; a module alone on
 *   its supply is wired straight to the header. Otherwise the breadboard is optional.
 * @property {{rail: '3v3' | '5v', supply: number, ground?: number, devices: string[], pullUps: string[], header?: string}[]} rails
 *   When required: for each rail pair, the header pins wired to it (supply, and ground when
 *   modules take power from it), the devices it powers, and the devices whose pull-up
 *   resistors go to its + strip. header: the pull-ups are all on this header of their
 *   device, so the rail is the one on that side.
 * @property {boolean} bridge   The pull-ups sit on both sides of their device: a jumper joins
 *   the two + rails, so both carry 3V3
 * @property {string[]} mounted   Devices that sit on the breadboard
 */

/**
 * @typedef {object} Problem
 * @property {string} [device]
 * @property {string} message   '<short name>: <reason>', for the pins page
 * @property {string} [reason]  Why the device can't be used, for its box
 * @property {'board' | 'oneOf' | 'connector' | 'covered' | 'twoHats' | 'pins' | 'other'} [code]
 */

/** Reason shown on a board that sits on the header when the header is already in use */
export const HAT_REASON = 'Requires installing on top of GPIO headers';

/**
 * "Not enough GPIO pins for SPI", or without a protocol for plain digital pins.
 * @param {Device} dev @param {string} [mode]
 */
export function notEnoughPins(dev, mode) {
  const protocol = dev.modes?.[mode ?? Object.keys(dev.modes)[0]]?.protocol ?? dev.protocol;
  return protocol ? `Not enough GPIO pins for ${protocol}` : 'Not enough GPIO pins';
}

/** Names of the boards that have something, e.g. 'Raspberry Pi 5' @param {(b: import('./header.js').Board) => boolean} has */
const boardsWith = (has) => Object.values(BOARDS).filter(has).map((b) => b.name).join(' or ');

/**
 * @typedef {object} Connector   A non-header connector given to a device
 * @property {string} device
 * @property {'pcie' | 'usb' | 'camera' | 'display'} kind
 * @property {string} name       e.g. 'PCIe', 'USB 1', 'CAM/DISP 0', 'Camera'
 */

/**
 * @typedef {object} Result
 * @property {boolean} ok
 * @property {Assignment[]} assignments
 * @property {Connector[]} connectors
 * @property {Breadboard} breadboard
 * @property {{device: string, pins: number[]}[]} plugs   Plugs on the header and the pins they cover
 * @property {Problem[]} errors
 * @property {Problem[]} warnings
 */

const GPIO_PINS = HEADER.filter((h) => h.kind === 'gpio');
const SUPPLY_NAMES = { '3v3': '3V3', '5v': '5V' };
/** @param {number} gpio */
const headerPin = (gpio) => GPIO_PINS.find((h) => h.gpio === gpio);
/** @param {string} kind */
const pinsOfKind = (kind) => HEADER.filter((h) => h.kind === kind).map((h) => h.pin);

/**
 * The signals of a device in the chosen mode (or its first mode).
 * @param {Device} device
 * @param {string} [mode]
 * @returns {Signal[] | undefined}
 */
export function signalsOf(device, mode) {
  if (!device.modes) return device.signals ?? [];
  return device.modes[mode ?? Object.keys(device.modes)[0]]?.signals;
}

/** @param {Signal} s */
const isMovable = (s) => s.type === 'gpio' && s.fixed === undefined;

/** Compare two scores item by item. @param {number[]} a @param {number[]} b */
const isLess = (a, b) => {
  const i = a.findIndex((v, j) => v !== b[j]);
  return i >= 0 && a[i] < b[i];
};

/**
 * @param {Selection} selection
 * @param {Device[]} [catalog]
 * @returns {Result}
 */
export function allocate(selection, catalog = DEVICES) {
  /** @type {Problem[]} */ const errors = [];
  /** @type {Problem[]} */ const warnings = [];
  /** @type {Assignment[]} */ const assignments = [];
  /** @param {Device} dev @param {NonNullable<Problem['code']>} code @param {string} reason */
  const fail = (dev, code, reason) => errors.push({ device: dev.id, code, reason, message: `${dev.short}: ${reason}` });

  const board = BOARDS[/** @type {keyof typeof BOARDS} */ (selection.board)];
  if (!board) {
    return { ok: false, assignments, connectors: [], breadboard: { required: false, rails: [], bridge: false, mounted: [] }, plugs: [], errors: [{ message: `Unknown board: ${selection.board}` }], warnings };
  }

  // Chosen devices in catalog order, so the order of the selection doesn't matter.
  /** @type {{dev: Device, signals: Signal[], mode?: string, power?: '3v3' | '5v'}[]} */
  const chosen = [];
  for (const { id, mode, power } of selection.devices) {
    const dev = catalog.find((d) => d.id === id);
    if (!dev) { errors.push({ device: id, code: 'other', message: `Unknown device: ${id}` }); continue; }
    if (chosen.some((c) => c.dev === dev)) { fail(dev, 'other', 'Chosen twice'); continue; }
    const signals = signalsOf(dev, mode);
    if (!signals) { fail(dev, 'other', `No ${mode} option`); continue; }
    chosen.push({ dev, signals, mode, ...(power ? { power } : {}) });
  }
  chosen.sort((a, b) => catalog.indexOf(a.dev) - catalog.indexOf(b.dev));

  /** @type {Set<Device>} */
  const wrongBoard = new Set();
  for (const { dev } of chosen) {
    if (dev.boards && !dev.boards.includes(selection.board)) {
      const names = dev.boards.map((b) => BOARDS[/** @type {keyof typeof BOARDS} */ (b)]?.name ?? b).join(' or ');
      fail(dev, 'board', dev.uses?.pcie ? `Requires a PCIe connector on ${names}` : `Requires ${names}`);
      wrongBoard.add(dev);
    }
  }

  // Choose-one groups, e.g. the second network interface: the ESP32 or a Wi-Fi dongle.
  /** @type {Map<string, Device>} */
  const firstOf = new Map();
  for (const { dev } of chosen) {
    if (!dev.oneOf) continue;
    const first = firstOf.get(dev.oneOf);
    if (first) fail(dev, 'oneOf', `Only one ${dev.oneOf} is allowed`);
    else firstOf.set(dev.oneOf, dev);
  }

  // Connectors other than the header: PCIe, camera/display, USB. Displays pick their
  // connector before cameras, because some connectors only take a camera.
  /** @type {Connector[]} */
  const connectors = [];
  for (const kind of /** @type {const} */ (['pcie', 'usb'])) {
    const has = board[kind];
    const what = kind === 'pcie' ? 'PCIe connector' : 'USB port';
    const none = kind === 'pcie' ? `Requires a PCIe connector on ${boardsWith((b) => b.pcie > 0)}` : 'Requires a USB port';
    let used = 0;
    for (const { dev } of chosen) {
      if (wrongBoard.has(dev)) continue;
      for (let i = 0; i < (dev.uses?.[kind] ?? 0); i++) {
        if (used < has) {
          used++;
          connectors.push({ device: dev.id, kind, name: kind === 'pcie' ? 'PCIe' : `USB ${used}` });
        } else {
          fail(dev, 'connector', has === 0 ? none : has === 1 ? `The only ${what} is in use` : `All ${what}s are in use`);
        }
      }
    }
  }
  /** @type {Set<string>} */
  const mipiTaken = new Set();
  for (const kind of /** @type {const} */ (['display', 'camera'])) {
    for (const { dev } of chosen) {
      if (wrongBoard.has(dev)) continue;
      for (let i = 0; i < (dev.uses?.[kind] ?? 0); i++) {
        const fits = board.mipi.filter((m) => m[kind]);
        const free = fits.find((m) => !mipiTaken.has(m.name));
        if (free) {
          mipiTaken.add(free.name);
          connectors.push({ device: dev.id, kind, name: free.name });
        } else if (!fits.length) {
          const short = kind === 'display' ? 'DISP' : 'CAM';
          fail(dev, 'connector', `Requires a ${short} connector on ${boardsWith((b) => b.mipi.some((m) => m[kind]))}`);
        } else {
          // 'CAM/DISP 0' and 'CAM/DISP 1' -> 'CAM/DISP'
          const name = fits[0].name.replace(/\s*\d+$/, '');
          fail(dev, 'connector', fits.length === 1 ? `${name} connector is in use` : `${fits.length === 2 ? 'Both' : 'All'} ${name} connectors are in use`);
        }
      }
    }
  }

  // Header coverage: one board without extension pins can sit on top; nothing can be
  // wired to the header then.
  const covers = (/** @type {Device} */ d) => Boolean(d.header?.covers);
  const tops = chosen.filter((c) => covers(c.dev) && !c.dev.header?.passthrough);
  for (const extra of tops.slice(1)) fail(extra.dev, 'twoHats', HAT_REASON);
  if (tops.length) {
    for (const c of chosen) {
      if (!covers(c.dev) && c.signals.some((s) => s.type !== 'analog')) {
        fail(c.dev, 'covered', `GPIO header is covered by ${tops[0].dev.short}`);
      }
    }
  }

  // Plugs on the header: nothing else can use their pins
  /** @type {Map<number, Device>} */
  const plugged = new Map();
  /** @type {Result['plugs']} */
  const plugs = [];
  for (const { dev } of chosen) {
    if (!dev.plug || wrongBoard.has(dev)) continue;
    const clash = dev.plug.pins.find((p) => plugged.has(p));
    if (clash !== undefined) {
      fail(dev, 'other', `Pin ${clash} is used by ${plugged.get(clash)?.short}`);
      continue;
    }
    for (const p of dev.plug.pins) plugged.set(p, dev);
    plugs.push({ device: dev.id, pins: dev.plug.pins });
  }

  /** @type {Map<number, {device: Device, label: string, bus?: string}>} */
  const used = new Map();

  /**
   * Reserve a GPIO for a signal. Returns why it can't, or null.
   * @param {Device} dev @param {Signal} s @param {number} gpio
   */
  const take = (dev, s, gpio) => {
    const h = headerPin(gpio);
    if (!h) return `GPIO${gpio} is not on the header`;
    if (h.reserved) return `GPIO${gpio} is reserved`;
    if (plugged.has(h.pin)) return `GPIO${gpio} is under ${plugged.get(h.pin)?.short}'s plug`;
    if (s.exclude?.includes(gpio)) return `can't use GPIO${gpio}`;
    const u = used.get(gpio);
    if (u && !(s.bus && u.bus === s.bus)) return `GPIO${gpio} is used by ${u.device.short} ${u.label}`;
    if (!u) used.set(gpio, { device: dev, label: s.label, bus: s.bus });
    return null;
  };
  const modeOf = new Map(chosen.map((c) => [c.dev, c.mode]));
  /** A signal that can't get its pin @param {Device} dev @param {Signal} s @param {string} why */
  const pinProblem = (dev, s, why) => errors.push({
    device: dev.id, code: 'pins', reason: notEnoughPins(dev, modeOf.get(dev)), message: `${dev.short} ${s.label}: ${why}`,
  });

  /** @param {Device} dev @param {Signal} s @param {number} gpio @param {Assignment['how']} how */
  const assign = (dev, s, gpio, how) => {
    const shared = used.get(gpio)?.device !== dev;
    assignments.push({
      device: dev.id, signal: s.id, label: s.label, devicePin: s.devicePin, type: 'gpio', gpio,
      ...(covers(dev) ? { how: 'header' } : { pin: headerPin(gpio)?.pin, how, ...(s.pullUp ? { pullUp: s.pullUp } : {}) }),
      ...(shared ? { shared: true } : {}),
    });
  };

  // 1. Fixed GPIOs
  for (const { dev, signals } of chosen) {
    for (const s of signals) {
      if (s.type !== 'gpio' || s.fixed === undefined) continue;
      const why = take(dev, s, s.fixed);
      if (why) pinProblem(dev, s, why);
      else assign(dev, s, s.fixed, 'fixed');
    }
  }

  // 2. GPIOs the viewer moved, or kept from a saved setup (before any default)
  /** @type {{dev: Device, s: Signal}[]} */
  const notMoved = [];
  for (const { dev, signals } of chosen) {
    for (const s of signals.filter(isMovable)) {
      const key = `${dev.id}.${s.id}`;
      const moved = selection.moved?.[key];
      const gpio = moved ?? selection.kept?.[key];
      if (gpio === undefined) { notMoved.push({ dev, s }); continue; }
      const why = take(dev, s, gpio);
      if (why) pinProblem(dev, s, why);
      else assign(dev, s, gpio, moved !== undefined ? 'moved' : 'kept');
    }
  }

  // 3. Defaults
  /** @type {{dev: Device, s: Signal}[]} */
  const unplaced = [];
  for (const { dev, s } of notMoved) {
    if (s.default !== undefined && !take(dev, s, s.default)) assign(dev, s, s.default, 'default');
    else unplaced.push({ dev, s });
  }

  // 4. Free GPIOs for the rest, device by device: the most compact group of free pins,
  //    looking among plain pins first and adding the next tier only when the device
  //    doesn't fit. A device's fixed or default pins count towards keeping it compact.
  /** @param {Signal} s @param {number} gpio */
  const usable = (s, gpio) => {
    const h = headerPin(gpio);
    return Boolean(h && !h.reserved && !plugged.has(h.pin) && !s.exclude?.includes(gpio) && !used.has(gpio));
  };
  /** @param {number} gpio */
  const pinOf = (gpio) => /** @type {number} */ (headerPin(gpio)?.pin);
  /** @param {number} gpio */
  const rank = (gpio) => GPIO_PREFERENCE.indexOf(gpio);
  /**
   * GPIOs for the signals, in signal order, or undefined when they don't fit.
   * @param {Signal[]} sigs @param {number[]} placed  Physical pins the device already has
   */
  const group = (sigs, placed) => {
    for (let tiers = 1; tiers <= GPIO_TIERS.length; tiers++) {
      const pool = GPIO_TIERS.slice(0, tiers).flat().filter((g) => sigs.some((s) => usable(s, g)));
      if (pool.length < sigs.length) continue;
      /** @type {number[] | undefined} */ let best;
      /** @type {number[]} */ let bestScore = [];
      for (const anchor of pool) {
        const near = [...pool].sort((x, y) => pinDistance(pinOf(x), pinOf(anchor)) - pinDistance(pinOf(y), pinOf(anchor)) || rank(x) - rank(y));
        /** @type {number[]} */ const pick = [];
        for (const s of sigs) {
          const g = near.find((x) => !pick.includes(x) && usable(s, x));
          if (g === undefined) break;
          pick.push(g);
        }
        if (pick.length < sigs.length) continue;
        // Rows covered, then how far each new pin is from its nearest neighbour, then tier order.
        const pins = [...pick.map(pinOf), ...placed];
        const rows = pins.map((p) => Math.ceil(p / 2));
        /** @param {number} g */
        const gap = (g) => {
          const others = pins.filter((p) => p !== pinOf(g));
          return others.length ? Math.min(...others.map((p) => pinDistance(p, pinOf(g)))) : 0;
        };
        const score = [
          Math.max(...rows) - Math.min(...rows),
          pick.reduce((sum, g) => sum + gap(g), 0),
          pick.reduce((sum, g) => sum + rank(g), 0),
        ];
        if (!best || isLess(score, bestScore)) {
          best = pick;
          bestScore = score;
        }
      }
      if (best) {
        // Signals in their listed order get the pins in header order, when they allow it.
        const ordered = [...best].sort((x, y) => pinOf(x) - pinOf(y));
        return sigs.every((s, i) => usable(s, ordered[i])) ? ordered : best;
      }
    }
    return undefined;
  };

  /** @type {Map<Device, Signal[]>} */
  const unplacedByDevice = new Map();
  for (const { dev, s } of unplaced) unplacedByDevice.set(dev, [...(unplacedByDevice.get(dev) ?? []), s]);
  for (const [dev, sigs] of unplacedByDevice) {
    const placed = assignments.filter((a) => a.device === dev.id && a.pin !== undefined).map((a) => /** @type {number} */ (a.pin));
    const gpios = group(sigs, placed);
    if (!gpios) {
      fail(dev, 'pins', notEnoughPins(dev, modeOf.get(dev)));
      continue;
    }
    sigs.forEach((s, i) => {
      take(dev, s, gpios[i]);
      if (s.default !== undefined) {
        const reason = `${s.label} is on GPIO${gpios[i]} because GPIO${s.default} is in use`;
        warnings.push({ device: dev.id, reason, message: `${dev.short} ${reason}` });
      }
      assign(dev, s, gpios[i], 'auto');
    });
  }

  // 5. Analog outputs: never wired
  for (const { dev, signals } of chosen) {
    const analog = signals.filter((s) => s.type === 'analog');
    if (!analog.length) continue;
    if (!signals.some((s) => s.type === 'gpio')) {
      fail(dev, 'other', 'Raspberry Pi has no analog input');
    } else {
      for (const s of analog) {
        const reason = `${s.devicePin} not connected: Raspberry Pi has no analog input`;
        warnings.push({ device: dev.id, reason, message: `${dev.short}: ${reason}` });
      }
    }
  }

  // 6. Power and ground for wired devices (a board on the header gets them through it).
  //    A plug's wires take the pins the plug puts them on. Each other module's power uses
  //    the supply the viewer chose, or its default one; when a plug takes every pin of the
  //    default supply, the next supply it can run on.
  //    A module that sits on the breadboard (the ESP32 DevKit), or more than 2 modules on one
  //    supply (2 pins each): the breadboard is required. Each supply with 2 or more modules
  //    gets a rail pair, wired to one supply pin and one ground pin; a module alone on its
  //    supply keeps its own pins. Pull-up resistors go to the 3V3 rail's + strip, which then
  //    gets a 3V3 pin even without modules on it (and no ground pin).
  /** @type {Map<number, number>} */
  const pinUse = new Map();
  const uses = (/** @type {number} */ p) => pinUse.get(p) ?? 0;
  /** Physical GPIO pins of these devices */
  const dataPinsOf = (/** @type {string[]} */ ids) =>
    assignments.filter((a) => ids.includes(a.device) && a.type === 'gpio' && a.pin !== undefined).map((a) => /** @type {number} */ (a.pin));
  /** The pin of this kind nearest to these pins; a pin nothing else uses first */
  const nearest = (/** @type {string} */ kind, /** @type {number[]} */ near, /** @type {number | undefined} */ preferred) => {
    const candidates = pinsOfKind(kind).filter((p) => !plugged.has(p));
    if (preferred && candidates.includes(preferred) && !uses(preferred)) return preferred;
    const away = (/** @type {number} */ p) => (near.length ? Math.min(...near.map((d) => pinDistance(d, p))) : 0);
    return /** @type {number | undefined} */ ([...candidates].sort((a, b) => uses(a) - uses(b) || away(a) - away(b) || a - b)[0]);
  };
  const take1 = (/** @type {number} */ pin) => {
    const shared = uses(pin) > 0;
    pinUse.set(pin, uses(pin) + 1);
    return shared;
  };

  const wired = chosen.filter((c) => !covers(c.dev));
  /** Pins of a supply that no plug takes @param {'3v3' | '5v'} supply */
  const freeOf = (supply) => pinsOfKind(supply).filter((p) => !plugged.has(p));
  /** The supply of each wired device's power wire (not a plug's) @type {Map<Device, '3v3' | '5v'>} */
  const supplies = new Map();
  for (const { dev, signals, power } of wired) {
    const s = signals.find((x) => x.type === 'power' && x.pin === undefined);
    if (!s) continue;
    const def = s.power ?? '3v3';
    const options = s.supplies ?? [def];
    let supply = power && options.includes(power) ? power : def;
    if (!power && !freeOf(def).length) {
      const next = options.find((x) => x !== def && freeOf(x).length);
      if (next) {
        supply = next;
        const by = plugged.get(pinsOfKind(def)[0]);
        const reason = `${s.label} is on ${SUPPLY_NAMES[next]} because ${by?.short} uses the ${SUPPLY_NAMES[def]} pins`;
        warnings.push({ device: dev.id, reason, message: `${dev.short} ${reason}` });
      }
    }
    supplies.set(dev, supply);
  }
  /** @type {Record<'3v3' | '5v', string[]>} */
  const onSupply = { '3v3': [], '5v': [] };
  for (const [dev, supply] of supplies) onSupply[supply].push(dev.id);
  const mounted = wired.filter((c) => c.dev.fit).map((c) => c.dev.id);
  const pulled = wired.filter((c) => c.signals.some((s) => s.pullUp));
  /** @type {Breadboard} */
  const breadboard = {
    required: mounted.length > 0 || onSupply['3v3'].length > 2 || onSupply['5v'].length > 2,
    rails: [],
    bridge: false,
    mounted,
  };
  // The headers of the module's own pins that take a pull-up: on both sides, the + rails are joined
  const pullUpHeaders = new Set(pulled.flatMap((c) => c.signals.filter((s) => s.pullUp)
    .flatMap((s) => (c.dev.pinout ?? []).filter((x) => x.name === s.devicePin).map((x) => x.header))));
  breadboard.bridge = pullUpHeaders.size > 1;

  // Devices without header power (e.g. the ESP32's ground wire) keep their own pins first
  const order = [...wired].sort((a, b) => Number(supplies.has(a.dev)) - Number(supplies.has(b.dev)));
  if (breadboard.required) {
    for (const rail of /** @type {const} */ (['3v3', '5v'])) {
      const ids = onSupply[rail].length >= 2 ? onSupply[rail] : [];
      const pullUps = rail === '3v3' ? pulled.map((c) => c.dev.id) : [];
      if (!ids.length && !pullUps.length) continue;
      const header = pullUpHeaders.size === 1 ? [...pullUpHeaders][0] : undefined;
      breadboard.rails.push({ rail, supply: 0, devices: ids, pullUps, ...(header ? { header } : {}) });
    }
    if (breadboard.bridge && breadboard.rails.some((r) => r.rail === '5v')) {
      errors.push({ code: 'other', message: 'Breadboard: both + rails carry 3V3 for the pull-up resistors, so there is no 5V rail' });
    }
  }
  for (const { dev, signals } of order) {
    const supply = supplies.get(dev);
    const onRail = breadboard.rails.some((r) => r.rail === supply && r.devices.includes(dev.id));
    for (const s of signals) {
      if (s.type !== 'power' && s.type !== 'ground') continue;
      const power = s.type === 'power' ? { supply: s.pin === undefined && supply ? supply : (s.power ?? '3v3') } : {};
      if (s.pin !== undefined) {
        assignments.push({ device: dev.id, signal: s.id, label: s.label, devicePin: s.devicePin, type: s.type, pin: s.pin, how: 'plug', ...power });
        continue;
      }
      if (onRail && supply) {
        assignments.push({ device: dev.id, signal: s.id, label: s.label, devicePin: s.devicePin, type: s.type, rail: supply, how: 'breadboard', ...power });
        continue;
      }
      const kind = s.type === 'ground' ? 'gnd' : (supply ?? s.power ?? '3v3');
      const pin = nearest(kind, dataPinsOf([dev.id]), s.preferredPin);
      if (pin === undefined) {
        fail(dev, 'other', `No ${kind === 'gnd' ? 'GND' : SUPPLY_NAMES[/** @type {'3v3' | '5v'} */ (kind)]} pin left`);
        continue;
      }
      const shared = take1(pin);
      assignments.push({
        device: dev.id, signal: s.id, label: s.label, devicePin: s.devicePin, type: s.type, pin, how: 'auto', ...power,
        ...(shared ? { shared: true } : {}),
      });
    }
  }
  // Each rail pair: one supply pin and one ground pin, nearest to the modules it powers
  for (const r of breadboard.rails) {
    const near = dataPinsOf([...r.devices, ...r.pullUps]);
    const supply = nearest(r.rail, near, undefined);
    const ground = r.devices.length ? nearest('gnd', near, undefined) : undefined;
    if (supply === undefined || (r.devices.length && ground === undefined)) {
      errors.push({ code: 'other', message: `Breadboard: no ${supply === undefined ? SUPPLY_NAMES[r.rail] : 'GND'} pin left for the ${SUPPLY_NAMES[r.rail]} rail` });
      continue;
    }
    r.supply = supply;
    take1(supply);
    if (ground !== undefined) {
      r.ground = ground;
      take1(ground);
    }
  }

  return { ok: errors.length === 0, assignments, connectors, breadboard, plugs, errors, warnings };
}

/**
 * Why a device can't be added, said from that device's side: adding it may make another
 * device fail (e.g. a board on the header covers a sensor that is already wired).
 * @param {Device} dev @param {string | undefined} mode @param {Problem[]} added  New errors
 */
function reasonFor(dev, mode, added) {
  /** @param {Problem} e */
  const said = (e) => ({ reason: e.reason ?? e.message, code: e.code });
  const own = added.find((e) => e.device === dev.id);
  if (own && own.code !== 'pins' && own.code !== 'covered' && own.code !== 'twoHats') return said(own);
  if (dev.header?.covers && added.some((e) => e.code === 'covered' || e.code === 'twoHats')) return { reason: HAT_REASON, code: /** @type {const} */ ('twoHats') };
  if (own?.code === 'covered') return said(own);
  if (added.some((e) => e.code === 'pins')) return { reason: notEnoughPins(dev, mode), code: /** @type {const} */ ('pins') };
  // Another device's problem caused by adding this one, e.g. the other second network interface
  const other = added.find((e) => e.device !== dev.id && e.code === 'oneOf');
  return said(own ?? other ?? added[0]);
}

/**
 * For every device that isn't chosen: can it be added, and if not, why.
 * A device with modes (SPI/SDIO) is available when at least one mode fits.
 * @param {Selection} selection
 * @param {Device[]} [catalog]
 * @returns {Record<string, {ok: boolean, reason?: string, code?: Problem['code'], modes?: Record<string, {ok: boolean, reason?: string, code?: Problem['code']}>}>}
 */
export function availability(selection, catalog = DEVICES) {
  const before = new Set(allocate(selection, catalog).errors.map((e) => e.message));
  /** @type {ReturnType<typeof availability>} */
  const out = {};
  for (const dev of catalog) {
    if (selection.devices.some((d) => d.id === dev.id)) continue;
    const modes = dev.modes ? Object.keys(dev.modes) : [undefined];
    /** @type {Record<string, {ok: boolean, reason?: string, code?: Problem['code']}>} */
    const perMode = {};
    for (const mode of modes) {
      const r = allocate({ ...selection, devices: [...selection.devices, { id: dev.id, ...(mode ? { mode } : {}) }] }, catalog);
      const added = r.errors.filter((e) => !before.has(e.message));
      perMode[mode ?? ''] = added.length ? { ok: false, ...reasonFor(dev, mode, added) } : { ok: true };
    }
    const fits = Object.values(perMode).filter((m) => m.ok);
    const first = Object.values(perMode)[0];
    out[dev.id] = fits.length ? { ok: true } : { ok: false, reason: first.reason, code: first.code };
    if (dev.modes) out[dev.id].modes = perMode;
  }
  return out;
}

/**
 * The supplies a device's power wire can be switched to (for the pins page), in the order
 * the device lists them: those the rest of the setup leaves a pin for. Empty when the device
 * has no choice.
 * @param {Selection} selection
 * @param {string} id   Device id
 * @param {Device[]} [catalog]
 * @returns {('3v3' | '5v')[]}
 */
export function supplyOptions(selection, id, catalog = DEVICES) {
  const chosen = selection.devices.find((d) => d.id === id);
  const dev = catalog.find((d) => d.id === id);
  const s = chosen && dev ? signalsOf(dev, chosen.mode)?.find((x) => x.type === 'power' && x.pin === undefined) : undefined;
  if (!s?.supplies || s.supplies.length < 2) return [];
  return s.supplies.filter((power) => allocate({ ...selection, devices: selection.devices.map((d) => (d.id === id ? { ...d, power } : d)) }, catalog).ok);
}

/**
 * GPIOs a movable signal can be moved to, in header order (for the planner's pin picker):
 * its own pin and every free pin it may use. Pins other signals use are not offered.
 * @param {Selection} selection
 * @param {string} key   'deviceId.signalId'
 * @param {Device[]} [catalog]
 * @returns {number[]}
 */
export function moveOptions(selection, key, catalog = DEVICES) {
  const [id, signalId] = key.split('.');
  const chosen = selection.devices.find((d) => d.id === id);
  const dev = catalog.find((d) => d.id === id);
  const signal = chosen && dev ? signalsOf(dev, chosen.mode)?.find((s) => s.id === signalId) : undefined;
  if (!signal || !isMovable(signal)) return [];
  const others = new Set(
    allocate(selection, catalog).assignments
      .filter((a) => a.type === 'gpio' && `${a.device}.${a.signal}` !== key)
      .map((a) => a.gpio),
  );
  return GPIO_PINS
    .filter((h) => !h.reserved && h.gpio !== undefined && !others.has(h.gpio))
    .map((h) => /** @type {number} */ (h.gpio))
    .filter((gpio) => allocate({ ...selection, moved: { ...selection.moved, [key]: gpio } }, catalog).ok);
}
