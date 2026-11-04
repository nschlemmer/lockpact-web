import type { CollectionEntry } from 'astro:content';

// Gate for the `pubDate <= now` scheduled-visibility filter.
//
// `import.meta.env.DEV` is true under `astro dev` (local review of future-dated drafts).
// `process.env.VERCEL_ENV === 'preview'` is true on Vercel PR-preview builds — verified
// against Vercel's system-environment-variables docs (2026-09-04): VERCEL_ENV is exposed
// at BOTH build and runtime, values are exactly 'production' | 'preview' | 'development',
// gated behind the project's "Enable access to System Environment Variables" checkbox
// (Vercel enables this by default for new projects; confirm it's on if this ever reads
// as unset in a preview build). Deliberately `=== 'preview'`, not `!== 'production'` —
// a local `npm run build` has no VERCEL_ENV at all and must behave like production so
// the future-post fixture check is meaningful.
const SHOW_ALL = import.meta.env.DEV || process.env.VERCEL_ENV === 'preview';

export const isVisible = ({ data }: Pick<CollectionEntry<'blog'>, 'data'>): boolean =>
  SHOW_ALL || (!data.draft && data.pubDate.valueOf() <= Date.now());

// Publish-date sort (2026-11-04): the blog list and homepage block show posts newest-first by
// pubDate. `updatedDate` no longer affects ordering or card labels; it only feeds the sitemap
// <lastmod>, JSON-LD dateModified and the "Updated" line on the post page itself (and is set
// only when a post's content materially changes).
export const byPubDate = (
  a: Pick<CollectionEntry<'blog'>, 'data'>,
  b: Pick<CollectionEntry<'blog'>, 'data'>
): number => b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
