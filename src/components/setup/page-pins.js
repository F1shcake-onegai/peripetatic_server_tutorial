// @ts-check
// Setup page 3 (/setup/pins/): the pins the planner gave. The header map is on the left
// (pinout.xyz style), the components on the right, with a dropdown on every pin that can
// move. Hovering or clicking a component's name greys out every other pin; clicking a pin
// on the map greys out the other modules and lights the free pins it can move to.
import {
  DEVICES, BOARDS, HEADER, allocate, toSelection, keepPins, moveOptions, moveSignal, resetPins,
  pinViews, pinOfGpio, signalsOf, RAIL_NAMES, load, save, clear, clearDraft,
} from '../../data/setup/index.js';
import { esc, urlsOf, currentSetup, keepDraft, stepper, chooseFirst, local, session } from './common.js';
import { BREADBOARD, alignBadges, headerMap, moduleColours } from './header-map.js';

/** @typedef {import('../../data/setup/store.js').Setup} Setup */
/** @typedef {import('../../data/setup/allocate.js').Result} Result */
/** @typedef {import('../../data/setup/picture.js').PinView} PinView */

const byId = Object.fromEntries(DEVICES.map((d) => [d.id, d]));
/** A setup as text that doesn't depend on key order, to compare two setups @param {Setup} s */
const canonical = (s) => {
  const sorted = (/** @type {Record<string, number>} */ o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({ ...s, moved: sorted(s.moved), kept: sorted(s.kept) });
};
/** @param {HTMLElement} root */
export function mountPins(root) {
  const urls = urlsOf(root);
  let setup = currentSetup();
  let saved = load(local);
  let message = '';
  /** Component whose name the pointer or keyboard is on @type {string | null} */
  let hovered = null;
  /** Component whose name was clicked @type {string | null} */
  let pinned = null;
  /** Physical pin clicked on the map @type {number | null} */
  let selectedPin = null;
  /** The movable signal on the selected pin and the GPIOs it can move to @type {{key: string, targets: Set<number>} | null} */
  let mover = null;
  /** @type {PinView[]} */
  let views = [];
  /** Colour of each module with header pins: 1-4 in catalog order, 0 (grey) after that @type {Map<string, number>} */
  let colours = new Map();
  /** @param {string} id */
  const colourOf = (id) => colours.get(id) ?? 0;

  /** GPIOs a signal can move to, besides its own @param {string} key */
  const targetsOf = (key) => {
    if (!setup) return new Set();
    const own = allocate(toSelection(setup)).assignments.find((a) => `${a.device}.${a.signal}` === key)?.gpio;
    return new Set(moveOptions(toSelection(keepPins(setup)), key).filter((g) => g !== own));
  };

  // --- Rendering ------------------------------------------------------------------

  const render = () => {
    const focused = document.activeElement?.id;
    if (!setup?.track) {
      root.innerHTML = stepper(3, setup, urls) + chooseFirst(urls);
      enableNext(false);
      return;
    }
    const s = setup;
    const result = allocate(toSelection(s));
    views = pinViews(toSelection(s), result);
    colours = moduleColours(views);
    const board = BOARDS[/** @type {keyof typeof BOARDS} */ (s.board)];
    const wired = result.assignments.some((a) => a.pin !== undefined || a.how === 'header');

    root.innerHTML = `
      ${stepper(3, s, urls)}
      <div class="pst-layout${wired ? '' : ' pst-layout-single'}">
        ${wired ? `<div class="pst-map">${headerMap(views, colours, board?.name ?? '')}</div>` : ''}
        <div class="pst-parts">
          ${result.errors.length ? `<ul class="pst-problems">${result.errors.map((e) => `<li>${esc(e.message)}</li>`).join('')}</ul>` : ''}
          ${s.devices.length ? '' : '<p class="pst-muted">No peripherals chosen.</p>'}
          ${breadboard(result)}
          ${[...s.devices].sort((a, b) => DEVICES.indexOf(byId[a.id]) - DEVICES.indexOf(byId[b.id])).map(({ id, mode }) => part(id, mode, result)).join('')}
        </div>
      </div>
      ${actions(result)}`;
    if (focused) document.getElementById(focused)?.focus();
    alignBadges(root);
    applyFocus();
    enableNext(result.ok && !isDirty(result));
  };

  // Starlight's Next link (0. Hardware Preparation) works only while the setup is saved
  const next = document.querySelector('.pagination-links a[rel="next"]');
  const nextHref = next?.getAttribute('href');
  /** @param {boolean} on */
  const enableNext = (on) => {
    if (!(next instanceof HTMLAnchorElement) || !nextHref) return;
    if (on) {
      next.setAttribute('href', nextHref);
      next.removeAttribute('role');
      next.removeAttribute('aria-disabled');
    } else {
      next.removeAttribute('href');
      next.setAttribute('role', 'link');
      next.setAttribute('aria-disabled', 'true');
    }
    next.classList.toggle('pst-next-off', !on);
  };

  document.fonts?.ready.then(() => alignBadges(root));

  /** @param {Result} result */
  const breadboard = (result) => {
    if (!result.breadboard.required) return '';
    const rows = result.breadboard.rails.map((r) => `
      <tr><td>${RAIL_NAMES[r.rail]} rail (+)</td><td>Pin ${r.supply} · ${RAIL_NAMES[r.rail]}</td></tr>
      <tr><td>${RAIL_NAMES[r.rail]} rail (−)</td><td>Pin ${r.ground} · GND</td></tr>
      <tr class="pst-row-note"><td colspan="2">On the ${RAIL_NAMES[r.rail]} rail: ${r.devices.map((id) => esc(byId[id].short)).join(', ')}</td></tr>`).join('');
    return `<section class="pst-part" data-device="${BREADBOARD}">
      <h3><button type="button" class="pst-part-name" id="pst-name-${BREADBOARD}" data-focus="${BREADBOARD}"><span class="pst-dot pst-dot-rail" aria-hidden="true"></span>Breadboard</button></h3>
      <table><thead><tr><th>Rail</th><th>Raspberry Pi</th></tr></thead><tbody>${rows}</tbody></table>
    </section>`;
  };

  /** @param {string} id @param {string | undefined} mode @param {Result} result */
  const part = (id, mode, result) => {
    const d = byId[id];
    const order = (signalsOf(d, mode) ?? []).map((x) => x.id);
    const mine = result.assignments.filter((a) => a.device === id).sort((a, b) => order.indexOf(a.signal) - order.indexOf(b.signal));
    const movable = new Set(views.flatMap((v) => v.users).filter((u) => u.device === id && u.movable).map((u) => u.key));
    const rows = mine.map((a) => {
      const key = `${a.device}.${a.signal}`;
      let where;
      if (a.rail) where = `Breadboard ${RAIL_NAMES[a.rail]} rail (${a.type === 'power' ? '+' : '−'})`;
      else if (a.type === 'gpio' && movable.has(key) && a.gpio !== undefined) {
        const gpios = [a.gpio, ...targetsOf(key)].sort((x, y) => (pinOfGpio(x) ?? 0) - (pinOfGpio(y) ?? 0));
        where = `<select id="pst-move-${key.replace('.', '-')}" data-key="${esc(key)}" aria-label="${esc(`${d.short} ${a.label}`)}">
          ${gpios.map((g) => `<option value="${g}" ${g === a.gpio ? 'selected' : ''}>Pin ${pinOfGpio(g)} · GPIO${g}</option>`).join('')}
        </select>${a.how === 'moved' ? ' <span class="pst-muted">moved</span>' : ''}`;
      } else if (a.type === 'gpio') where = `Pin ${a.pin ?? pinOfGpio(/** @type {number} */ (a.gpio))} · GPIO${a.gpio}`;
      else {
        const power = signalsOf(d, mode)?.find((x) => x.id === a.signal)?.power ?? '3v3';
        where = `Pin ${a.pin} · ${a.type === 'ground' ? 'GND' : RAIL_NAMES[power]}`;
      }
      return `<tr data-key="${esc(key)}"><td>${esc(a.label)}</td><td>${esc(a.devicePin)}</td><td>${where}</td></tr>`;
    }).join('');
    const uses = result.connectors.filter((c) => c.device === id).map((c) => c.name);
    const notes = result.warnings.filter((w) => w.device === id).map((w) => w.reason ?? w.message);
    const bad = result.errors.some((e) => e.device === id);
    const dot = colours.has(id) ? `<span class="pst-dot pst-m${colourOf(id)}" aria-hidden="true"></span>` : '';
    return `<section class="pst-part${bad ? ' pst-bad' : ''}" data-device="${id}">
      <h3><button type="button" class="pst-part-name" id="pst-name-${id}" data-focus="${id}">${dot}${esc(d.short)}</button></h3>
      ${rows ? `<table><thead><tr><th>Signal</th><th>Device pin</th><th>Raspberry Pi</th></tr></thead><tbody>${rows}</tbody></table>` : ''}
      ${uses.length ? `<p class="pst-muted">Using ${esc(uses.join(', '))}</p>` : ''}
      ${notes.map((n) => `<p class="pst-muted">${esc(n)}</p>`).join('')}
    </section>`;
  };

  /** Whether the page differs from the saved setup @param {Result} result */
  const isDirty = (result) => !saved || canonical(keepPins(/** @type {Setup} */ (setup), result)) !== canonical(saved);

  /** @param {Result} result */
  const actions = (result) => {
    const s = /** @type {Setup} */ (setup);
    const dirty = isDirty(result);
    const status = message || (!result.ok ? 'Fix the pins marked in red to save.' : dirty ? 'Not saved yet.' : 'Saved.');
    return `<div class="pst-nav">
      <a class="pst-btn" href="${esc(urls.peripherals)}">Back</a>
      <button type="button" class="pst-btn" id="pst-reset-pins" ${Object.keys(s.moved).length || Object.keys(s.kept).length ? '' : 'disabled'}>Reset pins</button>
      <button type="button" class="pst-btn" id="pst-clear">Clear all</button>
      <button type="button" class="pst-btn pst-primary" id="pst-save" ${result.ok && dirty ? '' : 'disabled'}>Save setup</button>
      <p class="pst-status" role="status">${esc(status)}</p>
    </div>`;
  };

  // --- Greying out and highlighting, without re-rendering -------------------------

  const applyFocus = () => {
    const pinUsers = selectedPin ? (views[selectedPin - 1]?.users ?? []) : [];
    const pinView = selectedPin ? views[selectedPin - 1] : undefined;
    const owners = new Set([...pinUsers.map((u) => u.device), ...(pinView?.rail ? [...pinView.rail.devices, BREADBOARD] : [])]);
    const focus = hovered ?? (selectedPin ? null : pinned);
    const mode = hovered || (!selectedPin && pinned) ? 'device' : selectedPin ? 'pin' : 'none';
    root.querySelectorAll('.pst-header [data-pin]').forEach((el) => {
      const e = /** @type {HTMLElement} */ (el);
      const p = Number(e.dataset.pin);
      const devs = (e.dataset.devices ?? '').split(' ').filter(Boolean);
      const gpio = HEADER[p - 1]?.gpio;
      const target = mode === 'pin' && gpio !== undefined && Boolean(mover?.targets.has(gpio));
      const lit = mode === 'device' ? devs.includes(/** @type {string} */ (focus))
        : mode === 'pin' ? p === selectedPin || devs.some((d) => owners.has(d)) : false;
      e.classList.toggle('pst-lit', lit);
      e.classList.toggle('pst-target', target);
      e.classList.toggle('pst-dim', mode !== 'none' && !lit && !target);
      e.classList.toggle('pst-selected', mode === 'pin' && p === selectedPin);
      if (e.tagName === 'BUTTON') e.setAttribute('aria-pressed', String(mode === 'pin' && p === selectedPin));
    });
    root.querySelectorAll('.pst-part').forEach((el) => {
      const e = /** @type {HTMLElement} */ (el);
      const id = e.dataset.device ?? '';
      const on = mode === 'device' ? id === focus : mode === 'pin' ? owners.has(id) : false;
      e.classList.toggle('pst-part-on', on);
      e.classList.toggle('pst-part-dim', mode !== 'none' && !on);
    });
    root.querySelectorAll('.pst-part-name').forEach((el) => {
      const e = /** @type {HTMLElement} */ (el);
      e.setAttribute('aria-pressed', String(pinned === e.dataset.focus && !selectedPin));
    });
    const keys = new Set(pinUsers.map((u) => u.key));
    root.querySelectorAll('tr[data-key]').forEach((el) => el.classList.toggle('pst-row-on', keys.has(/** @type {HTMLElement} */ (el).dataset.key ?? '')));
  };

  /** @param {number | null} p */
  const selectPin = (p) => {
    selectedPin = p;
    const movable = p ? views[p - 1]?.users.find((u) => u.movable) : undefined;
    mover = movable ? { key: movable.key, targets: targetsOf(movable.key) } : null;
    if (p) pinned = null;
    applyFocus();
  };

  // --- Events ---------------------------------------------------------------------

  root.addEventListener('mouseover', (e) => {
    const name = /** @type {HTMLElement} */ (e.target).closest('[data-focus]');
    const next = name instanceof HTMLElement ? name.dataset.focus ?? null : null;
    if (next !== hovered) { hovered = next; applyFocus(); }
  });
  root.addEventListener('focusin', (e) => {
    const name = /** @type {HTMLElement} */ (e.target).closest('[data-focus]');
    if (name instanceof HTMLElement) { hovered = name.dataset.focus ?? null; applyFocus(); }
  });
  root.addEventListener('focusout', (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest('[data-focus]')) { hovered = null; applyFocus(); }
  });
  root.addEventListener('mouseleave', () => { if (hovered) { hovered = null; applyFocus(); } });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (selectedPin || pinned)) { pinned = null; selectPin(null); }
  });

  root.addEventListener('change', (e) => {
    const el = /** @type {HTMLSelectElement} */ (e.target);
    if (!setup || !el.dataset.key) return;
    setup = moveSignal(setup, el.dataset.key, Number(el.value));
    keepDraft(setup);
    message = '';
    selectedPin = null;
    mover = null;
    render();
  });

  root.addEventListener('click', (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const pinEl = target.closest('.pst-header [data-pin]');
    const name = target.closest('[data-focus]');
    if (pinEl instanceof HTMLElement && setup) {
      const p = Number(pinEl.dataset.pin);
      const gpio = HEADER[p - 1]?.gpio;
      if (mover && gpio !== undefined && mover.targets.has(gpio)) {
        setup = moveSignal(setup, mover.key, gpio);
        keepDraft(setup);
        message = '';
        render();
        selectPin(p);
      } else {
        const used = views[p - 1]?.users.length || views[p - 1]?.rail;
        selectPin(selectedPin === p || !used ? null : p);
      }
      return;
    }
    if (name instanceof HTMLElement) {
      const id = name.dataset.focus ?? null;
      pinned = pinned === id ? null : id;
      // Clicking toggles; the pointer is still on the name, so show the click's result
      hovered = null;
      selectPin(null);
      return;
    }
    const button = target.closest('button')?.id;
    if (!setup) return;
    if (button === 'pst-save') {
      const stored = save(local, keepPins(setup));
      if (stored) {
        saved = stored;
        setup = stored;
        clearDraft(session);
        message = 'Saved. The tutorial now shows your setup.';
      } else {
        message = 'Your browser blocks saving for this site.';
      }
      render();
    } else if (button === 'pst-reset-pins') {
      setup = resetPins(setup);
      keepDraft(setup);
      message = '';
      selectedPin = null;
      mover = null;
      render();
    } else if (button === 'pst-clear') {
      clear(local);
      clearDraft(session);
      window.location.href = urls.start;
    }
  });

  render();
}
