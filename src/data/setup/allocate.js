// @ts-check
// Assigns Raspberry Pi header pins to the chosen hardware, and works out which hardware
// can still be added. The same selection always gives the same result.
//
// Order: fixed GPIOs, then GPIOs the viewer moved or kept from a saved setup, then
// defaults, then free GPIOs, kept
// close together for each device (plain pins first, see GPIO_TIERS); then the power and
// ground pins nearest each device's GPIOs. A board that covers the header without
// extension pins leaves no pins to wire anything else to.
import { BOARDS, GPIO_PREFERENCE, GPIO_TIERS, HEADER, pinDistance } from './header.js';
import { DEVICES } from './devices.js';

/** @typedef {import('./devices.js').Device} Device */
/** @typedef {import('./devices.js').Signal} Signal */

/**
 * @typedef {object} Selection
 * @property {string} board                     'rpi5' or 'rpi-zero-2-w'
 * @property {{id: string, mode?: string}[]} devices
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
 * @property {'fixed' | 'moved' | 'kept' | 'default' | 'auto' | 'header' | 'breadboard'} how
 * @property {boolean} [shared]  The pin is also used by another device
 */

/**
 * @typedef {object} Breadboard
 * @property {boolean} required  More than 2 modules take 3V3, or more than 2 take 5V, from the
 *   header (there are 2 of each pin): their power and ground go through breadboard rails.
 *   Otherwise the breadboard is optional.
 * @property {{rail: '3v3' | '5v', supply: number, ground: number, devices: string[]}[]} rails
 *   When required: for each rail pair, the header pins wired to it (supply and ground) and
 *   the devices it powers.
 */

/** @typedef {{device?: string, message: string}} Problem */

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
 * @property {Problem[]} errors
 * @property {Problem[]} warnings
 */

