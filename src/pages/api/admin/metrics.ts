import type { APIRoute } from 'astro';
import { requireAdmin, adminAuthErrorResponse } from '../../../lib/adminAuth';
import { computePeriodMetrics, parseWindowParams, InvalidRangeError } from '../../../lib/adminMetricsQueries';

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  try {
    await requireAdmin(request);
  } catch (err) {
    return adminAuthErrorResponse(err);
  }

  const window = parseWindowParams(url.searchParams);

  try {
    const metrics = await computePeriodMetrics(window);
    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    if (err instanceof InvalidRangeError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }
    console.error('[api/admin/metrics] Failed to compute period metrics:', err);
    return new Response(JSON.stringify({ error: 'Failed to read metrics' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
