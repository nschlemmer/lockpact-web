import type { APIRoute } from 'astro';
import { requireAdmin, adminAuthErrorResponse } from '../../../lib/adminAuth';
import {
  computeLiveMetrics,
  computePeriodMetrics,
  computeLifetimeExternalTotals,
  parseWindowParams,
  InvalidRangeError,
  type MetricsWindow,
} from '../../../lib/adminMetricsQueries';
import { formatMinutes } from '../../../lib/format';

export const prerender = false;

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtUsd(n: number): string {
  return `$${(n || 0).toFixed(2)}`;
}

function windowLabel(window: MetricsWindow): string {
  return window.kind === 'preset' ? window.period : `${window.start} to ${window.end}`;
}

function buildSnapshotMarkdown(
  window: MetricsWindow,
  live: Awaited<ReturnType<typeof computeLiveMetrics>>,
  metrics: Awaited<ReturnType<typeof computePeriodMetrics>>,
  lifetimeExternal: Awaited<ReturnType<typeof computeLifetimeExternalTotals>>
): string {
  const lines: string[] = [];
  lines.push(`snapshot_v: 1`);
  lines.push(`# LockPact metrics snapshot — period: ${windowLabel(window)}`);
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
  if (lifetimeExternal.available) {
    const totalRevenueUsd =
      lifetimeExternal.adEarningsUsdTotal + lifetimeExternal.purchaseCompleteUsdTotal + lifetimeExternal.tipSentUsdEstimateTotal;
    lines.push(
      `- downloads: ${lifetimeExternal.downloadsTotal} (ASC) · ads watched: ${lifetimeExternal.adsWatchedTotal} (AdMob impressions) · total revenue: ${fmtUsd(totalRevenueUsd)} (ads + IAP, web/Stripe not included)`
    );
  } else {
    lines.push('- downloads / ads / revenue: — (connects once AdMob/ASC access is set up)');
  }
  lines.push('');
  lines.push('## Product health (Firestore, current + period)');
  lines.push(
    `- users: ${live.current.usersTotal} (paired ${live.current.usersPaired}, ${fmtPct(live.current.pairedPct)}) · new this period: ${metrics.productHealth.newUsers}`
  );
  lines.push(
    `- engaged pairs (14d): ${live.current.partnershipsEngaged14d} · currently locked pairs: ${live.current.currentlyLockedPairs} · active pacts: ${live.current.activePacts} · pending unlock requests: ${live.current.pendingUnlockRequests}`
  );
  lines.push(`- bypass rate: ${fmtPct(live.current.bypassRatePct)} of active pairs (live, doc #07 formula)`);
  lines.push(
    `- pacts ended this period: ${metrics.productHealth.pactsEnded} · kept to the end: ${fmtPct(metrics.productHealth.pactCompletionPct)}`
  );
  const reasonEntries = Object.entries(metrics.productHealth.pactsEndedByReason).filter(([, v]) => v > 0);
  if (reasonEntries.length > 0) {
    lines.push(`  - by reason: ${reasonEntries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }
  lines.push(
    `- unlock requests this period: ${metrics.productHealth.unlockRequestsCreated} (approved ${fmtPct(metrics.productHealth.unlockApprovalPct)}, median response ${formatMinutes(metrics.productHealth.unlockResponseMinutesMedian)})`
  );
  lines.push(
    `- lock sessions this period: started ${metrics.productHealth.lockSessionsStarted}, ended ${metrics.productHealth.lockSessionsEnded} (${metrics.productHealth.lockHoursEnded.toFixed(1)} hours)`
  );
  lines.push(`- bypasses detected this period: ${metrics.productHealth.bypassesDetected}`);
  if (metrics.productHealth.streakHistogram) {
    const sh = metrics.productHealth.streakHistogram;
    lines.push(`- streak distribution: 0: ${sh['0']} · 1-3: ${sh['1-3']} · 4-7: ${sh['4-7']} · 8+: ${sh['8+']}`);
  }
  lines.push('');
  lines.push('## Acquisition');
  const acq = metrics.acquisition;
  if (acq.vercelAvailable || acq.ascAvailable) {
    lines.push(
      `- site visits: ${acq.vercelAvailable ? acq.siteVisits : '—'} (Vercel) · downloads: ${acq.ascAvailable ? acq.downloads : '—'} (ASC units) · signed in: ${acq.signedIn}`
    );
    if (acq.vercelAvailable) {
      lines.push(
        `- top referrers: ${acq.topReferrers.map((r) => r.referrer).join(', ') || 'none yet'} — /invite page: ${acq.inviteVisitsWindowTotal} visits`
      );
    }
    lines.push('- store page-view conversion: connects once ASC Analytics Reports access is bootstrapped (Sales-and-Reports key can only list/download an existing request, not create one)');
  } else {
    lines.push('- connects once Vercel Analytics + App Store Connect access are set up — not yet flowing');
  }
  lines.push('');
  lines.push('## Engagement & retention (GA4)');
  if (metrics.engagement.available) {
    lines.push(
      `- daily active users: ${metrics.engagement.dailyActiveUsers} · new users this period: ${metrics.engagement.newUsers} · permission denial rate: ${fmtPct(metrics.engagement.permissionDenialPct)}`
    );
    const ob = metrics.engagement.onboarding;
    lines.push(
      `- onboarding funnel: start ${ob.onboardingStart} → auth ${ob.authComplete} → permission ${ob.permissionGranted} → apps selected ${ob.appsSelected} → complete ${ob.onboardingComplete}`
    );
    const inv = metrics.engagement.invite;
    lines.push(`- invite loop: created ${inv.inviteCreated} → shared ${inv.inviteShared} → entered ${inv.inviteEntered}`);
    lines.push('- retention (D1/D7/D30 cohorts): connects in a follow-up (deferred — heavier GA4 report shape)');
  } else {
    lines.push('- connects once GA4 access is granted (keys-guide step 4) — not yet flowing');
  }
  lines.push('');
  lines.push('## Revenue');
  if (metrics.revenue.available) {
    lines.push(
      `- Willpower Waivers: ${metrics.revenue.purchaseComplete} this period (${fmtUsd(metrics.revenue.purchaseCompleteUsd)}) · Support LockPact: ${metrics.revenue.tipSent} this period (${fmtUsd(metrics.revenue.tipSentUsdEstimate)} est. — no per-tier breakdown)`
    );
  } else {
    lines.push('- connects once GA4 access is granted — not yet flowing');
  }
  if (metrics.revenue.admobAvailable) {
    lines.push(
      `- ad earnings: ${fmtUsd(metrics.revenue.adEarningsUsd)} · impressions: ${metrics.revenue.adImpressions} · eCPM: ${fmtUsd(metrics.revenue.adEcpmUsd)} · match rate: ${fmtPct(metrics.revenue.adMatchRatePct)}`
    );
  } else {
    lines.push('- ad earnings/impressions/eCPM: connects once AdMob access is set up — not yet flowing');
  }
  lines.push('');
  lines.push('## Quality & sentiment');
  if (metrics.reviews.available) {
    lines.push(`- App Store rating: ${metrics.reviews.averageRating.toFixed(1)} (${metrics.reviews.ratingCount} ratings)`);
    lines.push('- crash-free sessions: not instrumented (no Crashlytics — permanent gap, unrelated to Round 2)');
  } else {
    lines.push('- connects once the reviews source has run at least once — not yet flowing');
  }
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

  const window = parseWindowParams(url.searchParams);

  try {
    const [live, metrics, lifetimeExternal] = await Promise.all([
      computeLiveMetrics(),
      computePeriodMetrics(window),
      computeLifetimeExternalTotals(),
    ]);
    const markdown = buildSnapshotMarkdown(window, live, metrics, lifetimeExternal);
    return new Response(markdown, {
      status: 200,
      headers: { 'content-type': 'text/markdown; charset=utf-8' },
    });
  } catch (err) {
    if (err instanceof InvalidRangeError) {
      return new Response(`Invalid range: ${err.message}`, { status: 400 });
    }
    console.error('[api/admin/snapshot] Failed to build snapshot:', err);
    return new Response('Failed to build snapshot', { status: 500 });
  }
};
