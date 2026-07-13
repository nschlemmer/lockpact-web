import type { APIRoute } from 'astro';
import { requireAdmin, adminAuthErrorResponse } from '../../../lib/adminAuth';
import { computeLiveMetrics } from '../../../lib/adminMetricsQueries';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    await requireAdmin(request);
  } catch (err) {
    return adminAuthErrorResponse(err);
  }

  try {
    const live = await computeLiveMetrics();
    return new Response(JSON.stringify(live), {
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
