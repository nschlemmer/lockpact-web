import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './adminAuth';
import { computeFocusSignals, type FocusSignal } from './adminFocusSignals';
import { WAIVER_PRICE_USD, TIP_ESTIMATED_PRICE_USD, TIP_TIER_PRICES_USD } from './iapPrices';

// pacts.endReason — code-verified set (docs/agent-log.md 2026-07-13 entry has
// the full grep evidence). Only 5 of these 8 are ever actually written to a
// `pacts` doc; the other 3 are lockSessions-only values kept here so the
// shape matches .agent-work/shared/adminMetrics-contract.md, which
// metricsCollector (the writer, in the separate lockpact/firebase/functions
// repo) also targets.
const PACT_END_REASONS = [
  'timer_expired',
  'partner_approved',
  'declined',
  'partnership_dissolved',
  'superseded_by_pact',
  'orphaned_partnership_changed',
  'malformed',
  'account_deleted',
] as const;

const STREAK_BUCKETS = ['0', '1-3', '4-7', '8+'] as const;
type StreakBucket = (typeof STREAK_BUCKETS)[number];

function streakBucket(streak: number): StreakBucket {
  if (streak <= 0) return '0';
  if (streak <= 3) return '1-3';
  if (streak <= 7) return '4-7';
  return '8+';
}

function tsToMillis(v: unknown): number | null {
  return v instanceof Timestamp ? v.toMillis() : null;
}

// ---------------------------------------------------------------------------
// /api/admin/live — current state, computed on request directly from
// Firestore. Also the source for "Lifetime totals" (mockup: "unaffected by
// the period filter") — cumulative counts are always live-queried rather
// than summed from adminMetrics, so a rollup gap can never under-count them.
// ---------------------------------------------------------------------------

export interface LiveMetrics {
  lifetime: {
    usersTotal: number;
    partnershipsFormedTotal: number;
    pactsTotal: number;
    pactsKeptToEnd: number;
    lockSessionsTotal: number;
    lockHoursTotal: number;
    unlockRequestsTotal: number;
    unlockApprovedTotal: number;
    bypassesDetectedTotal: number;
    bypassAffectedPairs: number;
    invitesCreatedTotal: number;
  };
  current: {
    usersTotal: number;
    usersPaired: number;
    pairedPct: number;
    partnershipsActive: number;
    partnershipsEngaged14d: number;
    currentlyLockedPairs: number;
    activePacts: number;
    pendingUnlockRequests: number;
    streakHistogram: Record<StreakBucket, number>;
    bypassRatePct: number;
  };
  generatedAt: string;
}

