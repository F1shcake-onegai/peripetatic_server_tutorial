// @ts-check
// Starlight route middleware: tags each sidebar link with its page's audience, so pages
// that don't match the viewer's saved setup can be hidden (src/data/setup/visibility.js),
// and lists the pages in sidebar order for Previous/Next (src/scripts/setup-runtime.js).
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';
import { getCollection } from 'astro:content';

/** @type {Map<string, {track?: string, hw?: string} | undefined> | undefined} */
let audiences;

/** Page id ('guide/04-ai-hat', '' for the home page) from a sidebar href. */
const idOf = (/** @type {string} */ href) => href.replace(import.meta.env.BASE_URL, '').replace(/^\/|\/$/g, '');

export const onRequest = defineRouteMiddleware(async (context) => {
  audiences ??= new Map((await getCollection('docs')).map((e) => [e.id === 'index' ? '' : e.id, e.data.audience]));
  const route = context.locals.starlightRoute;

  /** @type {{href: string, label: string, track?: string, hw?: string}[]} */
  const pages = [];
  /** @param {any[]} entries */
  const tag = (entries) => {
    for (const e of entries) {
      if (e.type === 'group') { tag(e.entries); continue; }
      const audience = audiences?.get(idOf(e.href));
      if (audience?.track) e.attrs = { ...e.attrs, 'data-when-track': audience.track };
      if (audience?.hw) e.attrs = { ...e.attrs, 'data-when-hw': audience.hw };
      pages.push({ href: e.href, label: e.label, ...audience });
    }
  };
  tag(route.sidebar);
  /** @type {any} */ (context.locals).pstPages = pages;
});
