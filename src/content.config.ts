import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const igrashky = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/igrashky' }),
  schema: ({ image }) =>
    z.object({
      /** Назва іграшки. */
      title: z.string().optional(),
      /** Ціна у гривнях. */
      price: z.number().optional(),
      /** Розмір, наприклад «28 см». */
      size: z.string().optional(),
      /** Матеріали. */
      materials: z.string().optional(),
      /** Наявність. */
      status: z.enum(['available', 'made-to-order', 'sold']).optional(),
      /** Головне фото 1:1 для картки та сторінки. */
      cover: image(),
      /** Додаткові фото галереї. */
      gallery: z.array(image()).default([]),
      /** Тека з кадрами обертання. */
      spinDir: z.string().optional(),
    }),
});

export const collections = { igrashky };
