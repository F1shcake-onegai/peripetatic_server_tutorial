// @ts-check
// Setup page 2 (/setup/peripherals/): the hardware, one box each, in five sections.
// Hardware that can't be added is greyed out with the reason.
import {
  DEVICES, allocate, availability, toSelection, devicesFor, toggleDevice, setMode,
} from '../../data/setup/index.js';
import { esc, urlsOf, currentSetup, keepDraft, stepper, chooseFirst } from './common.js';

/** @typedef {import('../../data/setup/devices.js').Device} Device */

const SECTIONS = [
  ['network', 'Second network interface (choose at most one)'],
  ['hat', 'Hardware Attached on Top'],
  ['camera', 'Camera'],
  ['display', 'Display via FPC'],
  ['sensor', 'Sensors and Modules via GPIO'],
];

/** @param {HTMLElement} root */
export function mountPeripherals(root) {
  const urls = urlsOf(root);
  let setup = currentSetup();

  const render = () => {
    const focused = document.activeElement?.id;
    if (!setup?.track) {
      root.innerHTML = stepper(2, setup, urls) + chooseFirst(urls);
      return;
    }
    const s = setup;
    const result = allocate(toSelection(s));
    const av = availability(toSelection(s));
    const offered = devicesFor(s.track);

    /** @param {Device} d */
    const card = (d) => {
      const chosen = s.devices.find((x) => x.id === d.id);
      const problem = chosen ? result.errors.find((e) => e.device === d.id) : undefined;
      const blocked = !chosen && av[d.id]?.ok === false;
      const reason = problem?.reason ?? (blocked ? av[d.id]?.reason : undefined);
      let modes = '';
      if (d.modes && chosen) {
        // Which interfaces fit, checked without this device
        const others = { ...toSelection(s), devices: s.devices.filter((x) => x.id !== d.id) };
        const modeAv = availability(others)[d.id]?.modes ?? {};
        const off = Object.entries(d.modes).filter(([key]) => modeAv[key]?.ok === false && key !== chosen.mode);
        modes = `<div class="pst-segments" role="radiogroup" aria-label="${esc(d.short)} interface">
          ${Object.entries(d.modes).map(([key, m]) => {
            const ok = modeAv[key]?.ok !== false || key === chosen.mode;
            return `<label class="pst-segment${key === chosen.mode ? ' pst-on' : ''}${ok ? '' : ' pst-off'}">
              <input class="pst-sr" type="radio" name="pst-mode-${d.id}" id="pst-mode-${d.id}-${key}" data-device="${d.id}" value="${key}" ${key === chosen.mode ? 'checked' : ''} ${ok ? '' : 'disabled'}>${esc(m.label)}</label>`;
          }).join('')}
        </div>${off.map(([key]) => `<p class="pst-card-reason">${esc(modeAv[key]?.reason ?? '')}</p>`).join('')}`;
      }
      const cls = ['pst-card', chosen ? 'pst-on' : '', blocked ? 'pst-off' : '', problem ? 'pst-bad' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}">
        <label class="pst-card-main">
          <input class="pst-sr" type="checkbox" id="pst-dev-${d.id}" data-device="${d.id}" ${chosen ? 'checked' : ''} ${blocked ? 'disabled' : ''}>
          <span class="pst-card-title">${esc(d.name)}</span>
          ${d.versions ? `<span class="pst-card-sub">${esc(d.versions)}</span>` : ''}
        </label>
        ${modes}
        ${reason ? `<p class="pst-card-reason">${esc(reason)}</p>` : ''}
      </div>`;
    };

    const sections = SECTIONS.map(([cat, title]) => {
      const list = offered.filter((d) => d.category === cat);
      if (!list.length) return '';
      return `<section class="pst-section"><h2>${esc(title)}</h2><div class="pst-cards">${list.map(card).join('')}</div></section>`;
    }).join('');

    root.innerHTML = `
      ${stepper(2, s, urls)}
      ${sections}
      <div class="pst-nav">
        <a class="pst-btn" href="${esc(urls.start)}">Back</a>
        <button type="button" class="pst-btn pst-primary" id="pst-next" ${result.ok ? '' : 'disabled'}>Next</button>
        ${result.ok ? '' : '<p class="pst-status">Remove the hardware marked in red to continue.</p>'}
      </div>`;
    if (focused) document.getElementById(focused)?.focus();
  };

  root.addEventListener('change', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const id = el.dataset.device;
    if (!setup || !id) return;
    if (el.type === 'checkbox') {
      setup = toggleDevice(setup, id, el.checked);
      // A device with interfaces starts on the first one that fits
      const dev = DEVICES.find((d) => d.id === id);
      if (el.checked && dev?.modes) {
        const without = { ...toSelection(setup), devices: setup.devices.filter((x) => x.id !== id) };
        const fits = Object.entries(availability(without)[id]?.modes ?? {}).find(([, m]) => m.ok)?.[0];
        if (fits) setup = setMode(setup, id, fits);
      }
    } else if (el.name.startsWith('pst-mode-')) {
      setup = setMode(setup, id, el.value);
    }
    keepDraft(setup);
    render();
  });

  root.addEventListener('click', (e) => {
    if (/** @type {HTMLElement} */ (e.target).closest('#pst-next') && setup) {
      keepDraft(setup);
      window.location.href = urls.pins;
    }
  });

  render();
}
