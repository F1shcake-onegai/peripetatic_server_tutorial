// @ts-check
// Runs on every page after it loads, and again whenever the setup changes in another tab.
// "On this page" entries whose heading the setup hides are hidden too. Headings in tabs
// the viewer can still switch stay listed.
import { SETUP_KEY } from '../data/setup/store.js';

/** Hidden by the setup: inside a hidden <Only>, or a tab group whose tab bar is hidden. */
function hiddenBySetup(/** @type {Element} */ el) {
  if (el.checkVisibility()) return false;
  const only = el.closest('.pst-only');
  if (only && !only.checkVisibility()) return true;
  const tabs = el.closest('starlight-tabs');
  const bar = tabs?.querySelector(':scope > .tablist-wrapper');
  return Boolean(bar && !bar.checkVisibility());
}

function tidyContents() {
  for (const link of document.querySelectorAll('starlight-toc a[href^="#"], mobile-starlight-toc a[href^="#"]')) {
    const target = document.getElementById(decodeURIComponent(link.getAttribute('href')?.slice(1) ?? ''));
    const li = link.closest('li');
    if (target && li) li.hidden = hiddenBySetup(target);
  }
}

tidyContents();
// Another tab changed the setup: marks on <html> are set by the <head> script on the next
// load, so reload to show the new setup everywhere at once.
window.addEventListener('storage', (e) => {
  if (e.key === SETUP_KEY || e.key === null) location.reload();
});
