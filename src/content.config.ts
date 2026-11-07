import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.object({
        // Who the page is for. Pages that don't match the viewer's saved setup are hidden
        // from the sidebar and Previous/Next (src/routeData.js, src/data/setup/visibility.js).
        audience: z
          .object({
            track: z.enum(['student', 'server']).optional(),
            hw: z.string().optional(),
          })
          .optional(),
      }),
    }),
  }),
};
