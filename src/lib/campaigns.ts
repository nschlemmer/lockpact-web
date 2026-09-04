// Apple Search Ads / App Analytics campaign-link attribution.
//
// Format + constraints verified against
// developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links
// (2026-09-04): `ct` is alphanumeric plus limited punctuation, max 30 chars; a metric
// only surfaces in App Analytics once it reaches 5 in the selected date range; Apple
// attributes a download within a 24h window of the click.
export const APP_STORE_ID = '6759302382';

// Server/build-time only — never PUBLIC_ (must not ship in client JS, though this site
// has none for blog pages). Unset until Nick creates a campaign link in ASC → App
// Analytics → Acquisition → Campaigns (that's also where the token is generated).
export const providerToken: string | undefined =
  import.meta.env.ASC_PROVIDER_TOKEN ?? process.env.ASC_PROVIDER_TOKEN;

const BARE_APP_STORE_URL = `https://apps.apple.com/app/lockpact/id${APP_STORE_ID}`;

/**
 * Sanitize a raw campaign label into a valid Apple `ct` token: lower-case,
 * any run of non [a-z0-9-] collapsed to a single '-', trimmed of leading/trailing
 * '-', truncated to 30 chars.
 */
export function campaignToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

/**
 * Build the App Store URL for a given campaign. Returns the tokenized campaign-link
 * URL only when BOTH a provider token (`pt`) and a non-empty campaign are available;
 * otherwise falls back to the bare, unattributed App Store URL — never a broken link.
 */
export function appStoreUrl(campaign?: string): string {
  if (!providerToken || !campaign) return BARE_APP_STORE_URL;
  const ct = campaignToken(campaign);
  if (!ct) return BARE_APP_STORE_URL;
  return `https://apps.apple.com/app/apple-store/id${APP_STORE_ID}?pt=${encodeURIComponent(providerToken)}&ct=${ct}&mt=8`;
}
