import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// Real per-post <lastmod> for the sitemap. Built here (not via getCollection,
// which needs Astro's content-layer runtime that isn't available while this
// config file itself is being evaluated) by reading frontmatter straight off
// disk. Real dates only, never a blanket "today" — a fake always-fresh
// lastmod teaches Google to ignore the field entirely.
const blogDir = new URL('./src/content/blog/', import.meta.url);

function extractFrontmatterDate(raw, field) {
  const match = raw.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'));
  if (!match) return null;
  const value = match[1].trim().replace(/^["']|["']$/g, '');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const blogLastmodBySlug = new Map();
for (const file of readdirSync(blogDir)) {
  if (!file.endsWith('.md') && !file.endsWith('.mdx')) continue;
  const slug = file.replace(/\.mdx?$/, '');
  const raw = readFileSync(new URL(file, blogDir), 'utf-8');
  const pubDate = extractFrontmatterDate(raw, 'pubDate');
  const updatedDate = extractFrontmatterDate(raw, 'updatedDate');
  const lastmod = updatedDate ?? pubDate;
  if (lastmod) blogLastmodBySlug.set(slug, lastmod);
}

export default defineConfig({
  site: 'https://lockpact.app',
  output: 'server',
  trailingSlash: 'always',
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
    sitemap({
      filter: (page) => !page.includes('/admin') && !page.includes('/support-lockpact/thanks'),
      serialize(item) {
        const match = item.url.match(/\/blog\/([^/]+)\/?$/);
        const lastmod = match ? blogLastmodBySlug.get(match[1]) : null;
        return lastmod ? { ...item, lastmod: lastmod.toISOString() } : item;
      },
    }),
  ],
});
