// @ts-check
// Chapter 0 with a saved setup: the wiring steps (src/data/setup/wiring.js), one step at a
// time, with Back / Next and a "Done" tick. Ticks and the step you're on are kept in this
// browser; a tick belongs to its wire, so moving a pin later un-ticks only that wire.
// Chapter 0's own blocks are reused where they're marked with <WiringSource> (see that
// component): the power-off sentence, the ESP32 notes and the AI HAT+ 2 mounting steps.
import { DEVICES, BOARDS, allocate, toSelection, pinViews, load, wiringSteps, RAIL_NAMES } from '../../data/setup/index.js';
import { esc, local } from './common.js';
import { alignBadges, headerMap, moduleColours } from './header-map.js';

/** @typedef {import('../../data/setup/wiring.js').Step} Step */
/** @typedef {import('../../data/setup/devices.js').Device} Device */

const PROGRESS_KEY = 'pst-wiring';
const byId = Object.fromEntries(DEVICES.map((d) => [d.id, d]));
const HEADINGS = 'h1, h2, h3, h4, h5, h6';

/**
 * @typedef {object} View   One step on the page
 * @property {string} key
 * @property {string} [device]     For the coloured dot and name above the title
 * @property {string} [group]      Name above the title, e.g. 'Breadboard'
 * @property {string} [count]      e.g. 'wire 2 of 3'
 * @property {Node[]} title
 * @property {Node[]} body
 * @property {number} [pin]        Header pin to light on the map
 */

/** @returns {{at: string | null, done: string[]}} */
function readProgress() {
  try {
    const p = JSON.parse(local?.getItem(PROGRESS_KEY) ?? 'null');
    if (p && Array.isArray(p.done)) return { at: typeof p.at === 'string' ? p.at : null, done: p.done.filter((k) => typeof k === 'string') };
  } catch {
    // blocked storage or unreadable JSON: start from the beginning
  }
  return { at: null, done: [] };
}

/** @param {{at: string | null, done: string[]}} p */
function writeProgress(p) {
  try {
    local?.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // blocked storage: progress lasts until the page is left
  }
}

/** @param {string} tag @param {string} [cls] @param {(Node | string)[]} [children] */
function el(tag, cls, children = []) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...children);
  return e;
}

/** Copies without ids, so nothing on the page has the same id twice @param {Node} node */
function copy(node) {
  const c = node.cloneNode(true);
  if (c instanceof Element) for (const e of [c, ...c.querySelectorAll('[id]')]) e.removeAttribute('id');
  return c;
}

/**
 * Chapter 0's blocks marked with this id, copied and joined; the first heading among them
 * becomes the title.
 * @param {string} id
 * @returns {{title: Node[] | null, nodes: Node[], steps: boolean, inline: boolean} | null}
 */
function source(id) {
  const blocks = [...document.querySelectorAll(`[data-wiring-source="${CSS.escape(id)}"]`)];
  if (!blocks.length) return null;
  /** @type {Node[] | null} */ let title = null;
  /** @type {Node[]} */ const nodes = [];
  for (const block of blocks) {
    for (const child of block.childNodes) {
      if (child.nodeType === Node.TEXT_NODE && !child.textContent?.trim() && block.tagName !== 'SPAN') continue;
      const heading = child instanceof Element ? (child.matches(HEADINGS) ? child : child.matches('.sl-heading-wrapper') ? child.querySelector(HEADINGS) : null) : null;
      if (heading) {
        title ??= [...heading.childNodes].map(copy);
        continue;
      }
      nodes.push(copy(child));
    }
  }
  return { title, nodes, steps: blocks.some((b) => b.hasAttribute('data-wiring-steps')), inline: blocks.every((b) => b.tagName === 'SPAN') };
}

/** @param {string} text */
const p = (text) => el('p', '', [text]);

