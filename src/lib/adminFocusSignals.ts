// Focus signals config (spec §A1) — Round 1 is rule-based: flag any tracked
// metric whose period-over-period delta exceeds its threshold, tag it
// DEV or MARKETING. Kept in one module so thresholds/tags are edited in
// exactly one place.

import { formatMinutes } from './format';

export type FocusSignalTag = 'dev' | 'mkt';
export type FocusSignalSeverity = 'red' | 'amber' | 'green';

export interface FocusSignalMetricConfig {
  key: string;
  label: string;
  tag: FocusSignalTag;
  /** Absolute-point threshold (e.g. percentage points). */
  thresholdAbs?: number;
  /** Relative percent-change threshold. */
  thresholdPct?: number;
  goodDirection: 'up' | 'down';
  format: (value: number) => string;
}

export const FOCUS_SIGNAL_METRICS: FocusSignalMetricConfig[] = [
  {
    key: 'pactCompletionPct',
    label: 'Pacts kept to the end',
    tag: 'dev',
    thresholdAbs: 5,
    goodDirection: 'up',
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    key: 'unlockResponseMinutesMedian',
    label: 'Median unlock response time',
    tag: 'dev',
    // Both must be exceeded (see computeFocusSignals) — percent-only was
    // firing on noise for a metric with a small base value (e.g. a 2min ->
    // 2.5min swing is +25%, past the old 20% threshold, on a half-minute
    // change nobody should get paged for).
    thresholdAbs: 5,
    thresholdPct: 20,
    goodDirection: 'down',
    format: (v) => formatMinutes(v),
  },
  {
    key: 'pairedPct',
    label: 'Paired rate',
    tag: 'mkt',
    thresholdAbs: 5,
    goodDirection: 'up',
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    key: 'engagedPairs',
    label: 'Engaged pairs (14d)',
    tag: 'mkt',
    thresholdPct: 20,
    goodDirection: 'up',
    format: (v) => `${v.toFixed(0)}`,
  },
  // New in this round (audit finding B-M9 — signal coverage was limited to
  // 4 metrics vs. the spec's own example list, which explicitly calls out
  // funnel-step conversion and referrer/traffic thresholds).
  {
    key: 'onboardingCompletionPct',
    label: 'Onboarding completion rate',
    tag: 'dev',
    thresholdAbs: 5,
    goodDirection: 'up',
    format: (v) => `${v.toFixed(0)}%`,
  },
  {
    key: 'siteVisits',
    label: 'Site visits',
    tag: 'mkt',
    thresholdPct: 25,
    goodDirection: 'up',
    format: (v) => `${v.toFixed(0)}`,
  },
];

export interface FocusSignal {
  severity: FocusSignalSeverity;
  text: string;
  tag: FocusSignalTag;
}

/**
 * Compares current vs. previous period values for each configured metric and
 * returns a signal for anything crossing its threshold. Returns [] when there
 * is no previous period to compare against (e.g. "all time", or the very
 * first period once rollups start landing).
 */
export function computeFocusSignals(
  current: Record<string, number | undefined>,
  previous: Record<string, number | undefined> | null
): FocusSignal[] {
  if (!previous) return [];
  const signals: FocusSignal[] = [];

  for (const cfg of FOCUS_SIGNAL_METRICS) {
    const curVal = current[cfg.key];
    const prevVal = previous[cfg.key];
    if (curVal === undefined || prevVal === undefined) continue;

    const absDelta = curVal - prevVal;
    // Audit finding B-M2: prevVal===0 forced pctDelta to 0, which meant a
    // percent-only-threshold metric going from 0 to any positive value
    // could never cross its own threshold and silently never signaled.
    // Treat 0 -> positive as an automatic threshold cross instead.
    const zeroBaselineCross = prevVal === 0 && curVal > 0;
    const pctDelta = prevVal !== 0 ? (absDelta / prevVal) * 100 : 0;
    const exceedsAbs = cfg.thresholdAbs !== undefined && Math.abs(absDelta) >= cfg.thresholdAbs;
    const exceedsPct = cfg.thresholdPct !== undefined && Math.abs(pctDelta) >= cfg.thresholdPct;
    // When a metric defines BOTH threshold kinds, require both to be crossed
    // (AND) — e.g. a metric with a small base value can cross a % threshold
    // on a tiny, meaningless absolute move. A metric with only one threshold
    // kind defined keeps firing on that one alone, as before.
    const bothDefined = cfg.thresholdAbs !== undefined && cfg.thresholdPct !== undefined;
    const crossed = zeroBaselineCross || (bothDefined ? exceedsAbs && exceedsPct : exceedsAbs || exceedsPct);
    if (!crossed) continue;

    const improved = cfg.goodDirection === 'up' ? absDelta > 0 : absDelta < 0;
    // Audit finding B-M1: severity magnitude previously Math.max'd an
    // absolute-point delta against a percent delta together, comparing two
    // different units for any metric with only ONE threshold kind defined —
    // e.g. `engagedPairs` (percent-only) could hit "red" purely because its
    // raw pair-count delta happened to exceed a percent-scaled threshold
    // number. Now each threshold KIND is only ever compared against its own
    // doubled value, never against the other kind's.
    let severity: FocusSignalSeverity;
    if (improved) {
      severity = 'green';
    } else if (zeroBaselineCross) {
      severity = 'amber'; // floor — a 0-baseline cross is always at least a real signal, but "double the threshold" has no meaning from a 0 base
    } else {
      const redOnAbs = cfg.thresholdAbs !== undefined && Math.abs(absDelta) >= cfg.thresholdAbs * 2;
      const redOnPct = cfg.thresholdPct !== undefined && Math.abs(pctDelta) >= cfg.thresholdPct * 2;
      severity = redOnAbs || redOnPct ? 'red' : 'amber';
    }
    const direction = absDelta > 0 ? 'rose' : absDelta < 0 ? 'fell' : 'held steady';

    signals.push({
      severity,
      text: `${cfg.label} ${direction} to ${cfg.format(curVal)} (from ${cfg.format(prevVal)})`,
      tag: cfg.tag,
    });
  }

  return signals;
}
