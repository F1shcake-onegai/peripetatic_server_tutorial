// @ts-check
// The "Your setup" page: choose the board, track and hardware; see the pins the planner
// gives on a picture of the header, and move them; save, reset pins or clear. Everything
// runs in the browser; the setup is saved in localStorage (src/data/setup/store.js).
import {
  DEVICES, BOARDS, allocate, availability, emptySetup, load, save, clear, safeLocalStorage, toSelection,
  keepPins, devicesFor, setBoard, setTrack, toggleDevice, setMode, moveSignal, resetPins, moveOptions,
  pinViews, pinOfGpio, RAIL_NAMES, HEADER, signalsOf,
} from '../../data/setup/index.js';

/** @typedef {import('../../data/setup/store.js').Setup} Setup */

const CATEGORIES = [
  ['network', 'Second network interface (choose one)'],
  ['hat', 'Boards that plug onto the header'],
  ['camera', 'Cameras'],
  ['display', 'Displays (ribbon cable)'],
  ['sensor', 'Sensors and modules'],
];
const TRACKS = /** @type {const} */ ({ student: 'Student Kit', server: 'School Server' });
const RAIL = RAIL_NAMES;
const KINDS = [['3v3', '3V3 power'], ['5v', '5V power'], ['gnd', 'Ground'], ['gpio', 'GPIO'], ['reserved', 'Reserved']];
/** What each way of placing a signal means, for the pin details */
const HOW = {
  fixed: 'Fixed: it only works on this pin.',
  header: 'Through the header: the board sits on it.',
  moved: 'Moved by you.',
  kept: 'Kept on this pin when you add hardware or move other pins.',
  default: 'Its usual pin.',
  auto: 'Placed automatically.',
  breadboard: '',
};
const byId = Object.fromEntries(DEVICES.map((d) => [d.id, d]));

