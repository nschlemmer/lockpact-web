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

## Deployment

Vercel deploys automatically from the `main` branch. The root directory is `/` (this repo).

### Environment

- **Site URL:** https://lockpact.app
- **Output:** Static (no SSR)

## License

Proprietary — Rotate LLC
