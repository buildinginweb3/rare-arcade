/**
 * Precise NFT→USDG valuation math.
 *
 * usdgValueUnits = topBidUsd
 *
 * USDG (Global Dollar, Paxos) is redeemable 1:1 for US dollars, so an NFT's
 * USD top bid IS its USDG value. There is no price feed, no division, and no
 * rounding error — which is exactly why this replaced the old
 * topBidUsd / rfUsd conversion: RF is volatile, so dividing by an RF price
 * made a locked valuation drift whenever RF moved.
 *
 * No binary floating point in the authoritative path: the USD decimal string
 * is scaled to integer USDG units (1e6, matching USDG's on-chain decimals).
 */

import { USDG_SCALE } from '../domain/usdg.ts';

const USD_SCALE = USDG_SCALE; // 1 USD == 1 USDG == 1_000_000 internal units

/** Parse a decimal USD string into USDG internal units. Returns null if invalid. */
export function parseUsdToScaled(usd: string | number | null | undefined): bigint | null {
  if (usd === null || usd === undefined) return null;
  const str = String(usd).trim();
  if (!str || !/^\d+(\.\d+)?$/.test(str)) return null;
  const [intPartOpt, fracRaw = ''] = str.split('.');
  const intPart = intPartOpt ?? '';
  const frac = (fracRaw + '000000').slice(0, 6);
  try {
    return BigInt(intPart === '' ? '0' : intPart) * USD_SCALE + BigInt(frac);
  } catch {
    return null;
  }
}

/**
 * Convert an NFT top bid in USD into USDG internal units, 1:1.
 * Returns null when the bid is missing, unparseable, or non-positive — a
 * zero-value NFT must block publishing rather than silently skew RTP.
 */
export function convertUsdToUsdgUnits(
  topBidUsd: string | number | null | undefined
): bigint | null {
  const bidScaled = parseUsdToScaled(topBidUsd);
  if (bidScaled === null) return null;
  if (bidScaled <= 0n) return null;
  return bidScaled;
}

/** True when a bid number from OpenSea is usable for valuation. */
export function isUsableBidValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  );
}

/** Format a USD value with adaptive precision (never "$0.00" when nonzero). */
export function formatUsdAdaptive(usd: string | number | null | undefined): string {
  if (usd === null || usd === undefined) return '—';
  const n = typeof usd === 'string' ? Number(usd) : usd;
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '$0.00';
  if (n >= 1000) {
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }
  if (n >= 1) {
    return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 4, minimumFractionDigits: 2 });
  }
  // Sub-dollar: show up to 8 significant decimals, trim trailing zeros, min 4 dp.
  let s = n.toFixed(8);
  s = s.replace(/0+$/, '');
  if (s.endsWith('.')) s += '00';
  const decimals = Math.max(4, (s.split('.')[1] ?? '').length);
  return '$' + n.toFixed(decimals);
}

/** Compact USDG reference display (exact value stays in details/economics). */
export function formatUsdgReferenceCompact(units: bigint): string {
  const usdg = Number(units) / Number(USD_SCALE);
  if (!Number.isFinite(usdg)) return '—';
  if (usdg >= 1_000_000) {
    return `≈ ${trimNum(usdg / 1_000_000)}M USDG`;
  }
  if (usdg >= 10_000) {
    return `≈ ${trimNum(usdg / 1000)}K USDG`;
  }
  return `≈ ${formatUsdAdaptive(usdg)}`;
}

function trimNum(v: number): string {
  const r = Math.round(v * 100) / 100;
  return String(r);
}

/** Max age for market data used at publish time (15 minutes). */
export const MAX_PUBLISH_DATA_AGE_MS = 15 * 60 * 1000;

/** True when a market timestamp is fresh enough to publish against. */
export function isFreshEnoughForPublish(valuedAt: number, now: number = Date.now()): boolean {
  if (!Number.isFinite(valuedAt) || valuedAt <= 0) return false;
  return now - valuedAt <= MAX_PUBLISH_DATA_AGE_MS;
}
