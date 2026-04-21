import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://lockpact.app',
  output: 'server',
  security: {
    // Disable Astro 5's CSRF origin check site-wide. No auth, no cookies,
    // no state mutation on our side — Stripe's secret key is the security
    // boundary. Without this, POSTs from preview deploys (*.vercel.app)
    // and any www→apex hits get blocked with
    // "Cross-site POST form submissions are forbidden".
    checkOrigin: false,
  },
  adapter: vercel({
    webAnalytics: {
      enabled: true,
    },
  }),
  integrations: [
    tailwind({ applyBaseStyles: false }),
    mdx(),
    sitemap(),
  ],
});
