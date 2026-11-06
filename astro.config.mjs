// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import remarkStepHeadings from './plugins/remark-step-headings.mjs';

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
      customCss: ['./src/styles/steps.css', './src/styles/keys.css'],
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
