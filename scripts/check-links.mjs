/**
 * Internal blog link checker — scans src/content/blog/*.md for internal `/blog/<slug>/`
 * hrefs (markdown links and bare URLs) and fails (exit 1) on any slug with no matching
 * file in src/content/blog/.
 *
 * Why this exists: the scheduled-visibility filter (src/lib/posts.ts `isVisible`) means
 * a slug that exists as a file on disk isn't necessarily live yet — a future-dated or
 * `draft: true` post is invisible on the production site until its `pubDate` passes.
 * Linking to a not-yet-visible post is therefore a live 404 risk in a way it wouldn't be
 * without the scheduling mechanism. This script only checks "does a file for this slug
 * exist" (a broken/typo'd slug), not "is it visible today" — the content routine is
 * expected to run this before opening a PR, and to reason separately about pubDate
 * ordering for links between posts publishing in the same batch.
 *
 * NOT wired into `npm run build` (see task spec) — run manually:
 *   npm run check:links
 */
import { readdirSync, readFileSync } from 'node:fs';

const blogDir = new URL('../src/content/blog/', import.meta.url);
const files = readdirSync(blogDir).filter((f) => f.endsWith('.md') || f.endsWith('.mdx'));
const knownSlugs = new Set(files.map((f) => f.replace(/\.mdx?$/, '')));

// Matches /blog/<slug>/ or /blog/<slug> (no trailing slash) as an internal-site path —
// the negative lookbehind excludes a false match inside an external URL whose own path
// happens to contain "/blog/" (e.g. https://one-sec.app/blog/some-post), since that
// occurrence is preceded by a domain word character rather than `(`, a quote,
// whitespace, or start-of-line.
const LINK_RE = /(?<![\w.-])\/blog\/([a-z0-9-]+)\/?/g;

let hadError = false;

for (const file of files) {
  const slug = file.replace(/\.mdx?$/, '');
  let raw = readFileSync(new URL(file, blogDir), 'utf-8');
  // Strip HTML comments (e.g. Round-2 forward-reference placeholders like
  // `<!-- link /blog/some-future-post/ when live -->`) — not a live link, shouldn't fail.
  raw = raw.replace(/<!--[\s\S]*?-->/g, '');
  const seen = new Set();
  for (const match of raw.matchAll(LINK_RE)) {
    const target = match[1];
    if (seen.has(target)) continue;
    seen.add(target);
    if (!knownSlugs.has(target)) {
      hadError = true;
      console.error(`✗ ${file}: links to /blog/${target}/ — no matching file in src/content/blog/`);
    }
  }
}

if (hadError) {
  console.error('\ncheck:links found broken internal blog links (see above).');
  process.exit(1);
} else {
  console.log(`✓ check:links — all internal /blog/<slug>/ links across ${files.length} posts resolve to a file.`);
}
