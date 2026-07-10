// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Адресу сайту після розгортання на Cloudflare Pages замініть на власну.
// Вона потрібна для карти сайту (sitemap) та абсолютних Open Graph-посилань.
export default defineConfig({
  site: 'https://babusyni-igrashky.com.ua',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/igrashky/_toy'),
    }),
    {
      name: 'inject-toy-shell',
      hooks: {
        'astro:config:setup': ({ injectRoute }) => {
          injectRoute({
            pattern: 'igrashky/_toy',
            entrypoint: './src/pages/igrashky/_toy/index.astro'
          });
        }
      }
    }
  ],
  image: {
    // Стискання зображень виконує вбудований у Astro sharp.
    responsiveStyles: true,
  },
  experimental: {
    fonts: [
      {
        provider: fontProviders.google(),
        name: 'Comfortaa',
        cssVariable: '--font-comfortaa',
        weights: [700],
        subsets: ['cyrillic', 'latin'],
      },
      {
        provider: fontProviders.google(),
        name: 'PT Sans',
        cssVariable: '--font-pt-sans',
        weights: [400, 700],
        subsets: ['cyrillic', 'latin'],
      },
    ],
  },
});