/** @param {unknown} s */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** @param {HTMLElement} root */
export function mount(root) {
  const storage = safeLocalStorage();
  /** @type {Setup | null} */
  let saved = load(storage);
  /** @type {Setup} */
  let draft = saved ?? emptySetup();
  let message = '';
  /** Physical pin whose details are shown @type {number | null} */
  let selectedPin = null;
  /** Device whose pins are highlighted @type {string | null} */
  let highlight = null;
  /** The signal on the selected pin that can move, and the GPIOs it can move to @type {{key: string, targets: Set<number>} | null} */
  let mover = null;

  const render = () => {
    const focused = document.activeElement?.id;
    if (highlight && !draft.devices.some((d) => d.id === highlight)) highlight = null;
    const result = allocate(toSelection(draft));
    root.innerHTML = [boardSection(), trackSection(), hardwareSection(), pinsSection(result), actions(result)].join('');
    if (focused) document.getElementById(focused)?.focus();
  };

  const boardSection = () => `
    <fieldset class="pst-group"><legend>1. Your Raspberry Pi</legend>
      ${Object.entries(BOARDS).map(([id, b]) => `
        <label class="pst-choice"><input type="radio" name="pst-board" id="pst-board-${id}" value="${id}" ${draft.board === id ? 'checked' : ''}> ${esc(b.name)}</label>`).join('')}
    </fieldset>`;

  const trackSection = () => `
    <fieldset class="pst-group"><legend>2. Your track</legend>
      ${Object.entries(TRACKS).map(([id, name]) => `
        <label class="pst-choice"><input type="radio" name="pst-track" id="pst-track-${id}" value="${id}" ${draft.track === id ? 'checked' : ''}> ${name}</label>`).join('')}
      <label class="pst-choice"><input type="radio" name="pst-track" id="pst-track-none" value="" ${draft.track ? '' : 'checked'}> Not decided (show both)</label>
    </fieldset>`;

  const hardwareSection = () => {
    const av = availability(toSelection(draft));
    const offered = devicesFor(draft.track);
    const groups = CATEGORIES.map(([cat, title]) => {
      const list = offered.filter((d) => d.category === cat);
      if (!list.length) return '';
      return `<div class="pst-category"><h3>${esc(title)}</h3>${list.map((d) => deviceRow(d, av)).join('')}</div>`;
    }).join('');
    return `<fieldset class="pst-group"><legend>3. What you have</legend>${groups}</fieldset>`;
  };

  /** @param {import('../../data/setup/devices.js').Device} d @param {ReturnType<typeof availability>} av */
  const deviceRow = (d, av) => {
    const chosen = draft.devices.find((x) => x.id === d.id);
    const fits = Boolean(chosen) || av[d.id]?.ok !== false;
    let modes = '';
    if (d.modes) {
      // Which modes fit, checked without this device
      const others = { ...toSelection(draft), devices: draft.devices.filter((x) => x.id !== d.id) };
      const modeAv = availability(others)[d.id]?.modes ?? {};
      const current = chosen?.mode ?? Object.keys(d.modes)[0];
      modes = `<div class="pst-modes" role="radiogroup" aria-label="${esc(d.name)} interface">Interface:
        ${Object.entries(d.modes).map(([key, m]) => {
          const ok = modeAv[key]?.ok !== false;
          return `<label class="pst-choice ${ok ? '' : 'pst-off'}" title="${esc(modeAv[key]?.reason ?? '')}"><input type="radio" name="pst-mode-${d.id}" id="pst-mode-${d.id}-${key}" data-device="${d.id}" value="${key}" ${key === current ? 'checked' : ''} ${ok && chosen ? '' : 'disabled'}> ${esc(m.label)}</label>`;
        }).join('')}</div>`;
    }
    return `<div class="pst-device ${fits ? '' : 'pst-off'}">
      <label class="pst-choice"><input type="checkbox" id="pst-dev-${d.id}" data-device="${d.id}" ${chosen ? 'checked' : ''} ${fits ? '' : 'disabled'}>
        <span class="pst-name">${esc(d.name)}</span>${d.versions ? ` <span class="pst-muted">${esc(d.versions)}</span>` : ''}</label>
      ${fits ? '' : `<div class="pst-reason">${esc(av[d.id]?.reason ?? '')}</div>`}
      ${modes}
    </div>`;
  };

  /** @param {import('../../data/setup/allocate.js').Result} result */
  const pinsSection = (result) => {
    if (!draft.devices.length) return `<section class="pst-group"><h2 class="pst-legend">4. Your pins</h2><p class="pst-muted">Choose your hardware above.</p></section>`;
    const problems = [
      ...result.errors.map((e) => `<li class="pst-error">${esc(e.message)}</li>`),
      ...result.warnings.map((w) => `<li class="pst-warning">${esc(w.message)}</li>`),
    ].join('');
    const devices = [...draft.devices].sort((a, b) => DEVICES.indexOf(byId[a.id]) - DEVICES.indexOf(byId[b.id]));
    const tables = devices.map(({ id }) => deviceTable(id, result)).join('');
    return `<section class="pst-group"><h2 class="pst-legend">4. Your pins</h2>
      ${problems ? `<ul class="pst-problems">${problems}</ul>` : ''}
      ${breadboardNote(result)}
      ${picture(result)}
      ${tables}
    </section>`;
  };

  /**
   * The header, pinout.xyz style: odd pins on the left, even on the right, each with its
   * name and a badge saying what uses it.
   * @param {import('../../data/setup/allocate.js').Result} result
   */
  const picture = (result) => {
    mover = null;
    if (!result.assignments.some((a) => a.pin !== undefined || a.how === 'header')) return '';
    const views = pinViews(toSelection(draft), result);
    const selected = selectedPin ? views[selectedPin - 1] : undefined;
    const movable = selected?.users.find((u) => u.movable);
    if (movable && selected) {
      const options = moveOptions(toSelection(keepPins(draft)), movable.key);
      mover = { key: movable.key, targets: new Set(options.filter((g) => g !== selected.gpio)) };
    }
    const top = views.find((v) => v.coveredBy)?.coveredBy;
    /** @param {import('../../data/setup/picture.js').PinView} v */
    const lit = (v) => Boolean(highlight && (v.users.some((u) => u.device === highlight) || v.rail?.devices.includes(highlight)));
    /** @param {import('../../data/setup/picture.js').PinView} v */
    const state = (v) => {
      const target = v.gpio !== undefined && Boolean(mover?.targets.has(v.gpio));
      return [
        v.users.length || v.rail ? 'pst-used' : '',
        v.reserved ? 'pst-reserved' : '',
        target ? 'pst-target' : '',
        v.pin === selectedPin ? 'pst-selected' : '',
        (highlight && !lit(v)) || (v.coveredBy && !target) ? 'pst-dim' : '',
        lit(v) ? 'pst-lit' : '',
      ].filter(Boolean).join(' ');
    };
    /** @param {import('../../data/setup/picture.js').PinView} v */
    const pin = (v) => {
      const target = v.gpio !== undefined && mover?.targets.has(v.gpio);
      const label = [`Pin ${v.pin}`, v.name, v.badge, target ? 'move here' : ''].filter(Boolean).join(', ');
      return `<button type="button" class="pst-pin pst-k-${v.kind} ${state(v)}" id="pst-pin-${v.pin}" data-pin="${v.pin}" aria-pressed="${v.pin === selectedPin}" aria-label="${esc(label)}">${v.pin}</button>`;
    };
    /** @param {import('../../data/setup/picture.js').PinView} v @param {'left' | 'right'} side */
    const label = (v, side) => `<div class="pst-label pst-${side} ${state(v)}" data-pin="${v.pin}" aria-hidden="true">
        <span class="pst-pin-name">${esc(v.name)}</span>${v.badge ? `<span class="pst-badge${v.rail ? ' pst-badge-rail' : ''}">${esc(v.badge)}</span>` : ''}
      </div>`;
    const rows = [];
    for (let i = 0; i < views.length; i += 2) rows.push(label(views[i], 'left') + pin(views[i]) + pin(views[i + 1]) + label(views[i + 1], 'right'));

    const withPins = draft.devices
      .filter(({ id }) => result.assignments.some((a) => a.device === id && (a.pin !== undefined || a.how === 'header' || a.rail)))
      .sort((a, b) => DEVICES.indexOf(byId[a.id]) - DEVICES.indexOf(byId[b.id]));
    const chips = withPins.map(({ id }) => `<button type="button" class="pst-chip" data-highlight="${id}" aria-pressed="${highlight === id}">${esc(byId[id].short)}</button>`).join('');
    const legend = KINDS.map(([k, name]) => `<span class="pst-key"><span class="pst-swatch pst-k-${k === 'reserved' ? 'gpio pst-reserved' : k}"></span>${name}</span>`).join('');
    const board = BOARDS[/** @type {keyof typeof BOARDS} */ (draft.board)];

    return `<div class="pst-picture">
      <h3>${esc(board?.name ?? '')} GPIO header</h3>
      <p class="pst-muted">Odd-numbered pins are on the left, even-numbered pins on the right. Click a pin to see what it does. Click a module's pin, then a highlighted free pin, to move it there.</p>
      ${top ? `<p class="pst-note">The ${esc(byId[top].short)} sits on the header and uses the marked pins. Nothing else can be wired to the header.</p>` : ''}
      <div class="pst-chips" role="group" aria-label="Highlight the pins of a module"><span class="pst-muted">Highlight:</span>${chips}</div>
      <div class="pst-pin-details" aria-live="polite">${details(selected)}</div>
      <div class="pst-header" role="group" aria-label="${esc(board?.name ?? '')} GPIO header">${rows.join('')}</div>
      <div class="pst-keys">${legend}</div>
    </div>`;
  };

  /** @param {import('../../data/setup/picture.js').PinView | undefined} v */
  const details = (v) => {
    if (!v) return '<p class="pst-muted">No pin selected.</p>';
    const parts = [`<p class="pst-pin-title"><strong>Pin ${v.pin} · ${esc(v.name)}</strong>${v.functions.length ? ` <span class="pst-muted">(${esc(v.functions.join(', '))})</span>` : ''}</p>`];
    if (v.reserved) parts.push(`<p>${esc(v.note ?? 'Reserved')}. Leave it unconnected.</p>`);
    if (v.rail) {
      const who = v.rail.devices.map((id) => esc(byId[id].short)).join(', ');
      parts.push(v.rail.side === '+'
        ? `<p>Wire this pin to the breadboard's + rail for ${RAIL[v.rail.rail]}. Modules on that rail: ${who}.</p>`
        : `<p>Wire this pin to the − rail beside the ${RAIL[v.rail.rail]} + rail. Modules on that rail: ${who}.</p>`);
    }
    if (v.users.length) {
      parts.push(`<ul>${v.users.map((u) => `<li><strong>${esc(u.short)}</strong> ${esc(u.label)} <span class="pst-muted">(device pin ${esc(u.devicePin)})</span>. ${HOW[u.how] ?? ''}</li>`).join('')}</ul>`);
    } else if (!v.rail && !v.reserved) {
      parts.push(`<p>${v.coveredBy ? `Covered by the ${esc(byId[v.coveredBy].short)}.` : 'Free.'}</p>`);
    }
    const u = v.users.find((x) => x.key === mover?.key);
    if (u && mover) {
      const gpios = [...(v.gpio !== undefined ? [v.gpio] : []), ...mover.targets].sort((a, b) => (pinOfGpio(a) ?? 0) - (pinOfGpio(b) ?? 0));
      const options = gpios.map((g) => `<option value="${g}" ${g === v.gpio ? 'selected' : ''}>GPIO${g} (pin ${pinOfGpio(g)})</option>`).join('');
      const auto = u.how === 'moved' || u.how === 'kept' ? '<option value="auto">Let the planner choose</option>' : '';
      parts.push(`<p class="pst-move"><label for="pst-move">Move ${esc(u.short)} ${esc(u.label)} to:</label>
        <select id="pst-move" data-key="${esc(u.key)}">${options}${auto}</select>
        <span class="pst-muted">${mover.targets.size ? 'Or click a highlighted pin.' : 'No other pin is free for it.'}</span></p>`);
    } else if (v.users.some((x) => x.how === 'fixed')) {
      parts.push('<p class="pst-muted">Fixed pins can\'t be moved.</p>');
    }
    return parts.join('');
  };

  /** @param {import('../../data/setup/allocate.js').Result} result */
  const breadboardNote = (result) => {
    const powered = result.assignments.some((a) => a.type === 'power');
    if (!powered) return '';
    if (!result.breadboard.required) {
      return `<p class="pst-note"><strong>Breadboard (optional).</strong> Each module has its own power pin, so you can wire them straight to the header.</p>`;
    }
    const rails = result.breadboard.rails.map((r) => `<li><strong>${RAIL[r.rail]} rail:</strong> wire header pin ${r.supply} (${RAIL[r.rail]}) to the + rail and pin ${r.ground} (GND) to the − rail. Powers: ${r.devices.map((id) => esc(byId[id].short)).join(', ')}.</li>`).join('');
    return `<div class="pst-note"><p><strong>Breadboard (required).</strong> More than 2 modules take the same supply, and the header has only 2 pins of each, so their power and ground go through breadboard rails:</p><ul>${rails}</ul></div>`;
  };

  /** @param {string} id @param {import('../../data/setup/allocate.js').Result} result */
  const deviceTable = (id, result) => {
    const d = byId[id];
    // In the device's own signal order, however the planner placed them
    const order = (signalsOf(d, draft.devices.find((x) => x.id === id)?.mode) ?? []).map((s) => s.id);
    const mine = result.assignments.filter((a) => a.device === id).sort((a, b) => order.indexOf(a.signal) - order.indexOf(b.signal));
    const rows = mine.map((a) => {
      let where;
      if (a.how === 'header') where = `GPIO${a.gpio} <span class="pst-muted">through the header</span>`;
      else if (a.rail) where = a.type === 'power' ? `Breadboard ${RAIL[a.rail]} rail (+)` : `Breadboard ${RAIL[a.rail]} rail (−)`;
      else if (a.type === 'gpio') where = `Pin ${a.pin} (GPIO${a.gpio})`;
      else where = `Pin ${a.pin} (${a.type === 'ground' ? 'GND' : RAIL[/** @type {'3v3' | '5v'} */ (byId[id].signals?.find((s) => s.id === a.signal)?.power ?? '3v3')]})`;
      const how = a.how === 'moved' ? 'moved by you' : '';
      return `<tr><td>${esc(a.label)}</td><td>${esc(a.devicePin)}</td><td>${where}${how ? ` <span class="pst-muted">(${how})</span>` : ''}</td></tr>`;
    }).join('');
    const connectors = result.connectors.filter((c) => c.device === id).map((c) => esc(c.name)).join(', ');
    return `<div class="pst-device-pins"><h3>${esc(d.short)}</h3>
      ${rows ? `<table><thead><tr><th>Signal</th><th>Device pin</th><th>Raspberry Pi</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
      ${connectors ? `<p class="pst-muted">Uses: ${connectors}</p>` : ''}
    </div>`;
  };

  /** @param {import('../../data/setup/allocate.js').Result} result */
  const actions = (result) => {
    const empty = !draft.devices.length && !draft.track;
    const dirty = !(empty && !saved) && JSON.stringify(draft) !== JSON.stringify(saved);
    const status = message || (saved
      ? (dirty ? 'You have changes that are not saved yet.' : 'Saved. The tutorial shows your setup.')
      : 'No setup saved yet: the tutorial shows everything.');
    return `<div class="pst-actions">
      <button type="button" id="pst-save" ${result.ok && dirty ? '' : 'disabled'}>Save setup</button>
      <button type="button" id="pst-reset-pins" ${Object.keys(draft.moved).length || Object.keys(draft.kept).length ? '' : 'disabled'}>Reset pins</button>
      <button type="button" id="pst-clear" ${saved || draft.devices.length || draft.track ? '' : 'disabled'}>Clear all</button>
      <p class="pst-status" role="status">${esc(status)}${result.ok ? '' : ' Fix the problems above to save.'}</p>
    </div>`;
  };

  root.addEventListener('change', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    message = '';
    if (el.name === 'pst-board') draft = setBoard(draft, el.value);
    else if (el.name === 'pst-track') draft = setTrack(draft, el.value === 'student' || el.value === 'server' ? el.value : null);
    else if (el.type === 'checkbox' && el.dataset.device) draft = toggleDevice(draft, el.dataset.device, el.checked);
    else if (el.name.startsWith('pst-mode-') && el.dataset.device) draft = setMode(draft, el.dataset.device, el.value);
    else if (el.id === 'pst-move' && el.dataset.key) {
      draft = moveSignal(draft, el.dataset.key, el.value === 'auto' ? undefined : Number(el.value));
      // Follow the signal to its new pin
      const a = allocate(toSelection(draft)).assignments.find((x) => `${x.device}.${x.signal}` === el.dataset.key);
      selectedPin = a?.pin ?? selectedPin;
    }
    render();
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selectedPin !== null) {
      selectedPin = null;
      render();
    }
  });

  root.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const pinEl = target.closest('[data-pin]');
    const chip = target.closest('[data-highlight]');
    if (pinEl instanceof HTMLElement) {
      const p = Number(pinEl.dataset.pin);
      const gpio = HEADER.find((h) => h.pin === p)?.gpio;
      if (mover && gpio !== undefined && mover.targets.has(gpio)) {
        draft = moveSignal(draft, mover.key, gpio);
        message = '';
        selectedPin = p;
      } else {
        selectedPin = selectedPin === p ? null : p;
      }
      render();
      return;
    }
    if (chip instanceof HTMLElement) {
      highlight = highlight === chip.dataset.highlight ? null : chip.dataset.highlight ?? null;
      render();
      return;
    }
    const id = target.closest('button')?.id;
    if (id === 'pst-save') {
      const stored = save(storage, keepPins(draft));
      if (stored) { saved = stored; draft = stored; message = 'Saved. The tutorial now shows your setup.'; }
      else message = 'Your browser blocks saving for this site, so the setup could not be saved.';
    } else if (id === 'pst-reset-pins') {
      draft = resetPins(draft);
      message = '';
    } else if (id === 'pst-clear') {
      clear(storage);
      saved = null;
      draft = emptySetup();
      selectedPin = null;
      message = 'Cleared. The tutorial shows everything again.';
    } else {
      return;
    }
    render();
  });

  render();
}