export async function computeLiveMetrics(): Promise<LiveMetrics> {
  const [users, partnerships, pacts, lockSessions, unlockRequests, inviteCodes, bypassEvents] =
    await Promise.all([
      adminDb.collection('users').get(),
      adminDb.collection('partnerships').get(),
      adminDb.collection('pacts').get(),
      adminDb.collection('lockSessions').get(),
      adminDb.collection('unlockRequests').get(),
      adminDb.collection('inviteCodes').get(),
      // Same COLLECTION_GROUP field-override index metricsCollector needs —
      // see lockpact/firebase/firestore.indexes.json.
      adminDb.collectionGroup('events').where('type', '==', 'bypass_detected').get(),
    ]);

  const usersById = new Map(users.docs.map((d) => [d.id, d.data()]));

  // ---- lifetime ----
  const usersTotal = users.size;
  const partnershipsFormedTotal = partnerships.size;

  let pactsKeptToEnd = 0;
  for (const doc of pacts.docs) {
    if (doc.data().endReason === 'timer_expired') pactsKeptToEnd++;
  }

  // Audit finding B-L1: a malformed doc with endedAt before createdAt would
  // silently subtract from the lifetime total. Skip the session's
  // contribution entirely rather than accumulate a negative duration — a
  // floor on the final sum could still hide an offsetting-but-wrong pair of
  // sessions, whereas skipping the bad one can't.
  let lockHoursTotal = 0;
  for (const doc of lockSessions.docs) {
    const data = doc.data();
    const createdAtMs = tsToMillis(data.createdAt);
    const endedAtMs = tsToMillis(data.endedAt);
    if (createdAtMs !== null && endedAtMs !== null && endedAtMs >= createdAtMs) {
      lockHoursTotal += (endedAtMs - createdAtMs) / 3600000;
    }
  }

  let unlockApprovedTotal = 0;
  for (const doc of unlockRequests.docs) {
    if (doc.data().status === 'approved') unlockApprovedTotal++;
  }

  const bypassAffectedPartnershipIds = new Set<string>();
  for (const doc of bypassEvents.docs) {
    const partnershipId = doc.ref.parent.parent?.id;
    if (partnershipId) bypassAffectedPartnershipIds.add(partnershipId);
  }

  // ---- current state ----
  let usersPaired = 0;
  for (const doc of users.docs) {
    if (doc.data().partnerUid) usersPaired++;
  }
  const pairedPct = usersTotal > 0 ? (usersPaired / usersTotal) * 100 : 0;

  let partnershipsActive = 0;
  let currentlyLockedPairs = 0;
  let activePartnershipsWithBypass = 0;
  const streakHistogram: Record<StreakBucket, number> = { '0': 0, '1-3': 0, '4-7': 0, '8+': 0 };
  for (const doc of partnerships.docs) {
    const data = doc.data();
    if (data.status !== 'active') continue;
    partnershipsActive++;
    const streak = typeof data.currentStreak === 'number' ? data.currentStreak : 0;
    streakHistogram[streakBucket(streak)]++;
    if (typeof data.bypassCount === 'number' && data.bypassCount > 0) activePartnershipsWithBypass++;
    const user1 = usersById.get(data.user1Uid);
    const user2 = usersById.get(data.user2Uid);
    if (user1?.isLocked === true || user2?.isLocked === true) currentlyLockedPairs++;
  }

  const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const engagedPartnershipIds = new Set<string>();
  for (const doc of [...lockSessions.docs, ...pacts.docs]) {
    const data = doc.data();
    const createdAtMs = tsToMillis(data.createdAt);
    if (createdAtMs !== null && createdAtMs >= fourteenDaysAgo && data.partnershipId) {
      engagedPartnershipIds.add(data.partnershipId);
    }
  }
  const partnershipsEngaged14d = engagedPartnershipIds.size;

  let activePacts = 0;
  for (const doc of pacts.docs) {
    if (doc.data().status === 'active') activePacts++;
  }

  let pendingUnlockRequests = 0;
  for (const doc of unlockRequests.docs) {
    if (doc.data().status === 'pending') pendingUnlockRequests++;
  }

  // Doc #07 KPI 8's exact formula: pairs with bypassCount > 0 / active pairs.
  // A live/current-state snapshot only (bypassCount has no history) — same
  // category of metric as partnershipsActive/streakHistogram above, which
  // have the identical limitation for the identical reason.
  const bypassRatePct =
    partnershipsActive > 0 ? (activePartnershipsWithBypass / partnershipsActive) * 100 : 0;

  return {
    lifetime: {
      usersTotal,
      partnershipsFormedTotal,
      pactsTotal: pacts.size,
      pactsKeptToEnd,
      lockSessionsTotal: lockSessions.size,
      lockHoursTotal,
      unlockRequestsTotal: unlockRequests.size,
      unlockApprovedTotal,
      bypassesDetectedTotal: bypassEvents.size,
      bypassAffectedPairs: bypassAffectedPartnershipIds.size,
      invitesCreatedTotal: inviteCodes.size,
    },
    current: {
      usersTotal,
      usersPaired,
      pairedPct,
      partnershipsActive,
      partnershipsEngaged14d,
      currentlyLockedPairs,
      activePacts,
      pendingUnlockRequests,
      streakHistogram,
      bypassRatePct,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// /api/admin/metrics?period= — reads adminMetrics rollups (written by
// metricsCollector, a separate repo/service — this tier only reads).
// ---------------------------------------------------------------------------

export type Period = '7d' | '30d' | '90d' | 'all';

export type MetricsWindow =
  | { kind: 'preset'; period: Period }
  | { kind: 'range'; start: string; end: string };

const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Whole-day difference between two YYYY-MM-DD date strings (UTC, DST-safe). */
function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  return Math.round((end - start) / 86400000);
}

function addDaysToDateString(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export class InvalidRangeError extends Error {}

const VALID_PERIODS: Period[] = ['7d', '30d', '90d', 'all'];

/**
 * Parses `?start=YYYY-MM-DD&end=YYYY-MM-DD` (takes precedence when both are
 * present) or `?period=7d|30d|90d|all` (default `30d`) from a request URL's
 * search params into a MetricsWindow. Shared by /api/admin/metrics and
 * /api/admin/snapshot so the two routes can't drift on parsing rules.
 */
export function parseWindowParams(searchParams: URLSearchParams): MetricsWindow {
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (start && end) {
    return { kind: 'range', start, end };
  }
  const periodParam = searchParams.get('period');
  const period = (VALID_PERIODS as string[]).includes(periodParam ?? '') ? (periodParam as Period) : '30d';
  return { kind: 'preset', period };
}

/**
 * Validates a custom start/end range: well-formed dates, start <= end, end
 * not in the future, start clamped forward to the earliest available
 * `adminMetrics` doc (if any exist). Throws InvalidRangeError with a
 * user-facing message on anything malformed — including when the earliest-
 * data clamp itself pushes start past end (audit finding B-M4: previously
 * silently produced an empty `hasData:true` window instead of a 400).
 */
function validateRange(start: string, end: string, allDays: DayDoc[]): { start: string; end: string } {
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    throw new InvalidRangeError('start/end must be YYYY-MM-DD');
  }
  if (start > end) {
    throw new InvalidRangeError('start must be on or before end');
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  if (end > todayStr) {
    throw new InvalidRangeError('end cannot be in the future');
  }
  let clampedStart = start;
  if (allDays.length > 0 && clampedStart < allDays[0].date) {
    clampedStart = allDays[0].date;
  }
  if (clampedStart > end) {
    throw new InvalidRangeError('no data available in the requested range');
  }
  return { start: clampedStart, end };
}

interface DayDoc {
  date: string;
  schemaVersion?: number;
  backfilled?: true;
  firestore: Record<string, any>;
  ga4?: Record<string, any>;
  reviews?: Record<string, any>;
  appStoreRatingCount?: number;
  admob?: Record<string, any>;
  vercel?: Record<string, any>;
  vercelSummary?: Record<string, any>;
  asc?: Record<string, any>;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sumWindow(days: DayDoc[], field: string): number {
  return days.reduce((acc, d) => acc + (Number(d.firestore?.[field]) || 0), 0);
}

/**
 * Median of each day's own median in the window — labeled everywhere it's
 * displayed as "median of daily medians," not a true window-wide median
 * (that needs the collector to store a per-day response-time histogram,
 * deferred — see the contract doc). Excludes days with zero resolved
 * requests AND days where the median field itself is missing/null (audit
 * finding B-H4 — previously a present-but-null field coalesced to 0 via
 * `Number(...) || 0`, silently injecting a fake zero into the median input).
 */
function medianOfDailyMedians(days: DayDoc[]): number {
  const values = days
    .filter((d) => {
      const f = d.firestore;
      if (!f) return false;
      const hasResolved = (f.unlockApproved || 0) + (f.unlockDenied || 0) > 0;
      const hasMedianField = f.unlockResponseMinutesMedian !== null && f.unlockResponseMinutesMedian !== undefined;
      return hasResolved && hasMedianField;
    })
    .map((d) => Number(d.firestore!.unlockResponseMinutesMedian));
  return median(values);
}

function pactCompletionPct(days: DayDoc[]): number {
  const ended = sumWindow(days, 'pactsEnded');
  if (ended === 0) return 0;
  const keptToEnd = days.reduce(
    (acc, d) => acc + (Number(d.firestore?.pactsEndedByReason?.timer_expired) || 0),
    0
  );
  return (keptToEnd / ended) * 100;
}

/**
 * Walks backward to the latest day with a real (non-null, non-backfilled)
 * `paired`/`usersTotal` pair — same walk-back pattern as `latestGA4Day`
 * below (audit finding B-M3/A-H6). `backfillAdminMetrics` writes `paired`
 * as `null` on dates it can't reconstruct point-in-time state for; reading
 * a fixed last-day-in-window without this walk-back would read that `null`
 * as a false "fell to 0%".
 */
function pairedPctSnapshot(days: DayDoc[]): number {
  for (let i = days.length - 1; i >= 0; i--) {
    const f = days[i].firestore;
    if (f && f.paired !== null && f.paired !== undefined && f.usersTotal) {
      return f.usersTotal > 0 ? (f.paired / f.usersTotal) * 100 : 0;
    }
  }
  return 0;
}

/** Same walk-back reasoning as pairedPctSnapshot above. */
function engagedPairsSnapshot(days: DayDoc[]): number {
  for (let i = days.length - 1; i >= 0; i--) {
    const v = days[i].firestore?.partnershipsEngaged14d;
    if (typeof v === 'number') return v;
  }
  return 0;
}

/** Same walk-back reasoning as pairedPctSnapshot above — `streakHistogram` is also nulled on backfilled dates. */
function latestStreakHistogram(days: DayDoc[]): Record<StreakBucket, number> | null {
  for (let i = days.length - 1; i >= 0; i--) {
    const sh = days[i].firestore?.streakHistogram;
    if (sh) return sh as Record<StreakBucket, number>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// GA4 + reviews readers — Round B (agent-2/metrics-collector-round-b). Only
// these two external sources are implemented; AdMob/Vercel/ASC blocks simply
// don't exist on any adminMetrics doc yet (see that PR's description) — no
// separate "blocked" handling needed here, `ga4`/`reviews` are just absent
// until a day actually has them, same as any other not-yet-populated field.
// ---------------------------------------------------------------------------

function sumGA4Window(days: DayDoc[], field: string): number {
  return days.reduce((acc, d) => acc + (Number(d.ga4?.[field]) || 0), 0);
}

/** Most recent day in the window that actually has a ga4 block, or null. */
function latestGA4Day(days: DayDoc[]): Record<string, any> | null {
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].ga4) return days[i].ga4 as Record<string, any>;
  }
  return null;
}

/**
 * True only if every day in the window that has a `ga4` block also has the
 * schemaVersion-2 unique-user fields (audit finding A-C3/B-C3) — used to
 * decide the funnel basis without silently mixing event-count and
 * unique-user bases within one render. False (event-count fallback) for any
 * window spanning pre-rollout docs.
 */
function allDaysHaveGA4UsersFields(days: DayDoc[]): boolean {
  const ga4Days = days.filter((d) => d.ga4);
  if (ga4Days.length === 0) return false;
  return ga4Days.every((d) => typeof d.ga4!.onboardingStartUsers === 'number');
}

/** Reviews has no historical concept — only the most recent day in the window ever carries it. */
function latestReviewsBlock(days: DayDoc[]): Record<string, any> | null {
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].reviews) return days[i].reviews as Record<string, any>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// AdMob / Vercel / ASC readers — Round B2 (agent-2/metrics-collector-round-b2).
// Same "field simply absent until a day has it" convention as ga4/reviews —
// no separate blocked-state handling needed here.
// ---------------------------------------------------------------------------

function sumAdMobWindow(days: DayDoc[], field: string): number {
  return days.reduce((acc, d) => acc + (Number(d.admob?.[field]) || 0), 0);
}

function sumVercelWindow(days: DayDoc[], field: string): number {
  return days.reduce((acc, d) => acc + (Number(d.vercel?.[field]) || 0), 0);
}

function sumASCWindow(days: DayDoc[], field: string): number {
  return days.reduce((acc, d) => acc + (Number(d.asc?.[field]) || 0), 0);
}

/** ASC's authoritative IAP counts (asc.iap.*) — excludes TestFlight/sandbox test purchases, unlike ga4.purchaseComplete/tipSent. */
function sumASCIapWindow(days: DayDoc[], field: string): number {
  return days.reduce((acc, d) => acc + (Number(d.asc?.iap?.[field]) || 0), 0);
}

function anyAdMobDay(days: DayDoc[]): boolean {
  return days.some((d) => d.admob);
}

function anyVercelDay(days: DayDoc[]): boolean {
  return days.some((d) => d.vercel);
}

function anyASCDay(days: DayDoc[]): boolean {
  return days.some((d) => d.asc);
}

function anyGA4Day(days: DayDoc[]): boolean {
  return days.some((d) => d.ga4);
}

/** Vercel's referrer/invite/UTM summary is a whole-window aggregate, not per-day — only the most recent day in a run ever carries it, same convention as reviews. Its window (windowStart/windowEnd) is DECOUPLED from the caller's selected period — see acquisition.summaryWindowStart/End. */
function latestVercelSummary(days: DayDoc[]): Record<string, any> | null {
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].vercelSummary) return days[i].vercelSummary as Record<string, any>;
  }
  return null;
}

