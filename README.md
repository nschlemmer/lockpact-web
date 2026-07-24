# lockpact-web

Marketing website for [LockPact](https://lockpact.app) — mutual screen time accountability for iOS.

## Tech Stack

- [Astro](https://astro.build) — static site generator
- [Tailwind CSS](https://tailwindcss.com) — utility-first styling
- [MDX](https://mdxjs.com) — blog content via Astro content collections
- Deployed on [Vercel](https://vercel.com)

## Development

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # Production build to dist/
npm run preview    # Preview production build
```

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page — hero, how it works, differentiators, social proof, FAQ, blog preview |
| `/blog` | Blog index |
| `/blog/[slug]` | Individual blog posts |
| `/privacy` | Privacy policy |
| `/support` | FAQ + contact |

## Blog

Blog posts live in `src/content/blog/` as Markdown files with frontmatter. Adding a new post is as simple as creating a new `.md` file — Astro's content collection handles the rest.

## Answer engine optimization (AEO)

- **`public/llms.txt`** — a curated, machine-readable index of the site's highest-value pages, per the [llms.txt convention](https://llmstxt.org). Kept in sync manually; not build-generated.
- **FAQPage JSON-LD** — blog posts can set an optional `faq: [{ q, a }]` array in frontmatter (see `src/content/config.ts`); when present, `BlogLayout.astro` emits a `FAQPage` JSON-LD block alongside the existing `BlogPosting`/`BreadcrumbList` data. Note: Google retired the FAQ rich-result feature for Search in 2026, so this schema no longer earns classic Google rich results — it's kept as a machine-readable answer set for other answer engines (AI Overviews, Bing/ChatGPT retrieval, Perplexity, Claude) that still parse FAQPage.
- **IndexNow** — `scripts/indexnow-ping.mjs` is a manual tool (not wired into build or deploy) that pings the [IndexNow](https://www.indexnow.org) aggregator so changed/new URLs reach Bing's index quickly — which matters because Bing's index is what ChatGPT/Copilot retrieval draws from. **Google does not participate in IndexNow at all**; don't expect any Google Search Console movement from running this. Run it after each content deploy:

  ```bash
  node scripts/indexnow-ping.mjs https://lockpact.app/blog/some-new-post/
  node scripts/indexnow-ping.mjs --all   # after `npm run build`, pings every URL in the sitemap
  ```

  The verification key file lives at `public/<key>.txt` (self-hosted verification per the IndexNow spec) and must be deployed before pinging.

## Deployment

Vercel deploys automatically from the `main` branch. The root directory is `/` (this repo).

### Environment

- **Site URL:** https://lockpact.app
- **Output:** Static (no SSR)

## License

Proprietary — Rotate LLC
