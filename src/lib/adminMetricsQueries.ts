import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from './adminAuth';
import { computeFocusSignals, type FocusSignal } from './adminFocusSignals';

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

  let lockHoursTotal = 0;
  for (const doc of lockSessions.docs) {
    const data = doc.data();
    const createdAtMs = tsToMillis(data.createdAt);
    const endedAtMs = tsToMillis(data.endedAt);
    if (createdAtMs !== null && endedAtMs !== null) {
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
 * user-facing message on anything malformed.
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
  return { start: clampedStart, end };
}

interface DayDoc {
  date: string;
  firestore: Record<string, any>;
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

/** Median of each day's own median in the window, excluding days with zero resolved requests. */
function medianOfDailyMedians(days: DayDoc[]): number {
  const values = days
    .filter((d) => (d.firestore?.unlockApproved || 0) + (d.firestore?.unlockDenied || 0) > 0)
    .map((d) => Number(d.firestore?.unlockResponseMinutesMedian) || 0);
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

function pairedPctSnapshot(days: DayDoc[]): number {
  if (days.length === 0) return 0;
  const last = days[days.length - 1].firestore;
  const total = Number(last?.usersTotal) || 0;
  const paired = Number(last?.paired) || 0;
  return total > 0 ? (paired / total) * 100 : 0;
}

function engagedPairsSnapshot(days: DayDoc[]): number {
  if (days.length === 0) return 0;
  return Number(days[days.length - 1].firestore?.partnershipsEngaged14d) || 0;
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
function comparableMetrics(days: DayDoc[]): Record<string, number> {
  return {
    pactCompletionPct: pactCompletionPct(days),
    unlockResponseMinutesMedian: medianOfDailyMedians(days),
    pairedPct: pairedPctSnapshot(days),
    engagedPairs: engagedPairsSnapshot(days),
  };
}

export interface PeriodMetrics {
  window: MetricsWindow;
  hasData: boolean;
  windowStart: string | null;
  windowEnd: string | null;
  compareNote: string;
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
  focusSignals: FocusSignal[];
}

async function fetchAllDayDocs(): Promise<DayDoc[]> {
  const snap = await adminDb.collection('adminMetrics').orderBy('date', 'asc').get();
  return snap.docs.map((d) => d.data() as DayDoc);
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

export async function computePeriodMetrics(window: MetricsWindow): Promise<PeriodMetrics> {
  const allDays = await fetchAllDayDocs();

  if (allDays.length === 0) {
    return {
      window,
      hasData: false,
      windowStart: null,
      windowEnd: null,
      compareNote: 'Collecting — first rollup pending',
      productHealth: emptyProductHealth(),
      focusSignals: [],
    };
  }

  let windowDays: DayDoc[];
  let prevWindowDays: DayDoc[];
  let compareNote: string;

  if (window.kind === 'range') {
    const { start, end } = validateRange(window.start, window.end, allDays);
    windowDays = allDays.filter((d) => d.date >= start && d.date <= end);
    const spanDays = daysBetween(start, end) + 1;
    const prevEnd = addDaysToDateString(start, -1);
    const prevStart = addDaysToDateString(start, -spanDays);
    prevWindowDays = allDays.filter((d) => d.date >= prevStart && d.date <= prevEnd);
    const clampedNote = start !== window.start ? ` (clamped to earliest available data, ${start})` : '';
    compareNote =
      prevWindowDays.length > 0
        ? `Showing ${start} → ${end}${clampedNote} · deltas vs the preceding ${spanDays}-day window`
        : `Showing ${start} → ${end}${clampedNote} · not enough history yet for a comparison period`;
  } else if (window.period === 'all') {
    windowDays = allDays;
    prevWindowDays = [];
    compareNote = `Showing all time (since ${allDays[0].date}) · no comparison period`;
  } else {
    const n = PERIOD_DAYS[window.period];
    windowDays = allDays.slice(-n);
    prevWindowDays = allDays.slice(-2 * n, -n);
    const label = window.period === '7d' ? 'last 7 days' : window.period === '30d' ? 'last 30 days' : 'last 90 days';
    compareNote =
      prevWindowDays.length > 0
        ? `Showing ${label} · deltas vs previous ${label.replace('last ', '')}`
        : `Showing ${label} · not enough history yet for a comparison period`;
  }

  const pactsEndedByReason = Object.fromEntries(
    PACT_END_REASONS.map((r) => [
      r,
      windowDays.reduce((acc, d) => acc + (Number(d.firestore?.pactsEndedByReason?.[r]) || 0), 0),
    ])
  ) as PeriodMetrics['productHealth']['pactsEndedByReason'];

  const unlockApproved = sumWindow(windowDays, 'unlockApproved');
  const unlockDenied = sumWindow(windowDays, 'unlockDenied');
  const lastDayStreak = windowDays.length > 0
    ? (windowDays[windowDays.length - 1].firestore?.streakHistogram as Record<StreakBucket, number> | undefined)
    : undefined;

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
    streakHistogram: lastDayStreak ?? null,
  };

  const focusSignals =
    prevWindowDays.length > 0
      ? computeFocusSignals(comparableMetrics(windowDays), comparableMetrics(prevWindowDays))
      : [];

  return {
    window,
    hasData: true,
    windowStart: windowDays[0]?.date ?? null,
    windowEnd: windowDays[windowDays.length - 1]?.date ?? null,
    compareNote,
    productHealth,
    focusSignals,
  };
}
