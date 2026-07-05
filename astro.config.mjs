// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Адресу сайту після розгортання на Cloudflare Pages замініть на власну.
// Вона потрібна для карти сайту (sitemap) та абсолютних Open Graph-посилань.
export default defineConfig({
  site: 'https://babusyni-igrashky.pages.dev',
  integrations: [sitemap()],
  image: {
    // Стискання зображень виконує вбудований у Astro sharp.
    responsiveStyles: true,
  },
});
