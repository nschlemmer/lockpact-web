import type { APIRoute } from 'astro';
import { appStoreUrl, campaignToken } from '../../lib/campaigns';

// SSR redirect so blog markdown can link to `/go/b-<slug>/` instead of embedding the
// Apple provider token directly in ~35 content files. `campaign` is validated with the
// same sanitiser used to build the `ct` token: if sanitising the raw param changes it
// (bad characters, path-traversal attempts, over-length, etc.), the campaign is
// rejected with a 404 rather than silently mangled into some other campaign's token.
export const prerender = false;

export const GET: APIRoute = ({ params }) => {
  const raw = params.campaign ?? '';
  const sanitized = campaignToken(raw);

  if (!sanitized || sanitized !== raw) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: appStoreUrl(sanitized),
      'Cache-Control': 'no-store',
    },
  });
};
