/**
 * Precise NFT→RF valuation math.
 *
 * referenceRf = topBidUsd / rfUsd
 *
 * No binary floating point in the authoritative path: USD strings are scaled
 * to integer microunits (1e9) and the division rounds to the nearest 0.001 RF
 * (1 internal unit, matching RF_SCALE = 1000).
 */

import { RF_SCALE } from '../domain/rf.ts';

const USD_SCALE = 1_000_000_000n; // 1e9 microunits for USD strings

/** Parse a decimal USD string into scaled integer microunits. Returns null if invalid. */
export function parseUsdToScaled(usd: string | number | null | undefined): bigint | null {
  if (usd === null || usd === undefined) return null;
  const str = String(usd).trim();
  if (!str || !/^\d+(\.\d+)?$/.test(str)) return null;
  const [intPartOpt, fracRaw = ''] = str.split('.');
  const intPart = intPartOpt ?? '';
  const frac = (fracRaw + '000000000').slice(0, 9);
  try {
    return BigInt(intPart === '' ? '0' : intPart) * USD_SCALE + BigInt(frac);
  } catch {
    return null;
  }
}

/**
 * Convert top-bid USD → RF reference (internal units, 1 RF = 1000).
 * Rounds to nearest 0.001 RF. Returns null when inputs are invalid/non-positive.
 */
export function convertUsdToRfUnits(
  topBidUsd: string | number | null | undefined,
  rfUsd: string | number | null | undefined
): bigint | null {
  const bidScaled = parseUsdToScaled(topBidUsd);
  const rfScaled = parseUsdToScaled(rfUsd);
  if (bidScaled === null || rfScaled === null) return null;
  if (bidScaled <= 0n || rfScaled <= 0n) return null;
  // refUnits = bid / rf * 1000, rounded: (bid*1000*2 + rf) / (2*rf)... simpler:
  // (bidScaled * RF_SCALE + rfScaled/2) / rfScaled
  return (bidScaled * RF_SCALE + rfScaled / 2n) / rfScaled;
}

/** True when a bid number from OpenSea is usable for valuation. */
export function isUsableBidValue(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  );
}

/** @deprecated Use isUsableBidValue. */
export const isUsableFloorValue = isUsableBidValue;

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

/** Compact RF reference display (exact value stays in details/economics). */
export function formatRfReferenceCompact(units: bigint): string {
  const rf = Number(units) / 1000;
  if (!Number.isFinite(rf)) return '—';
  if (rf >= 1_000_000) {
    const v = rf / 1_000_000;
    return `≈ ${trimNum(v)}M RF`;
  }
  if (rf >= 10_000) {
    const v = rf / 1000;
    return `≈ ${trimNum(v)}K RF`;
  }
  return `≈ ${Math.round(rf).toLocaleString('en-US')} RF`;
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