/** @param {HTMLElement} root */
export function mountWiring(root) {
  const setup = load(local);
  if (!setup) return; // without a setup, chapter 0 shows its own content
  const selection = toSelection(setup);
  const result = allocate(selection);
  if (!result.ok) {
    root.innerHTML = `<p>Your setup has a problem. <a href="${esc(root.dataset.pins ?? '')}">Fix it on the Assigned pins page.</a></p>`;
    return;
  }
  const views = pinViews(selection, result);
  const colours = moduleColours(views);
  const board = BOARDS[/** @type {keyof typeof BOARDS} */ (setup.board)];

  // --- The steps -------------------------------------------------------------------

  /** @type {View[]} */
  const list = [];
  /** @type {Set<string>} */
  const introduced = new Set();
  const shortOf = (/** @type {string} */ id) => byId[id]?.short ?? id;
  /** "Pi pin 15 (GPIO22)" @param {number} pin */
  const piPin = (pin) => `Pi pin ${pin} (${views[pin - 1]?.name ?? ''})`;
  /** A wire, "from → to" @param {string} from @param {string} to */
  const wire = (from, to) => el('p', 'pst-wire', [el('strong', '', [from]), ' → ', el('strong', '', [to])]);

  /** Where a pin sits on the module's own headers, e.g. 'IO10 (J1-11)' @param {Device} dev @param {string} name */
  const onModule = (dev, name) => {
    const at = (dev.pinout ?? []).filter((x) => x.name === name).map((x) => `${x.header}-${x.no}`);
    if (!at.length) return name;
    return `${name} (${at.length > 1 ? `${at.slice(0, -1).join(', ')} or ${at.at(-1)}` : at[0]})`;
  };

  for (const s of wiringSteps(selection, result)) {
    const dev = s.device ? byId[s.device] : undefined;
    if (s.kind === 'start') {
      const src = source('power-off');
      list.push({
        key: s.key,
        title: [document.createTextNode('Before you start')],
        body: src ? [src.inline ? el('p', '', src.nodes) : el('div', '', src.nodes)] : [p('Disconnect the Pi from power before you connect anything.')],
      });
    } else if (s.kind === 'part' && dev) {
      const src = source(dev.id);
      const items = src?.steps ? [...src.nodes].flatMap((n) => (n instanceof Element && n.matches('ol, ul') ? [...n.children].filter((c) => c.tagName === 'LI') : [])) : [];
      if (src && items.length) {
        items.forEach((li, i) => list.push({
          key: `${s.key}:${i + 1}`, device: dev.id, count: `${i + 1} of ${items.length}`,
          title: (src.title ?? [document.createTextNode(dev.name)]).map(copy),
          body: [el('div', '', [...li.childNodes].map(copy))],
        }));
      } else if (src) {
        list.push({ key: s.key, device: dev.id, title: src.title ?? [document.createTextNode(dev.name)], body: src.nodes });
      } else {
        const how = {
          header: "Fit it onto the Pi's GPIO header.",
          pcie: "Connect it to the Pi's PCIe connector.",
          camera: `Connect its ribbon cable to the Pi's ${s.connector} connector.`,
          display: `Connect its ribbon cable to the Pi's ${s.connector} connector.`,
          usb: 'Plug it into a USB port on the Pi.',
        }[s.how ?? 'header'];
        list.push({ key: s.key, device: dev.id, title: [document.createTextNode(dev.name)], body: [p(how)] });
      }
    } else if (s.kind === 'breadboard') {
      if (s.required) {
        list.push({
          key: s.key,
          title: [document.createTextNode('Breadboard')],
          body: [
            ...(s.over ?? []).map((o) => p(`The Pi has two ${RAIL_NAMES[o.supply]} pins, and ${o.modules} modules need ${RAIL_NAMES[o.supply]}.`)),
            p("Modules that share a supply take power and ground from the breadboard's rails. A module alone on its supply is wired straight to the Pi."),
          ],
        });
      } else {
        list.push({
          key: s.key,
          title: [document.createTextNode('Breadboard (optional)')],
          body: [p('You can push the modules into a breadboard to hold them. The wires below still go straight to the Pi.')],
        });
      }
    } else if (s.kind === 'rail' && s.rail && s.pin) {
      const rail = `${RAIL_NAMES[s.rail]} rail (${s.side})`;
      list.push({ key: s.key, group: 'Breadboard', title: [document.createTextNode(rail)], body: [wire(piPin(s.pin), rail)], pin: s.pin });
    } else if (s.kind === 'wire' && dev) {
      // A module's own notes from chapter 0 (e.g. the ESP32's) come before its first wire
      if (!introduced.has(dev.id)) {
        introduced.add(dev.id);
        const src = source(dev.id);
        const mode = setup.devices.find((d) => d.id === dev.id)?.mode;
        const extra = mode ? source(`${dev.id}:${mode}`) : null;
        if (src || extra) {
          list.push({
            key: `intro:${dev.id}${mode ? `:${mode}` : ''}`, device: dev.id,
            title: src?.title ?? extra?.title ?? [document.createTextNode(dev.name)],
            body: [...(src?.nodes ?? []), ...(extra?.nodes ?? [])],
          });
        }
      }
      const to = s.rail ? `${RAIL_NAMES[s.rail]} rail (${s.side}) on the breadboard` : piPin(/** @type {number} */ (s.pin));
      list.push({
        key: s.key, device: dev.id, count: `wire ${s.index} of ${s.count}`,
        title: [document.createTextNode(s.label ?? '')],
        body: [wire(onModule(dev, s.devicePin ?? ''), to)],
        ...(s.pin ? { pin: s.pin } : {}),
      });
    } else if (s.kind === 'usb' && dev) {
      list.push({ key: s.key, device: dev.id, title: [document.createTextNode('USB cable')], body: [p(`Connect the ${shortOf(dev.id)} to a USB port on the Pi with a USB cable.`)] });
    }
  }
  const total = list.length;
  const keys = new Set(list.map((v) => v.key));

  // --- Progress --------------------------------------------------------------------

  const saved = readProgress();
  const done = new Set(saved.done.filter((k) => keys.has(k)));
  /** Index of the step shown; `total` is the list of all steps at the end */
  let at = saved.at === 'all' ? total : list.findIndex((v) => v.key === saved.at);
  if (at < 0) {
    at = list.findIndex((v) => !done.has(v.key));
    if (at < 0) at = total;
  }
  const keep = () => writeProgress({ at: at === total ? 'all' : list[at].key, done: [...done] });

  // --- Page ------------------------------------------------------------------------

  /** @param {View} v @param {number} i */
  const stepEl = (v, i) => {
    const head = el('p', 'pst-wstep-head not-content', [`Step ${i + 1} of ${total}`]);
    if (v.device || v.group) {
      head.append(' · ');
      if (v.device && colours.has(v.device)) head.append(el('span', `pst-dot pst-m${colours.get(v.device)}`));
      head.append(v.device ? shortOf(v.device) : (v.group ?? ''));
    }
    if (v.count) head.append(` · ${v.count}`);
    const title = el('h3', 'pst-wstep-title', v.title);
    title.tabIndex = -1;
    const text = el('div', 'pst-wstep-text', [head, title, el('div', 'pst-wstep-body', v.body)]);
    const step = el('section', 'pst-wstep', [text]);
    step.dataset.key = v.key;
    if (v.pin) {
      const map = el('div', 'pst-wstep-map not-content');
      map.setAttribute('aria-hidden', 'true');
      map.innerHTML = headerMap(views, colours, board?.name ?? '', { interactive: false, title: false });
      // Only this wire's pin is lit and keeps its badges, which keeps the map narrow
      for (const e of /** @type {NodeListOf<HTMLElement>} */ (map.querySelectorAll('[data-pin]'))) {
        const lit = Number(e.dataset.pin) === v.pin;
        e.classList.toggle('pst-lit', lit);
        e.classList.toggle('pst-dim', !lit);
        if (!lit && e.classList.contains('pst-label')) {
          e.removeAttribute('title');
          for (const b of e.querySelectorAll('.pst-badge')) b.remove();
        }
      }
      step.append(map);
      step.classList.add('pst-wstep-wired');
    }
    step.hidden = true;
    return step;
  };

  const steps = list.map(stepEl);
  /** A step's title as plain text (without footnote markers) @param {View} v */
  const plainTitle = (v) => {
    const t = el('span', '', v.title.map(copy));
    for (const sup of t.querySelectorAll('sup')) sup.remove();
    return t.textContent ?? '';
  };
  const all = el('section', 'pst-wstep pst-wstep-all', [
    el('p', 'pst-wstep-head not-content', [`${total} steps`]),
    el('h3', 'pst-wstep-title', ['All steps']),
    el('ol', 'pst-wiring-list not-content', list.map((v, i) => {
      const b = el('button', 'pst-wiring-item', [
        el('span', 'pst-wiring-mark', []),
        el('span', '', [
          `${i + 1}. `,
          ...(v.device ? [shortOf(v.device), ' · '] : v.group ? [v.group, ' · '] : []),
          plainTitle(v),
          ...(v.count ? [` (${v.count})`] : []),
        ]),
      ]);
      b.setAttribute('type', 'button');
      b.dataset.goto = String(i);
      return el('li', '', [b]);
    })),
  ]);
  all.hidden = true;
  all.querySelector('h3')?.setAttribute('tabindex', '-1');

  root.innerHTML = '';
  const bar = el('div', 'pst-wiring-bar not-content');
  bar.innerHTML = `<p class="pst-wiring-count" role="status"></p>
    <div class="pst-wiring-meter" aria-hidden="true"><span></span></div>
    <button type="button" class="pst-btn" id="pst-wiring-restart">Start over</button>`;
  const controls = el('div', 'pst-wiring-controls not-content');
  controls.innerHTML = `<label class="pst-done"><input type="checkbox" id="pst-wiring-done"> Done</label>
    <div class="pst-nav">
      <button type="button" class="pst-btn" id="pst-wiring-back">Back</button>
      <button type="button" class="pst-btn pst-primary" id="pst-wiring-next">Next</button>
      <button type="button" class="pst-btn pst-primary" id="pst-wiring-all">All steps</button>
    </div>`;
  root.append(bar, el('div', 'pst-wsteps', [...steps, all]));
  // Footnote markers in the steps count as shown (src/scripts/setup-runtime.js)
  document.dispatchEvent(new Event('pst:content'));

  const q = (/** @type {string} */ id) => /** @type {HTMLInputElement} */ (controls.querySelector(`#${id}`));
  const tick = q('pst-wiring-done');
  const back = q('pst-wiring-back');
  const next = q('pst-wiring-next');
  const toAll = q('pst-wiring-all');

  /** @param {boolean} [focus] */
  const show = (focus = false) => {
    steps.forEach((s, i) => { s.hidden = i !== at; });
    all.hidden = at !== total;
    // Done / Back / Next sit right under the step's text, above its map
    (at < total ? steps[at].querySelector('.pst-wstep-text') ?? steps[at] : all).append(controls);
    for (const li of all.querySelectorAll('.pst-wiring-item')) {
      const i = Number(/** @type {HTMLElement} */ (li).dataset.goto);
      li.classList.toggle('pst-wiring-done', done.has(list[i].key));
      /** @type {HTMLElement} */ (li).setAttribute('aria-label', `${li.textContent?.trim()}${done.has(list[i].key) ? ', done' : ''}`);
    }
    const count = root.querySelector('.pst-wiring-count');
    if (count) count.textContent = `Done: ${done.size} of ${total}`;
    const meter = /** @type {HTMLElement | null} */ (root.querySelector('.pst-wiring-meter span'));
    if (meter) meter.style.width = `${total ? (100 * done.size) / total : 0}%`;
    const onStep = at < total;
    tick.closest('label')?.toggleAttribute('hidden', !onStep);
    tick.checked = onStep && done.has(list[at].key);
    back.disabled = at === 0;
    next.hidden = !onStep || at === total - 1;
    toAll.hidden = onStep && at !== total - 1;
    toAll.textContent = onStep ? 'All steps' : 'Back to step 1';
    alignBadges(root);
    if (focus) {
      const current = at < total ? steps[at] : all;
      /** @type {HTMLElement | null} */ (current.querySelector('.pst-wstep-title'))?.focus({ preventScroll: true });
      if (root.getBoundingClientRect().top < 0) root.scrollIntoView({ block: 'start' });
    }
    keep();
  };
  /** @param {number} i */
  const go = (i) => {
    at = Math.max(0, Math.min(total, i));
    show(true);
  };

  root.addEventListener('change', (e) => {
    if (e.target !== tick || at >= total) return;
    if (tick.checked) done.add(list[at].key);
    else done.delete(list[at].key);
    show();
  });
  root.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const id = t.closest('button')?.id;
    if (id === 'pst-wiring-back') go(at - 1);
    else if (id === 'pst-wiring-next') go(at + 1);
    else if (id === 'pst-wiring-all') go(at < total ? total : 0);
    else if (id === 'pst-wiring-restart') {
      done.clear();
      go(0);
    } else {
      const item = /** @type {HTMLElement | null} */ (t.closest('[data-goto]'));
      if (item) go(Number(item.dataset.goto));
    }
  });
  document.fonts?.ready.then(() => alignBadges(root));
  show();
}
