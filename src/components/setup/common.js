// @ts-check
// Shared by the three setup pages: /setup/ (Raspberry Pi and track), /setup/peripherals/
// and /setup/pins/. The setup being edited goes from page to page as a draft in
// sessionStorage; only "Save setup" on the last page writes the setup the tutorial reads.
import { load, loadDraft, saveDraft, safeLocalStorage, safeSessionStorage, allocate, toSelection } from '../../data/setup/index.js';

/** @typedef {import('../../data/setup/store.js').Setup} Setup */

/** @param {unknown} s */
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

export const local = safeLocalStorage();
export const session = safeSessionStorage();

/** Page addresses, from the app's data attributes @param {HTMLElement} root */
export function urlsOf(root) {
  const d = root.dataset;
  return { home: d.home ?? '/', start: d.start ?? '/', peripherals: d.peripherals ?? '/', pins: d.pins ?? '/' };
}

/** The setup being edited: the draft, else the saved setup. @returns {Setup | null} */
export function currentSetup() {
  return loadDraft(session) ?? load(local);
}

/** @param {Setup} setup */
export function keepDraft(setup) {
  saveDraft(session, setup);
}

/**
 * The three steps at the top of each page; steps that can be reached are links.
 * @param {1 | 2 | 3} current
 * @param {Setup | null} setup
 * @param {ReturnType<typeof urlsOf>} urls
 */
export function stepper(current, setup, urls) {
  const chosen = Boolean(setup?.track);
  const fits = chosen && setup ? allocate(toSelection(setup)).ok : false;
  const steps = /** @type {const} */ ([
    [1, 'Raspberry Pi and track', urls.start, true],
    [2, 'Peripherals', urls.peripherals, chosen],
    [3, 'Assigned pins', urls.pins, fits],
  ]);
  return `<ol class="pst-steps">${steps.map(([n, name, href, open]) => {
    const label = `<span class="pst-step-no">${n}</span> ${name}`;
    const cls = `pst-step${n === current ? ' pst-step-current' : ''}${open ? '' : ' pst-step-closed'}`;
    return n === current || !open
      ? `<li class="${cls}"${n === current ? ' aria-current="step"' : ''}>${label}</li>`
      : `<li class="${cls}"><a href="${esc(href)}">${label}</a></li>`;
  }).join('')}</ol>`;
}

/** When a later page is opened before the first one was done @param {ReturnType<typeof urlsOf>} urls */
export function chooseFirst(urls) {
  return `<p>Choose your Raspberry Pi and track first.</p>
    <div class="pst-nav"><a class="pst-btn pst-primary" href="${esc(urls.start)}">Go to step 1</a></div>`;
}