/** AdMob's match-rate is a per-day rate, not additive — average across days that actually reported, then clamp to [0,100] (audit finding B-M6: the raw field is asserted to be a 0-1 fraction, never enforced before). */
function averageAdMobMatchRatePct(days: DayDoc[]): number {
  const values = days.filter((d) => d.admob).map((d) => Number(d.admob!.matchRate) || 0);
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.min(100, Math.max(0, avg * 100));
}

/**
 * Period eCPM: sum(earnings)/sum(impressions)*1000, never a simple average
 * of each day's own eCPM (audit finding B-H3 — averaging daily rates
 * weights a near-zero-impression day equally with a high-impression day,
 * skewing the period figure). Null (not 0) when the window has zero
 * impressions total, matching the collector's own null convention.
 */
function sumWeightedAdMobEcpm(days: DayDoc[]): number | null {
  const totalEarnings = sumAdMobWindow(days, 'earningsUsd');
  const totalImpressions = sumAdMobWindow(days, 'impressions');
  return totalImpressions > 0 ? (totalEarnings / totalImpressions) * 1000 : null;
}

/**
 * The comparable-metrics view used for focus-signal deltas. Deliberately no
 * `bypassRatePct` here — doc #07's bypass-rate formula (partnerships.bypassCount
 * > 0 / active pairs, see computeLiveMetrics) is a live/current-state-only
 * value with no historical field to reconstruct a true "previous period"
 * comparison from, and fabricating a differently-defined proxy just to have
 * a delta reintroduces the exact two-different-numbers bug this was meant
 * to fix. The single correct value lives only in computeLiveMetrics().
 */
