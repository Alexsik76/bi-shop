import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const igrashky = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/igrashky' }),
  schema: ({ image }) =>
    z.object({
      /** Назва іграшки. */
      title: z.string(),
      /** Ціна у гривнях. */
      price: z.number(),
      /** Розмір, наприклад «28 см». */
      size: z.string(),
      /** Матеріали. */
      materials: z.string(),
      /** Наявність. */
      status: z.enum(['available', 'made-to-order', 'sold']),
      /** Головне фото 1:1 для картки та сторінки. */
      cover: image(),
      /** Додаткові фото галереї. */
      gallery: z.array(image()).default([]),
    }),
});

export const collections = { igrashky };
