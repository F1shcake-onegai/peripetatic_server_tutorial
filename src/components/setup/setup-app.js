// @ts-check
// The setup pages, in three steps: /setup/ (Raspberry Pi and track), /setup/peripherals/
// and /setup/pins/. Everything runs in the browser; see common.js for how the setup goes
// from page to page and src/data/setup/store.js for how it is saved.
import { mountStart } from './page-start.js';
import { mountPeripherals } from './page-peripherals.js';
import { mountPins } from './page-pins.js';

/** @param {HTMLElement} root */
export function mount(root) {
  const page = root.dataset.page;
  if (page === 'peripherals') mountPeripherals(root);
  else if (page === 'pins') mountPins(root);
  else mountStart(root);
}
