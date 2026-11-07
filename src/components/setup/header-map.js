// @ts-check
// The pinout.xyz-style header map, shared by the pins page (page-pins.js) and the wiring
// steps (page-wiring.js): pins in two columns, each with its name and one badge per module
// in the module's colour.
import { DEVICES, RAIL_NAMES } from '../../data/setup/index.js';
import { esc } from './common.js';

/** @typedef {import('../../data/setup/picture.js').PinView} PinView */

/** How many modules get their own colour */
export const MODULE_COLOURS = 4;
/** Pseudo device for the breadboard's rail pins */
export const BREADBOARD = 'breadboard';
const KINDS = [['3v3', '3V3 power'], ['5v', '5V power'], ['gnd', 'Ground'], ['gpio', 'GPIO'], ['reserved', 'Reserved']];
const byId = Object.fromEntries(DEVICES.map((d) => [d.id, d]));

/**
 * Colour of each module with header pins: 1-4 in catalog order, 0 (grey) after that.
 * Four colours stay distinguishable side by side in both themes (checked with the dataviz
 * palette validator, all pairs); later modules are grey. Names are always shown.
 * @param {PinView[]} views
 * @returns {Map<string, number>}
 */
export function moduleColours(views) {
  const onHeader = new Set(views.flatMap((v) => v.users.map((u) => u.device)));
  return new Map(DEVICES.filter((d) => onHeader.has(d.id)).map((d, i) => [d.id, i < MODULE_COLOURS ? i + 1 : 0]));
}

/** Devices on a pin, for greying out: its modules, and for a rail pin the rail's modules @param {PinView} v */
export const devicesOf = (v) => [...v.users.map((u) => u.device), ...(v.rail ? [...v.rail.devices, BREADBOARD] : [])].join(' ');

/**
 * @param {PinView[]} views
 * @param {Map<string, number>} colours
 * @param {string} boardName
 * @param {{interactive?: boolean, title?: boolean}} [opts]  interactive: pins are buttons
 *   (pins page); title: show the "<board> GPIO header" heading
 */
export function headerMap(views, colours, boardName, { interactive = true, title = true } = {}) {
  const colourOf = (/** @type {string} */ id) => colours.get(id) ?? 0;
  /** @param {PinView} v */
  const base = (v) => [v.users.length || v.rail ? 'pst-used' : '', v.reserved ? 'pst-reserved' : '', v.coveredBy ? 'pst-covered' : ''].filter(Boolean).join(' ');
  /** @param {PinView} v */
  const pin = (v) => {
    const label = esc([`Pin ${v.pin}`, v.name, v.badge].filter(Boolean).join(', '));
    return interactive
      ? `<button type="button" class="pst-hpin pst-k-${v.kind} ${base(v)}" id="pst-pin-${v.pin}" data-pin="${v.pin}" data-devices="${devicesOf(v)}" aria-label="${label}">${v.pin}</button>`
      : `<span class="pst-hpin pst-k-${v.kind} ${base(v)}" data-pin="${v.pin}" data-devices="${devicesOf(v)}" aria-hidden="true">${v.pin}</span>`;
  };
  /** One badge per module on the pin, in its colour, with its short name @param {PinView} v */
  const badges = (v) => [
    ...(v.rail ? [`<span class="pst-badge pst-badge-rail">${RAIL_NAMES[v.rail.rail]} rail (${v.rail.side})</span>`] : []),
    ...[...new Set(v.users.map((u) => u.device))].map((id) => `<span class="pst-badge pst-m${colourOf(id)}">${esc(byId[id]?.short ?? id)}</span>`),
  ].join('');
  /** @param {PinView} v @param {'left' | 'right'} side */
  const label = (v, side) => `<div class="pst-label pst-${side} ${base(v)}" data-pin="${v.pin}" data-devices="${devicesOf(v)}"${v.badge ? ` title="${esc(v.badge)}"` : ''} aria-hidden="true">
      <span class="pst-pin-name">${esc(v.name)}</span>${badges(v)}</div>`;
  const rows = [];
  for (let i = 0; i < views.length; i += 2) rows.push(label(views[i], 'left') + pin(views[i]) + pin(views[i + 1]) + label(views[i + 1], 'right'));
  const top = views.find((v) => v.coveredBy)?.coveredBy;
  return `${title ? `<h2 class="pst-map-title">${esc(boardName)} GPIO header</h2>` : ''}
    ${top ? `<p class="pst-muted">${esc(byId[top].short)} covers the header.</p>` : ''}
    <div class="pst-header"${interactive ? ` role="group" aria-label="${esc(boardName)} GPIO header"` : ''}>${rows.join('')}</div>
    <div class="pst-keys">${KINDS.map(([k, name]) => `<span class="pst-key"><span class="pst-swatch pst-k-${k === 'reserved' ? 'gpio pst-reserved' : k}"></span>${name}</span>`).join('')}</div>`;
}

/**
 * Every pin name is as wide as the longest one, so all badges start as far from the pins
 * as the farthest one. Measures the maps in `container` that are shown.
 * @param {ParentNode} container
 */
export function alignBadges(container) {
  const headers = /** @type {HTMLElement[]} */ ([...container.querySelectorAll('.pst-header')]);
  for (const h of headers) h.style.removeProperty('--pst-name-w');
  const names = headers.flatMap((h) => [...h.querySelectorAll('.pst-pin-name')]);
  const widest = Math.max(0, ...names.map((n) => n.getBoundingClientRect().width));
  if (!widest) return;
  for (const h of headers) h.style.setProperty('--pst-name-w', `${Math.ceil(widest)}px`);
}