const GPIO_PINS = HEADER.filter((h) => h.kind === 'gpio');
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

  const board = BOARDS[/** @type {keyof typeof BOARDS} */ (selection.board)];
  if (!board) {
    return { ok: false, assignments, connectors: [], breadboard: { required: false, rails: [] }, errors: [{ message: `Unknown board: ${selection.board}` }], warnings };
  }

  // Chosen devices in catalog order, so the order of the selection doesn't matter.
  /** @type {{dev: Device, signals: Signal[]}[]} */
  const chosen = [];
  for (const { id, mode } of selection.devices) {
    const dev = catalog.find((d) => d.id === id);
    if (!dev) { errors.push({ device: id, message: `Unknown device: ${id}` }); continue; }
    if (chosen.some((c) => c.dev === dev)) { errors.push({ device: id, message: `${dev.name} is chosen twice.` }); continue; }
    const signals = signalsOf(dev, mode);
    if (!signals) { errors.push({ device: id, message: `${dev.name} has no ${mode} option.` }); continue; }
    chosen.push({ dev, signals });
  }
  chosen.sort((a, b) => catalog.indexOf(a.dev) - catalog.indexOf(b.dev));

  /** @type {Set<Device>} */
  const wrongBoard = new Set();
  for (const { dev } of chosen) {
    if (dev.boards && !dev.boards.includes(selection.board)) {
      const names = dev.boards.map((b) => BOARDS[/** @type {keyof typeof BOARDS} */ (b)]?.name ?? b).join(' or ');
      errors.push({ device: dev.id, message: `${dev.name} needs a ${names}.` });
      wrongBoard.add(dev);
    }
  }

  // Choose-one groups, e.g. the second network interface: the ESP32 or a Wi-Fi dongle.
  /** @type {Map<string, Device>} */
  const firstOf = new Map();
  for (const { dev } of chosen) {
    if (!dev.oneOf) continue;
    const first = firstOf.get(dev.oneOf);
    if (first) errors.push({ device: dev.id, message: `Choose one ${dev.oneOf}: ${first.name} or ${dev.name}.` });
    else firstOf.set(dev.oneOf, dev);
  }

  // Connectors other than the header: PCIe, camera/display, USB. Displays pick their
  // connector before cameras, because some connectors only take a camera.
  /** @type {Connector[]} */
  const connectors = [];
  /** @param {string} one  e.g. 'USB port' @param {number} has */
  const lacks = (one, has) =>
    has === 0 ? `the ${board.name} has none`
      : has === 1 ? `the only ${one} of the ${board.name} is in use`
        : `all ${has} ${one}s of the ${board.name} are in use`;
  for (const kind of /** @type {const} */ (['pcie', 'usb'])) {
    const has = board[kind];
    const what = kind === 'pcie' ? 'PCIe connector' : 'USB port';
    let used = 0;
    for (const { dev } of chosen) {
      if (wrongBoard.has(dev)) continue;
      for (let i = 0; i < (dev.uses?.[kind] ?? 0); i++) {
        if (used < has) {
          used++;
          connectors.push({ device: dev.id, kind, name: kind === 'pcie' ? 'PCIe' : `USB ${used}` });
        } else {
          errors.push({ device: dev.id, message: `${dev.name} needs ${kind === 'pcie' ? 'a PCIe connector' : 'a USB port'}, but ${lacks(what, has)}.` });
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
        } else {
          errors.push({ device: dev.id, message: `${dev.name} needs a ${kind} connector, but ${lacks(`${kind} connector`, fits.length)}.` });
        }
      }
    }
  }

  // Header coverage: one board without extension pins can sit on top; nothing can be
  // wired to the header then.
  const covers = (/** @type {Device} */ d) => Boolean(d.header?.covers);
  const tops = chosen.filter((c) => covers(c.dev) && !c.dev.header?.passthrough);
  for (const extra of tops.slice(1)) {
    errors.push({ device: extra.dev.id, message: `${extra.dev.name} and ${tops[0].dev.name} both cover the GPIO header; only one of them fits.` });
  }
  if (tops.length) {
    for (const c of chosen) {
      if (!covers(c.dev) && c.signals.some((s) => s.type !== 'analog')) {
        errors.push({ device: c.dev.id, message: `${c.dev.name} can't be wired: ${tops[0].dev.name} covers the GPIO header.` });
      }
    }
  }

  /** @type {Map<number, {device: Device, label: string, bus?: string}>} */
  const used = new Map();

  /**
   * Reserve a GPIO for a signal. Returns why it can't, or null.
   * @param {Device} dev @param {Signal} s @param {number} gpio
   */
  const take = (dev, s, gpio) => {
    const h = headerPin(gpio);
    if (!h) return `GPIO${gpio} is not on the 40-pin header.`;
    if (h.reserved) return `GPIO${gpio} (pin ${h.pin}) is reserved for HAT identification.`;
    if (s.exclude?.includes(gpio)) return `${dev.name} ${s.label} can't use GPIO${gpio} (pin ${h.pin}).`;
    const u = used.get(gpio);
    if (u && !(s.bus && u.bus === s.bus)) {
      return `${dev.name} ${s.label} needs GPIO${gpio} (pin ${h.pin}), which ${u.device.name} already uses for ${u.label}.`;
    }
    if (!u) used.set(gpio, { device: dev, label: s.label, bus: s.bus });
    return null;
  };

  /** @param {Device} dev @param {Signal} s @param {number} gpio @param {Assignment['how']} how */
  const assign = (dev, s, gpio, how) => {
    const shared = used.get(gpio)?.device !== dev;
    assignments.push({
      device: dev.id, signal: s.id, label: s.label, devicePin: s.devicePin, type: 'gpio', gpio,
      ...(covers(dev) ? { how: 'header' } : { pin: headerPin(gpio)?.pin, how }),
      ...(shared ? { shared: true } : {}),
    });
  };

  // 1. Fixed GPIOs
  for (const { dev, signals } of chosen) {
    for (const s of signals) {
      if (s.type !== 'gpio' || s.fixed === undefined) continue;
      const why = take(dev, s, s.fixed);
      if (why) errors.push({ device: dev.id, message: why });
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
      if (why) errors.push({ device: dev.id, message: why });
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
    return Boolean(h && !h.reserved && !s.exclude?.includes(gpio) && !used.has(gpio));
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
      errors.push({ device: dev.id, message: `Not enough free GPIO pins for ${dev.name}.` });
      continue;
    }
    sigs.forEach((s, i) => {
      take(dev, s, gpios[i]);
      if (s.default !== undefined) {
        warnings.push({ device: dev.id, message: `${dev.name} ${s.label} uses GPIO${gpios[i]} instead of GPIO${s.default}, which is taken.` });
      }
      assign(dev, s, gpios[i], 'auto');
    });
  }

  // 5. Analog outputs: never wired
  for (const { dev, signals } of chosen) {
    const analog = signals.filter((s) => s.type === 'analog');
    if (!analog.length) continue;
    if (!signals.some((s) => s.type === 'gpio')) {
      errors.push({
        device: dev.id,
        message: `${dev.name} has only an analog output, and the Raspberry Pi has no analog inputs. It needs an analog-to-digital converter.`,
      });
    } else {
      for (const s of analog) {
        warnings.push({ device: dev.id, message: `${dev.name} ${s.devicePin} is an analog output; the Raspberry Pi has no analog inputs, so it stays unconnected.` });
      }
    }
  }

  // 6. Power and ground for wired devices (a board on the header gets them through it).
  //    More than 2 modules on one supply (2 pins each): power and ground through breadboard
  //    rails, each rail pair wired to one supply pin and one ground pin.
  /** @type {Map<number, number>} */
  const pinUse = new Map();
  const uses = (/** @type {number} */ p) => pinUse.get(p) ?? 0;
  /** Physical GPIO pins of these devices */
  const dataPinsOf = (/** @type {string[]} */ ids) =>
    assignments.filter((a) => ids.includes(a.device) && a.type === 'gpio' && a.pin !== undefined).map((a) => /** @type {number} */ (a.pin));
  /** The pin of this kind nearest to these pins; a pin nothing else uses first */
  const nearest = (/** @type {string} */ kind, /** @type {number[]} */ near, /** @type {number | undefined} */ preferred) => {
    const candidates = pinsOfKind(kind);
    if (preferred && candidates.includes(preferred) && !uses(preferred)) return preferred;
    const away = (/** @type {number} */ p) => (near.length ? Math.min(...near.map((d) => pinDistance(d, p))) : 0);
    return [...candidates].sort((a, b) => uses(a) - uses(b) || away(a) - away(b) || a - b)[0];
  };
  const take1 = (/** @type {number} */ pin) => {
    const shared = uses(pin) > 0;
    pinUse.set(pin, uses(pin) + 1);
    return shared;
  };

  const wired = chosen.filter((c) => !covers(c.dev));
  const supplyOf = (/** @type {Signal[]} */ signals) => signals.find((s) => s.type === 'power')?.power ?? (signals.some((s) => s.type === 'power') ? '3v3' : undefined);
  /** @type {Record<'3v3' | '5v', string[]>} */
  const onSupply = { '3v3': [], '5v': [] };
  for (const { dev, signals } of wired) {
    const supply = supplyOf(signals);
    if (supply) onSupply[supply].push(dev.id);
  }
  /** @type {Breadboard} */
  const breadboard = { required: onSupply['3v3'].length > 2 || onSupply['5v'].length > 2, rails: [] };

  // Devices without header power (e.g. the ESP32's ground wire) keep their own pins first
  const order = [...wired].sort((a, b) => Number(Boolean(supplyOf(a.signals))) - Number(Boolean(supplyOf(b.signals))));
  if (breadboard.required) {
    for (const rail of /** @type {const} */ (['3v3', '5v'])) {
      const ids = onSupply[rail];
      if (!ids.length) continue;
      breadboard.rails.push({ rail, supply: 0, ground: 0, devices: ids });
    }
  }
  for (const { dev, signals } of order) {
    const supply = supplyOf(signals);
    for (const s of signals) {
      if (s.type !== 'power' && s.type !== 'ground') continue;
      if (breadboard.required && supply) {
        assignments.push({ device: dev.id, signal: s.id, label: s.label, devicePin: s.devicePin, type: s.type, rail: supply, how: 'breadboard' });
        continue;
      }
      const kind = s.type === 'ground' ? 'gnd' : (s.power ?? '3v3');
      const pin = nearest(kind, dataPinsOf([dev.id]), s.preferredPin);
      const shared = take1(pin);
      assignments.push({
        device: dev.id, signal: s.id, label: s.label, devicePin: s.devicePin, type: s.type, pin, how: 'auto',
        ...(shared ? { shared: true } : {}),
      });
    }
  }
  // Each rail pair: one supply pin and one ground pin, nearest to the modules it powers
  for (const r of breadboard.rails) {
    const near = dataPinsOf(r.devices);
    r.supply = nearest(r.rail, near, undefined);
    take1(r.supply);
    r.ground = nearest('gnd', near, undefined);
    take1(r.ground);
  }

  return { ok: errors.length === 0, assignments, connectors, breadboard, errors, warnings };
}

