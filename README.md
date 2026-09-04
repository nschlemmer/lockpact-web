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

### Scheduled visibility

A post is visible on the built site only once `pubDate <= now` (and `draft` is not `true`) — see `src/lib/posts.ts`'s `isVisible` filter, applied in `blog/index.astro`, `blog/[...slug].astro`, and `BlogPreview.astro`. This means:

- **Merge a future-dated post today and it stays invisible** on the production site (and on a local `npm run build`) until the first production rebuild after `pubDate` passes. It's visible in the repo itself (drafts aren't secret) and in `astro dev` / Vercel PR previews, so a reviewer can see it before it goes live.
- **Timezone gotcha:** a date-only `pubDate: 2026-09-15` parses as UTC midnight = **5 p.m. PT the previous day**. Either write a full ISO string with an explicit offset, or just expect the post to appear at the first production build after that instant, not necessarily "that morning, Pacific time."
- Production only goes live on a rebuild — see "Daily rebuild" below. A day with no newly-due post is a no-op deploy.

### Daily rebuild

`.github/workflows/daily-rebuild.yml` cron-triggers a Vercel Deploy Hook once a day (14:17 UTC / 07:17 PT — off the hour on purpose, GitHub can delay or drop `:00` runs) so scheduled posts actually go live without a manual deploy. It needs a `VERCEL_DEPLOY_HOOK` repository secret (Vercel → Settings → Git → Deploy Hooks) that isn't set by default; the workflow fails loudly until it is. `workflow_dispatch` lets you trigger it manually (also the required re-arm — GitHub auto-disables `schedule:` workflows on public repos after 60 days with no commits to the repo).

## Answer engine optimization (AEO)

- **`public/llms.txt`** — a curated, machine-readable index of the site's highest-value pages, per the [llms.txt convention](https://llmstxt.org). Kept in sync manually; not build-generated.
- **FAQPage JSON-LD** — blog posts can set an optional `faq: [{ q, a }]` array in frontmatter (see `src/content/config.ts`); when present, `BlogLayout.astro` emits a `FAQPage` JSON-LD block alongside the existing `BlogPosting`/`BreadcrumbList` data. Note: Google retired the FAQ rich-result feature for Search in 2026, so this schema no longer earns classic Google rich results — it's kept as a machine-readable answer set for other answer engines (AI Overviews, Bing/ChatGPT retrieval, Perplexity, Claude) that still parse FAQPage.
- **IndexNow** — `scripts/indexnow-ping.mjs` is a manual tool (not wired into build or deploy) that pings the [IndexNow](https://www.indexnow.org) aggregator so changed/new URLs reach Bing's index quickly — which matters because Bing's index is what ChatGPT/Copilot retrieval draws from. **Google does not participate in IndexNow at all**; don't expect any Google Search Console movement from running this. Run it after each content deploy:

  ```bash
  node scripts/indexnow-ping.mjs https://lockpact.app/blog/some-new-post/
  node scripts/indexnow-ping.mjs --all   # after `npm run build`, pings every URL in the sitemap
  ```

  The verification key file lives at `public/<key>.txt` (self-hosted verification per the IndexNow spec) and must be deployed before pinging.

## Attribution

App Store links on the site carry an [Apple campaign-link token](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links) (`pt`/`ct`/`mt`) when a provider token is configured, so App Store Connect can report installs per page instead of just "Web" in aggregate:

- `src/lib/campaigns.ts` builds the URL: `appStoreUrl(campaign)` returns `https://apps.apple.com/app/apple-store/id6759302382?pt=<ASC_PROVIDER_TOKEN>&ct=<campaign>&mt=8` when both the provider token and a campaign are present, and falls back to the bare, untracked App Store URL otherwise — so it's always safe to deploy with `ASC_PROVIDER_TOKEN` unset.
- Every `ct` value is run through `campaignToken()`: lower-cased, non-`[a-z0-9-]` characters collapsed to `-`, and truncated to **30 characters** (Apple's cap).
- Blog posts use `ct=b-<slug>` on the bottom download CTA; the homepage uses `ct=home`; in-article App Store links in `src/content/blog/*.md` point at `/go/b-<slug>/` (an SSR redirect, `src/pages/go/[campaign].ts`) rather than embedding the token directly in ~35 markdown files.
- `ASC_PROVIDER_TOKEN` is generated once, the first time a campaign link is created in ASC → App Analytics → Acquisition → Campaigns — set it in Vercel → Settings → Environment Variables (Production + Preview) and redeploy to activate. Results show up in the same ASC screen, **only once a campaign reaches ≥5 in the selected date range** — read at 28–60-day ranges.
- The homepage's `WebApplication` JSON-LD `downloadUrl` is deliberately left as the bare URL — structured-data fields are for crawlers, not click attribution.

## Deployment

Vercel deploys automatically from the `main` branch. The root directory is `/` (this repo).

### Environment

- **Site URL:** https://lockpact.app
- **Output:** Server-rendered (`output: 'server'` + `@astrojs/vercel`) — most pages (home, blog index, blog posts) are still `export const prerender = true` and served as static output, but `/admin`, `/invite/[code]`, `/api/*`, and `/go/[campaign]` are genuine SSR routes.

## License

Proprietary — Rotate LLC