function onboardingCompletionPctFromDays(days: DayDoc[]): number {
  const usersBasis = allDaysHaveGA4UsersFields(days);
  const start = sumGA4Window(days, usersBasis ? 'onboardingStartUsers' : 'onboardingStart');
  const complete = sumGA4Window(days, usersBasis ? 'onboardingCompleteUsers' : 'onboardingComplete');
  return start > 0 ? (complete / start) * 100 : 0;
}

function comparableMetrics(days: DayDoc[]): Record<string, number> {
  return {
    pactCompletionPct: pactCompletionPct(days),
    unlockResponseMinutesMedian: medianOfDailyMedians(days),
    pairedPct: pairedPctSnapshot(days),
    engagedPairs: engagedPairsSnapshot(days),
    // New in this round (audit finding B-M9) — funnel-step-conversion and
    // referrer/site-visit-traffic signal coverage, using the spec's own
    // example thresholds (±5pt / ±25%).
    onboardingCompletionPct: onboardingCompletionPctFromDays(days),
    siteVisits: sumVercelWindow(days, 'visits'),
  };
}

export interface PeriodMetrics {
  window: MetricsWindow;
  hasData: boolean;
  windowStart: string | null;
  windowEnd: string | null;
  compareNote: string;
  /** True when the newest adminMetrics doc is more than 2 days behind real "today" — surfaced as a banner (audit finding B-C1/B-C2). */
  collectorStalled: { sinceDate: string } | null;
  /** Intra-window completeness — how many of the calendar days in this window actually have a doc (audit finding B-M7). Not meaningful for the 'all' period (no fixed expected length). */
  gapInfo: {
    current: { daysWithData: number; daysExpected: number };
    previous: { daysWithData: number; daysExpected: number } | null;
  };
  productHealth: {
    newUsers: number;
    pairedPct: number;
    engagedPairs: number;
    pactsStarted: number;
    pactsEnded: number;
    pactCompletionPct: number;
    pactsEndedByReason: Record<(typeof PACT_END_REASONS)[number], number>;
    lockSessionsStarted: number;
    lockSessionsEnded: number;
    lockHoursEnded: number;
    unlockRequestsCreated: number;
    unlockApproved: number;
    unlockDenied: number;
    unlockApprovalPct: number;
    unlockResponseMinutesMedian: number;
    bypassesDetected: number;
    invitesCreated: number;
    streakHistogram: Record<StreakBucket, number> | null;
  };
  engagement: {
    available: boolean; // false until metricsCollector's GA4 pull has landed at least once
    dailyActiveUsers: number; // latest day in window with a ga4 block
    newUsers: number; // summed over window
    wau: number; // latest day's rolling 7d active users
    mau: number; // latest day's rolling 28d active users
    permissionDenialPct: number;
    /** 'users' when every day in the window has the schemaVersion-2 unique-user fields; 'events' (approximate, footnoted) otherwise. Never mixed within one render. */
    funnelBasis: 'users' | 'events';
    onboarding: {
      onboardingStart: number;
      authComplete: number;
      permissionGranted: number;
      appsSelected: number;
      onboardingComplete: number;
    };
    invite: {
      inviteCreated: number;
      inviteShared: number;
      inviteEntered: number;
    };
  };
  revenue: {
    available: boolean; // true once GA4 has landed at least once
    purchaseComplete: number; // GA4 purchase_complete count -- Willpower Waivers -- SECONDARY signal, includes test purchases
    purchaseCompleteUsd: number; // exact -- single price point ($9.99)
    tipSent: number; // GA4 tip_sent count -- Support LockPact -- SECONDARY signal, includes test purchases
    tipSentUsdEstimate: number; // ESTIMATE -- count only, no per-tier breakdown; uses the median tier price
    ascRevenueAvailable: boolean; // true once at least one adminMetrics doc has an asc.iap block
    waiversAsc: number; // ASC sales, Product Type Identifier IA1 -- AUTHORITATIVE, excludes test purchases and restores
    waiversAscUsd: number; // exact -- single price point ($9.99)
    supportAsc: { small: number; medium: number; large: number }; // ASC sales, SKU-matched per tier -- AUTHORITATIVE
    supportAscUsd: number; // exact -- real per-tier prices, not a blended estimate
    admobAvailable: boolean;
    adEarningsUsd: number;
    adImpressions: number;
    adEcpmUsd: number | null; // sum(earnings)/sum(impressions)*1000 -- null (not 0) when the window has zero impressions
    adMatchRatePct: number; // averaged across days that reported, clamped to [0,100]
  };
  acquisition: {
    vercelAvailable: boolean;
    siteVisits: number; // summed over window
    ascAvailable: boolean;
    downloads: number; // ASC sales units, summed over window
    signedIn: number; // Firestore new users, same value as productHealth.newUsers
    topReferrers: Array<{ referrer: string; visits: number }>;
    inviteVisitsWindowTotal: number;
    /** The summary's OWN fixed trailing-30d window (decoupled from the selected period) — must be disclosed alongside topReferrers/inviteVisitsWindowTotal, never implied to be period-scoped (audit finding B-M5). */
    summaryWindowStart: string | null;
    summaryWindowEnd: string | null;
  };
  reviews: {
    available: boolean;
    averageRating: number;
    ratingCount: number;
    recentReviews: Array<{ title: string; rating: number; excerpt: string; date: string }>;
  };
  focusSignals: FocusSignal[];
  /**
   * Comparable prior-window values for the period-scoped KPI cards (audit
   * finding B-M8 — per-card deltas were specced but never rendered). Null
   * when there's no comparison period (e.g. 'all' time, or insufficient
   * history). Deliberately a narrower subset than the full PeriodMetrics
   * shape — only the fields that actually have a rendered KPI card need one.
   */
  previousPeriod: {
    productHealth: {
      newUsers: number;
      pactCompletionPct: number;
      unlockResponseMinutesMedian: number;
    };
    engagement: {
      dailyActiveUsers: number;
      newUsers: number;
      permissionDenialPct: number;
    };
    revenue: {
      adEarningsUsd: number;
      adEcpmUsd: number | null;
      waiversAscUsd: number;
      supportAscUsd: number;
    };
    acquisition: {
      siteVisits: number;
      downloads: number;
    };
    reviews: {
      averageRating: number;
    };
  } | null;
}

