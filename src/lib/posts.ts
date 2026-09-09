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

// Latest-activity sort (2026-09-09 — visible "Updated" dates + activity-based ordering,
// docs/content-plan-60d-2026-08.md §4 "Dates" rule). A post's activity timestamp is the
// later of updatedDate/pubDate — guarded against a mis-set updatedDate earlier than
// pubDate (falls back to pubDate rather than letting a bad date sort a post backward).
export const lastActivity = ({ data }: Pick<CollectionEntry<'blog'>, 'data'>): number => {
  const pub = data.pubDate.valueOf();
  const updated = data.updatedDate?.valueOf();
  return updated !== undefined && updated > pub ? updated : pub;
};

export const byLatestActivity = (
  a: Pick<CollectionEntry<'blog'>, 'data'>,
  b: Pick<CollectionEntry<'blog'>, 'data'>
): number => lastActivity(b) - lastActivity(a);
