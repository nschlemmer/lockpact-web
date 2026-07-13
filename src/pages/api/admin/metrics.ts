import type { APIRoute } from 'astro';
import { requireAdmin, adminAuthErrorResponse } from '../../../lib/adminAuth';
import { computePeriodMetrics, type Period } from '../../../lib/adminMetricsQueries';

export const prerender = false;

const VALID_PERIODS: Period[] = ['7d', '30d', '90d', 'all'];

export const GET: APIRoute = async ({ request, url }) => {
  try {
    await requireAdmin(request);
  } catch (err) {
    return adminAuthErrorResponse(err);
  }

  const periodParam = url.searchParams.get('period');
  const period = (VALID_PERIODS as string[]).includes(periodParam ?? '')
    ? (periodParam as Period)
    : '30d';

  try {
    const metrics = await computePeriodMetrics(period);
    return new Response(JSON.stringify(metrics), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/admin/metrics] Failed to compute period metrics:', err);
    return new Response(JSON.stringify({ error: 'Failed to read metrics' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
