import type { APIRoute } from 'astro';
import { appStoreUrl } from '../../lib/campaigns';

// SSR redirect so blog markdown can link to `/go/b-<slug>/` instead of embedding the
// Apple provider token directly in ~35 content files.
//
// `campaign` is validated against a strict shape (lower-case alphanumeric segments
// joined by single hyphens, no leading/trailing/doubled hyphens, capped well above any
// real slug) — malformed input, path-traversal attempts, and anything with disallowed
// characters is rejected with a 404. This is deliberately NOT "does campaignToken()
// leave it unchanged": campaignToken() also truncates to Apple's 30-char `ct` cap, and
// several real blog slugs (`b-<slug>`) are longer than 30 chars — requiring byte-for-
// byte stability against a truncating sanitiser would 404 those valid, legitimate
// campaign links. appStoreUrl() truncates internally when building the `ct` param, so
// two very long slugs can in principle truncate to the same `ct` — an acceptable
// analytics-attribution tradeoff, not a routing bug.
export const prerender = false;

const VALID_CAMPAIGN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_CAMPAIGN_LENGTH = 80; // generous vs. the longest real slug (~46 chars)

export const GET: APIRoute = ({ params }) => {
  const raw = params.campaign ?? '';

  if (!raw || raw.length > MAX_CAMPAIGN_LENGTH || !VALID_CAMPAIGN.test(raw)) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: appStoreUrl(raw),
      'Cache-Control': 'no-store',
    },
  });
};