async function fetchAllDayDocs(): Promise<DayDoc[]> {
  const snap = await adminDb.collection('adminMetrics').orderBy('date', 'asc').get();
  // Filters out the `_meta` gap-tracking doc (audit finding A-L4's
  // companion on the reader side — `_meta` isn't date-shaped and must never
  // be treated as a day doc).
  return snap.docs.filter((d) => DATE_RE.test(d.id)).map((d) => d.data() as DayDoc);
}

function emptyProductHealth(): PeriodMetrics['productHealth'] {
  return {
    newUsers: 0,
    pairedPct: 0,
    engagedPairs: 0,
    pactsStarted: 0,
    pactsEnded: 0,
    pactCompletionPct: 0,
    pactsEndedByReason: Object.fromEntries(PACT_END_REASONS.map((r) => [r, 0])) as any,
    lockSessionsStarted: 0,
    lockSessionsEnded: 0,
    lockHoursEnded: 0,
    unlockRequestsCreated: 0,
    unlockApproved: 0,
    unlockDenied: 0,
    unlockApprovalPct: 0,
    unlockResponseMinutesMedian: 0,
    bypassesDetected: 0,
    invitesCreated: 0,
    streakHistogram: null,
  };
}

function emptyEngagement(): PeriodMetrics['engagement'] {
  return {
    available: false,
    dailyActiveUsers: 0,
    newUsers: 0,
    wau: 0,
    mau: 0,
    permissionDenialPct: 0,
    funnelBasis: 'events',
    onboarding: { onboardingStart: 0, authComplete: 0, permissionGranted: 0, appsSelected: 0, onboardingComplete: 0 },
    invite: { inviteCreated: 0, inviteShared: 0, inviteEntered: 0 },
  };
}

function emptyRevenue(): PeriodMetrics['revenue'] {
  return {
    available: false,
    purchaseComplete: 0,
    purchaseCompleteUsd: 0,
    tipSent: 0,
    tipSentUsdEstimate: 0,
    ascRevenueAvailable: false,
    waiversAsc: 0,
    waiversAscUsd: 0,
    supportAsc: { small: 0, medium: 0, large: 0 },
    supportAscUsd: 0,
    admobAvailable: false,
    adEarningsUsd: 0,
    adImpressions: 0,
    adEcpmUsd: null,
    adMatchRatePct: 0,
  };
}

function emptyAcquisition(): PeriodMetrics['acquisition'] {
  return {
    vercelAvailable: false,
    siteVisits: 0,
    ascAvailable: false,
    downloads: 0,
    signedIn: 0,
    topReferrers: [],
    inviteVisitsWindowTotal: 0,
    summaryWindowStart: null,
    summaryWindowEnd: null,
  };
}

function emptyReviews(): PeriodMetrics['reviews'] {
  return { available: false, averageRating: 0, ratingCount: 0, recentReviews: [] };
}

/** daysExpected for a calendar-anchored span — 'all' has no fixed expected length (100% by definition). */
function gapInfoFor(days: DayDoc[], daysExpected: number | null): { daysWithData: number; daysExpected: number } {
  const expected = daysExpected ?? days.length;
  return { daysWithData: days.length, daysExpected: expected };
}

