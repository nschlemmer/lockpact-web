import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('LockPact'),
    // "Merged but not ready" escape hatch alongside the `pubDate <= now` visibility
    // filter (src/lib/posts.ts) — see README.md "Scheduled visibility".
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    // Optional FAQPage JSON-LD source. Keep each `a` short (~50 words) — this feeds a
    // machine-readable answer set for answer engines (AI Overviews, ChatGPT/Bing
    // retrieval, Perplexity), not the visible article prose.
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
    // Round 6 trust fields (docs: /editorial-policy/). `testedOn` is shown under the H1 only where a
    // check was actually run (e.g. "iOS 27.0 Simulator · October 16, 2026"). `sources` feeds the
    // HowWeTested box. `disclosure` adds the "We make LockPact" line to listicles and comparisons.
    testedOn: z.string().optional(),
    sources: z.array(z.object({ label: z.string(), url: z.string() })).optional(),
    howWeTested: z.boolean().default(false),
    disclosure: z.boolean().default(false),
  }),
});

export const collections = { blog };
