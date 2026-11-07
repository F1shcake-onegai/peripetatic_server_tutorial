// @ts-check
// Runs on every page after it loads:
// - "On this page" entries whose heading the setup hides are hidden too. Headings in tabs
//   the viewer can still switch stay listed.
// - Previous/Next skip pages that aren't part of the setup.
// - Pin values (<Pin> and code placeholders, src/data/setup/pins.js) show the viewer's pins.
// - References (footnotes) whose markers the setup all hides are hidden, the rest are
//   numbered 1, 2, 3…, and the "Reference" heading goes when none are left. Content added
//   later (chapter 0's wiring steps) sends a "pst:content" event to check again.
// When another tab changes the setup, the page reloads.
import { SETUP_KEY, load, safeLocalStorage, toSelection } from '../data/setup/store.js';
import { allocate } from '../data/setup/allocate.js';
import { formatPin } from '../data/setup/pins.js';

/**
 * Hidden by the setup: inside a hidden <Only>, or in a tab the setup didn't choose (its
 * group's tab bar is hidden). <Only> wrappers have no box of their own (display: contents),
 * and a tab bar inside an unselected tab has none either, so their computed display tells
 * whether the setup hid them.
 */
function hiddenBySetup(/** @type {Element} */ el) {
  if (el.checkVisibility()) return false;
  for (let only = el.closest('.pst-only'); only; only = only.parentElement?.closest('.pst-only') ?? null) {
    if (getComputedStyle(only).display === 'none') return true;
  }
  for (let panel = el.closest('[role="tabpanel"]'); panel; panel = panel.parentElement?.closest('[role="tabpanel"]') ?? null) {
    const bar = panel.parentElement?.querySelector(':scope > .tablist-wrapper');
    if (panel.hasAttribute('hidden') && bar && getComputedStyle(bar).display === 'none') return true;
  }
  return false;
}

/** References follow the setup; markers keep matching the numbers in the list. */
function tidyReferences() {
  const section = document.querySelector('section[data-footnotes]');
  if (!(section instanceof HTMLElement)) return;
  let shown = 0;
  for (const li of /** @type {NodeListOf<HTMLLIElement>} */ (section.querySelectorAll('ol > li[id]'))) {
    const markers = [...document.querySelectorAll(`a[data-footnote-ref][href="#${CSS.escape(li.id)}"]`)];
    li.hidden = markers.length > 0 && markers.every(hiddenBySetup);
    if (li.hidden) continue;
    shown++;
    for (const m of markers) m.textContent = String(shown);
  }
  section.hidden = shown === 0;
  const heading = section.querySelector('h2[id]');
  if (!heading) return;
  for (const link of document.querySelectorAll(`starlight-toc a[href="#${heading.id}"], mobile-starlight-toc a[href="#${heading.id}"]`)) {
    const li = link.closest('li');
    if (li) li.hidden = section.hidden;
  }
}

function tidyContents() {
  for (const link of document.querySelectorAll('starlight-toc a[href^="#"], mobile-starlight-toc a[href^="#"]')) {
    const target = document.getElementById(decodeURIComponent(link.getAttribute('href')?.slice(1) ?? ''));
    const li = link.closest('li');
    if (target && li) li.hidden = hiddenBySetup(target);
  }
}

/** Previous/Next skip pages that aren't part of the setup (page list from src/routeData.js). */
function fixPagination() {
  const marks = document.documentElement.dataset;
  const list = document.getElementById('pst-pages');
  if (marks.setup === undefined || !list) return;
  /** @type {{href: string, label: string, track?: string, hw?: string}[]} */
  const pages = JSON.parse(list.textContent || '[]');
  const hw = new Set((marks.hw ?? '').split(' ').filter(Boolean));
  const shown = (/** @type {typeof pages[number]} */ p) => (!p.track || !marks.track || p.track === marks.track) && (!p.hw || hw.has(p.hw));
  const here = pages.findIndex((p) => new URL(p.href, location.href).pathname === location.pathname);
  if (here < 0) return;
  for (const [rel, step] of /** @type {const} */ ([['prev', -1], ['next', 1]])) {
    const link = /** @type {HTMLAnchorElement | null} */ (document.querySelector(`.pagination-links a[rel="${rel}"]`));
    if (!link) continue;
    let i = here + step;
    while (pages[i] && !shown(pages[i])) i += step;
    if (!pages[i]) { link.hidden = true; continue; }
    link.href = pages[i].href;
    const title = link.querySelector('.link-title');
    if (title) title.textContent = pages[i].label;
  }
}

/** Swap in the viewer's pins; code blocks also get their copy-button text updated. */
function fillPins() {
  const setup = load(safeLocalStorage());
  if (!setup) return;
  const result = allocate(toSelection(setup));
  const byKey = new Map(result.assignments.filter((a) => a.pin !== undefined).map((a) => [`${a.device}.${a.signal}`, a]));
  /** @type {Set<Element>} */
  const changed = new Set();
  for (const el of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.pst-pin[data-pin]'))) {
    const a = byKey.get(el.dataset.pin ?? '');
    if (!a) continue; // device not in the setup: keep the default
    const text = formatPin(a, el.dataset.show ?? 'pin');
    if (el.textContent === text) continue;
    el.textContent = text;
    const figure = el.closest('figure');
    if (figure) changed.add(figure);
  }
  for (const figure of changed) {
    const button = /** @type {HTMLElement | null} */ (figure.querySelector('button[data-code]'));
    if (!button) continue;
    const lines = [...figure.querySelectorAll('.ec-line .code')].map((c) => (c.textContent ?? '').replace(/\n$/, ''));
    button.dataset.code = lines.join('\u007f');
  }
}

tidyContents();
fixPagination();
fillPins();
tidyReferences();
document.addEventListener('pst:content', tidyReferences);
// Another tab changed the setup: marks on <html> are set by the <head> script on the next
// load, so reload to show the new setup everywhere at once.
window.addEventListener('storage', (e) => {
  if (e.key === SETUP_KEY || e.key === null) location.reload();
});
