import type { APIRoute } from 'astro';
import { requireAdmin, adminAuthErrorResponse } from '../../../lib/adminAuth';
import { computeLiveMetrics, computeLifetimeExternalTotals } from '../../../lib/adminMetricsQueries';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    await requireAdmin(request);
  } catch (err) {
    return adminAuthErrorResponse(err);
  }

  try {
    const [live, lifetimeExternal] = await Promise.all([computeLiveMetrics(), computeLifetimeExternalTotals()]);
    return new Response(JSON.stringify({ ...live, lifetimeExternal }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/admin/live] Failed to compute live metrics:', err);
    return new Response(JSON.stringify({ error: 'Failed to read live metrics' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
