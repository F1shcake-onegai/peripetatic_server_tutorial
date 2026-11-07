// @ts-check
// Hiding what doesn't match the viewer's setup, without a flash: a tiny script in every
// page's <head> marks <html> with the saved setup before anything is shown, and plain CSS
// hides the marked parts. With no setup (or JavaScript off) nothing is marked, so the page
// shows everything.
//
// Marks on <html>:
//   data-setup            a setup is saved
//   data-track="student"  its track, when one is chosen
//   data-board="rpi5"
//   data-hw="id id …"     chosen devices
//   data-modes="id:mode …"
// What the content marks (see src/components/Only.astro):
//   data-when-hw="id"     only with that device       data-when-not-hw="id"  only without it
//   data-when-mode="id:mode"                          data-when-track="student"
//   data-when-setup       only with a saved setup     data-when-no-setup     only without one
import { DEVICES } from './devices.js';
import { SETUP_KEY, SETUP_VERSION, TAB_LABELS, TAB_PREFIX } from './store.js';

const TRACKS = ['student', 'server'];

/** The <head> script, as text. */
export function headScript() {
  const tabs = JSON.stringify(TAB_LABELS);
  return `(() => {
  try {
    const s = JSON.parse(localStorage.getItem(${JSON.stringify(SETUP_KEY)}) || 'null');
    if (!s || s.version !== ${SETUP_VERSION} || !Array.isArray(s.devices)) return;
    const devices = s.devices.filter((d) => d && typeof d.id === 'string');
    const have = new Set(devices.flatMap((d) => (typeof d.mode === 'string' ? [d.id, d.id + ':' + d.mode] : [d.id])));
    const root = document.documentElement;
    root.dataset.setup = '';
    root.dataset.board = typeof s.board === 'string' ? s.board : 'rpi5';
    if (s.track === 'student' || s.track === 'server') root.dataset.track = s.track;
    root.dataset.hw = devices.map((d) => d.id).join(' ');
    root.dataset.modes = devices.filter((d) => typeof d.mode === 'string').map((d) => d.id + ':' + d.mode).join(' ');
    // Tab groups the setup decides open on the viewer's choice (their tab bar is hidden)
    const tabs = ${tabs};
    for (const key in tabs) {
      for (const token in tabs[key]) if (have.has(token)) localStorage.setItem(${JSON.stringify(TAB_PREFIX)} + key, tabs[key][token]);
    }
  } catch (e) {
    // No setup, or storage blocked: show everything
  }
})();`;
}

/** @param {string} token  'id' or 'id:mode' */
const marked = (token) => (token.includes(':') ? `[data-modes~="${token}"]` : `[data-hw~="${token}"]`);
const HIDE = '{display:none!important}';

/**
 * The CSS rules, as text.
 * @param {import('./devices.js').Device[]} [catalog]
 */
export function visibilityCss(catalog = DEVICES) {
  const rules = [
    `html[data-setup] [data-when-no-setup]${HIDE}`,
    `html:not([data-setup]) [data-when-setup]${HIDE}`,
    '.pst-only{display:contents}',
  ];
  for (const t of TRACKS) rules.push(`html[data-track]:not([data-track="${t}"]) [data-when-track="${t}"]${HIDE}`);
  for (const d of catalog) {
    rules.push(`html[data-setup]:not([data-hw~="${d.id}"]) [data-when-hw="${d.id}"]${HIDE}`);
    rules.push(`html[data-hw~="${d.id}"] [data-when-not-hw="${d.id}"]${HIDE}`);
    for (const mode of Object.keys(d.modes ?? {})) {
      rules.push(`html[data-setup]:not([data-modes~="${d.id}:${mode}"]) [data-when-mode="${d.id}:${mode}"]${HIDE}`);
    }
  }
  // A tab group the setup decides shows only the chosen tab: hide its tab bar
  for (const [syncKey, labels] of Object.entries(TAB_LABELS)) {
    for (const token of Object.keys(labels)) {
      rules.push(`html${marked(token)} starlight-tabs[data-sync-key="${syncKey}"]>.tablist-wrapper${HIDE}`);
    }
  }
  return rules.join('\n');
}

/**
 * Check an <Only> condition while building, so a typo fails the build instead of hiding
 * content for everyone. Throws on an unknown device, mode or track.
 * @param {{hw?: string, notHw?: string, mode?: string, track?: string}} when
 * @param {import('./devices.js').Device[]} [catalog]
 */
export function checkCondition(when, catalog = DEVICES) {
  for (const id of [when.hw, when.notHw].filter(Boolean)) {
    if (!catalog.some((d) => d.id === id)) throw new Error(`<Only>: unknown device "${id}"`);
  }
  if (when.mode) {
    const [id, mode] = when.mode.split(':');
    if (!catalog.find((d) => d.id === id)?.modes?.[mode]) throw new Error(`<Only>: unknown mode "${when.mode}"`);
  }
  if (when.track && !TRACKS.includes(when.track)) throw new Error(`<Only>: unknown track "${when.track}"`);
}
