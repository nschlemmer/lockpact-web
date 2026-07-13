/**
 * Verified real IAP price points — cross-checked against 3 independent
 * sources agreeing exactly (2026-07-13): `docs/monetization-feature-spec.md`,
 * `docs/monetization-strategy.md` (both in the monorepo), and the actual
 * Xcode StoreKit configuration file `lockpact/LockPact/StoreKit.storekit`.
 * These do NOT match the web Stripe "Support LockPact" checkout tiers
 * (`create-checkout-session.ts`'s TIERS constant, a different purchase path)
 * — do not conflate the two when changing either.
 *
 * GA4's `purchase_complete` event does carry a real `price` parameter
 * (confirmed in `AnalyticsService.swift`), which would let a future version
 * sum real per-purchase dollar values instead of count * fixed price. That
 * needs a GA4 custom-metric registered on that parameter, which isn't
 * confirmed configured and isn't verifiable from here — noted as a real,
 * available upgrade path, not attempted blind.
 */

/** com.rotate.lockpact.waiver — non-consumable, single price point. */
export const WAIVER_PRICE_USD = 9.99;

/** com.rotate.lockpact.tip.{small,medium,large} — three distinct prices. */
export const TIP_TIER_PRICES_USD = {
  small: 2.99,
  medium: 6.99,
  large: 14.99,
} as const;

/**
 * The collector only counts total `tip_sent` events, not broken out by
 * tier, so a single blended $ figure for "Support LockPact" this period
 * can't be computed exactly from count alone. Using the median tier price
 * as an estimate — flagged as an estimate everywhere it's displayed, not
 * presented as an exact figure.
 */
export const TIP_ESTIMATED_PRICE_USD = TIP_TIER_PRICES_USD.medium;