/**
 * For every device that isn't chosen: can it be added, and if not, why.
 * A device with modes (SPI/SDIO) is available when at least one mode fits.
 * @param {Selection} selection
 * @param {Device[]} [catalog]
 * @returns {Record<string, {ok: boolean, reason?: string, modes?: Record<string, {ok: boolean, reason?: string}>}>}
 */
export function availability(selection, catalog = DEVICES) {
  const before = new Set(allocate(selection, catalog).errors.map((e) => e.message));
  /** @type {ReturnType<typeof availability>} */
  const out = {};
  for (const dev of catalog) {
    if (selection.devices.some((d) => d.id === dev.id)) continue;
    const modes = dev.modes ? Object.keys(dev.modes) : [undefined];
    /** @type {Record<string, {ok: boolean, reason?: string}>} */
    const perMode = {};
    for (const mode of modes) {
      const r = allocate({ ...selection, devices: [...selection.devices, { id: dev.id, ...(mode ? { mode } : {}) }] }, catalog);
      const added = r.errors.filter((e) => !before.has(e.message));
      perMode[mode ?? ''] = added.length ? { ok: false, reason: added[0].message } : { ok: true };
    }
    const fits = Object.values(perMode).filter((m) => m.ok);
    out[dev.id] = fits.length ? { ok: true } : { ok: false, reason: Object.values(perMode)[0].reason };
    if (dev.modes) out[dev.id].modes = perMode;
  }
  return out;
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
