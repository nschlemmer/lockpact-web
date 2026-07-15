/** Isomorphic formatting helpers shared between server routes and the admin client script. */

/**
 * Formats a minute value for display, special-casing the sub-1-minute range
 * so a genuinely fast response doesn't render as a misleading "0 min"
 * (`.toFixed(0)` alone collapses anything under 0.5 to "0"). Clamped to
 * >=0 (audit finding B-L1) — a malformed/out-of-order timestamp pair
 * upstream should never render as a negative duration.
 */
export function formatMinutes(n: number): string {
  const clamped = Math.max(0, n);
  if (clamped > 0 && clamped < 1) return '<1 min';
  return `${Math.round(clamped)} min`;
}
