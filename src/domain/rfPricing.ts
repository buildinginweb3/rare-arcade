/**
 * RF → USDG pricing for $RAREFRIENDS cashback prizes.
 *
 * RF cashback is paid in RF but accounted in USDG, so an RF prize must be
 * valued at the moment it is seeded. That locked value is what feeds RTP, which
 * means a wrong rate here produces a machine that publishes a confidently
 * incorrect number.
 *
 * This module exists because that rate was previously a hardcoded constant
 * (`demoEconomy.demoRfPriceUsdg`). A constant cannot be right: RF moves, and a
 * stale rate silently mis-states the RTP of every RF prize seeded with it.
 *
 * Resolution rules, in order:
 *   1. A fresh, positive, finite live quote wins.
 *   2. A stale live quote is used but flagged, so the creator sees the age.
 *   3. Otherwise fall back to the documented demo constant, flagged
 *      `fallback` so the UI can say so out loud.
 *
 * The source is never silently swallowed: every RF prize stores the rate it was
 * locked at (`RfPrizeEntry.rfPriceUsdg`), so a machine published on a fallback
 * rate is auditable forever after.
 *
 * In live mode, `resolveRfQuote` is fed by the on-chain RF/USDG oracle
 * (`web3/contracts.ts → rfPriceOracle`) instead of OpenSea.
 */

import { RARE_ARCADE_DEMO_ECONOMY } from './demoEconomy.ts';

export type RfPriceSource = 'live' | 'stale' | 'fallback';

export interface RfQuote {
  /** USDG per 1 RF, as a decimal string. Always parseable by `parseUsdg`. */
  usdgPerRf: string;
  source: RfPriceSource;
  /** Epoch ms the quote was captured, or null for the fallback constant. */
  valuedAt: number | null;
}

/**
 * How old a live quote may be before it is still used but flagged `stale`.
 * Generous — RF is volatile, so this exists to surface a clearly stale figure
 * rather than to reject it and force a fallback.
 */
export const RF_PRICE_STALE_AFTER_MS = 15 * 60 * 1000;

/** Shape returned by `nfts/marketData.getRareFriendsUsdPrice()`. */
export interface LiveRfPriceLike {
  usdPrice: string;
  valuedAt: number;
}

function isUsablePrice(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const n = Number(value);
  return value.trim() !== '' && Number.isFinite(n) && n > 0;
}

/**
 * Pick the rate to lock RF cashback prizes at.
 *
 * Never returns an unusable quote: if the live price is missing, malformed,
 * non-positive, or older than `RF_PRICE_STALE_AFTER_MS`, the caller gets the
 * documented fallback constant with `source: 'fallback'` (or `'stale'` when a
 * real-but-old number was available).
 */
export function resolveRfQuote(
  live: LiveRfPriceLike | null | undefined,
  now: number = Date.now()
): RfQuote {
  if (!live || !isUsablePrice(live.usdPrice)) {
    return {
      usdgPerRf: RARE_ARCADE_DEMO_ECONOMY.demoRfPriceUsdg,
      source: 'fallback',
      valuedAt: null,
    };
  }

  const age = now - live.valuedAt;
  // A timestamp from the future (clock skew) is not "stale" — treat as fresh.
  const isStale = age > RF_PRICE_STALE_AFTER_MS && live.valuedAt > 0;

  return {
    usdgPerRf: live.usdPrice,
    source: isStale ? 'stale' : 'live',
    valuedAt: live.valuedAt,
  };
}

/** True when the quote is not trustworthy enough to present as a market price. */
export function isFallbackQuote(quote: RfQuote): boolean {
  return quote.source === 'fallback';
}

/** Human label for the UI, including the rate so it is always visible. */
export function describeRfQuote(quote: RfQuote, now: number = Date.now()): string {
  if (quote.source === 'fallback') {
    return `FALLBACK $${quote.usdgPerRf}/RF — live RF price unavailable`;
  }
  if (quote.source === 'stale') {
    const mins = Math.max(1, Math.round((now - (quote.valuedAt ?? 0)) / 60000));
    return `STALE $${quote.usdgPerRf}/RF (${mins}m old) — live RF price not refreshing`;
  }
  return `LIVE $${quote.usdgPerRf}/RF`;
}