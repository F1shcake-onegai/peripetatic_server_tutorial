// @ts-check
// The "Your setup" page: choose the board, track and hardware; see the pins the planner
// gives; save, reset pins or clear. Everything runs in the browser; the setup is saved in
// localStorage (src/data/setup/store.js).
import {
  DEVICES, BOARDS, allocate, availability, emptySetup, load, save, clear, safeLocalStorage, toSelection,
  keepPins, devicesFor, setBoard, setTrack, toggleDevice, setMode, resetPins,
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
const RAIL = { '3v3': '3V3', '5v': '5V' };
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

  const render = () => {
    const focused = document.activeElement?.id;
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
      ${tables}
    </section>`;
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
    const rows = result.assignments.filter((a) => a.device === id).map((a) => {
      let where;
      if (a.how === 'header') where = `GPIO${a.gpio} <span class="pst-muted">through the header</span>`;
      else if (a.rail) where = a.type === 'power' ? `Breadboard ${RAIL[a.rail]} rail (+)` : `Breadboard ${RAIL[a.rail]} rail (−)`;
      else if (a.type === 'gpio') where = `Pin ${a.pin} (GPIO${a.gpio})`;
      else where = `Pin ${a.pin} (${a.type === 'ground' ? 'GND' : RAIL[/** @type {'3v3' | '5v'} */ (byId[id].signals?.find((s) => s.id === a.signal)?.power ?? '3v3')]})`;
      const how = { moved: 'moved by you', kept: 'kept from your saved setup' }[a.how] ?? '';
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
    render();
  });

  root.addEventListener('click', (e) => {
    const id = /** @type {HTMLElement} */ (e.target).closest('button')?.id;
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
      message = 'Cleared. The tutorial shows everything again.';
    } else {
      return;
    }
    render();
  });

  render();
}