export async function computePeriodMetrics(window: MetricsWindow): Promise<PeriodMetrics> {
  const allDays = await fetchAllDayDocs();

  if (allDays.length === 0) {
    return {
      window,
      hasData: false,
      windowStart: null,
      windowEnd: null,
      compareNote: 'Collecting — first rollup pending',
      collectorStalled: null,
      gapInfo: { current: { daysWithData: 0, daysExpected: 0 }, previous: null },
      productHealth: emptyProductHealth(),
      engagement: emptyEngagement(),
      revenue: emptyRevenue(),
      acquisition: emptyAcquisition(),
      reviews: emptyReviews(),
      focusSignals: [],
      previousPeriod: null,
    };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const latestDocDate = allDays[allDays.length - 1].date;
  // Audit finding B-C1: surfaced regardless of the selected window — a
  // collector stall should be visible even when viewing "all time" or a
  // custom historical range.
  const collectorStalled = daysBetween(latestDocDate, todayStr) > 2 ? { sinceDate: latestDocDate } : null;

  let windowDays: DayDoc[];
  let prevWindowDays: DayDoc[];
  let compareNote: string;
  let daysExpected: number | null;
  let prevDaysExpected: number | null;

  if (window.kind === 'range') {
    const { start, end } = validateRange(window.start, window.end, allDays);
    windowDays = allDays.filter((d) => d.date >= start && d.date <= end);
    const spanDays = daysBetween(start, end) + 1;
    const prevEnd = addDaysToDateString(start, -1);
    const prevStart = addDaysToDateString(start, -spanDays);
    prevWindowDays = allDays.filter((d) => d.date >= prevStart && d.date <= prevEnd);
    daysExpected = spanDays;
    prevDaysExpected = spanDays;
    const clampedNote = start !== window.start ? ` (clamped to earliest available data, ${start})` : '';
    compareNote =
      prevWindowDays.length > 0
        ? `Showing ${start} → ${end}${clampedNote} · deltas vs the preceding ${spanDays}-day window`
        : `Showing ${start} → ${end}${clampedNote} · not enough history yet for a comparison period`;
  } else if (window.period === 'all') {
    windowDays = allDays;
    prevWindowDays = [];
    daysExpected = null;
    prevDaysExpected = null;
    compareNote = `Showing all time (since ${allDays[0].date}) · no comparison period`;
  } else {
    // Calendar-anchored to real "today" (audit finding B-C1/B-C2) — NOT
    // `allDays.slice(-n)`, which silently stretched to "the last n
    // *documents*" (any collector stall or missing day made the window span
    // more real calendar time than its label claimed, and could make a
    // sub-n-history dashboard show all-time data still labeled "last 30
    // days"). Anchored to yesterday, not today — the collector's freshest
    // possible doc is always "yesterday" by design, so anchoring to today
    // would show a permanent 1-day gap even in a perfectly healthy state.
    const n = PERIOD_DAYS[window.period];
    const end = addDaysToDateString(todayStr, -1);
    const start = addDaysToDateString(end, -(n - 1));
    const prevEnd = addDaysToDateString(start, -1);
    const prevStart = addDaysToDateString(prevEnd, -(n - 1));
    windowDays = allDays.filter((d) => d.date >= start && d.date <= end);
    prevWindowDays = allDays.filter((d) => d.date >= prevStart && d.date <= prevEnd);
    daysExpected = n;
    prevDaysExpected = n;
    const label = window.period === '7d' ? 'last 7 days' : window.period === '30d' ? 'last 30 days' : 'last 90 days';
    compareNote =
      prevWindowDays.length > 0
        ? `Showing ${label} (${start} → ${end}) · deltas vs previous ${label.replace('last ', '')}`
        : `Showing ${label} (${start} → ${end}) · not enough history yet for a comparison period`;
  }

  const gapInfo = {
    current: gapInfoFor(windowDays, daysExpected),
    previous: prevWindowDays.length > 0 ? gapInfoFor(prevWindowDays, prevDaysExpected) : null,
  };
  // Audit finding B-M7: disclose intra-window completeness directly in the
  // human-readable note, not just the structured gapInfo field above.
  if (gapInfo.current.daysWithData < gapInfo.current.daysExpected) {
    compareNote += ` (${gapInfo.current.daysWithData} of ${gapInfo.current.daysExpected} days reported)`;
  }

  const pactsEndedByReason = Object.fromEntries(
    PACT_END_REASONS.map((r) => [
      r,
      windowDays.reduce((acc, d) => acc + (Number(d.firestore?.pactsEndedByReason?.[r]) || 0), 0),
    ])
  ) as PeriodMetrics['productHealth']['pactsEndedByReason'];

  const unlockApproved = sumWindow(windowDays, 'unlockApproved');
  const unlockDenied = sumWindow(windowDays, 'unlockDenied');

  const productHealth: PeriodMetrics['productHealth'] = {
    newUsers: sumWindow(windowDays, 'usersNew'),
    pairedPct: pairedPctSnapshot(windowDays),
    engagedPairs: engagedPairsSnapshot(windowDays),
    pactsStarted: sumWindow(windowDays, 'pactsStarted'),
    pactsEnded: sumWindow(windowDays, 'pactsEnded'),
    pactCompletionPct: pactCompletionPct(windowDays),
    pactsEndedByReason,
    lockSessionsStarted: sumWindow(windowDays, 'lockSessionsStarted'),
    lockSessionsEnded: sumWindow(windowDays, 'lockSessionsEnded'),
    lockHoursEnded: sumWindow(windowDays, 'lockMinutesEnded') / 60,
    unlockRequestsCreated: sumWindow(windowDays, 'unlockRequestsCreated'),
    unlockApproved,
    unlockDenied,
    unlockApprovalPct: unlockApproved + unlockDenied > 0 ? (unlockApproved / (unlockApproved + unlockDenied)) * 100 : 0,
    unlockResponseMinutesMedian: medianOfDailyMedians(windowDays),
    bypassesDetected: sumWindow(windowDays, 'bypassesDetected'),
    invitesCreated: sumWindow(windowDays, 'invitesCreated'),
    streakHistogram: latestStreakHistogram(windowDays),
  };

  const focusSignals =
    prevWindowDays.length > 0
      ? computeFocusSignals(comparableMetrics(windowDays), comparableMetrics(prevWindowDays))
      : [];

  const ga4Latest = latestGA4Day(windowDays);
  const permissionGrantedSum = sumGA4Window(windowDays, 'permissionGranted');
  const permissionDeniedSum = sumGA4Window(windowDays, 'permissionDenied');
  const funnelBasis: 'users' | 'events' = allDaysHaveGA4UsersFields(windowDays) ? 'users' : 'events';
  const onboardingField = (base: string) => (funnelBasis === 'users' ? `${base}Users` : base);
  const engagement: PeriodMetrics['engagement'] = {
    available: ga4Latest !== null,
    dailyActiveUsers: Number(ga4Latest?.activeUsers) || 0,
    newUsers: sumGA4Window(windowDays, 'newUsers'),
    wau: Number(ga4Latest?.wau) || 0,
    mau: Number(ga4Latest?.mau) || 0,
    permissionDenialPct:
      permissionGrantedSum + permissionDeniedSum > 0
        ? (permissionDeniedSum / (permissionGrantedSum + permissionDeniedSum)) * 100
        : 0,
    funnelBasis,
    onboarding: {
      onboardingStart: sumGA4Window(windowDays, onboardingField('onboardingStart')),
      authComplete: sumGA4Window(windowDays, onboardingField('authComplete')),
      permissionGranted: sumGA4Window(windowDays, onboardingField('permissionGranted')),
      appsSelected: sumGA4Window(windowDays, onboardingField('appsSelected')),
      onboardingComplete: sumGA4Window(windowDays, onboardingField('onboardingComplete')),
    },
    invite: {
      inviteCreated: sumGA4Window(windowDays, onboardingField('inviteCreated')),
      inviteShared: sumGA4Window(windowDays, onboardingField('inviteShared')),
      inviteEntered: sumGA4Window(windowDays, onboardingField('inviteEntered')),
    },
  };

  const purchaseComplete = sumGA4Window(windowDays, 'purchaseComplete');
  const tipSent = sumGA4Window(windowDays, 'tipSent');
  const waiversAsc = sumASCIapWindow(windowDays, 'waivers');
  const supportAsc = {
    small: sumASCIapWindow(windowDays, 'supportSmall'),
    medium: sumASCIapWindow(windowDays, 'supportMedium'),
    large: sumASCIapWindow(windowDays, 'supportLarge'),
  };
  const revenue: PeriodMetrics['revenue'] = {
    available: ga4Latest !== null,
    purchaseComplete,
    purchaseCompleteUsd: purchaseComplete * WAIVER_PRICE_USD,
    tipSent,
    tipSentUsdEstimate: tipSent * TIP_ESTIMATED_PRICE_USD,
    ascRevenueAvailable: anyASCDay(windowDays),
    waiversAsc,
    waiversAscUsd: waiversAsc * WAIVER_PRICE_USD,
    supportAsc,
    supportAscUsd:
      supportAsc.small * TIP_TIER_PRICES_USD.small +
      supportAsc.medium * TIP_TIER_PRICES_USD.medium +
      supportAsc.large * TIP_TIER_PRICES_USD.large,
    admobAvailable: anyAdMobDay(windowDays),
    adEarningsUsd: sumAdMobWindow(windowDays, 'earningsUsd'),
    adImpressions: sumAdMobWindow(windowDays, 'impressions'),
    adEcpmUsd: sumWeightedAdMobEcpm(windowDays),
    adMatchRatePct: averageAdMobMatchRatePct(windowDays),
  };

  const vercelSummaryLatest = latestVercelSummary(windowDays);
  const acquisition: PeriodMetrics['acquisition'] = {
    vercelAvailable: anyVercelDay(windowDays),
    siteVisits: sumVercelWindow(windowDays, 'visits'),
    ascAvailable: anyASCDay(windowDays),
    downloads: sumASCWindow(windowDays, 'units'),
    signedIn: productHealth.newUsers,
    topReferrers: Array.isArray(vercelSummaryLatest?.topReferrers) ? vercelSummaryLatest!.topReferrers : [],
    inviteVisitsWindowTotal: Number(vercelSummaryLatest?.inviteVisitsWindowTotal) || 0,
    summaryWindowStart: vercelSummaryLatest?.windowStart ?? null,
    summaryWindowEnd: vercelSummaryLatest?.windowEnd ?? null,
  };

  const reviewsLatest = latestReviewsBlock(windowDays);
  const reviews: PeriodMetrics['reviews'] = {
    available: reviewsLatest !== null,
    averageRating: Number(reviewsLatest?.averageRating) || 0,
    ratingCount: Number(reviewsLatest?.ratingCount) || 0,
    recentReviews: Array.isArray(reviewsLatest?.recentReviews) ? reviewsLatest!.recentReviews : [],
  };

  const previousPeriod: PeriodMetrics['previousPeriod'] =
    prevWindowDays.length > 0
      ? {
          productHealth: {
            newUsers: sumWindow(prevWindowDays, 'usersNew'),
            pactCompletionPct: pactCompletionPct(prevWindowDays),
            unlockResponseMinutesMedian: medianOfDailyMedians(prevWindowDays),
          },
          engagement: {
            dailyActiveUsers: Number(latestGA4Day(prevWindowDays)?.activeUsers) || 0,
            newUsers: sumGA4Window(prevWindowDays, 'newUsers'),
            permissionDenialPct: (() => {
              const g = sumGA4Window(prevWindowDays, 'permissionGranted');
              const d = sumGA4Window(prevWindowDays, 'permissionDenied');
              return g + d > 0 ? (d / (g + d)) * 100 : 0;
            })(),
          },
          revenue: {
            adEarningsUsd: sumAdMobWindow(prevWindowDays, 'earningsUsd'),
            adEcpmUsd: sumWeightedAdMobEcpm(prevWindowDays),
            waiversAscUsd: sumASCIapWindow(prevWindowDays, 'waivers') * WAIVER_PRICE_USD,
            supportAscUsd:
              sumASCIapWindow(prevWindowDays, 'supportSmall') * TIP_TIER_PRICES_USD.small +
              sumASCIapWindow(prevWindowDays, 'supportMedium') * TIP_TIER_PRICES_USD.medium +
              sumASCIapWindow(prevWindowDays, 'supportLarge') * TIP_TIER_PRICES_USD.large,
          },
          acquisition: {
            siteVisits: sumVercelWindow(prevWindowDays, 'visits'),
            downloads: sumASCWindow(prevWindowDays, 'units'),
          },
          reviews: {
            averageRating: Number(latestReviewsBlock(prevWindowDays)?.averageRating) || 0,
          },
        }
      : null;

  return {
    window,
    hasData: true,
    windowStart: windowDays[0]?.date ?? null,
    windowEnd: windowDays[windowDays.length - 1]?.date ?? null,
    compareNote,
    collectorStalled,
    gapInfo,
    productHealth,
    engagement,
    revenue,
    acquisition,
    reviews,
    focusSignals,
    previousPeriod,
  };
}

// ---------------------------------------------------------------------------
// Lifetime external-source totals — "Lifetime totals" (mockup: "unaffected
// by the period filter") needs downloads/ads-watched/ad-revenue sums, which
// only exist in the adminMetrics rollup (external APIs, not Firestore) —
// unlike the rest of Lifetime Totals, which is live-queried in
// computeLiveMetrics(). A separate function, called alongside
// computeLiveMetrics() by /api/admin/live, rather than folded into it, so
// that function's existing signature/callers stay untouched.
// ---------------------------------------------------------------------------

export interface LifetimeExternalTotals {
  available: boolean; // true if EITHER admob or asc has ever populated (general gating — kept for back-compat)
  admobAvailable: boolean;
  ascAvailable: boolean;
  ga4Available: boolean;
  adsWatchedTotal: number;
  adEarningsUsdTotal: number;
  downloadsTotal: number;
  purchaseCompleteTotal: number; // GA4 -- SECONDARY signal, includes test purchases
  purchaseCompleteUsdTotal: number;
  tipSentTotal: number; // GA4 -- SECONDARY signal, includes test purchases
  tipSentUsdEstimateTotal: number;
  waiversAscTotal: number; // ASC -- AUTHORITATIVE, excludes test purchases
  waiversAscUsdTotal: number;
  supportAscTotal: number; // ASC -- AUTHORITATIVE, excludes test purchases (small+medium+large)
  supportAscUsdTotal: number; // exact, real per-tier prices
  /**
   * Server-computed once, consumed identically by the UI and snapshot.ts
   * (audit finding B-L3 — this composition previously lived only in
   * index.astro's client script, duplicated nowhere else but still the
   * wrong layer for a number meant to be authoritative). Only meaningful
   * when both `admobAvailable` and `ascAvailable` are true — see
   * `totalRevenueComplete`.
   */
  totalRevenueUsdTotal: number;
  /** True only when every component of totalRevenueUsdTotal (ads + IAP) is actually available — false means the figure is partial, not wrong (audit finding B-H5). */
  totalRevenueComplete: boolean;
}

export async function computeLifetimeExternalTotals(): Promise<LifetimeExternalTotals> {
  const allDays = await fetchAllDayDocs();
  let adsWatchedTotal = 0;
  let adEarningsUsdTotal = 0;
  let downloadsTotal = 0;
  let purchaseCompleteTotal = 0;
  let tipSentTotal = 0;
  let waiversAscTotal = 0;
  let supportSmallAscTotal = 0;
  let supportMediumAscTotal = 0;
  let supportLargeAscTotal = 0;
  let admobAvailable = false;
  let ascAvailable = false;

  for (const d of allDays) {
    if (d.admob) {
      admobAvailable = true;
      adsWatchedTotal += Number(d.admob.impressions) || 0;
      adEarningsUsdTotal += Number(d.admob.earningsUsd) || 0;
    }
    if (d.asc) {
      ascAvailable = true;
      downloadsTotal += Number(d.asc.units) || 0;
      waiversAscTotal += Number(d.asc.iap?.waivers) || 0;
      supportSmallAscTotal += Number(d.asc.iap?.supportSmall) || 0;
      supportMediumAscTotal += Number(d.asc.iap?.supportMedium) || 0;
      supportLargeAscTotal += Number(d.asc.iap?.supportLarge) || 0;
    }
    if (d.ga4) {
      purchaseCompleteTotal += Number(d.ga4.purchaseComplete) || 0;
      tipSentTotal += Number(d.ga4.tipSent) || 0;
    }
  }

  const supportAscTotal = supportSmallAscTotal + supportMediumAscTotal + supportLargeAscTotal;
  const waiversAscUsdTotal = waiversAscTotal * WAIVER_PRICE_USD;
  const supportAscUsdTotal =
    supportSmallAscTotal * TIP_TIER_PRICES_USD.small +
    supportMediumAscTotal * TIP_TIER_PRICES_USD.medium +
    supportLargeAscTotal * TIP_TIER_PRICES_USD.large;

  return {
    available: admobAvailable || ascAvailable,
    admobAvailable,
    ascAvailable,
    ga4Available: anyGA4Day(allDays),
    adsWatchedTotal,
    adEarningsUsdTotal,
    downloadsTotal,
    purchaseCompleteTotal,
    purchaseCompleteUsdTotal: purchaseCompleteTotal * WAIVER_PRICE_USD,
    tipSentTotal,
    tipSentUsdEstimateTotal: tipSentTotal * TIP_ESTIMATED_PRICE_USD,
    waiversAscTotal,
    waiversAscUsdTotal,
    supportAscTotal,
    supportAscUsdTotal,
    totalRevenueUsdTotal: adEarningsUsdTotal + waiversAscUsdTotal + supportAscUsdTotal,
    totalRevenueComplete: admobAvailable && ascAvailable,
  };
}
