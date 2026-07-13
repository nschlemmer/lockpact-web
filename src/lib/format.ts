/** Isomorphic formatting helpers shared between server routes and the admin client script. */

/**
 * Formats a minute value for display, special-casing the sub-1-minute range
 * so a genuinely fast response doesn't render as a misleading "0 min"
 * (`.toFixed(0)` alone collapses anything under 0.5 to "0").
 */
export function formatMinutes(n: number): string {
  if (n > 0 && n < 1) return '<1 min';
  return `${Math.round(n)} min`;
}
