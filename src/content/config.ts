import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    author: z.string().default('LockPact'),
    tags: z.array(z.string()).default([]),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    // Optional FAQPage JSON-LD source. Keep each `a` short (~50 words) — this feeds a
    // machine-readable answer set for answer engines (AI Overviews, ChatGPT/Bing
    // retrieval, Perplexity), not the visible article prose.
    faq: z.array(z.object({ q: z.string(), a: z.string() })).optional(),
  }),
});

export const collections = { blog };
