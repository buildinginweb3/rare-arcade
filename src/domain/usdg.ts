/**
 * Fixed-point USDG (Global Dollar) accounting utilities.
 *
 * USDG is the platform's play currency: every pull price, every cashback
 * prize, and every platform fee is denominated in USDG.
 *
 * Scale: 1 USDG = 1_000_000 internal units (6 decimals). This matches the
 * on-chain decimals() of USDG on Robinhood Chain (chain id 4663) exactly, so
 * internal units map 1:1 to base units with no rounding at the contract
 * boundary. Verified on-chain: decimals() == 6.
 *
 * USDG is a Paxos-issued single-currency stablecoin redeemable 1:1 for US
 * dollars, so 1 USDG == 1 USD. That peg is what lets NFT top bids be used
 * directly as USDG reference values with no price feed.
 *
 * Standard basis points: 10000 bps = 100.00%.
 */

import { BPS_DIVISOR, mulBps, RF_SCALE } from './rf.ts';

export const USDG_SCALE = 1_000_000n;
export const USDG_DECIMALS = 6;

/**
 * Converts a human USDG string/number into internal integer units.
 * Rejects more precision than USDG's 6 decimals instead of silently
 * truncating — a truncated cent is a bug, not a rounding.
 *
 * Examples:
 *   "10"      -> 10000000n
 *   "0.5"     -> 500000n
 *   "0.000001"-> 1n
 *   100       -> 100000000n
 */
export function parseUsdg(input: string | number | bigint): bigint {
  if (typeof input === 'bigint') {
    return input;
  }

  const str = String(input).trim();
  if (!str) {
    return 0n;
  }

  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid USDG representation: "${str}"`);
  }

  const isNegative = str.startsWith('-');
  const cleanStr = isNegative ? str.slice(1) : str;
  const [wholePart = '0', fracPart = ''] = cleanStr.split('.');

  if (fracPart.length > USDG_DECIMALS) {
    throw new Error(
      `USDG supports at most ${USDG_DECIMALS} decimal places (1 USDG = 1,000,000 units). Got "${str}".`
    );
  }

  const fracUnits = BigInt(fracPart.padEnd(USDG_DECIMALS, '0'));
  const totalUnits = BigInt(wholePart) * USDG_SCALE + fracUnits;

  return isNegative ? -totalUnits : totalUnits;
}

/**
 * Formats internal integer units to a human-readable USDG string.
 * Examples: 10000000n -> "10" | "10.00 USDG"; 1n -> "0.000001".
 */
export function formatUsdg(
  units: bigint,
  options: {
    decimals?: number;
    showSymbol?: boolean;
    trimZeros?: boolean;
  } = {}
): string {
  const { decimals = 2, showSymbol = false, trimZeros = false } = options;

  const isNegative = units < 0n;
  const absUnits = isNegative ? -units : units;

  const whole = absUnits / USDG_SCALE;
  const frac = absUnits % USDG_SCALE;

  let fracStr = frac.toString().padStart(USDG_DECIMALS, '0');

  if (decimals === 0) {
    fracStr = '';
  } else if (decimals < USDG_DECIMALS) {
    fracStr = fracStr.slice(0, decimals);
  } else {
    fracStr = fracStr.padEnd(decimals, '0');
  }

  let formatted = fracStr ? `${whole}.${fracStr}` : whole.toString();

  if (trimZeros && formatted.includes('.')) {
    formatted = formatted.replace(/\.?0+$/, '');
  }

  return `${isNegative ? '-' : ''}${formatted}${showSymbol ? ' USDG' : ''}`;
}

export function addUsdg(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subUsdg(a: bigint, b: bigint): bigint {
  const res = a - b;
  if (res < 0n) {
    throw new RangeError(`USDG underflow: ${a} - ${b} < 0`);
  }
  return res;
}

function groupThousands(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Exact grouped display: 2500000n -> "2.50 USDG"; 2500000000n -> "2,500.00 USDG".
 */
export function formatUsdgGrouped(
  units: bigint,
  options: { decimals?: number; showSymbol?: boolean } = {}
): string {
  const { decimals = 2, showSymbol = true } = options;
  const base = formatUsdg(units, { decimals, showSymbol: false });
  const [intPart, fracPart] = base.split('.');
  const grouped = groupThousands(intPart ?? '0');
  const formatted = fracPart !== undefined ? `${grouped}.${fracPart}` : grouped;
  return showSymbol ? `${formatted} USDG` : formatted;
}

/**
 * Compact display for tight spaces: "2.5K USDG", "250K USDG", "2.5M USDG".
 * Approximate — always pair with exact on details.
 */
export function formatUsdgCompact(units: bigint): string {
  const usdg = Number(units) / Number(USDG_SCALE);
  if (!Number.isFinite(usdg)) return formatUsdgGrouped(units);
  const sign = usdg < 0 ? '-' : '';
  const abs = Math.abs(usdg);
  if (abs >= 1_000_000) return `${sign}${trimNum(abs / 1_000_000)}M USDG`;
  if (abs >= 10_000) return `${sign}${trimNum(abs / 1000)}K USDG`;
  if (abs >= 1000) return `${sign}${trimNum(abs / 1000)}K USDG`;
  return formatUsdgGrouped(units);
}

function trimNum(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

/** Sub-cent amounts still need to render without collapsing to "$0.00". */
export function formatUsdgAdaptive(units: bigint): string {
  const abs = units < 0n ? -units : units;
  if (abs === 0n) return '0.00 USDG';
  if (abs < 10_000n) return formatUsdg(abs, { decimals: 6, trimZeros: true, showSymbol: true });
  return formatUsdgGrouped(units);
}

/** Convert a USD top-bid into USDG units 1:1 (the USDG peg makes this exact). */
export function usdgFromUsd(usd: string | number | bigint): bigint {
  if (typeof usd === 'bigint') {
    // Caller already holds base units.
    return usd;
  }
  const str = String(usd).trim();
  if (!str || !/^\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid USD amount: "${usd}"`);
  }
  const [wholePart = '0', fracPart = ''] = str.split('.');
  if (fracPart.length > USDG_DECIMALS) {
    throw new Error(
      `USD supports at most ${USDG_DECIMALS} decimal places for USDG valuation. Got "${str}".`
    );
  }
  const fracUnits = BigInt(fracPart.padEnd(USDG_DECIMALS, '0'));
  return BigInt(wholePart) * USDG_SCALE + fracUnits;
}

