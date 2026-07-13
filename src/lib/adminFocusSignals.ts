// Focus signals config (spec §A1) — Round 1 is rule-based: flag any tracked
// metric whose period-over-period delta exceeds its threshold, tag it
// DEV or MARKETING. Kept in one module so thresholds/tags are edited in
// exactly one place.

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
    format: (v) => `${v.toFixed(0)} min`,
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
    const pctDelta = prevVal !== 0 ? (absDelta / prevVal) * 100 : 0;
    const exceedsAbs = cfg.thresholdAbs !== undefined && Math.abs(absDelta) >= cfg.thresholdAbs;
    const exceedsPct = cfg.thresholdPct !== undefined && Math.abs(pctDelta) >= cfg.thresholdPct;
    // When a metric defines BOTH threshold kinds, require both to be crossed
    // (AND) — e.g. a metric with a small base value can cross a % threshold
    // on a tiny, meaningless absolute move. A metric with only one threshold
    // kind defined keeps firing on that one alone, as before.
    const bothDefined = cfg.thresholdAbs !== undefined && cfg.thresholdPct !== undefined;
    const crossed = bothDefined ? exceedsAbs && exceedsPct : exceedsAbs || exceedsPct;
    if (!crossed) continue;

    const improved = cfg.goodDirection === 'up' ? absDelta > 0 : absDelta < 0;
    const doubleThreshold =
      Math.max(cfg.thresholdAbs ?? 0, 0) * 2 || Math.max(cfg.thresholdPct ?? 0, 0) * 2;
    const magnitude = Math.max(Math.abs(absDelta), Math.abs(pctDelta));
    const severity: FocusSignalSeverity = improved ? 'green' : magnitude >= doubleThreshold ? 'red' : 'amber';
    const direction = absDelta > 0 ? 'rose' : absDelta < 0 ? 'fell' : 'held steady';

    signals.push({
      severity,
      text: `${cfg.label} ${direction} to ${cfg.format(curVal)} (from ${cfg.format(prevVal)})`,
      tag: cfg.tag,
    });
  }

  return signals;
}
