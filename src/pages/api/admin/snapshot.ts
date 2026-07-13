import type { APIRoute } from 'astro';
import { requireAdmin, adminAuthErrorResponse } from '../../../lib/adminAuth';
import { computeLiveMetrics, computePeriodMetrics, type Period } from '../../../lib/adminMetricsQueries';

export const prerender = false;

const VALID_PERIODS: Period[] = ['7d', '30d', '90d', 'all'];

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}
function fmtMin(n: number): string {
  return `${n.toFixed(0)}min`;
}

function buildSnapshotMarkdown(
  period: Period,
  live: Awaited<ReturnType<typeof computeLiveMetrics>>,
  metrics: Awaited<ReturnType<typeof computePeriodMetrics>>
): string {
  const lines: string[] = [];
  lines.push(`snapshot_v: 1`);
  lines.push(`# LockPact metrics snapshot — period: ${period}`);
  lines.push(
    metrics.hasData
      ? `${metrics.compareNote} (window ${metrics.windowStart} → ${metrics.windowEnd})`
      : metrics.compareNote
  );
  lines.push('');
  lines.push('## Lifetime totals (Firestore, live — unaffected by period)');
  lines.push(`- users signed in: ${live.lifetime.usersTotal}`);
  lines.push(`- partnerships formed: ${live.lifetime.partnershipsFormedTotal}`);
  lines.push(`- pacts made: ${live.lifetime.pactsTotal} (${live.lifetime.pactsKeptToEnd} kept to the end)`);
  lines.push(
    `- lock sessions: ${live.lifetime.lockSessionsTotal} (≈${live.lifetime.lockHoursTotal.toFixed(0)} hours locked)`
  );
  lines.push(
    `- unlock requests: ${live.lifetime.unlockRequestsTotal} (${live.lifetime.unlockApprovedTotal} approved)`
  );
  lines.push(
    `- bypasses detected: ${live.lifetime.bypassesDetectedTotal} (across ${live.lifetime.bypassAffectedPairs} pairs)`
  );
  lines.push(`- invite codes created: ${live.lifetime.invitesCreatedTotal}`);
  lines.push('- downloads / ads / revenue: — (connects in Round 2 — GA4, AdMob, App Store Connect)');
  lines.push('');
  lines.push('## Product health (Firestore, current + period)');
  lines.push(
    `- users: ${live.current.usersTotal} (paired ${live.current.usersPaired}, ${fmtPct(live.current.pairedPct)}) · new this period: ${metrics.productHealth.newUsers}`
  );
  lines.push(
    `- engaged pairs (14d): ${live.current.partnershipsEngaged14d} · currently locked pairs: ${live.current.currentlyLockedPairs} · active pacts: ${live.current.activePacts} · pending unlock requests: ${live.current.pendingUnlockRequests}`
  );
  lines.push(
    `- pacts ended this period: ${metrics.productHealth.pactsEnded} · kept to the end: ${fmtPct(metrics.productHealth.pactCompletionPct)}`
  );
  const reasonEntries = Object.entries(metrics.productHealth.pactsEndedByReason).filter(([, v]) => v > 0);
  if (reasonEntries.length > 0) {
    lines.push(`  - by reason: ${reasonEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  lines.push(
    `- unlock requests this period: ${metrics.productHealth.unlockRequestsCreated} (approved ${fmtPct(metrics.productHealth.unlockApprovalPct)}, median response ${fmtMin(metrics.productHealth.unlockResponseMinutesMedian)})`
  );
  lines.push(
    `- lock sessions this period: started ${metrics.productHealth.lockSessionsStarted}, ended ${metrics.productHealth.lockSessionsEnded} (${metrics.productHealth.lockHoursEnded.toFixed(1)} hours)`
  );
  lines.push(`- bypasses this period: ${metrics.productHealth.bypassesDetected} (rate proxy ${fmtPct(metrics.productHealth.bypassRatePct)})`);
  if (metrics.productHealth.streakHistogram) {
    const sh = metrics.productHealth.streakHistogram;
    lines.push(`- streak distribution: 0: ${sh['0']} · 1-3: ${sh['1-3']} · 4-7: ${sh['4-7']} · 8+: ${sh['8+']}`);
  }
  lines.push('');
  lines.push('## Acquisition / Engagement / Revenue / Quality');
  lines.push('- connects in Round 2 (Vercel Analytics, GA4, AdMob, App Store Connect)');
  lines.push('');
  lines.push('## Focus signals');
  if (metrics.focusSignals.length === 0) {
    lines.push('- none crossed threshold this period (or not enough history for a comparison yet)');
  } else {
    for (const s of metrics.focusSignals) {
      lines.push(`- [${s.tag}] (${s.severity}) ${s.text}`);
    }
  }
  return lines.join('\n') + '\n';
}

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
    const [live, metrics] = await Promise.all([computeLiveMetrics(), computePeriodMetrics(period)]);
    const markdown = buildSnapshotMarkdown(period, live, metrics);
    return new Response(markdown, {
      status: 200,
      headers: { 'content-type': 'text/markdown; charset=utf-8' },
    });
  } catch (err) {
    console.error('[api/admin/snapshot] Failed to build snapshot:', err);
    return new Response('Failed to build snapshot', { status: 500 });
  }
};