/** Render USDG units back into a plain USD decimal string (no symbol). */
export function usdgToUsdString(units: bigint, decimals = 2): string {
  return formatUsdg(units, { decimals, trimZeros: false });
}

/**
 * Parse a USDG-per-unit RATE to USDG base units, flooring any excess precision.
 *
 * Rates are NOT amounts. `parseUsdg` correctly rejects over-precise *amounts*
 * (truncating a user's cent is a bug), but a live market price for a cheap token
 * can legitimately carry more than 6 decimals — RF can quote at $0.00000012,
 * and OpenSea returns whatever precision it has. Throwing there would make a
 * perfectly valid quote unusable.
 *
 * So a rate is floored to representable precision instead. Flooring is the safe
 * direction: it understates the converted value by less than one base unit
 * rather than overstating it.
 *
 * A rate below 1e-6 USDG per unit floors to 0 — the conversion genuinely has no
 * representable value, and callers treat 0 as "not worth seeding".
 */
export function parseUsdgRateToUnits(rate: string | number): bigint {
  const str = String(rate).trim();
  if (!str || !/^\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid USDG rate: "${rate}"`);
  }
  const [wholePart = '0', fracRaw = ''] = str.split('.');
  const frac = (fracRaw + '0'.repeat(USDG_DECIMALS)).slice(0, USDG_DECIMALS);
  return BigInt(wholePart) * USDG_SCALE + BigInt(frac);
}

/**
 * Value an $RAREFRIENDS amount in USDG at a given RF price.
 *
 * RF cashback is still a valid prize, but RTP is accounted in USDG — so the
 * conversion is captured ONCE at seed time and stored as the prize's immutable
 * `usdgValueUnits`. That keeps a locked, published RTP exact instead of letting
 * a volatile RF price silently revalue the machine after the fact.
 *
 * @param rfUnits        RF amount in RF internal units (1 RF = RF_SCALE)
 * @param priceUsdgPerRf RF's price in USDG as a decimal string (e.g. "0.002")
 */
export function rfToUsdgUnits(rfUnits: bigint, priceUsdgPerRf: string | number): bigint {
  if (rfUnits < 0n) throw new RangeError(`RF amount cannot be negative: ${rfUnits}`);
  // Tolerant of over-precise rates (see parseUsdgRateToUnits).
  const priceScaled = parseUsdgRateToUnits(priceUsdgPerRf);
  // A price of literally zero (or negative) is nonsense input and throws. But a
  // GENUINELY positive price smaller than one base unit floors to 0 and is
  // returned as 0n — that is a real quote with no representable value, and the
  // caller decides what to do rather than having a valid quote crash the flow.
  if (!(Number(priceUsdgPerRf) > 0)) {
    throw new Error('RF price in USDG must be greater than zero.');
  }
  // rfUnits * pricePerRf, with RF_SCALE cancelling the RF base unit:
  //   (rfUnits / RF_SCALE) * priceScaled
  return (rfUnits * priceScaled) / RF_SCALE;
}

export { BPS_DIVISOR, mulBps };