// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import remarkStepHeadings from './plugins/remark-step-headings.mjs';
import { pluginPinPlaceholders } from './plugins/ec-pin-placeholders.mjs';

export default defineConfig({
  site: 'https://f1shcake-onegai.github.io',
  base: '/peripetatic_server_tutorial',
  markdown: {
    processor: unified({
      remarkPlugins: [remarkStepHeadings],
      // Footnotes under a visible "Reference" heading, as hooks/references.py did in MkDocs
      remarkRehype: { footnoteLabel: 'Reference', footnoteLabelProperties: {} },
      // Straight quotes and dashes as typed, as in MkDocs
      smartypants: false,
    }),
  },
  integrations: [
    starlight({
      title: 'Peripatetic Server Tutorial',
      // Pin placeholders in code blocks follow the viewer's setup (src/data/setup/pins.js)
      expressiveCode: { plugins: [pluginPinPlaceholders()] },
      customCss: ['./src/styles/steps.css', './src/styles/keys.css', './src/styles/setup.css'],
      components: {
        // Marks every page with the viewer's saved setup (src/data/setup/visibility.js)
        Head: './src/components/overrides/Head.astro',
        // Adds a note on pages that aren't part of the viewer's setup
        Banner: './src/components/overrides/Banner.astro',
      },
      // Tags sidebar links with their page's audience
      routeMiddleware: './src/routeData.js',
      sidebar: [
        { label: 'Home', link: '/' },
        {
          label: 'General',
          items: ['guide/00-hardware', 'guide/01-raspberry-pi-os', 'guide/02-update', 'guide/03-zram'],
        },
        {
          label: 'Student Kit',
          items: [
            'guide/04-second-interface',
            'guide/05-mesh-vpn',
            'guide/06-gpio',
            'guide/07-website-files',
            'guide/07-website-files-dynamic',
          ],
        },
        {
          label: 'School Server',
          items: ['guide/04-ai-hat', 'guide/05-reverse-proxy'],
        },
      ],
    }),
  ],
});
